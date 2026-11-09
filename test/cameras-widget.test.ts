// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

let win: any;
beforeAll(() => { win = loadWidget('cameras'); });
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Images load (or fail, for URLs containing "broken") on the next tick, like a browser's would. */
let loaded: string[] = [];
beforeEach(() => {
  loaded = [];
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) {
      setTimeout(() => {
        if (v.includes('broken')) this.onerror?.();
        else { loaded.push(v); this.onload?.(); }
      });
    }
  });
});

const cam = (id: string, opts: { image?: string | null, video?: string | null, videos?: string[], h265?: string[] } = {}) => ({
  id, name: `Cam ${id}`, icon: null,
  image: opts.image === null ? null : { id: `img-${id}`, url: opts.image ?? `/api/image/img-${id}`, lastUpdated: 1 },
  video: opts.video === undefined ? (opts.videos ? opts.videos[0] : `vid-${id}`) : opts.video,
  ...(opts.videos ? { videos: opts.videos, h265: opts.h265 ?? [] } : {}),
});

function widget(devices: any[], api: Mock<(...args: any[]) => Promise<any>> = vi.fn(async (): Promise<any> => ({ type: 'image/jpeg', data: 'AQID' })), now = () => 1000, extra: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const report = vi.fn();
  const w = win.createCamerasWidget(root, { api, report, now, ...extra });
  w.setState(devices);
  const tile = (id: string) => root.querySelector<HTMLElement>(`.cw-tile[data-device="${id}"]`)!;
  const tiles = () => [...root.querySelectorAll<HTMLElement>('.cw-tile')];
  return { w, root, tile, tiles, api, report };
}

describe('grid', () => {
  it('shows one tile per camera, in order, with the name', () => {
    const { tiles } = widget([cam('a'), cam('b'), cam('c')]);
    expect(tiles().map(t => t.querySelector('.cw-name')!.textContent)).toEqual(['Cam a', 'Cam b', 'Cam c']);
  });

  it('spans a lone tile and the last of an odd number across the row', () => {
    const wide = (n: number) => widget(Array.from({ length: n }, (_, i) => cam(`c${i}`))).tiles().map(t => t.classList.contains('wide'));
    expect(wide(1)).toEqual([true]);
    expect(wide(2)).toEqual([false, false]);
    expect(wide(3)).toEqual([false, false, true]);
    expect(wide(6)).toEqual([false, false, false, false, false, false]);
  });

  it('marks cameras without a snapshot or video and unavailable ones', () => {
    const { tile } = widget([cam('a', { image: null, video: null }), cam('v', { image: null }), { id: 'gone', missing: true }]);
    expect(tile('a').classList.contains('no-image')).toBe(true);
    expect(tile('a').getAttribute('data-empty')).toBe('No snapshot');
    // A camera with video gets a frame from it instead.
    expect(tile('v').classList.contains('no-image')).toBe(false);
    expect(tile('gone').classList.contains('missing')).toBe(true);
    expect(tile('gone').querySelector('.cw-name')!.textContent).toBe('Unavailable');
  });
});

describe('layout', () => {
  /** Which of n tiles span the row with the `layout` setting. */
  const wide = (n: number, layout?: string) => widget(Array.from({ length: n }, (_, i) => cam(`c${i}`)), undefined, undefined, { layout })
    .tiles().map(t => t.classList.contains('wide'));

  it('puts an odd number\'s wide tile first with the large camera on top', () => {
    expect(wide(1, 'top')).toEqual([true]);
    expect(wide(2, 'top')).toEqual([false, false]);
    expect(wide(3, 'top')).toEqual([true, false, false]);
    expect(wide(5, 'top')).toEqual([true, false, false, false, false]);
  });

  it('gives every camera a row of its own with one per row', () => {
    expect(wide(2, 'single')).toEqual([true, true]);
    expect(wide(3, 'single')).toEqual([true, true, true]);
  });

  it.each([[undefined], ['bottom'], ['sideways']])('keeps the wide tile last for layout %s', (layout) => {
    expect(wide(3, layout)).toEqual([false, false, true]);
    expect(wide(4, layout)).toEqual([false, false, false, false]);
  });

  it('takes it from the widget settings', async () => {
    vi.useFakeTimers();
    try {
      loadMount('cameras');
      const root = document.createElement('div');
      document.body.append(root);
      const api = vi.fn(async (_m: string, path: string): Promise<any> => (path.startsWith('/state')
        ? { state: [cam('a'), cam('b'), cam('c')], tileNames: {} } : new Promise(() => {})));
      const Homey = {
        api, on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(), getSettings: () => ({ layout: 'top' }),
        getDeviceIds: () => ['a', 'b', 'c'], getWidgetInstanceId: () => 'w1', __: (key: string) => key,
      };
      win.mountCamerasWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(100);
      expect([...root.querySelectorAll('.cw-tile')].map(t => t.classList.contains('wide'))).toEqual([true, false, false]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Camera slots', () => {
  it('adds the Camera 1 … 6 picks after the devices, a repeat or None left out', async () => {
    vi.useFakeTimers();
    try {
      loadMount('cameras');
      const root = document.createElement('div');
      document.body.append(root);
      const api = vi.fn(async (_m: string, path: string): Promise<any> => (path.startsWith('/state')
        ? { state: [], tileNames: {} } : new Promise(() => {})));
      const Homey = {
        api, on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(), getWidgetInstanceId: () => 'w1', __: (key: string) => key,
        getSettings: () => ({ camera1: { id: 'syn1', name: 'Garden' }, camera2: { id: 'none', name: 'None' }, camera3: { id: 'a' }, camera6: { id: 'syn2' } }),
        getDeviceIds: () => ['a', 'b'],
      };
      win.mountCamerasWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(100);
      expect(api.mock.calls.find(([, path]) => path.startsWith('/state'))?.[1]).toMatch(/^\/state\?deviceIds=a,b,syn1,syn2&/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows Always live\'s camera too, once, and passes it on', async () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      const api = vi.fn(async (_m: string, path: string): Promise<any> => (path.startsWith('/state')
        ? { state: [], tileNames: {} } : new Promise(() => {})));
      const Homey = {
        api, on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(), getWidgetInstanceId: () => 'w1', __: (key: string) => key,
        getSettings: () => ({ autoLive: { id: 'syn9', name: 'Garden' }, camera1: { id: 'a' } }),
        getDeviceIds: () => ['a'],
      };
      win.mountCamerasWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(100);
      expect(api.mock.calls.find(([, path]) => path.startsWith('/state'))?.[1]).toMatch(/^\/state\?deviceIds=a,syn9&/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the slots alone when no device is picked', async () => {
    vi.useFakeTimers();
    try {
      loadMount('cameras');
      const root = document.createElement('div');
      document.body.append(root);
      const api = vi.fn(async (_m: string, path: string): Promise<any> => (path.startsWith('/state')
        ? { state: [cam('syn1')], tileNames: {} } : new Promise(() => {})));
      const Homey = {
        api, on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(), getWidgetInstanceId: () => 'w1', __: (key: string) => key,
        getSettings: () => ({ camera1: { id: 'syn1', name: 'Garden' } }), getDeviceIds: () => [],
      };
      win.mountCamerasWidget(Homey, { root, frame: root });
      await vi.advanceTimersByTimeAsync(100);
      expect(root.querySelectorAll('.cw-tile')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('snapshots', () => {
  it('loads each snapshot from its URL, cache-busted, and swaps it in once loaded', async () => {
    const { w, tile } = widget([cam('a'), cam('b', { image: null })]);
    await w.refresh();
    expect(loaded).toEqual(['/api/image/img-a?t=1000']);
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('/api/image/img-a?t=1000');
    expect(tile('a').classList.contains('loaded')).toBe(true);
    expect(w.routeOf('a')).toBe('direct');
  });

  it('moves a camera to the app route when the frame can\'t load its URL', async () => {
    const { w, tile, api, report } = widget([cam('a', { image: '/broken/a' }), cam('b', { image: '/broken/b' })]);
    await w.refresh();
    expect(w.routeOf('a')).toBe('app');
    expect(w.routeOf('b')).toBe('app');
    expect(api).toHaveBeenCalledWith('GET', '/snapshot?deviceId=a', undefined);
    expect(api).toHaveBeenCalledWith('GET', '/snapshot?deviceId=b', undefined);
    expect(tile('b').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,AQID');
    expect(report).toHaveBeenCalledTimes(2);
    // Once on the app route, a camera doesn't try its URL again.
    api.mockClear();
    loaded = [];
    await w.refresh();
    expect(loaded).toEqual(['data:image/jpeg;base64,AQID', 'data:image/jpeg;base64,AQID']);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('keeps the other cameras direct when one camera\'s URL fails', async () => {
    const { w, tile, api } = widget([cam('a', { image: '/broken/a' }), cam('b')]);
    await w.refresh();
    expect(w.routeOf('a')).toBe('app');
    expect(w.routeOf('b')).toBe('direct');
    expect(api).not.toHaveBeenCalledWith('GET', '/snapshot?deviceId=b', undefined);
    expect(tile('b').querySelector('img')!.getAttribute('src')).toBe('/api/image/img-b?t=1000');
  });
});

/** A fake RTCPeerConnection; getStats reports `frames` as decoded. */
function stubPeerConnection() {
  const pcs: any[] = [];
  vi.stubGlobal('RTCPeerConnection', class {
    iceGatheringState = 'complete';
    localDescription = { sdp: 'v=0 offer' };
    remote: any = null;
    closed = false;
    frames = 0;
    constructor() { pcs.push(this); }
    addTransceiver() {}
    addEventListener() {}
    removeEventListener() {}
    async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription(d: any) { this.remote = d; }
    async getStats() { return new Map([['in', { type: 'inbound-rtp', kind: 'video', framesDecoded: this.frames }]]); }
    close() { this.closed = true; }
  });
  return pcs;
}

/** Canvas drawing: happy-dom has none, so a frame comes out as a fixed data URL. */
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as any);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,FRAME');
}

describe('always live (autoLive)', () => {
  const opts = { autoLive: 'b', liveFor: '30' };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const offers = (api: any) => api.mock.calls.filter((c: any[]) => c[1] === '/video/offer').length;

  /** The page shows with cameras a and b, Always live on b, already playing. */
  async function playingAuto(extra: object = {}) {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const w = widget([cam('a'), cam('b')], api, () => Date.now(), { ...opts, ...extra });
    w.w.resume();
    await vi.advanceTimersByTimeAsync(0);
    playing(w.tile('b'));
    return { ...w, pcs, api };
  }

  it('goes live when the page shows, not before, and keeps no time limit', async () => {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const { w, tile } = widget([cam('a'), cam('b')], api, () => Date.now(), opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(pcs).toEqual([]);
    w.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(tile('b').classList.contains('expanded')).toBe(true);
    playing(tile('b'));
    pcs[0].frames = 1;
    await vi.advanceTimersByTimeAsync(4000);
    pcs[0].frames = 2;
    await vi.advanceTimersByTimeAsync(4000);
    for (let i = 0; i < 12; i++) { pcs[0].frames += 1; await vi.advanceTimersByTimeAsync(5000); }
    expect(tile('b').classList.contains('live')).toBe(true);
  });

  it('starts when a first read that was busy brings the camera', async () => {
    const pcs = stubPeerConnection();
    const { w, tile } = widget([cam('a'), { id: 'b', missing: true }], offerApi(), () => Date.now(), opts);
    w.resume();
    expect(pcs).toEqual([]);
    w.setState([cam('a'), cam('b')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(tile('b').classList.contains('connecting')).toBe(true);
  });

  it('shows the grid after a tap and comes back after a minute', async () => {
    const { tile, pcs } = await playingAuto();
    tile('b').click();
    expect(tile('b').classList.contains('expanded')).toBe(false);
    expect(pcs[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(59e3);
    expect(pcs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pcs).toHaveLength(2);
    expect(tile('b').classList.contains('expanded')).toBe(true);
  });

  it('waits while another camera is tapped live, which keeps its limit, then comes back', async () => {
    const { tile, pcs } = await playingAuto();
    tile('b').click();
    await vi.advanceTimersByTimeAsync(1000);
    tile('a').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(tile('a').classList.contains('expanded')).toBe(true);
    playing(tile('a'));
    for (let i = 0; i < 6; i++) { pcs[1].frames += 1; await vi.advanceTimersByTimeAsync(5000); }
    expect(tile('a').classList.contains('expanded')).toBe(false);
    expect(pcs).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60e3);
    expect(pcs).toHaveLength(3);
    expect(tile('b').classList.contains('expanded')).toBe(true);
  });

  it('reconnects 5 s after a playing stream is lost', async () => {
    const { tile, pcs } = await playingAuto();
    pcs[0].connectionState = 'failed';
    pcs[0].onconnectionstatechange();
    expect(tile('b').classList.contains('expanded')).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(pcs).toHaveLength(2);
    expect(tile('b').classList.contains('expanded')).toBe(true);
  });

  it('stays on snapshots away from home until the page next shows', async () => {
    stubPeerConnection();
    const api = offerApi();
    const { w, tile } = widget([cam('a'), cam('b')], api, () => Date.now(), opts);
    w.resume();
    await vi.advanceTimersByTimeAsync(15e3); // answered, but never connected
    expect(tile('b').classList.contains('expanded')).toBe(false);
    const tries = offers(api);
    await vi.advanceTimersByTimeAsync(300e3);
    expect(offers(api)).toBe(tries);
    w.pause();
    w.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(offers(api)).toBe(tries + 1);
  });

  it('is not put off by another camera that can\'t play', async () => {
    const { tile, pcs } = await playingAuto();
    tile('b').click();
    await vi.advanceTimersByTimeAsync(1000);
    tile('a').click(); // answered, but never connected: this camera's away-from-home message
    await vi.advanceTimersByTimeAsync(15e3);
    expect(tile('a').classList.contains('expanded')).toBe(false);
    await vi.advanceTimersByTimeAsync(60e3);
    expect(pcs).toHaveLength(3);
    expect(tile('b').classList.contains('expanded')).toBe(true);
  });

  it('tries again after a minute when no stream played for another reason', async () => {
    const pcs = stubPeerConnection();
    const api = vi.fn(async (_m: string, path: string): Promise<any> => {
      if (path === '/video/offer') throw new Error('busy');
      return {};
    });
    const { w } = widget([cam('a'), cam('b')], api, () => Date.now(), opts);
    w.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pcs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60e3);
    expect(pcs).toHaveLength(2);
  });

  it('stops while the page is hidden and comes back at once', async () => {
    const { w, tile, pcs } = await playingAuto();
    w.pause();
    expect(pcs[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(300e3);
    expect(pcs).toHaveLength(1);
    w.resume();
    expect(pcs).toHaveLength(2);
    expect(tile('b').classList.contains('expanded')).toBe(true);
  });

  it('does nothing with live view off, for a camera without video, or while renaming', async () => {
    const pcs = stubPeerConnection();
    widget([cam('b')], offerApi(), () => Date.now(), { ...opts, liveView: false }).w.resume();
    widget([cam('b', { video: null })], offerApi(), () => Date.now(), opts).w.resume();
    widget([cam('b')], offerApi(), () => Date.now(), { ...opts, renameTiles: true }).w.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pcs).toEqual([]);
  });

  it('leaves a widget without it as it was', async () => {
    const pcs = stubPeerConnection();
    widget([cam('b')], offerApi(), () => Date.now(), {}).w.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pcs).toEqual([]);
  });
});

/** The tile's video starts playing at 1280 × 720. */
function playing(tile: HTMLElement) {
  const video = tile.querySelector('video')!;
  Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
  video.dispatchEvent(new Event('playing'));
  return video;
}

const offerApi = () => vi.fn(async (_m: string, path: string): Promise<any> => (path === '/video/offer' ? { answer: 'v=0 answer', streamId: 's1' } : {}));

describe('live view', () => {
  it('ignores taps on a camera without video', () => {
    const { tile, api } = widget([cam('a', { video: null })]);
    tile('a').click();
    expect(tile('a').classList.contains('connecting')).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  it('takes a click after a touch tap again with a fixed clock (opts.now)', () => {
    stubPeerConnection();
    const { tile } = widget([cam('a'), cam('b')], offerApi(), () => 1000);
    const touch = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true }) as any;
      e.changedTouches = [{ clientX: 10, clientY: 10 }];
      tile('a').dispatchEvent(e);
    };
    touch('touchstart'); touch('touchend');
    expect(tile('a').classList.contains('expanded')).toBe(true);
    // The click right after the touch is the same tap: ignored.
    tile('a').click();
    expect(tile('a').classList.contains('expanded')).toBe(true);
    // A click a second later is a new one, though the widget's own clock stands still.
    vi.setSystemTime(Date.now() + 1000);
    tile('a').click();
    expect(tile('a').classList.contains('expanded')).toBe(false);
  });

  it('sends an offer on a tap and fills the widget, and stops on a second tap', async () => {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const { tile, root } = widget([cam('a'), cam('b')], api);
    const grid = root.querySelector('.cw-grid')!;
    tile('a').click();
    expect(tile('a').classList.contains('connecting')).toBe(true);
    // The live camera covers the whole widget.
    expect(tile('a').classList.contains('expanded')).toBe(true);
    expect(grid.classList.contains('has-expanded')).toBe(true);
    await vi.waitFor(() => expect(pcs[0]?.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' }));
    expect(api).toHaveBeenCalledWith('POST', '/video/offer', { videoId: 'vid-a', offer: 'v=0 offer' });
    tile('a').click();
    expect(pcs[0].closed).toBe(true);
    expect(tile('a').classList.contains('connecting')).toBe(false);
    expect(tile('a').classList.contains('expanded')).toBe(false);
    expect(grid.classList.contains('has-expanded')).toBe(false);
  });

  it('keeps the widget\'s height when a wide last tile goes live', () => {
    stubPeerConnection();
    const { tile, root } = widget([cam('a'), cam('b'), cam('c')], offerApi());
    const grid = root.querySelector<HTMLElement>('.cw-grid')!;
    // At 320 px: the half-width row (90 px), the gap and the wide tile's own row (180 px).
    grid.getBoundingClientRect = () => ({ width: 320, height: 278 } as DOMRect);
    tile('c').click();
    expect(grid.style.minHeight).toBe('278px');
  });

  it('keeps the widget\'s height when a wide first tile goes live', () => {
    stubPeerConnection();
    const { tile, root } = widget([cam('a'), cam('b'), cam('c')], offerApi(), undefined, { layout: 'top' });
    const grid = root.querySelector<HTMLElement>('.cw-grid')!;
    grid.getBoundingClientRect = () => ({ width: 320, height: 278 } as DOMRect);
    tile('a').click();
    expect(tile('a').classList.contains('expanded')).toBe(true);
    expect(grid.style.minHeight).toBe('278px');
  });

  it('grows a single row to a full-width 16:9 while live', () => {
    stubPeerConnection();
    const { tile, root } = widget([cam('a'), cam('b')], offerApi());
    const grid = root.querySelector<HTMLElement>('.cw-grid')!;
    grid.getBoundingClientRect = () => ({ width: 320, height: 90 } as DOMRect);
    tile('a').click();
    expect(grid.style.minHeight).toBe('180px');
  });

  it('keeps a video-only camera\'s last live frame when live view ends', async () => {
    const pcs = stubPeerConnection();
    stubCanvas();
    const { tile } = widget([cam('a', { image: null })], offerApi());
    tile('a').click();
    await vi.waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
    const video = playing(tile('a'));
    expect(video).toBeTruthy();
    tile('a').click();
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,FRAME');
    expect(tile('a').classList.contains('loaded')).toBe(true);
  });

  it('ends live view when the stream stops sending frames', async () => {
    vi.useFakeTimers();
    try {
      const pcs = stubPeerConnection();
      let clock = 1000;
      const { tile, report } = widget([cam('a')], offerApi(), () => clock);
      tile('a').click();
      await vi.waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
      tile('a').querySelector('video')!.dispatchEvent(new Event('playing'));
      expect(tile('a').classList.contains('live')).toBe(true);
      // Frames keep coming for a while...
      for (let i = 0; i < 4; i++) {
        pcs[0].frames += 100;
        clock += 5000;
        await vi.advanceTimersByTimeAsync(5000);
      }
      expect(pcs[0].closed).toBe(false);
      // ...then stop, and 15 s later live view ends.
      for (let i = 0; i < 3; i++) {
        clock += 5000;
        await vi.advanceTimersByTimeAsync(5000);
      }
      expect(pcs[0].closed).toBe(true);
      expect(tile('a').classList.contains('live')).toBe(false);
      expect(report).toHaveBeenCalledWith(expect.stringContaining('no new frame'), true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('live view: falling back to the next stream', () => {
  const offers = (api: any) => api.mock.calls.filter((c: any[]) => c[1] === '/video/offer').map((c: any[]) => c[2].videoId);
  /** An API whose offer for the given streams is refused, as go2rtc refuses an H.265 one. */
  const refusing = (...bad: string[]) => vi.fn(async (_m: string, path: string, body?: any): Promise<any> => {
    if (path !== '/video/offer') return {};
    if (bad.includes(body.videoId)) throw new Error('codecs not matched');
    return { answer: `answer ${body.videoId}`, streamId: `s-${body.videoId}` };
  });

  it('tries the next stream when the first offer is refused, and starts with the one that played next time', async () => {
    const pcs = stubPeerConnection();
    const api = refusing('main');
    const { tile, report } = widget([cam('a', { videos: ['main', 'sub'] })], api);
    tile('a').click();
    await vi.waitFor(() => expect(pcs[1]?.remote).toEqual({ type: 'answer', sdp: 'answer sub' }));
    expect(offers(api)).toEqual(['main', 'sub']);
    expect(pcs[0].closed).toBe(true);
    expect(tile('a').classList.contains('connecting')).toBe(true);
    expect(tile('a').classList.contains('expanded')).toBe(true);
    expect(report).toHaveBeenCalledWith('live view of Cam a: stream 1 of 2 failed: codecs not matched', true);
    playing(tile('a'));
    expect(tile('a').classList.contains('live')).toBe(true);
    expect(tile('a').querySelector<HTMLElement>('.cw-note')!.style.display).toBe('none');
    // Again: the stream that played goes first.
    tile('a').click();
    tile('a').click();
    await vi.waitFor(() => expect(offers(api)).toEqual(['main', 'sub', 'sub']));
  });

  it('moves on after 10 s without a frame, and keeps the playing stream alive', async () => {
    vi.useFakeTimers();
    try {
      const pcs = stubPeerConnection();
      const api = refusing();
      const { tile, report } = widget([cam('a', { videos: ['main', 'sub'] })], api);
      tile('a').click();
      await vi.advanceTimersByTimeAsync(9000);
      expect(offers(api)).toEqual(['main']);
      await vi.advanceTimersByTimeAsync(1500);
      expect(offers(api)).toEqual(['main', 'sub']);
      expect(pcs[0].closed).toBe(true);
      expect(report).toHaveBeenCalledWith('live view of Cam a: stream 1 of 2 failed: no video after 10 s', true);
      playing(tile('a'));
      await vi.advanceTimersByTimeAsync(10000);
      const keepAlives = api.mock.calls.filter((c: any[]) => c[1] === '/video/keepalive').map((c: any[]) => c[2]);
      // Only the playing stream's: the first one's keep-alive stopped with it.
      expect(keepAlives.length).toBeGreaterThan(0);
      expect(keepAlives.every((b: any) => b.videoId === 'sub' && b.streamId === 's-sub')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when no stream plays', async () => {
    const pcs = stubPeerConnection();
    const { tile, report } = widget([cam('a', { videos: ['main', 'sub'], h265: ['main'] })], refusing('main', 'sub'));
    tile('a').click();
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('live view of Cam a: none of its 2 streams played', true));
    expect(pcs.every(pc => pc.closed)).toBe(true);
    expect(tile('a').classList.contains('expanded')).toBe(false);
    expect(tile('a').querySelector('.cw-note')!.textContent).toBe('Live view failed');
  });

  it('says live view needs the home network when Homey answered but no connection came up', async () => {
    vi.useFakeTimers();
    try {
      stubPeerConnection();
      const { tile, report } = widget([cam('a', { videos: ['main', 'sub'] })], refusing('main'));
      tile('a').click();
      await vi.advanceTimersByTimeAsync(16000);
      expect(report).toHaveBeenCalledWith('live view of Cam a: none of its 2 streams played; Homey answered, but its video server could not be reached (away from home?)', true);
      expect(tile('a').querySelector('.cw-note')!.textContent).toBe('Live view needs your home network or a VPN.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps "Live view failed" when the connection came up but no video did', async () => {
    vi.useFakeTimers();
    try {
      const pcs = stubPeerConnection();
      const { tile } = widget([cam('a', { videos: ['sub'] })], refusing());
      tile('a').click();
      await vi.advanceTimersByTimeAsync(100);
      pcs[0].connectionState = 'connected';
      pcs[0].onconnectionstatechange();
      await vi.advanceTimersByTimeAsync(16000);
      expect(tile('a').querySelector('.cw-note')!.textContent).toBe('Live view failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('names H.265 when every stream is H.265', async () => {
    stubPeerConnection();
    const { tile } = widget([cam('a', { videos: ['main'], h265: ['main'] })], refusing('main'));
    tile('a').click();
    await vi.waitFor(() => expect(tile('a').querySelector('.cw-note')!.textContent).toBe('H.265 can\'t play live. Try H.264.'));
  });

  it('names H.265 on a video-only camera that has nothing else', async () => {
    stubPeerConnection();
    const { w, tile } = widget([cam('a', { image: null, videos: ['main'], h265: ['main'] })], refusing('main'));
    await w.refresh();
    expect(tile('a').classList.contains('no-image')).toBe(true);
    expect(tile('a').getAttribute('data-empty')).toBe('H.265 can\'t play live. Try H.264.');
  });

  it('grabs a video-only camera\'s frame from the next stream when the first is refused', async () => {
    const pcs = stubPeerConnection();
    stubCanvas();
    const api = refusing('main');
    const { w, tile } = widget([cam('a', { image: null, videos: ['main', 'sub'] })], api);
    const done = w.refresh();
    await vi.waitFor(() => expect(pcs[1]?.remote).toBeTruthy());
    playing(tile('a'));
    await done;
    expect(offers(api)).toEqual(['main', 'sub']);
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,FRAME');
  });
});

describe('live view off (liveView)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a tap opens no stream and expands nothing, and the tile does not look tappable', async () => {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const { tile } = widget([cam('a'), cam('b')], api, () => Date.now(), { liveView: false });
    tile('a').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(pcs).toHaveLength(0);
    expect(api.mock.calls.some((c: any[]) => c[1] === '/video/offer')).toBe(false);
    expect(tile('a').classList.contains('expanded')).toBe(false);
    expect(tile('a').classList.contains('has-video')).toBe(false);
  });

  it('still grabs a frame for a video-only camera', async () => {
    const pcs = stubPeerConnection();
    const { w } = widget([cam('v', { image: null })], offerApi(), () => Date.now(), { liveView: false });
    w.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(pcs).toHaveLength(1);
  });

  it('the mount reads a missing setting as on, and false as off', async () => {
    loadMount('cameras');
    const mount = (settings: object) => {
      const root = document.createElement('div');
      document.body.append(root);
      const api = vi.fn(async (_m: string, path: string): Promise<any> => (path.startsWith('/state') ? { state: [cam('a')], tileNames: {} } : {}));
      win.mountCamerasWidget({
        api, on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(), getSettings: () => settings,
        getDeviceIds: () => ['a'], getWidgetInstanceId: () => 'w1', __: (key: string) => key,
      }, { root, frame: root });
      return root;
    };
    const on = mount({}), off = mount({ liveView: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(on.querySelector('.cw-tile')!.classList.contains('has-video')).toBe(true);
    expect(off.querySelector('.cw-tile')!.classList.contains('has-video')).toBe(false);
  });
});

describe('live view: how long it stays on (liveFor)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const offers = (api: any) => api.mock.calls.filter((c: any[]) => c[1] === '/video/offer').map((c: any[]) => c[2].videoId);

  /** Taps the camera and lets its stream play; returns its peer connection. */
  async function goLive(tile: HTMLElement, pcs: any[]) {
    tile.click();
    await vi.advanceTimersByTimeAsync(0);
    playing(tile);
    return pcs[pcs.length - 1];
  }

  /** Lets `ms` pass in 5 s steps while the stream keeps decoding frames, so the frame check doesn't end it. */
  async function streamFor(pc: any, ms: number) {
    for (let left = ms; left > 0; left -= 5000) {
      pc.frames += 100;
      await vi.advanceTimersByTimeAsync(Math.min(5000, left));
    }
  }

  it.each([[undefined], ['soon']])('ends after 5 minutes by default (liveFor %s)', async (liveFor) => {
    const pcs = stubPeerConnection();
    const { tile } = widget([cam('a')], offerApi(), () => Date.now(), { liveFor });
    const pc = await goLive(tile('a'), pcs);
    await streamFor(pc, 5 * 60e3 - 5000);
    expect(pc.closed).toBe(false);
    expect(tile('a').classList.contains('live')).toBe(true);
    await streamFor(pc, 5000);
    expect(pc.closed).toBe(true);
    expect(tile('a').classList.contains('expanded')).toBe(false);
  });

  it.each([['30', 30e3], ['60', 60e3]])('liveFor %s ends after %d ms', async (liveFor, ms) => {
    const pcs = stubPeerConnection();
    const { tile } = widget([cam('a')], offerApi(), () => Date.now(), { liveFor });
    const pc = await goLive(tile('a'), pcs);
    await streamFor(pc, ms - 5000);
    expect(pc.closed).toBe(false);
    await streamFor(pc, 5000);
    expect(pc.closed).toBe(true);
    expect(tile('a').classList.contains('live')).toBe(false);
  });

  it('until tapped: still live after an hour, with the stream kept alive, and a tap ends it', async () => {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const { tile } = widget([cam('a')], api, () => Date.now(), { liveFor: 'tap' });
    const pc = await goLive(tile('a'), pcs);
    await streamFor(pc, 60 * 60e3);
    expect(pc.closed).toBe(false);
    expect(tile('a').classList.contains('live')).toBe(true);
    expect(api.mock.calls.filter((c: any[]) => c[1] === '/video/keepalive').length).toBeGreaterThan(300);
    tile('a').click();
    expect(pc.closed).toBe(true);
    expect(tile('a').classList.contains('expanded')).toBe(false);
  });

  it('until tapped: goes live again when the page shows again', async () => {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const { w, tile } = widget([cam('a'), cam('b')], api, () => Date.now(), { liveFor: 'tap' });
    const pc = await goLive(tile('a'), pcs);
    w.pause();
    expect(pc.closed).toBe(true);
    expect(tile('a').classList.contains('expanded')).toBe(false);
    w.pause(); // hidden, then off screen in a Smart Stack: still remembered
    w.resume();
    expect(pcs).toHaveLength(2);
    expect(tile('a').classList.contains('expanded')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(offers(api)).toEqual(['vid-a', 'vid-a']);
    // Once: the next resume() has nothing to bring back until the next pause().
    tile('a').click();
    w.resume();
    expect(pcs).toHaveLength(2);
  });

  it('does not go live again with a time limit, or after a tap ended it', async () => {
    const pcs = stubPeerConnection();
    const limited = widget([cam('a')], offerApi(), () => Date.now());
    await goLive(limited.tile('a'), pcs);
    limited.w.pause();
    limited.w.resume();
    expect(pcs).toHaveLength(1);

    const tapped = widget([cam('b')], offerApi(), () => Date.now(), { liveFor: 'tap' });
    await goLive(tapped.tile('b'), pcs);
    tapped.tile('b').click();
    tapped.w.pause();
    tapped.w.resume();
    expect(pcs).toHaveLength(2);
  });

  it('does not go live again for a camera that went', async () => {
    const pcs = stubPeerConnection();
    const { w, tile } = widget([cam('a'), cam('b')], offerApi(), () => Date.now(), { liveFor: 'tap' });
    await goLive(tile('a'), pcs);
    w.pause();
    w.setState([{ id: 'a', missing: true }, cam('b')]);
    w.resume();
    await goLive(tile('b'), pcs);
    w.pause();
    w.setState([cam('a')]);
    w.resume();
    expect(pcs).toHaveLength(2);
  });

  it('a Smart Stack page goes live again when it is back on screen', async () => {
    const pcs = stubPeerConnection();
    loadMount('cameras');
    const root = document.createElement('div');
    document.body.append(root);
    const api = vi.fn(async (_m: string, path: string): Promise<any> => {
      if (path.startsWith('/state')) return { state: [cam('a')], tileNames: {} };
      if (path === '/video/offer') return { answer: 'v=0 answer', streamId: 's1' };
      return {};
    });
    const Homey = {
      api, on: vi.fn(), ready: vi.fn(), setHeight: vi.fn(), getSettings: () => ({ liveFor: 'tap' }),
      getDeviceIds: () => ['a'], getWidgetInstanceId: () => 'w1', __: (key: string) => key,
    };
    const page = win.mountCamerasWidget(Homey, { root, frame: root });
    await vi.advanceTimersByTimeAsync(100);
    const tile = root.querySelector<HTMLElement>('.cw-tile[data-device="a"]')!;
    await goLive(tile, pcs);
    page.setVisible(false);
    expect(pcs[0].closed).toBe(true);
    page.setVisible(true);
    expect(pcs).toHaveLength(2);
    expect(tile.classList.contains('expanded')).toBe(true);
  });
});

describe('snapshots behind live view', () => {
  it('loads none while a camera is live, and refreshes them when it ends', async () => {
    stubPeerConnection();
    const { w, tile } = widget([cam('a'), cam('b')], offerApi());
    tile('a').click();
    await w.refresh();
    expect(loaded).toEqual([]);
    tile('a').click();
    await vi.waitFor(() => expect(loaded).toEqual(['/api/image/img-a?t=1000', '/api/image/img-b?t=1000']));
  });
});

describe('frame grabs (video, no snapshot)', () => {
  it('grabs a frame from the stream, shows it and closes the stream', async () => {
    const pcs = stubPeerConnection();
    stubCanvas();
    const api = offerApi();
    const { w, tile } = widget([cam('a', { image: null, video: 'vid-a' })], api);
    const done = w.refresh();
    await vi.waitFor(() => expect(pcs[0]?.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' }));
    expect(api).toHaveBeenCalledWith('POST', '/video/offer', { videoId: 'vid-a', offer: 'v=0 offer' });
    playing(tile('a'));
    await done;
    expect(pcs[0].closed).toBe(true);
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,FRAME');
    expect(tile('a').classList.contains('loaded')).toBe(true);
    expect(tile('a').classList.contains('live')).toBe(false);
    expect(tile('a').classList.contains('no-image')).toBe(false);
    // Not again within the minute.
    await w.refresh();
    expect(pcs).toHaveLength(1);
  });

  it('grabs again after a minute', async () => {
    const pcs = stubPeerConnection();
    stubCanvas();
    let clock = 1000;
    const { w, tile } = widget([cam('a', { image: null })], offerApi(), () => clock);
    const first = w.refresh();
    await vi.waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
    playing(tile('a'));
    await first;
    clock += 60e3;
    w.refresh();
    await vi.waitFor(() => expect(pcs).toHaveLength(2));
  });

  it('does not grab while a camera is live', async () => {
    const pcs = stubPeerConnection();
    const { w, tile } = widget([cam('a'), cam('b', { image: null })], offerApi());
    tile('a').click();
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    await w.refresh();
    expect(pcs).toHaveLength(1);
  });

  it('a tap during a grab cancels it and goes live', async () => {
    const pcs = stubPeerConnection();
    const api = offerApi();
    const { w, tile } = widget([cam('a', { image: null })], api);
    const done = w.refresh();
    await vi.waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
    tile('a').click();
    await done;
    expect(pcs[0].closed).toBe(true);
    expect(pcs).toHaveLength(2);
    expect(pcs[1].closed).toBe(false);
    expect(tile('a').classList.contains('connecting')).toBe(true);
  });

  it('reports a failed grab once and says there is no snapshot', async () => {
    stubPeerConnection();
    let clock = 1000;
    const api = vi.fn(async (): Promise<any> => { throw new Error('H.265 not supported'); });
    const { w, tile, report } = widget([cam('a', { image: null })], api, () => clock);
    await w.refresh();
    expect(report).toHaveBeenCalledWith('frame grab of Cam a failed: H.265 not supported', true);
    expect(tile('a').classList.contains('no-image')).toBe(true);
    expect(tile('a').getAttribute('data-empty')).toBe('No snapshot');
    // Retried after 5 minutes, without a second report.
    clock += 60e3;
    await w.refresh();
    expect(api).toHaveBeenCalledTimes(1);
    clock += 5 * 60e3;
    await w.refresh();
    expect(api).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('sends no offer for a camera with neither snapshot nor video', async () => {
    const pcs = stubPeerConnection();
    const { w, api } = widget([cam('a', { image: null, video: null })], offerApi());
    await w.refresh();
    expect(pcs).toHaveLength(0);
    expect(api).not.toHaveBeenCalled();
  });
});

describe('long refresh (battery cameras)', () => {
  const HOUR = 3600e3;
  const keptApi = (at: () => number) => vi.fn(async (_m: string, path: string): Promise<any> => (
    path.includes('saved=1') ? { none: true } : { type: 'image/jpeg', data: 'KEPT', at: at() }));
  const asks = (api: Mock) => api.mock.calls.filter((c: any[]) => String(c[1]).startsWith('/snapshot')).length;

  it('asks the app, never the image URL, and not again until the picture is due', async () => {
    let clock = 1e9;
    const taken = clock - 1000;
    const api = keptApi(() => taken);
    const { w, tile } = widget([cam('a')], api, () => clock, { refreshMs: HOUR });
    await w.refresh();
    expect(api.mock.calls[0].slice(0, 2)).toEqual(['GET', '/snapshot?deviceId=a&maxAge=3600']);
    expect(loaded).toEqual(['data:image/jpeg;base64,KEPT']);
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,KEPT');
    clock += HOUR - 2000;
    await w.refresh();
    expect(asks(api)).toBe(1);
    clock += 2000;
    await w.refresh();
    expect(asks(api)).toBe(2);
  });

  it('Only by Flow: asks once, then only after a Flow, and always shows the time', async () => {
    let at = 1e9 - 1000;
    const api = keptApi(() => at);
    const { w, tile } = widget([cam('a')], api, () => 2e9, { refreshMs: Infinity });
    await w.refresh();
    expect(api.mock.calls[0].slice(0, 2)).toEqual(['GET', '/snapshot?deviceId=a&maxAge=Infinity']);
    expect(tile('a').querySelector('.cw-badge')!.textContent).not.toBe('');
    await w.refresh();
    expect(asks(api)).toBe(1);
    at += 5000;
    expect(w.renewed('a')).toBe(true);
    await w.refresh();
    expect(asks(api)).toBe(2);
    expect(api.mock.calls[1][1]).toBe(`/snapshot?deviceId=a&maxAge=Infinity&have=${at - 5000}`);
    await w.refresh();
    expect(asks(api)).toBe(2);
  });

  it('a Flow during live view or a busy load is not lost: the tile stays due', async () => {
    const api = keptApi(() => 1e9);
    const { w } = widget([cam('a')], api, () => 2e9, { refreshMs: Infinity });
    await w.refresh();
    w.renewed('a');
    api.mockRejectedValueOnce(new Error('busy'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await w.refresh();
    expect(asks(api)).toBe(2);
    await w.refresh();
    expect(asks(api)).toBe(3);
  });

  it('asks the app again when the page shows, and keeps the picture when it is the same', async () => {
    const api = vi.fn(async (_m: string, path: string): Promise<any> => (
      path.includes('have=') ? { same: true } : { type: 'image/jpeg', data: 'KEPT', at: 1e9 }));
    const { w, tile } = widget([cam('a')], api, () => 2e9, { refreshMs: Infinity });
    await w.refresh();
    const shown = loaded.length;
    w.pause();
    w.resume();
    await w.refresh();
    expect(asks(api)).toBe(2);
    expect(loaded.length).toBe(shown);
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,KEPT');
    await w.refresh();
    expect(asks(api)).toBe(2);
  });

  it('a short refresh ignores the event', async () => {
    const { w } = widget([cam('a')], vi.fn(), () => 1000, { refreshMs: 10e3 });
    expect(w.renewed('a')).toBe(false);
  });

  it('waits 5 min before asking again when no new picture came', async () => {
    let clock = 1e9;
    const api = vi.fn(async (): Promise<any> => { throw new Error('asleep'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { w } = widget([cam('a')], api, () => clock, { refreshMs: HOUR });
    await w.refresh();
    clock += 60e3;
    await w.refresh();
    expect(asks(api)).toBe(1);
    clock += 4 * 60e3;
    await w.refresh();
    expect(asks(api)).toBe(2);
  });

  it('keeps the direct image URL on a short refresh', async () => {
    const api = keptApi(() => 1);
    const { w } = widget([cam('a')], api, () => 1000, { refreshMs: 60e3 });
    await w.refresh();
    expect(asks(api)).toBe(0);
    expect(loaded[0]).toContain('/api/image/img-a');
  });

  it('shows a video-only camera\'s kept frame and opens no stream until a frame is due', async () => {
    const pcs = stubPeerConnection();
    let clock = 1e9;
    const api = vi.fn(async (): Promise<any> => ({ type: 'image/jpeg', data: 'OLD', at: clock - 1000 }));
    const { w, tile } = widget([cam('a', { image: null })], api, () => clock, { refreshMs: HOUR });
    await w.refresh();
    expect((api.mock.calls as any[][])[0].slice(0, 2)).toEqual(['GET', '/snapshot?deviceId=a&saved=1']);
    expect(tile('a').querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,OLD');
    expect(pcs).toHaveLength(0);
    await w.refresh();
    expect(asks(api)).toBe(1);
  });

  it('Only by Flow, video-only: a kept frame opens no stream, a Flow\'s event does', async () => {
    const pcs = stubPeerConnection();
    stubCanvas();
    const api = vi.fn(async (_m: string, path: string): Promise<any> => (path === '/video/offer'
      ? { answer: 'v=0', streamId: 's' } : { type: 'image/jpeg', data: 'OLD', at: 1e9 }));
    const { w, tile } = widget([cam('a', { image: null })], api, () => 2e9, { refreshMs: Infinity });
    await w.refresh();
    await w.refresh();
    expect(pcs).toHaveLength(0);
    expect(w.renewed('a', true)).toBe(true);
    const done = w.refresh();
    await vi.waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
    playing(tile('a'));
    await done;
    expect(api).toHaveBeenCalledWith('POST', '/snapshot', { deviceId: 'a', type: 'image/jpeg', data: 'FRAME' });
  });

  it('grabs when a Flow asked for a frame while no screen was open', async () => {
    const pcs = stubPeerConnection();
    const api = vi.fn(async (_m: string, path: string): Promise<any> => (path === '/video/offer'
      ? { answer: 'v=0', streamId: 's' } : { type: 'image/jpeg', data: 'OLD', at: 1e9, wanted: true }));
    const { w } = widget([cam('a', { image: null })], api, () => 2e9, { refreshMs: Infinity });
    w.refresh();
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    w.pause();
  });

  it('gives the app a grabbed frame to keep', async () => {
    const pcs = stubPeerConnection();
    stubCanvas();
    const api = vi.fn(async (_m: string, path: string): Promise<any> => (path === '/video/offer'
      ? { answer: 'v=0', streamId: 's' } : { none: true }));
    const { w, tile } = widget([cam('a', { image: null })], api, () => 1e9, { refreshMs: HOUR });
    const done = w.refresh();
    await vi.waitFor(() => expect(pcs[0]?.remote).toBeTruthy());
    playing(tile('a'));
    await done;
    expect(api).toHaveBeenCalledWith('POST', '/snapshot', { deviceId: 'a', type: 'image/jpeg', data: 'FRAME' });
  });
});
