/*
 * Wires createCombinedWidget to Homey: the settings, the app's API and its realtime events. index.html calls it with the
 * frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own. `frame` is the
 * element whose height Homey gets (the body, or the slide).
 */
window.mountCombinedWidget = function (Homey, { root, frame }) {
  const haptic = window.WidgetkeeperKit.wireHaptic(Homey); // a tap that acts vibrates
  const { wireFrame, wireDeviceState, wireTileNames } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);
  window.WidgetkeeperKit.wireTileShadow(Homey); // the app's Tile shadows (kit.css)

  const settings = Homey.getSettings() || {};
  // The `capability` setting is an autocomplete item whose id is the capability id (`none` for none).
  const pick = settings.capability && typeof settings.capability === 'object' ? settings.capability.id : null;
  const capabilityId = typeof pick === 'string' && pick && pick !== 'none' ? pick : null;

  // The names typed on the devices in the list (Rename tiles), sent with every `/state` and by realtime.
  const tileNames = wireTileNames(Homey, names => widget.setNames(names));
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
    onTap: haptic,
    renameTiles: settings.renameTiles === true,
    onRename: (key, name) => tileNames.rename(key, name),
  });

  /** The devices counted in the last answer: the realtime changes of those count. */
  let counted = new Set();

  // The usual loop (also picks up a new device when none were picked), with no devices meaning every one with the value.
  wireDeviceState(Homey, link, widget, {
    devicesOptional: true,
    tileNames,
    need: () => (capabilityId ? null : 'selectValue'),
    query: () => `&capabilityId=${encodeURIComponent(capabilityId)}`,
    onState: (state) => {
      counted = new Set((state && Array.isArray(state.devices) ? state.devices : []).map(d => d.id));
    },
  });

  // The values are Value Matrix's cells, so their changes come as its event.
  Homey.on('valuematrix:state', (data) => {
    if (data && data.capabilityId === capabilityId && counted.has(data.deviceId)) widget.pushChange(data);
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountCombinedWidget.frameClass = 'homey-widget-full';
