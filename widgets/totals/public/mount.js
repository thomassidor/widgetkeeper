/*
 * Wires createTotalsWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountTotalsWidget = function (Homey, { root, frame }) {
  const { spanSetting, slotId } = window.WidgetkeeperKit;
  const settings = Homey.getSettings() || {};
  // The value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = slotId(settings.slot);
  const period = spanSetting(settings, '', { count: 1, unit: 'calWeeks' }); // a number of a unit; missing: this week
  const compare = settings.compare === true;
  const show = settings.show === 'cost' ? 'cost' : 'use'; // missing: the amount, as before 1.2.0

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createTotalsWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      period,
      compare,
      show,
      legend: settings.legend, // missing: above
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValue',
    // The period's running total, and with compare the period before's.
    // With Show: Cost, the prices over them too.
    query: () => {
      if (!slot) return null;
      const prices = widget.priceSpan();
      return `charts=${widget.windows().map(w => `${encodeURIComponent(slot)}~${encodeURIComponent(w)}`).join(',')}${prices ? `&prices=${prices}` : ''}`;
    },
    state: res => [res && res.charts, res && res.language, res ? res.prices : undefined],
    // A long span's first read of past prices answers with what came within 8 s: the rest in 10 s.
    again: res => (res && res.prices && res.prices.pending ? 10e3 : null),
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountTotalsWidget.frameClass = 'homey-widget';
