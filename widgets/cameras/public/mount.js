/*
 * Wires createCamerasWidget to Homey: the settings, the app's API and its realtime events. index.html calls it
 * with the frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own.
 * `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountCamerasWidget = function (Homey, { root, frame }) {
  const { wireFrame, wireTileNames, wireDeviceState } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);

  const settings = Homey.getSettings() || {};
  const snapshotMs = (Number(settings.refresh) || 10) * 1000;
  let snapshotTimer = null;
  let visible = true; // false while the Smart Stack shows another page

  const tileNames = wireTileNames(Homey, names => widget.setNames(names));
  const widget = window.createCamerasWidget(root, {
    t: (key, tokens) => Homey.__(key, tokens),
    renameTiles: settings.renameTiles === true,
    onRename: (key, name) => tileNames.rename(key, name),
    refreshMs: snapshotMs,
    liveFor: settings.liveFor,
    timeFormat: settings.timeFormat,
    layout: settings.layout,
    api:(method, path, body) => Homey.api(method, path, body),
    report: (text, warn) => { Homey.api('POST', '/report', { text, warn: !!warn }).catch(() => {}); },
    onHeight: link.setHeight,
  });

  // Snapshots refresh on their own timer, and not while the dashboard is in the background (or the stack's
  // slide is off screen). Live view until tapped comes back first, so the refresh skips the tiles it covers.
  function startSnapshots() {
    if (snapshotTimer || document.hidden || !visible || !cameras.loaded()) return;
    widget.resume();
    widget.refresh();
    snapshotTimer = setInterval(() => widget.refresh(), snapshotMs);
  }
  function stopSnapshots() {
    if (snapshotTimer) clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopSnapshots(); widget.pause(); } else startSnapshots();
  });

  // The cameras (names, image and video ids) with their tile names, now and every 5 min; snapshots start with the first.
  // Camera 1 … 6 add cameras the `devices` list leaves out (Synology's are class sensor), after the picked ones.
  const more = [1, 2, 3, 4, 5, 6].map(n => settings[`camera${n}`]?.id).filter(id => typeof id === 'string' && id && id !== 'none');
  const cameras = wireDeviceState(Homey, link, widget, { tileNames, onState: startSnapshots, more });

  return {
    /** The Smart Stack: whether this page is the one on screen. */
    setVisible(v) {
      visible = !!v;
      if (visible) startSnapshots();
      else { stopSnapshots(); widget.pause(); }
    },
  };
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountCamerasWidget.frameClass = 'homey-widget-full';
