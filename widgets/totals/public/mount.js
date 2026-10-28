/*
 * Wires createTotalsWidget to Homey: the settings, the app's API and its realtime events. index.html calls it
 * with the frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own.
 * `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountTotalsWidget = function (Homey, { root, frame }) {
  const REFRESH_MS = 5 * 60e3; // keeps the app's device subscription alive and resyncs the history

  const { wireFrame, onDeviceNames } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);

  const settings = Homey.getSettings() || {};
  // The value is an autocomplete item whose id is `<deviceId>:<capabilityId>`.
  const slot = settings.slot && settings.slot.id;
  const picked = typeof slot === 'string' && slot.indexOf(':') > 0 && !slot.endsWith(':'); // as parseSlot()
  const period = settings.period || 'thisWeek'; // missing: the default
  const compare = settings.compare === true;
  let loaded = false;

  const widget = window.createTotalsWidget(root, {
    colorStyle: settings.colorStyle,
    color: settings.color,
    t: key => Homey.__(key),
    period,
    compare,
    title: settings.title,
    showHeader: settings.showHeader !== false, // missing: on
    onHeight: link.setHeight,
  });

  async function load() {
    if (!picked) {
      widget.setMessage(widget.t('selectValue'));
      link.ready();
      return;
    }
    try {
      const res = await Homey.api('GET', `/state?slot=${encodeURIComponent(slot)}&period=${encodeURIComponent(period)}${compare ? '&compare=1' : ''}${link.perfParam()}`);
      widget.setState(res ? [res.current, res.previous] : [], res && res.language);
      loaded = true;
    } catch (err) {
      console.error(err);
      // A failed refresh keeps the chart; only a failed first load replaces it with the error.
      widget.setMessage(widget.t('error'), loaded);
    }
    link.ready();
  }

  // The live values come from the Device Values service, which the app's Sparklines service (behind /state) uses.
  Homey.on('values:state', (data) => {
    if (data) widget.pushChange(data);
  });

  setInterval(load, REFRESH_MS);
  onDeviceNames(Homey, load);
  load();

  return {
    /** The Smart Stack: whether this page is the one on screen. */
    setVisible: (v) => widget.setVisible(v),
  };
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountTotalsWidget.frameClass = 'homey-widget';
