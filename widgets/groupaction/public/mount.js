/*
 * Wires createGroupActionWidget to Homey: the settings, the app's API and its realtime events. index.html calls it with
 * the frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own. `frame` is the
 * element whose height Homey gets (the body, or the slide).
 */
window.mountGroupActionWidget = function (Homey, { root, frame }) {
  const haptic = window.WidgetkeeperKit.wireHaptic(Homey); // a tap that acts vibrates
  const { wireFrame, wireDeviceState, takeTileShadow } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);
  window.WidgetkeeperKit.wireTileShadow(Homey); // the app's Tile shadows (kit.css)

  const settings = Homey.getSettings() || {};
  const widget = window.createGroupActionWidget(root, {
    t: (key, tokens) => Homey.__(key, tokens),
    name: settings.name,
    press: settings.press,
    color: settings.color,
    colorStyle: settings.colorStyle,
    onTrigger: (deviceId, value) => Homey.api('POST', '/trigger', { deviceId, value }),
    onHaptic: haptic,
    onHeight: link.setHeight,
  });

  // The devices' state (Quick Actions' answer, `{state, tileShadow}`), now and every 5 min, and their realtime changes.
  wireDeviceState(Homey, link, widget, {
    event: 'quickactions:state',
    setState: (res) => {
      takeTileShadow(res);
      widget.setState(res && !Array.isArray(res) && 'state' in res ? res.state : res);
    },
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountGroupActionWidget.frameClass = 'homey-widget-full';
