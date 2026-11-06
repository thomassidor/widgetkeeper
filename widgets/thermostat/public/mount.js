/*
 * Wires createThermostatWidget to Homey: the settings, the app's API and its realtime events. index.html calls it
 * with the frame's own Homey and body; the Smart Stack calls it with a slide of its page and a Homey of its own.
 * `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountThermostatWidget = function (Homey, { root, frame }) {
  const REFRESH_MS = 5 * 60e3; // keeps the app's device subscription alive and resyncs state

  const { wireFrame, onDeviceNames } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);

  const settings = Homey.getSettings() || {};
  // A tap that changes something vibrates, as on the other widgets that act (the settings review, 2026-11-04). Homey's
  // haptic throws unless a touch has just ended (a click, a key, a late send): nothing then.
  // Once for a room's lights or presets' several values sent together.
  let hapticAt = 0;
  const haptic = () => {
    if (Date.now() - hapticAt < 300) return;
    hapticAt = Date.now();
    try { if (Homey.hapticFeedback) Homey.hapticFeedback(); } catch (e) { /* not now */ }
  };
  // `none`: a row that only said something (`No thermostats found`) was tapped.
  const deviceId = (settings.device && settings.device.id !== 'none' && settings.device.id) || null;
  // The value beside the name: a Device Values slot `<deviceId>:<capabilityId>` (`None`'s id has no colon).
  const sensor = settings.sensor && String(settings.sensor.id || '').includes(':') ? settings.sensor.id : null;
  // Sent with a button's tap, so the Flow card *… was tapped* knows the button (a stack page has the original's id).
  let instance = '';
  try { instance = typeof Homey.getWidgetInstanceId === 'function' ? Homey.getWidgetInstanceId() || '' : ''; } catch (e) { /* none */ }
  let loaded = false;

  const widget = window.createThermostatWidget(root, {
    colorStyle: settings.colorStyle,
    t: (key, tokens) => Homey.__(key, tokens),
    layout: settings.layout, // missing on widgets placed before the setting: standard
    title: settings.title, // empty or missing: the device's name
    onApply: (values, press) => {
      haptic();
      return Homey.api('POST', '/apply', {
        deviceId,
        values: values.map(({ capabilityId, value }) => ({ capabilityId, value })),
        ...(press && instance ? { instance, button: press.button } : {}),
      });
    },
    // The widget reports its own height; Homey needs the body's, which adds the widget padding.
    onHeight: link.setHeight,
  });
  widget.setButtons(window.thermostatPresetsFromSettings(settings));

  function ready() {
    return link.ready();
  }

  async function load() {
    if (!deviceId) {
      widget.setMessage(widget.t('selectDevice'));
      ready();
      return;
    }
    try {
      const sensorParam = sensor ? `&sensor=${encodeURIComponent(sensor)}` : '';
      const state = await Homey.api('GET', `/state?deviceId=${encodeURIComponent(deviceId)}${sensorParam}${link.perfParam()}`);
      loaded = !state.missing; // a deleted device: the buttons go, the next error is persistent too
      if (state.missing) widget.setMessage(widget.t('error'));
      else widget.setState(state);
    } catch (err) {
      console.error(err);
      refresh.failed();
      // A failed refresh keeps the buttons; only a failed first load replaces them with the error.
      widget.setMessage(widget.t('error'), loaded);
    }
    ready();
  }

  Homey.on('thermostat:state', (data) => {
    if (data && data.deviceId === deviceId) widget.pushChange(data);
  });
  // The sensor is tracked by Device Values' service, which sends its changes as `values:state`.
  Homey.on('values:state', (data) => {
    if (sensor && data && `${data.deviceId}:${data.capabilityId}` === sensor) widget.pushSensor(data.value);
  });

  const refresh = window.WidgetkeeperKit.wireRefresh(load, REFRESH_MS);
  onDeviceNames(Homey, load);
  load();
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountThermostatWidget.frameClass = 'homey-widget tw-frame';
