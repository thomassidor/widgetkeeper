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

  let widget;
  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => (widget = window.createTotalsWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      period,
      compare,
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    })),
    need: 'selectValue',
    // The period's running total, and with compare the period before's.
    query: () => (slot ? `charts=${widget.windows().map(w => `${encodeURIComponent(slot)}~${encodeURIComponent(w)}`).join(',')}` : null),
    state: res => [res && res.charts, res && res.language],
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountTotalsWidget.frameClass = 'homey-widget';
