/*
 * Wires createCustomWidget to Homey: the design setting, the app's API and its realtime events. index.html calls it
 * with the frame's own Homey and body. Web dashboards only for now (instances `web-<dashboard>-<widget>`); on a Homey
 * dashboard it says so without asking the app.
 */
window.mountCustomWidget = function (Homey, { root, frame }) {
  const REFRESH_MS = 5 * 60e3; // keeps the app's device subscriptions alive and resyncs state

  const { wireFrame, onDeviceNames } = window.WidgetkeeperKit;
  const link = wireFrame(Homey, frame);
  window.WidgetkeeperKit.wireTileShadow(Homey);
  const haptic = window.WidgetkeeperKit.wireHaptic(Homey);

  const settings = Homey.getSettings() || {};
  const design = settings.design && typeof settings.design.id === 'string' && settings.design.id !== 'none' ? settings.design.id : '';
  // The widget's device: a design that works with any device shows this one's values.
  let device = '';
  const devices = window.WidgetkeeperKit.getDeviceIds(Homey).then((ids) => { device = ids[0] || ''; });
  /** A request's device: a Repeater's copy names its own, else the widget's. */
  const deviceOf = part => (part && part.device) || device || undefined;
  let instance = '';
  try { instance = typeof Homey.getWidgetInstanceId === 'function' ? Homey.getWidgetInstanceId() : ''; } catch (e) { /* not on the web */ }
  const web = Promise.resolve(instance).then(id => { instance = id; return typeof id === 'string' && id.startsWith('web-'); }, () => false);
  let loaded = false;
  let reading = 0;

  /** A route's `{ok: false, reason}` as a thrown error the widget can explain. */
  async function call(method, path, body) {
    const res = await Homey.api(method, path, body);
    if (res && res.ok === false) {
      throw Object.assign(new Error(res.reason || 'failed'), { reason: res.reason });
    }
    return res;
  }

  const widget = window.createCustomWidget(root, {
    t: (key, tokens) => Homey.__(key, tokens),
    colorStyle: settings.colorStyle,
    onHeight: link.setHeight,
    onHaptic: haptic,
    onSet: (part, value, slot) => call('POST', part.variable ? '/variable' : '/set', { design, part: part.id, value, ...(slot ? { slot } : {}), device: deviceOf(part) }),
    onButton: part => call('POST', part.flowId ? '/flow' : '/tap', { design, part: part.id, instance, device: deviceOf(part) }),
    // A button's actions the app runs, one at a time and in order; `do` says which kind (its API key use).
    onAction: (part, index, action) => call('POST', '/action', { design, part: part.id, index, do: action.do, device: deviceOf(part) }),
    // A web dashboard's page opens one (as Dashboard Shortcuts does).
    onOpen: (id) => { try { Homey.popup(`#/d/${encodeURIComponent(id)}`); } catch (e) { console.error(e); } },
    onImage: part => Homey.api('GET', `/image?design=${encodeURIComponent(design)}&part=${encodeURIComponent(part.id)}${deviceOf(part) ? `&device=${encodeURIComponent(deviceOf(part))}` : ''}`),
    // Widget states are kept on this screen, per design.
    storeKey: design,
  });

  const ready = () => link.ready({ fonts: true });

  async function load() {
    if (!await web) { widget.setMessage(widget.t('webOnly')); ready(); return; }
    if (!design) { widget.setMessage(widget.t('pickDesign')); ready(); return; }
    await devices;
    const mine = ++reading;
    try {
      const state = await Homey.api('GET', `/state?design=${encodeURIComponent(design)}${device ? `&device=${encodeURIComponent(device)}` : ''}${link.perfParam()}`);
      if (mine !== reading) return; // a newer read is on its way
      window.WidgetkeeperKit.takeTileShadow(state); // the app's Tile shadows ride along
      widget.setState(state);
      loaded = true;
    } catch (err) {
      console.error(err);
      refresh.failed();
      widget.setMessage(widget.t('error'), loaded);
    }
    ready();
  }

  Homey.on('values:state', (data) => { if (data) widget.pushValue(data); });
  Homey.on('variables:state', (data) => { if (data) widget.pushVariable(data); });
  Homey.on('custom:flow', (data) => { if (data && data.design === design) widget.pushFlow(data); });
  Homey.on('custom:design', (data) => { if (data && data.id === design) load(); });
  // The app's time format rides along in `/state` (no route of its own); a change draws the times again.
  Homey.on('timeformat:state', (data) => {
    if (data && window.WidgetkeeperKit.setTimeFormat(data.timeFormat)) widget.update();
  });

  const refresh = window.WidgetkeeperKit.wireRefresh(load, REFRESH_MS);
  onDeviceNames(Homey, load);
  load();
};
/** The classes index.html puts on its body. */
window.mountCustomWidget.frameClass = 'homey-widget-full';
