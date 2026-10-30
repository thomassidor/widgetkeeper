/*
 * Wires createStackedWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountStackedWidget = function (Homey, { root, frame }) {
  const { spanSetting, slotId } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // Each value is an autocomplete item whose id is `<deviceId>:<capabilityId>`; empty ones are left out, with their colours.
  const total = slotId(settings.total);
  const layers = [1, 2, 3, 4, 5, 6].map(n => ({ id: slotId(settings[`slot${n}`]), color: settings[`color${n}`] })).filter(l => l.id);

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createStackedWidget(root, {
      colorStyle: settings.colorStyle,
      colors: layers.map(l => l.color), // a missing one: the kit's colours in order
      t: key => Homey.__(key),
      total: !!total,
      count: layers.length,
      span: spanSetting(settings, '', { count: 24, unit: 'hours' }), // a number of a unit; missing: 24 hours
      style: settings.style, // missing: areas
      legend: settings.legend, // missing: above
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValues',
    // The total first, when picked, then the layers.
    query: () => {
      if (!layers.length) return null;
      const windows = widget.windows();
      const slots = (total ? [total] : []).concat(layers.map(l => l.id));
      return `charts=${slots.map((s, i) => `${encodeURIComponent(s)}~${encodeURIComponent(windows[i])}`).join(',')}`;
    },
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountStackedWidget.frameClass = 'homey-widget';
