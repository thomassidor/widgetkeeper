import { createHash } from 'node:crypto';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type Homey from 'homey';
import { getAppApi } from './appApi.js';
import { listDevicesWhere, withNone, type AutocompleteItem } from './autocomplete.js';
import { isTransientError, readFresh } from './DeviceTracker.js';
import { deviceImage, fetchDeviceIcon, fetchImageBase64, type DeviceImage } from './deviceIcon.js';
import { deviceNamer } from './deviceNames.js';
import { fileStorage } from './secrets.js';
import Timings from './Timings.js';

/** Several widgets (or a fast refresh) asking for the same snapshot within this share one fetch. */
const IMAGE_REUSE = 2000;
/** A camera no request has asked for in this long is forgotten (open widgets re-fetch every 5 min). */
const IDLE_TIMEOUT = 10 * 60e3;
/** After a camera didn't give a picture, it's left alone this long: every try wakes a battery camera. */
const KEEP_RETRY = 5 * 60e3;
/** A kept picture no widget has renewed in this long goes (a camera taken off every dashboard). */
const KEEP_FOR = 30 * 24 * 3600e3;
/** A frame the widget grabbed: at most 640 px wide, so far under this as base64. */
const MAX_FRAME_LENGTH = 1024 * 1024;
const FILE_PREFIX = 'camera-snapshot-';

/** The Flow card that renews a camera's picture, and what tells the open widgets. */
export const CAMERAS_REFRESH_CARD = 'cameras_refresh';
export const CAMERAS_PICTURE_EVENT = 'cameras:picture';

export type CameraImage = DeviceImage;

export type CameraDevice =
  | {
    id: string, name: string, icon: string | null, image: CameraImage | null,
    /** The best stream (`videos[0]`), kept for callers that only want one. */
    video: string | null,
    /** Every stream, best first: live view tries the next when one won't play. */
    videos: string[],
    /** The streams whose title says H.265, which Homey's WebRTC can't play. */
    h265: string[],
  }
  | { id: string, missing: true };

export type Snapshot = { type: string, data: string };
/** A kept picture, with when it was taken; `wanted`: a video-only camera's frame a Flow asked to renew. */
export type KeptSnapshot = Snapshot & { at: number, wanted?: boolean };
/** The answer when the widget already shows the kept picture (its `have`): a picture can be 2 MB. */
export type SamePicture = { same: true };

/** Where the long refresh's pictures are kept, one per camera. */
export type SnapshotFiles = { read(id: string): string | null, write(id: string, text: string): void, prune(olderThan: number): void };

/** In the app's own `/userdata`, as they can be 2 MB: never in memory or an app setting. Named by a hash, as an id comes from a request. */
export function snapshotFiles(dir = '/userdata'): SnapshotFiles {
  const file = (id: string) => join(dir, `${FILE_PREFIX}${createHash('sha256').update(id).digest('hex').slice(0, 32)}.json`);
  return {
    read: id => fileStorage(file(id)).read(),
    write: (id, text) => fileStorage(file(id)).write(text),
    prune(olderThan) {
      for (const name of readdirSync(dir)) {
        if (!name.startsWith(FILE_PREFIX)) continue;
        const path = join(dir, name);
        if (Date.now() - statSync(path).mtimeMs > olderThan) unlinkSync(path);
      }
    },
  };
}

/** A camera's streams, best first (`cameraVideos()`), and those whose title says H.265. */
export type CameraVideos = { videos: string[], h265: string[] };

/**
 * The snapshot to show: the device's first `camera` image, else its first image (`device.images`
 * entries are `{type, id, title, imageObj: {id, url, lastUpdated}}`).
 */
export function cameraImage(device: any): CameraImage | null {
  return deviceImage(device, 'camera', { anyType: true });
}

const H265 = /h\.?265|hevc/i;

/**
 * The videos for live view, best first: `device.videos` entries are `{type, id, title, videoObj: {id, type:
 * 'rtsp'}}`. Homey's go2rtc only offers H.264 over WebRTC, and the Reolink app's `main` stream can be H.265
 * (`Camera (main - h265)`), so the `sub` stream comes first, then streams that say H.264, then any that don't
 * say H.265, and H.265 last (a title can be wrong). The widget tries them in this order until one plays.
 */
export function cameraVideos(device: any): string[] {
  const videos: any[] = (Array.isArray(device?.videos) ? device.videos : []).filter((v: any) => v?.videoObj?.id);
  const rank = (v: any) => {
    const title = String(v.title ?? '');
    if (v.id === 'sub' || /sub/i.test(title)) return H265.test(title) ? 3 : 0;
    if (/h\.?264|avc/i.test(title)) return 1;
    return H265.test(title) ? 4 : 2;
  };
  return videos
    .map((v, i) => ({ v, i, r: rank(v) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => String(x.v.videoObj.id));
}

/** The videos whose title says H.265. */
export function h265Videos(device: any): string[] {
  return (Array.isArray(device?.videos) ? device.videos : [])
    .filter((v: any) => v?.videoObj?.id && H265.test(String(v.title ?? '')))
    .map((v: any) => String(v.videoObj.id));
}

/**
 * Whether a device has a camera's picture or stream: a `camera` image or a video, whatever its class (Synology
 * Surveillance Station's cameras are class `sensor`, which the `devices` filter, by class only, leaves out).
 */
export function hasCameraMedia(device: any): boolean {
  const images: any[] = Array.isArray(device?.images) ? device.images : [];
  return images.some(i => i?.type === 'camera') || cameraVideos(device).length > 0;
}

/**
 * Cameras widget: snapshot URLs and live view. Homey serves a device's snapshot at `/api/image/<id>`
 * (the driver makes it on request); the widget loads that directly when it can reach it, or else
 * through `getSnapshot`. Live view goes through Homey's own WebRTC server (go2rtc, `api.videos`):
 * the widget's offer goes in, an answer and a stream id come back, and the stream is kept alive.
 */
export default class CameraService {

  private images = new Map<string, { at: number, promise: Promise<Snapshot> }>();
  /** Each camera's last entry, for a read that fails only because Homey is busy. */
  private last = new Map<string, CameraDevice>();
  /** deviceId → image URL from the last state read, so a snapshot doesn't need a device read. */
  private imageUrls = new Map<string, string>();
  /** When each camera was last asked for, so `last` and `imageUrls` don't keep cameras no widget shows any more. */
  private requested = new Map<string, number>();
  /** The long refresh: pictures being fetched, so two screens wake a camera once, and when one last failed. */
  private keeping = new Map<string, Promise<KeptSnapshot>>();
  private keepFailed = new Map<string, number>();

  constructor(
    private homey: Homey.App['homey'],
    private log: (...args: any[]) => void, // errors and warnings: always kept
    private debug: (...args: any[]) => void = () => {}, // routine detail: only with the `debugLog` setting on
    private files: SnapshotFiles = snapshotFiles(),
  ) {}

  async stop() {
    this.images.clear();
    this.last.clear();
    this.imageUrls.clear();
    this.requested.clear();
    this.keepFailed.clear();
  }

  /**
   * The Camera 1 … 6 settings: `None`, then every camera, doorbell or device with a camera image or a video, as the
   * `devices` setting's filter can only ask for classes.
   */
  async listCameras(query: string): Promise<AutocompleteItem[]> {
    const items = await this.listFlowCameras(query);
    return items[0]?.id === 'none' ? items : withNone(this.homey.__('values.none') || 'None', query, items);
  }

  /** The same cameras without `None`, for the Flow card. */
  async listFlowCameras(query: string): Promise<AutocompleteItem[]> {
    return listDevicesWhere(this.homey, query, d => d?.class === 'camera' || d?.class === 'doorbell' || hasCameraMedia(d), {
      empty: this.homey.__('autocomplete.noCameras') || 'No cameras found',
    });
  }

  /** One entry per device, in the order asked for. A deleted device doesn't fail the others. */
  async getState(deviceIds: string[]): Promise<CameraDevice[]> {
    const tm = new Timings();
    const api = await tm.time('api', () => getAppApi(this.homey));
    const show = await deviceNamer(this.homey, tm, this.log, 'Camera');
    const out = await Promise.all(deviceIds.map(async (id): Promise<CameraDevice> => {
      this.requestedNow(id);
      try {
        const device: any = await tm.time('getDevice', () => readFresh(api.devices, id));
        const image = cameraImage(device);
        const videos = cameraVideos(device);
        if (image) this.imageUrls.set(id, image.url);
        else this.imageUrls.delete(id);
        const entry: CameraDevice = {
          id,
          name: show(device.name, device.zone),
          icon: await tm.time('icons', () => fetchDeviceIcon(api, device, this.log)),
          image,
          video: videos[0] ?? null,
          videos,
          h265: h265Videos(device),
        };
        this.last.set(id, entry);
        return entry;
      } catch (err) {
        this.log(`Camera ${id} unavailable:`, err);
        // Homey busy isn't a deleted camera: its last entry, so a live view goes on (as DeviceTracker keeps its entries).
        const last = this.last.get(id);
        if (last && isTransientError(err)) return last;
        this.last.delete(id);
        this.imageUrls.delete(id);
        return { id, missing: true };
      }
    }));
    this.debug(`Cameras state for ${deviceIds.length} devices: ${tm.summary()}`);
    return out;
  }

  /** The device's current snapshot, for a widget that can't load the image URL itself. */
  async getSnapshot(deviceId: string): Promise<Snapshot> {
    this.requestedNow(deviceId);
    let url = this.imageUrls.get(deviceId);
    if (!url) {
      const api = await getAppApi(this.homey);
      const image = cameraImage(await api.devices.getDevice({ id: deviceId, $cache: false }));
      if (!image) throw new Error('No camera image');
      url = image.url;
      this.imageUrls.set(deviceId, url);
    }
    const hit = this.images.get(url);
    if (hit && Date.now() - hit.at < IMAGE_REUSE) return hit.promise;
    const promise = this.fetchImage(url);
    const key = url;
    this.images.set(key, { at: Date.now(), promise });
    // Snapshots can be 2 MB, so none is kept past its reuse window.
    const drop = () => { if (this.images.get(key)?.promise === promise) this.images.delete(key); };
    promise.then(() => this.homey.setTimeout(drop, IMAGE_REUSE), drop);
    return promise;
  }

  /**
   * The long refresh (battery cameras): the kept picture while it's younger than `maxAge` ms, so opening a dashboard
   * doesn't wake the camera; else a new one, kept. A camera that doesn't answer gives the kept picture, however old.
   */
  async getKeptSnapshot(deviceId: string, maxAge: number, have?: number): Promise<KeptSnapshot | SamePicture> {
    this.requestedNow(deviceId);
    const kept = this.readKept(deviceId);
    if (kept && Date.now() - kept.at < maxAge) return kept.at === have ? { same: true } : kept;
    const running = this.keeping.get(deviceId);
    if (!running) {
      const failedAt = this.keepFailed.get(deviceId);
      if (failedAt != null && Date.now() - failedAt < KEEP_RETRY) {
        if (kept) return kept;
        throw new Error('Camera did not answer');
      }
    }
    return (running ?? this.fetchAndKeep(deviceId)).catch((err) => {
      if (kept) return kept;
      throw err;
    });
  }

  /** Asks the camera and keeps its picture, once however many ask; rejects when it doesn't answer. */
  private fetchAndKeep(deviceId: string): Promise<KeptSnapshot> {
    const fetched = this.getSnapshot(deviceId).then(
      (snapshot) => {
        this.keepFailed.delete(deviceId);
        return this.keep(deviceId, snapshot);
      },
      (err) => {
        this.keepFailed.set(deviceId, Date.now());
        throw err;
      },
    ).finally(() => this.keeping.delete(deviceId));
    this.keeping.set(deviceId, fetched);
    return fetched;
  }

  /**
   * The Flow card: one new picture, kept, whatever the age of the last one and with no dashboard open, so a failure
   * throws to the Flow (the old picture stays). The app can't read a frame from a stream, so a video-only camera's is
   * asked of the open widgets, and marked on the kept frame for the next widget to open.
   */
  async refreshPicture(deviceId: string) {
    this.requestedNow(deviceId);
    const api = await getAppApi(this.homey);
    const device: any = await readFresh(api.devices, deviceId);
    const image = cameraImage(device);
    if (image) {
      this.imageUrls.set(deviceId, image.url);
      await (this.keeping.get(deviceId) ?? this.fetchAndKeep(deviceId));
      this.homey.api.realtime(CAMERAS_PICTURE_EVENT, { deviceId });
      return;
    }
    if (!cameraVideos(device).length) throw new Error('No camera image');
    this.wantFrame(deviceId);
    this.homey.api.realtime(CAMERAS_PICTURE_EVENT, { deviceId, grab: true });
  }

  /** A video-only camera's kept frame, however old (the widget grabs a new one when it's due), or `{none: true}`. */
  getKeptFrame(deviceId: string, have?: number): KeptSnapshot | SamePicture | { none: true } {
    this.requestedNow(deviceId);
    const kept = this.readKept(deviceId);
    if (kept && kept.at === have && !kept.wanted) return { same: true };
    return kept ?? { none: true };
  }

  /** Marks the kept frame as due for a new grab, which clears it. Without a kept frame the next widget grabs anyway. */
  private wantFrame(deviceId: string) {
    const kept = this.readKept(deviceId);
    if (!kept || kept.wanted) return;
    try {
      this.files.write(deviceId, JSON.stringify({ ...kept, wanted: true }));
    } catch (err) {
      this.log(`Camera ${deviceId}: could not mark its frame:`, err);
    }
  }

  /** Keeps a frame the widget grabbed from a video-only camera, one a `/state` has just named. */
  keepFrame(deviceId: string, type: unknown, data: unknown) {
    if (!this.last.has(deviceId) || type !== 'image/jpeg' || typeof data !== 'string' || !data || data.length > MAX_FRAME_LENGTH) {
      throw new Error('Invalid frame');
    }
    this.keep(deviceId, { type, data });
  }

  /** A camera's streams, read fresh: a popup's camera may be one no widget has asked for. */
  async getVideos(deviceId: string): Promise<CameraVideos> {
    this.requestedNow(deviceId);
    const api = await getAppApi(this.homey);
    const device: any = await readFresh(api.devices, deviceId);
    return { videos: cameraVideos(device), h265: h265Videos(device) };
  }

  /** Starts live view: Homey answers the widget's WebRTC offer (all candidates included, no trickle). */
  async offer(videoId: string, offer: string): Promise<{ answer: string, streamId: string | null }> {
    const api = await getAppApi(this.homey);
    const t0 = Date.now();
    const res: any = await api.videos.videoOffer({ id: videoId, offer });
    if (!res || typeof res.answerSdp !== 'string') throw new Error('No answer from Homey');
    this.debug(`Camera video ${videoId}: answered in ${Date.now() - t0} ms, stream ${res.streamId}`);
    return { answer: res.answerSdp, streamId: typeof res.streamId === 'string' ? res.streamId : null };
  }

  async keepAlive(videoId: string, streamId: string) {
    const api = await getAppApi(this.homey);
    await api.videos.videoKeepAlive({ id: videoId, streamId });
  }

  /** Marks `id` as asked for, and forgets the cameras nothing has asked for in IDLE_TIMEOUT. */
  private requestedNow(id: string) {
    const now = Date.now();
    this.requested.set(id, now);
    for (const [k, at] of this.requested) {
      if (now - at <= IDLE_TIMEOUT) continue;
      this.requested.delete(k);
      this.last.delete(k);
      this.imageUrls.delete(k);
    }
  }

  /** The kept picture; none if it can't be read, which only means asking the camera. */
  private readKept(deviceId: string): KeptSnapshot | null {
    try {
      const text = this.files.read(deviceId);
      if (text == null) return null;
      const kept = JSON.parse(text);
      return typeof kept?.type === 'string' && typeof kept.data === 'string' && Number.isFinite(kept.at) ? kept : null;
    } catch (err) {
      this.log(`Camera ${deviceId}: kept snapshot unreadable:`, err);
      return null;
    }
  }

  /** Writes it and drops old ones; a failed write still gives the picture. */
  private keep(deviceId: string, snapshot: Snapshot): KeptSnapshot {
    const kept = { type: snapshot.type, data: snapshot.data, at: Date.now() };
    try {
      this.files.write(deviceId, JSON.stringify(kept));
      this.files.prune(KEEP_FOR);
    } catch (err) {
      this.log(`Camera ${deviceId}: could not keep its snapshot:`, err);
    }
    return kept;
  }

  private async fetchImage(url: string): Promise<Snapshot> {
    const api = await getAppApi(this.homey);
    const t0 = Date.now();
    const snapshot = await fetchImageBase64(api, url, 'Snapshot');
    this.debug(`Camera snapshot ${url}: ${Math.round(snapshot.data.length / 1024)} KB base64 in ${Date.now() - t0} ms`);
    return snapshot;
  }

}
