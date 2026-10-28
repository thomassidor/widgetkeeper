/*
 * Wires createTotalsWidget to Homey: the settings, the app's API and its realtime events (the chart module's
 * `wireChart()`). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of its
 * page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountTotalsWidget = function (Homey, { root, frame }) {
  const settings = Homey.getSettings() || {};
  // The value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = settings.slot && settings.slot.id;
  const picked = typeof slot === 'string' && slot.indexOf(':') > 0 && !slot.endsWith(':'); // as parseSlot()
  const period = settings.period || 'thisWeek'; // missing: the default
  const compare = settings.compare === true;

  return window.WidgetkeeperChart.wireChart(Homey, { frame }, {
    create: link => window.createTotalsWidget(root, {
      colorStyle: settings.colorStyle,
      color: settings.color,
      t: key => Homey.__(key),
      period,
      compare,
      title: settings.title,
      showHeader: settings.showHeader !== false, // missing: on
      onHeight: link.setHeight,
    }),
    need: 'selectValue',
    query: () => (picked ? `slot=${encodeURIComponent(slot)}&period=${encodeURIComponent(period)}${compare ? '&compare=1' : ''}` : null),
    state: res => (res ? [[res.current, res.previous], res.language] : [[], undefined]),
  });
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountTotalsWidget.frameClass = 'homey-widget';
