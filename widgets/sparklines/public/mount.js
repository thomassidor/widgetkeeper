/*
 * Wires createSparklinesWidget to Homey: the settings, the app's API and its realtime events. index.html calls it
 * with the frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own.
 * `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountSparklinesWidget = function (Homey, { root, frame }) {
  const REFRESH_MS = 5 * 60e3; // keeps the app's device subscriptions alive and resyncs state

  const { wireFrame, wireTileNames, onDeviceNames, slotId, spanSetting } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);
  window.WidgetkeeperKit.wireTileShadow(Homey); // the app's Tile shadows (kit.css)

  const settings = Homey.getSettings() || {};
  // Each slot setting is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slots = [1, 2, 3, 4, 5, 6].map(n => slotId(settings[`slot${n}`])).filter(Boolean);
  // A number of a unit (1.2.0, as the chart widgets'), or the span set before (`24h`, `today` …) until a unit is picked.
  const span = spanSetting(settings, '', { count: 24, unit: 'hours' });
  /** The name each value was picked by: a gone device's tile keeps it. */
  const labels = Object.fromEntries([1, 2, 3, 4, 5, 6]
    .map(n => settings[`slot${n}`])
    .filter(item => slotId(item) && typeof item.name === 'string')
    .map(item => [item.id, item.name]));
  let loaded = false;

  const tileNames = wireTileNames(Homey, names => widget.setNames(names));
  const widget = window.createSparklinesWidget(root, {
    colorStyle: settings.colorStyle,
    color: settings.color,
    smooth: settings.smooth === true,
    t: (key, tokens) => Homey.__(key, tokens),
    renameTiles: settings.renameTiles === true,
    onRename: (key, name) => tileNames.rename(key, name),
    span,
    columns: settings.columns,
    labels,
    onHeight: link.setHeight,
  });

  // Shown once the text font has loaded (at most 1 s), so the text doesn't pop in after the icons.
  function ready() {
    return link.ready({ fonts: true });
  }

  async function load() {
    if (!slots.length) {
      widget.setMessage(widget.t('selectSlots'));
      ready();
      return;
    }
    try {
      const state = await tileNames.state(`/state?slots=${slots.map(encodeURIComponent).join(',')}&window=${encodeURIComponent(widget.windowQuery())}${link.perfParam()}`);
      widget.setState(state);
      loaded = true;
    } catch (err) {
      console.error(err);
      refresh.failed();
      // A failed refresh keeps the tiles; only a failed first load replaces them with the error.
      widget.setMessage(widget.t('error'), loaded);
    }
    ready();
  }

  // The live values come from the Device Values service, which the app's sparklines service uses.
  Homey.on('values:state', (data) => {
    if (data) widget.pushChange(data);
  });

  const refresh = window.WidgetkeeperKit.wireRefresh(load, REFRESH_MS);
  onDeviceNames(Homey, load);
  load();

  return {
    /** The Smart Stack: whether this page is the one on screen (the lines only scroll while it is). */
    setVisible: v => widget.setVisible(v),
  };
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountSparklinesWidget.frameClass = 'homey-widget-full';
