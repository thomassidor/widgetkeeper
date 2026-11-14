/*
 * Wires createValueBoardWidget to Homey: the settings, the app's API and its realtime events. index.html calls it
 * with the frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own.
 * `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountValueBoardWidget = function (Homey, { root, frame }) {
  const { wireFrame, wireTileNames, wireDeviceState } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);
  window.WidgetkeeperKit.wireTileShadow(Homey); // the app's Tile shadows (kit.css)

  const settings = Homey.getSettings() || {};

  const tileNames = wireTileNames(Homey, names => widget.setNames(names));
  const widget = window.createValueBoardWidget(root, {
    renameTiles: settings.renameTiles === true,
    onRename: (key, name) => tileNames.rename(key, name),
    layout: settings.layout,
    groupBy: settings.groupBy,
    columns: settings.columns,
    greenWhenFine: settings.greenWhenFine === true,
    colorStyle: settings.colorStyle,
    t: (key, tokens) => Homey.__(key, tokens),
    onHeight: link.setHeight,
  });

  // The devices' values with their rooms and tile names, now and every 5 min, and their realtime changes.
  wireDeviceState(Homey, link, widget, {
    event: 'valueboard:state',
    tileNames,
    query: () => (settings.values === 'all' ? '&values=all' : ''),
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountValueBoardWidget.frameClass = 'homey-widget-full';
