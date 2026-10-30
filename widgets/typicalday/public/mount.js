/*
 * Wires createTypicalDayWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountTypicalDayWidget = function (Homey, { root, frame }) {
  const settings = Homey.getSettings() || {};
  // The value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = window.WidgetkeeperKit.slotId(settings.slot);

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createTypicalDayWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: (key, tokens) => Homey.__(key, tokens),
      usual: settings.usual, // missing: 7 days
      band: settings.band !== false, // missing: on
      smooth: settings.smooth === true,
      range: settings.range,
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValue',
    // Today, and the days before it.
    query: () => (slot ? `charts=${widget.windows().map(w => `${encodeURIComponent(slot)}~${encodeURIComponent(w)}`).join(',')}` : null),
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountTypicalDayWidget.frameClass = 'homey-widget';
