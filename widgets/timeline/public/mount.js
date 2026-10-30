/*
 * Wires createTimelineWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountTimelineWidget = function (Homey, { root, frame }) {
  const { spanSetting } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // Each value is an autocomplete item whose id is `<deviceId>:<capabilityId>`; empty ones are left out, with their colours.
  // A number's threshold and side come with it (`thresholdN`, `whenN`); a boolean's are ignored.
  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
    id: settings[`slot${n}`] && settings[`slot${n}`].id,
    color: settings[`color${n}`],
    threshold: { at: Number(settings[`threshold${n}`]), below: settings[`when${n}`] === 'below' }, // missing: above 0
  }))
    .filter(r => typeof r.id === 'string' && r.id.indexOf(':') > 0 && !r.id.endsWith(':')); // as parseSlot()

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createTimelineWidget(root, {
      colorStyle: settings.colorStyle,
      colors: rows.map(r => r.color), // a missing one: the kit's colours in order
      thresholds: rows.map(r => r.threshold),
      t: key => Homey.__(key),
      span: spanSetting(settings, '', { count: 1, unit: 'calDays' }), // a number of a unit; missing: today
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValues',
    query: () => {
      if (!rows.length) return null;
      const w = widget.window();
      return `slots=${rows.map(r => encodeURIComponent(r.id)).join(',')}&from=${w.from}&end=${w.end}&unit=${w.unit}&span=${encodeURIComponent(w.span)}`;
    },
    state: res => [res && res.rows, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountTimelineWidget.frameClass = 'homey-widget';
