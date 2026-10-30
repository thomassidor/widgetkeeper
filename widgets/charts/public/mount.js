/*
 * Wires createChartsWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountChartsWidget = function (Homey, { root, frame }) {
  const { spanSetting, slotId } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // '2': stacked; 'overlay': both on one chart, over chart 1's time span (or two periods of a kind: today with yesterday …).
  const overlay = settings.charts === 'overlay';
  const count = settings.charts === '2' || overlay ? 2 : 1;
  // Each chart setting is an autocomplete item whose id is `<deviceId>:<capabilityId>`; empty ones are left out.
  const charts = [1, 2].slice(0, count).map(n => ({
    slot: slotId(settings[`chart${n}`]),
    span: spanSetting(settings, n), // a number of a unit, or the span set before 1.2.0
    style: settings[`style${n}`],
    color: settings[`color${n}`] || (n === 2 ? 'green' : 'blue'),
    range: settings[`range${n}`],
    negative: settings[`negative${n}`] === true,
    smooth: settings[`smooth${n}`] === true,
    title: settings[`title${n}`],
  })).filter(c => c.slot);

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createChartsWidget(root, {
      colorStyle: settings.colorStyle,
      t: (key, tokens) => Homey.__(key, tokens),
      charts,
      overlay: overlay && charts.length === 2,
      sharedScale: settings.sharedScale === true, // missing: off, each its own scale
      showHeader: settings.showHeader !== false, // missing: on
      legend: settings.legend, // missing: above
      onHeight: link.setHeight,
    })),
    need: 'selectChart',
    // The windows the widget draws: on one chart, series 2 may take chart 1's span (a lone chart keeps its own).
    query: () => {
      if (!charts.length) return null;
      const windows = widget.windows();
      return `charts=${charts.map((c, i) => `${encodeURIComponent(c.slot)}~${encodeURIComponent(windows[i])}`).join(',')}`;
    },
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountChartsWidget.frameClass = 'homey-widget';
