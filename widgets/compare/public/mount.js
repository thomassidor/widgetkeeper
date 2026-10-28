/*
 * Wires createCompareWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountCompareWidget = function (Homey, { root, frame }) {
  const { spanSetting } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // Each value is an autocomplete item whose id is `<deviceId>:<capabilityId>`; empty ones are left out.
  const slots = [1, 2, 3, 4, 5, 6, 7, 8].map(n => settings[`slot${n}`] && settings[`slot${n}`].id)
    .filter(id => typeof id === 'string' && id.indexOf(':') > 0 && !id.endsWith(':')); // as parseSlot()

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createCompareWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      count: slots.length,
      span: spanSetting(settings, '', { count: 1, unit: 'calDays' }), // a number of a unit; missing: today
      sort: settings.sort, // missing: highest first
      showRange: settings.showRange !== false, // missing: on
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValues',
    query: () => {
      if (!slots.length) return null;
      const windows = widget.windows();
      return `charts=${slots.map((s, i) => `${encodeURIComponent(s)}~${encodeURIComponent(windows[i])}`).join(',')}`;
    },
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountCompareWidget.frameClass = 'homey-widget';
