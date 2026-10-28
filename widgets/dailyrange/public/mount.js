/*
 * Wires createDailyRangeWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountDailyRangeWidget = function (Homey, { root, frame }) {
  const { spanSetting } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // The value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = settings.slot && settings.slot.id;
  const picked = typeof slot === 'string' && slot.indexOf(':') > 0 && !slot.endsWith(':'); // as parseSlot()

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createDailyRangeWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      span: spanSetting(settings, '', { count: 4, unit: 'weeks' }), // a number of a unit; missing: the last 4 weeks
      average: settings.average !== false, // missing: on
      range: settings.range,
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValue',
    query: () => (picked ? `charts=${widget.windows().map(w => `${encodeURIComponent(slot)}~${encodeURIComponent(w)}`).join(',')}` : null),
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountDailyRangeWidget.frameClass = 'homey-widget';
