import type { App } from 'homey';
import { timeFormatRoutes } from '../../lib/timeFormat.js';
import type WidgetkeeperApp from '../../app.js';
import type { KeptSnapshot, SamePicture, Snapshot } from '../../lib/CameraService.js';
import { idList, logged, logPerf } from '../../lib/widgetApi.js';
import { tileNameRoutes, withTileNames } from '../../lib/TileNameService.js';
import { tileShadowRoutes } from '../../lib/tileShadow.js';

type Homey = App['homey'];

export default {
  ...tileShadowRoutes,
  ...timeFormatRoutes,
  ...tileNameRoutes,

  async getState({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    logPerf(app, 'Cameras', query);
    return withTileNames(homey, query, logged(app, 'Cameras state failed:', () => app.cameras.getState(idList(query.deviceIds))));
  },

  /** A snapshot as base64, for a widget that can't load `/api/image/<id>` itself. */
  async getSnapshot({ homey, query }: {
    homey: Homey,
    query: Record<string, string>,
  }) {
    const app = homey.app as WidgetkeeperApp;
    if (!query.deviceId) throw new Error('deviceId required');
    // The long refresh: `saved` a video-only camera's kept frame, `maxAge` (seconds; Infinity for Only by Flow) a kept
    // snapshot, `have` the time of the picture the widget shows, which isn't sent again.
    const have = query.have ? Number(query.have) : undefined;
    if (query.saved) return app.cameras.getKeptFrame(query.deviceId, have);
    const maxAge = Number(query.maxAge) * 1000;
    return logged<Snapshot | KeptSnapshot | SamePicture>(app, `Camera snapshot for ${query.deviceId} failed:`, () => (maxAge > 0
      ? app.cameras.getKeptSnapshot(query.deviceId, maxAge, have)
      : app.cameras.getSnapshot(query.deviceId)));
  },

  /** Keeps a frame the widget grabbed from a video-only camera, on the long refresh. */
  async postSnapshot({ homey, body }: {
    homey: Homey,
    body: { deviceId?: string, type?: string, data?: string },
  }) {
    const app = homey.app as WidgetkeeperApp;
    if (!body?.deviceId) throw new Error('deviceId required');
    app.cameras.keepFrame(body.deviceId, body.type, body.data);
    return { ok: true };
  },

  async postOffer({ homey, body }: {
    homey: Homey,
    body: { videoId?: string, offer?: string },
  }) {
    const app = homey.app as WidgetkeeperApp;
    const { videoId, offer } = body ?? {};
    if (!videoId || typeof offer !== 'string') throw new Error('videoId and offer required');
    return logged(app, `Camera video ${videoId} offer failed:`, () => app.cameras.offer(videoId, offer));
  },

  async postKeepAlive({ homey, body }: {
    homey: Homey,
    body: { videoId?: string, streamId?: string },
  }) {
    const app = homey.app as WidgetkeeperApp;
    if (!body?.videoId || !body.streamId) throw new Error('videoId and streamId required');
    await app.cameras.keepAlive(body.videoId, body.streamId);
    return { ok: true };
  },

  /**
   * What the widget found out about loading snapshots and live view, for the diagnostics log. A failure
   * (`warn`: a stream that wouldn't play) is always logged; the rest only with debug logging on.
   */
  async postReport({ homey, body }: {
    homey: Homey,
    body: { text?: string, warn?: boolean },
  }) {
    const app = homey.app as WidgetkeeperApp;
    if (typeof body?.text !== 'string') return { ok: true };
    const line = `Cameras widget: ${body.text.slice(0, 300)}`;
    if (body.warn === true) app.log(line);
    else app.debug(line);
    return { ok: true };
  },
};
