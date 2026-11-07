// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFile } from './helpers/loadWidget.js';

/** A fake RTCPeerConnection, as the Cameras widget's tests have; `connections` lists them in order. */
function stubPeerConnection() {
  const connections: any[] = [];
  vi.stubGlobal('RTCPeerConnection', class {
    iceGatheringState = 'complete';
    localDescription = { sdp: 'v=0 offer' };
    connectionState = 'new';
    remote: any = null;
    closed = false;
    frames = 0;
    ontrack: any = null;
    onconnectionstatechange: any = null;
    constructor() { connections.push(this); }
    addTransceiver() {}
    addEventListener() {}
    removeEventListener() {}
    async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription(d: any) { this.remote = d; }
    async getStats() { return new Map([['in', { type: 'inbound-rtp', kind: 'video', framesDecoded: this.frames }]]); }
    close() { this.closed = true; }
  });
  return connections;
}

function setup(ids = ['sub', 'main'], refused: string[] = []) {
  const connections = stubPeerConnection();
  const video = document.createElement('video');
  video.play = vi.fn(async () => {});
  video.pause = vi.fn();
  const post = vi.fn(async (path: string, body: any): Promise<any> => {
    if (path === '/video/offer' && refused.includes(body.videoId)) throw new Error('codecs not matched');
    return path === '/video/offer' ? { answer: 'v=0 answer', streamId: `s-${body.videoId}` } : { ok: true };
  });
  const onPlaying = vi.fn();
  const onEnded = vi.fn();
  const stream = (window as any).WidgetkeeperKit.playCameraStream(video, ids, post, { onPlaying, onEnded });
  return { connections, video, post, onPlaying, onEnded, stream };
}

const offers = (post: any) => post.mock.calls.filter((c: any[]) => c[0] === '/video/offer').map((c: any[]) => c[1].videoId);

beforeEach(() => {
  vi.useFakeTimers();
  runFile('widgets/spacer/public/kit.js');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as any).WidgetkeeperKit;
});

describe('the kit: playCameraStream (a popup on a web dashboard)', () => {
  it('offers the first stream, says when it plays, and keeps it alive', async () => {
    const { video, post, onPlaying, onEnded } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(offers(post)).toEqual(['sub']);
    video.dispatchEvent(new Event('playing'));
    expect(onPlaying).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10e3);
    expect(post).toHaveBeenCalledWith('/video/keepalive', { videoId: 'sub', streamId: 's-sub' });
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('moves on from a refused stream and from one without a frame, then gives up', async () => {
    const { connections, post, onEnded, onPlaying } = setup(['h265', 'sub', 'main'], ['h265']);
    await vi.advanceTimersByTimeAsync(0);
    expect(offers(post)).toEqual(['h265', 'sub']);
    expect(connections[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(10e3);
    expect(offers(post)).toEqual(['h265', 'sub', 'main']);
    await vi.advanceTimersByTimeAsync(15e3);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(false, 'no video after 15 s', { away: true });
    expect(onPlaying).not.toHaveBeenCalled();
    expect(connections.every(c => c.closed)).toBe(true);
  });

  it('moves on from a connection that fails before a frame', async () => {
    const { connections, post } = setup();
    await vi.advanceTimersByTimeAsync(0);
    connections[0].connectionState = 'failed';
    connections[0].onconnectionstatechange();
    await vi.advanceTimersByTimeAsync(0);
    expect(offers(post)).toEqual(['sub', 'main']);
  });

  it('ends, as played, when a playing stream freezes or its connection fails', async () => {
    const frozen = setup();
    await vi.advanceTimersByTimeAsync(0);
    frozen.video.dispatchEvent(new Event('playing'));
    await vi.advanceTimersByTimeAsync(20e3);
    expect(frozen.onEnded).toHaveBeenCalledWith(true, 'no new frame for 15 s', { away: false });
    expect(frozen.connections[0].closed).toBe(true);

    const lost = setup();
    await vi.advanceTimersByTimeAsync(0);
    lost.video.dispatchEvent(new Event('playing'));
    lost.connections[0].connectionState = 'failed';
    lost.connections[0].onconnectionstatechange();
    expect(lost.onEnded).toHaveBeenCalledWith(true, 'connection failed', { away: false });
    expect(offers(lost.post)).toEqual(['sub']);
  });

  it('goes on while frames come', async () => {
    const { connections, video, onEnded } = setup();
    await vi.advanceTimersByTimeAsync(0);
    video.dispatchEvent(new Event('playing'));
    for (let i = 0; i < 12; i++) {
      connections[0].frames += 50;
      await vi.advanceTimersByTimeAsync(5000);
    }
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('stop() ends it without a word, even with an offer on its way', async () => {
    const { connections, post, onEnded, stream, video } = setup();
    stream.stop();
    await vi.advanceTimersByTimeAsync(30e3);
    expect(connections[0].closed).toBe(true);
    expect(video.srcObject).toBeNull();
    expect(onEnded).not.toHaveBeenCalled();
    expect(post.mock.calls.filter((c: any[]) => c[0] === '/video/keepalive')).toEqual([]);
  });

  it('says which stream played or made way, and a refused keep-alive once', async () => {
    const connections = stubPeerConnection();
    const video = document.createElement('video');
    video.play = vi.fn(async () => {});
    video.pause = vi.fn();
    const post = vi.fn(async (path: string, body: any): Promise<any> => {
      if (path === '/video/keepalive') throw new Error('gone');
      if (body.videoId === 'h265') throw new Error('codecs not matched');
      return { answer: 'v=0 answer', streamId: 's' };
    });
    const hooks = { onPlaying: vi.fn(), onEnded: vi.fn(), onStreamFailed: vi.fn(), onKeepAliveFailed: vi.fn() };
    (window as any).WidgetkeeperKit.playCameraStream(video, ['h265', 'sub'], post, hooks);
    await vi.advanceTimersByTimeAsync(0);
    expect(hooks.onStreamFailed).toHaveBeenCalledWith('h265', 'codecs not matched', 0);
    video.dispatchEvent(new Event('playing'));
    expect(hooks.onPlaying).toHaveBeenCalledWith('sub');
    connections[1].frames = 1;
    await vi.advanceTimersByTimeAsync(25e3);
    expect(hooks.onKeepAliveFailed).toHaveBeenCalledTimes(1);
  });

  it('tells a stream that was answered but never connected, unless another one connected', async () => {
    const unreached = setup(['sub']);
    await vi.advanceTimersByTimeAsync(15e3);
    expect(unreached.onEnded).toHaveBeenCalledWith(false, 'no video after 15 s', { away: true });
  });

  it('leaves the last frame in the video until onEnded has run, and stop() after it changes nothing', async () => {
    const connections = stubPeerConnection();
    const video = document.createElement('video');
    video.play = vi.fn(async () => {});
    video.pause = vi.fn();
    const post = vi.fn(async () => ({ answer: 'v=0 answer', streamId: 's' }));
    Object.defineProperty(video, 'srcObject', { writable: true, value: null }); // happy-dom takes only a real MediaStream
    let during: unknown = 'not called';
    const stream = (window as any).WidgetkeeperKit.playCameraStream(video, ['sub'], post, {
      onPlaying: () => {},
      onEnded: () => { during = video.srcObject; },
    });
    await vi.advanceTimersByTimeAsync(0);
    const media = {};
    connections[0].ontrack({ streams: [media] });
    video.dispatchEvent(new Event('playing'));
    await vi.advanceTimersByTimeAsync(20e3);
    expect(during).toBe(media);
    expect(video.srcObject).toBeNull();
    expect(video.pause).toHaveBeenCalledTimes(1);
    stream.stop();
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('ends at once without streams', () => {
    const { onEnded } = setup([]);
    expect(onEnded).toHaveBeenCalledWith(false, 'no streams', { away: false });
  });
});
