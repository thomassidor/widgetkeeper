/*
 * Wires createLinesWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountLinesWidget = function (Homey, { root, frame }) {
  const { spanSetting } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // Each value is an autocomplete item whose id is `<deviceId>:<capabilityId>`; empty ones are left out, with their colours.
  const slotOf = s => (s && typeof s.id === 'string' && s.id.indexOf(':') > 0 && !s.id.endsWith(':') ? s.id : null); // as parseSlot()
  const lines = [1, 2, 3, 4, 5, 6].map(n => ({ id: slotOf(settings[`slot${n}`]), color: settings[`color${n}`] })).filter(l => l.id);

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createLinesWidget(root, {
      colorStyle: settings.colorStyle,
      colors: lines.map(l => l.color), // a missing one: the kit's colours in order
      t: key => Homey.__(key),
      count: lines.length,
      span: spanSetting(settings, '', { count: 24, unit: 'hours' }), // a number of a unit; missing: 24 hours
      style: settings.style, // missing: lines
      range: settings.range, // missing: fit
      smooth: settings.smooth === true,
      legend: settings.legend, // missing: above
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValues',
    query: () => {
      if (!lines.length) return null;
      const windows = widget.windows();
      return `charts=${lines.map((l, i) => `${encodeURIComponent(l.id)}~${encodeURIComponent(windows[i])}`).join(',')}`;
    },
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountLinesWidget.frameClass = 'homey-widget';
