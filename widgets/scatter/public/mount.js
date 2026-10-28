/*
 * Wires createScatterWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountScatterWidget = function (Homey, { root, frame }) {
  const { spanSetting } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // Each value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = item => (item && typeof item.id === 'string' && item.id.indexOf(':') > 0 && !item.id.endsWith(':') ? item.id : null); // as parseSlot()
  const x = slot(settings.xValue), y = slot(settings.yValue);

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createScatterWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      span: spanSetting(settings, '', { count: 7, unit: 'days' }), // a number of a unit; missing: the last 7 days
      dots: settings.dots,
      trend: settings.trend !== false, // missing: on
      fade: settings.fade !== false, // missing: on
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValues',
    // Both values over the same window.
    query: () => {
      if (!x || !y) return null;
      const [wx, wy] = widget.windows();
      return `charts=${encodeURIComponent(x)}~${encodeURIComponent(wx)},${encodeURIComponent(y)}~${encodeURIComponent(wy)}`;
    },
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountScatterWidget.frameClass = 'homey-widget';
