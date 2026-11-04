/*
 * Wires createCombinedWidget to Homey: the settings, the app's API and its realtime events. index.html calls it with the
 * frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own. `frame` is the
 * element whose height Homey gets (the body, or the slide).
 */
window.mountCombinedWidget = function (Homey, { root, frame }) {
  const REFRESH_MS = 5 * 60e3; // keeps the app's device subscriptions alive, resyncs state and picks up new devices

  const { wireFrame, getDeviceIds, onDeviceNames } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);

  const settings = Homey.getSettings() || {};
  // The `capability` setting is an autocomplete item whose id is the capability id (`none` for none).
  const pick = settings.capability && typeof settings.capability === 'object' ? settings.capability.id : null;
  const capabilityId = typeof pick === 'string' && pick && pick !== 'none' ? pick : null;

  const widget = window.createCombinedWidget(root, {
    t: (key, tokens) => Homey.__(key, tokens),
    show: settings.show,
    name: settings.name,
    okRange: settings.okRange,
    range: settings.showRange !== false,
    chart: settings.chart !== false,
    tileStyle: settings.tileStyle,
    color: settings.color,
    colorStyle: settings.colorStyle,
    greenWhenFine: settings.greenWhenFine === true,
    onHeight: link.setHeight,
    // Throws without a touch just before it (a click on a web dashboard).
    onTap: () => { try { if (Homey.hapticFeedback) Homey.hapticFeedback(); } catch (e) { /* not on every platform */ } },
  });

  // Shown once the text font has loaded (at most 1 s), so the text doesn't pop in.
  const ready = () => link.ready({ fonts: true });

  let deviceIds = [];
  /** The devices counted in the last answer: the realtime changes of those count. */
  let counted = new Set();
  let loaded = false;
  let loadSeq = 0; // only the latest load's answer counts

  async function load() {
    const seq = ++loadSeq;
    if (!capabilityId) {
      widget.setMessage(widget.t('selectValue'));
      ready();
      return;
    }
    try {
      const ids = deviceIds.length ? `&deviceIds=${deviceIds.map(encodeURIComponent).join(',')}` : '';
      const state = await Homey.api('GET', `/state?capabilityId=${encodeURIComponent(capabilityId)}${ids}${link.perfParam()}`);
      if (seq !== loadSeq) return;
      counted = new Set((state && Array.isArray(state.devices) ? state.devices : []).map(d => d.id));
      widget.setState(state);
      loaded = true;
    } catch (err) {
      if (seq !== loadSeq) return;
      console.error(err);
      // A failed refresh keeps the tile; only a failed first load replaces it with the error.
      widget.setMessage(widget.t('error'), loaded);
    }
    ready();
  }

  // The values are Value Matrix's cells, so their changes come as its event.
  Homey.on('valuematrix:state', (data) => {
    if (data && data.capabilityId === capabilityId && counted.has(data.deviceId)) widget.pushChange(data);
  });

  getDeviceIds(Homey)
    .then((ids) => { deviceIds = [...new Set(ids)]; })
    .then(() => {
      setInterval(load, REFRESH_MS);
      onDeviceNames(Homey, load);
      load();
    });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountCombinedWidget.frameClass = 'homey-widget-full';
