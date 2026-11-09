import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { DEVICE_NAMES_SETTING } from '../lib/deviceNames.js';
import CameraService, { cameraImage, cameraVideos, h265Videos, hasCameraMedia, snapshotFiles } from '../lib/CameraService.js';

vi.mock('homey-api', () => homeyApiMock);

// As the Reolink app reports them (verified on the real Homey, 2026-10-04).
const image = (id: string, type = 'camera') => ({
  type, id: 'snapshot', title: 'Snapshot',
  imageObj: { id, ownerUri: 'homey:app:com.reolink', url: `/api/image/${id}`, lastUpdated: 1790672723645 },
});
const video = (id: string, videoId: string, codec = 'h264', title = `Camera (${id} - ${codec})`) => ({
  type: 'camera', id, title,
  videoObj: { id: videoId, ownerUri: 'homey:app:com.reolink', type: 'rtsp', options: {} },
});
const camera = (id: string, name: string, extra: object) => Object.assign(fakeDevice({ id, name, caps: {} }), extra);

const kitchen = () => camera('kitchen', 'E1 Kitchen', { images: [image('img-k')], videos: [video('main', 'vid-km', 'h265'), video('sub', 'vid-ks')] });
const terrace = () => camera('terrace', 'C4 Terrace', { images: [], videos: [] });

function setup(devices = [kitchen(), terrace()]) {
  const api = Object.assign(fakeApi({ devices }), {
    baseUrl: 'http://homey',
    videos: {
      videoOffer: vi.fn(async ({ id }: { id: string }) => ({ answerSdp: `answer for ${id}`, streamId: `video_${id}` })),
      videoKeepAlive: vi.fn(async () => undefined),
    },
  });
  const homey = fakeHomey(api);
  return { api, homey, service: new CameraService(homey, () => {}) };
}

function stubFetch(type = 'image/jpeg') {
  const fetch = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': type } }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('state', () => {
  it('keeps a camera whose read fails because Homey is busy, and drops a deleted one', async () => {
    const { api, service } = setup();
    const [first] = await service.getState(['kitchen']);
    expect('missing' in first).toBe(false);
    api.devices.getDevice.mockRejectedValueOnce(Object.assign(new Error('Too many requests.'), { statusCode: 429 }));
    expect(await service.getState(['kitchen'])).toEqual([first]);
    api.devices.getDevice.mockRejectedValueOnce(new Error('Not Found'));
    expect(await service.getState(['kitchen'])).toEqual([{ id: 'kitchen', missing: true }]);
    // Its image goes too, so a snapshot isn't fetched from a deleted camera.
    expect((service as any).imageUrls.has('kitchen')).toBe(false);
  });
});

describe('cameraImage / cameraVideos', () => {
  it('picks the camera image, else any image', () => {
    expect(cameraImage({ images: [image('art', 'media'), image('snap')] })).toEqual({ id: 'snap', url: '/api/image/snap', lastUpdated: 1790672723645 });
    expect(cameraImage({ images: [image('art', 'media')] })?.id).toBe('art');
    expect(cameraImage({ images: [] })).toBeNull();
    expect(cameraImage({})).toBeNull();
  });

  it('prefers the sub stream, then one that isn\'t H.265', () => {
    expect(cameraVideos({ videos: [video('main', 'm'), video('sub', 's')] })[0]).toBe('s');
    expect(cameraVideos({ videos: [video('main', 'm', 'h265'), video('other', 'o')] })[0]).toBe('o');
    expect(cameraVideos({ videos: [video('main', 'm', 'h265')] })[0]).toBe('m');
    expect(cameraVideos({ videos: [] })).toEqual([]);
  });

  it('lists every stream, best first, so live view can fall back', () => {
    expect(cameraVideos({ videos: [video('main', 'm', 'h265'), video('sub', 's')] })).toEqual(['s', 'm']);
    // A stream that says H.264 before one that says nothing, H.265 last; otherwise the app's order.
    expect(cameraVideos({ videos: [
      video('a', 'a', 'h265'), video('b', 'b', '', 'Lens 2'), video('c', 'c', 'h264'), video('d', 'd', '', 'Lens 1'),
    ] })).toEqual(['c', 'b', 'd', 'a']);
    // A single stream (a camera on a Reolink Home Hub or NVR) is still tried.
    expect(cameraVideos({ videos: [video('main', 'm', 'h265')] })).toEqual(['m']);
    expect(cameraVideos({ videos: [{ id: 'x', title: 'No object' }] })).toEqual([]);
    expect(cameraVideos({})).toEqual([]);
  });

  it('tells a camera that calls itself a sensor (Synology) by its picture or stream', () => {
    expect(hasCameraMedia({ class: 'sensor', images: [image('snap')] })).toBe(true);
    expect(hasCameraMedia({ class: 'sensor', images: [], videos: [video('main', 'm')] })).toBe(true);
    expect(hasCameraMedia({ class: 'sensor', images: [image('art', 'media')] })).toBe(false);
    expect(hasCameraMedia({ class: 'sensor', capabilities: ['alarm_motion'] })).toBe(false);
  });

  it('names the H.265 streams', () => {
    expect(h265Videos({ videos: [video('main', 'm', 'h265'), video('sub', 's'), video('x', 'x', 'HEVC')] })).toEqual(['m', 'x']);
    expect(h265Videos({})).toEqual([]);
  });
});

describe('listCameras', () => {
  it('lists cameras, doorbells and any device with a camera picture or stream (Synology: class sensor), None first', async () => {
    const synology = camera('syn', 'Garden', { class: 'sensor', images: [image('img-s')] });
    const doorbell = camera('bell', 'Doorbird', { class: 'doorbell', images: [] });
    const motion = Object.assign(fakeDevice({ id: 'pir', name: 'Hall motion', class: 'sensor', caps: {} }), { images: [] });
    const art = camera('sonos', 'Sonos', { class: 'speaker', images: [image('img-a', 'media')] });
    const { service } = setup([Object.assign(kitchen(), { class: 'camera' }), synology, doorbell, motion, art]);
    expect((await service.listCameras('')).map(i => i.id)).toEqual(['none', 'bell', 'kitchen', 'syn']);
    expect((await service.listCameras('gard')).map(i => i.id)).toEqual(['syn']);
  });
});

describe('getState', () => {
  it('shows the name as the device names setting says', async () => {
    const { homey, service } = setup([camera('kitchen', 'E1 Kitchen | Hall', { images: [], videos: [] })]);
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'before', separator: '|' });
    expect(await service.getState(['kitchen'])).toMatchObject([{ id: 'kitchen', name: 'E1 Kitchen' }]);
  });

  it('returns the cameras in the order asked, with missing ones marked', async () => {
    const { service } = setup();
    expect(await service.getState(['terrace', 'nope', 'kitchen'])).toEqual([
      { id: 'terrace', name: 'C4 Terrace', icon: null, image: null, video: null, videos: [], h265: [] },
      { id: 'nope', missing: true },
      { id: 'kitchen', name: 'E1 Kitchen', icon: null, image: { id: 'img-k', url: '/api/image/img-k', lastUpdated: 1790672723645 }, video: 'vid-ks', videos: ['vid-ks', 'vid-km'], h265: ['vid-km'] },
    ]);
  });
});

describe('idle cameras', () => {
  it('forgets a camera no request has asked for in 10 minutes', async () => {
    const { service } = setup();
    await service.getState(['kitchen']);
    expect((service as any).last.has('kitchen')).toBe(true);
    expect((service as any).imageUrls.has('kitchen')).toBe(true);
    vi.advanceTimersByTime(11 * 60e3);
    await service.getState(['terrace']);
    expect((service as any).last.has('kitchen')).toBe(false);
    expect((service as any).imageUrls.has('kitchen')).toBe(false);
    expect((service as any).last.has('terrace')).toBe(true);
  });
});

describe('getSnapshot', () => {
  it('fetches the image from Homey as base64', async () => {
    const fetch = stubFetch();
    const { service } = setup();
    expect(await service.getSnapshot('kitchen')).toEqual({ type: 'image/jpeg', data: 'AQID' });
    expect(fetch).toHaveBeenCalledWith('http://homey/api/image/img-k', { signal: expect.any(AbortSignal) });
  });

  it('shares one fetch within 2 s, then fetches again', async () => {
    const fetch = stubFetch();
    const { service } = setup();
    await Promise.all([service.getSnapshot('kitchen'), service.getSnapshot('kitchen')]);
    await service.getSnapshot('kitchen');
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2100);
    await service.getSnapshot('kitchen');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails for a camera without an image, or a response that isn\'t one', async () => {
    stubFetch('application/json');
    const { service } = setup();
    await expect(service.getSnapshot('terrace')).rejects.toThrow('No camera image');
    await expect(service.getSnapshot('kitchen')).rejects.toThrow('Snapshot is application/json');
  });
});

describe('live view', () => {
  it('passes the offer to Homey and returns its answer and stream id', async () => {
    const { service, api } = setup();
    expect(await service.offer('vid-ks', 'v=0 offer')).toEqual({ answer: 'answer for vid-ks', streamId: 'video_vid-ks' });
    expect(api.videos.videoOffer).toHaveBeenCalledWith({ id: 'vid-ks', offer: 'v=0 offer' });
    await service.keepAlive('vid-ks', 'video_vid-ks');
    expect(api.videos.videoKeepAlive).toHaveBeenCalledWith({ id: 'vid-ks', streamId: 'video_vid-ks' });
  });

  it('fails without an answer', async () => {
    const { service, api } = setup();
    api.videos.videoOffer.mockResolvedValueOnce({} as any);
    await expect(service.offer('vid-ks', 'v=0')).rejects.toThrow('No answer from Homey');
  });
});

describe('kept snapshots (the long refresh)', () => {
  const HOUR = 3600e3;
  function keeping(devices?: any[]) {
    const stored = new Map<string, string>();
    const prune = vi.fn();
    const files = { read: (id: string) => stored.get(id) ?? null, write: (id: string, t: string) => { stored.set(id, t); }, prune };
    const { homey } = setup(devices);
    return { stored, prune, homey, service: new CameraService(homey, () => {}, () => {}, files) };
  }

  it('asks the camera once, then gives the kept picture until it is older than maxAge', async () => {
    const fetch = stubFetch();
    const { service, prune } = keeping();
    await service.getState(['kitchen']);
    const first = await service.getKeptSnapshot('kitchen', HOUR);
    expect(first).toEqual({ type: 'image/jpeg', data: 'AQID', at: Date.now() });
    expect(prune).toHaveBeenCalled();
    vi.advanceTimersByTime(HOUR - 1000);
    expect(await service.getKeptSnapshot('kitchen', HOUR)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(((await service.getKeptSnapshot('kitchen', HOUR)) as any).at).toBe(Date.now());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('survives a restart of the app', async () => {
    const fetch = stubFetch();
    const { service, stored, prune } = keeping();
    await service.getState(['kitchen']);
    const first = await service.getKeptSnapshot('kitchen', HOUR);
    const files = { read: (id: string) => stored.get(id) ?? null, write: () => {}, prune };
    expect(await new CameraService(setup().homey, () => {}, () => {}, files).getKeptSnapshot('kitchen', HOUR)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not send the picture the widget already shows', async () => {
    const fetch = stubFetch();
    const { service } = keeping();
    await service.getState(['kitchen']);
    const first: any = await service.getKeptSnapshot('kitchen', HOUR);
    expect(await service.getKeptSnapshot('kitchen', HOUR, first.at)).toEqual({ same: true });
    expect(await service.getKeptSnapshot('kitchen', HOUR, first.at - 1)).toEqual(first);
    expect(await service.getKeptSnapshot('kitchen', Infinity, first.at)).toEqual({ same: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('a Flow takes a new picture however young the last one, and tells the widgets', async () => {
    const fetch = stubFetch();
    const { service, homey } = keeping();
    await service.refreshPicture('kitchen');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(homey.api.realtime).toHaveBeenLastCalledWith('cameras:picture', { deviceId: 'kitchen' });
    vi.advanceTimersByTime(5000);
    await service.refreshPicture('kitchen');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(((await service.getKeptSnapshot('kitchen', Infinity)) as any).at).toBe(Date.now());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('a Flow is told when the camera fails, past the retry pause, and the old picture stays', async () => {
    const fetch = stubFetch();
    const { service, homey, stored } = keeping();
    await service.refreshPicture('kitchen');
    const kept = stored.get('kitchen');
    fetch.mockRejectedValue(new Error('asleep'));
    vi.advanceTimersByTime(5000);
    await expect(service.refreshPicture('kitchen')).rejects.toThrow();
    vi.advanceTimersByTime(5000);
    await expect(service.refreshPicture('kitchen')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(homey.api.realtime).toHaveBeenCalledTimes(1);
    expect(stored.get('kitchen')).toBe(kept);
  });

  it('a Flow marks a video-only camera\'s frame as wanted, until a new one is kept', async () => {
    const { service, homey } = keeping([camera('terrace', 'C4 Terrace', { images: [], videos: [video('main', 'vid-t')] })]);
    await service.getState(['terrace']);
    service.keepFrame('terrace', 'image/jpeg', 'AQID');
    const at = Date.now();
    expect(service.getKeptFrame('terrace', at)).toEqual({ same: true });
    await service.refreshPicture('terrace');
    expect(homey.api.realtime).toHaveBeenLastCalledWith('cameras:picture', { deviceId: 'terrace', grab: true });
    expect(service.getKeptFrame('terrace', at)).toEqual({ type: 'image/jpeg', data: 'AQID', at, wanted: true });
    vi.advanceTimersByTime(1000);
    service.keepFrame('terrace', 'image/jpeg', 'BBBB');
    expect(service.getKeptFrame('terrace')).toEqual({ type: 'image/jpeg', data: 'BBBB', at: at + 1000 });
  });

  it('a Flow fails for a device with neither a picture nor a video', async () => {
    const { service, homey } = keeping();
    await expect(service.refreshPicture('terrace')).rejects.toThrow('No camera image');
    expect(homey.api.realtime).not.toHaveBeenCalled();
  });

  it('the Flow card lists cameras without None', async () => {
    const { service } = keeping();
    const items = await service.listFlowCameras('');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(i => i.id === 'none')).toBe(false);
  });

  it('wakes a camera once for two screens at the same time', async () => {
    const fetch = stubFetch();
    const { service } = keeping();
    await service.getState(['kitchen']);
    await Promise.all([service.getKeptSnapshot('kitchen', HOUR), service.getKeptSnapshot('kitchen', HOUR)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives the kept picture when the camera fails, and leaves the camera alone for 5 min', async () => {
    const fetch = stubFetch();
    const { service } = keeping();
    await service.getState(['kitchen']);
    const first = await service.getKeptSnapshot('kitchen', HOUR);
    vi.advanceTimersByTime(HOUR + 3000);
    fetch.mockRejectedValue(new Error('asleep'));
    expect(await service.getKeptSnapshot('kitchen', HOUR)).toEqual(first);
    expect(await service.getKeptSnapshot('kitchen', HOUR)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5 * 60e3);
    await service.getKeptSnapshot('kitchen', HOUR);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('asks the camera when the file is broken', async () => {
    const fetch = stubFetch();
    const { service, stored } = keeping();
    await service.getState(['kitchen']);
    stored.set('kitchen', '{broken');
    expect(((await service.getKeptSnapshot('kitchen', HOUR)) as any).data).toBe('AQID');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a grabbed frame only for a camera a state named, and only a JPEG of a sensible size', async () => {
    const { service } = keeping();
    expect(() => service.keepFrame('kitchen', 'image/jpeg', 'AQID')).toThrow('Invalid frame');
    expect(service.getKeptFrame('kitchen')).toEqual({ none: true });
    await service.getState(['kitchen']);
    expect(() => service.keepFrame('kitchen', 'text/html', 'AQID')).toThrow('Invalid frame');
    expect(() => service.keepFrame('kitchen', 'image/jpeg', 'A'.repeat(1024 * 1024 + 1))).toThrow('Invalid frame');
    service.keepFrame('kitchen', 'image/jpeg', 'AQID');
    expect(service.getKeptFrame('kitchen')).toEqual({ type: 'image/jpeg', data: 'AQID', at: Date.now() });
  });
});

describe('snapshotFiles', () => {
  it('names files by a hash, and prunes only its own old ones', () => {
    vi.useRealTimers();
    const dir = mkdtempSync(join(tmpdir(), 'wk-cameras-'));
    try {
      const files = snapshotFiles(dir);
      files.write('../../evil', 'x');
      expect(files.read('../../evil')).toBe('x');
      const [name] = readdirSync(dir);
      expect(name).toMatch(/^camera-snapshot-[0-9a-f]{32}\.json$/);
      writeFileSync(join(dir, 'secrets.json'), '{}');
      files.prune(60e3);
      expect(readdirSync(dir)).toHaveLength(2);
      const old = new Date(Date.now() - 120e3);
      utimesSync(join(dir, name), old, old);
      utimesSync(join(dir, 'secrets.json'), old, old);
      files.prune(60e3);
      expect(readdirSync(dir)).toEqual(['secrets.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
