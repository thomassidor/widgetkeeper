/*
 * Wires createGaugeWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountGaugeWidget = function (Homey, { root, frame }) {
  const { spanSetting, slotId } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // The value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = slotId(settings.slot);
  const number = v => (v === '' || v == null ? undefined : Number(v));

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createGaugeWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      layout: settings.layout, // missing: the bar
      span: spanSetting(settings, '', { count: 1, unit: 'calDays' }), // a number of a unit; missing: today
      scale: settings.scale, // missing: automatic
      scaleMin: number(settings.scaleMin),
      scaleMax: number(settings.scaleMax),
      zones: settings.zones, // missing: one colour
      yellowAt: number(settings.yellowAt),
      redAt: number(settings.redAt),
      showRange: settings.showRange !== false, // missing: on
      title: settings.title,
      onHeight: link.setHeight,
    })),
    need: 'selectValue',
    query: () => (slot ? `charts=${encodeURIComponent(slot)}~${encodeURIComponent(widget.windows()[0])}` : null),
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountGaugeWidget.frameClass = 'homey-widget';
