// The widget pages' "Looks" (docs/widgets/<id>.md, docs/variants/<id>-<key>.webp, scripts/render-variants.mjs): each
// widget in its modes, with the README screenshot's made-up data (mock-dashboard.js) where it has one. `VARIANTS[id]` is
// a list of `{key, label, light, opts}`: `label` is written on the image and in its alt text, `light` is Homey's light
// mode, and `opts` go over the widget's options through `BASE[id](el, opts)`. Spacer draws nothing, so it has none.
(function () {
  const withOpts = (w, o) => ({ ...w, opts: { ...w.opts, ...o } });

  // The widgets the README shows as a clip, not a screenshot, and Smart Stack's and Timers' own.
  const curtains = SHOWCASE.livingroom.columns.flat().find(w => w.type === 'curtains');
  const kitchenTimer = SHOWCASE.kitchen.columns.flat().find(w => w.type === 'timers');
  const MIN = 6e4;
  const BASE = {
    ...SCREENSHOTS,
    lights: (el, { count, ...o } = {}) => {
      const w = findWidget('lights');
      MOUNT.lights(el, withOpts({ ...w, devices: w.devices.slice(0, count) }, o));
    },
    // A row per device: the showcase's sensors go by their ids, as only their rooms show on a dashboard.
    valuematrix: (el, o) => {
      const w = findWidget('valuematrix');
      const devices = w.state.devices.map(d => ({ ...d, name: `${d.zone.name} sensor` }));
      MOUNT.valuematrix(el, withOpts({ ...w, state: { ...w.state, devices } }, o));
    },
    curtains: (el, o) => MOUNT.curtains(el, { opts: o, devices: [...curtains.devices,
      { id: 'ec3', name: 'Bedroom blind', kind: 'blind', caps: { windowcoverings_set: { value: 1, setable: true }, windowcoverings_state: { value: 'idle', setable: true } } },
      { id: 'ec4', name: 'Office', kind: 'curtain', caps: { windowcoverings_set: { value: 0.6, setable: true } } }] }),
    media: (el, o) => MOUNT.media(el, withOpts(findWidget('media'), o)),
    timers: (el, { done, ...o } = {}) => MOUNT.timers(el, done
      ? { presets: kitchenTimer.presets, opts: o, timers: [{ id: 'd1', label: 'Eggs', duration: 7 * MIN, endsAt: SHOWCASE_NOW - 20e3, remaining: null, doneAt: SHOWCASE_NOW - 20e3 }] }
      : withOpts(kitchenTimer, o)),
    sensordots: (el, { closed, ...o } = {}) => {
      const w = findWidget('sensordots', 1);
      MOUNT.sensordots(el, withOpts(closed ? { ...w, open: null } : w, o));
    },
    stack: (el, o) => MOUNT.stack(el, withOpts(findWidget('stack'), o)),
    // A made-up house's rooms, as dev/valueboard-preview.html's: Value Board has no README screenshot.
    valueboard: (el, o) => {
      const n = (capabilityId, title, value, units = null, more = {}) => ({
        capabilityId, title, type: typeof value === 'boolean' ? 'boolean' : 'number', units, decimals: null, min: null, max: null, values: null, value, ...more,
      });
      const T = t => n('measure_temperature', 'Temperature', t, '°C', { decimals: 1 });
      const H = h => n('measure_humidity', 'Humidity', h, '%');
      const B = b => n('measure_battery', 'Battery', b, '%');
      const W = w => n('measure_power', 'Power', w, 'W');
      const zone = (id, name) => ({ id, name });
      const living = zone('living', 'Living room'), kitchen = zone('kitchen', 'Kitchen'), bed = zone('bed', 'Bedroom');
      createValueBoardWidget(el, o).setState([
        { id: 'thermo', zone: living, name: 'Thermostat', values: [T(21.4), H(41)] },
        { id: 'tv', zone: living, name: 'TV', values: [W(86)] },
        { id: 'balcony', zone: living, name: 'Balcony door', values: [n('alarm_contact', 'Contact', false), B(64)] },
        { id: 'fridge', zone: kitchen, name: 'Fridge', values: [T(4.1), W(42)] },
        { id: 'kair', zone: kitchen, name: 'Air sensor', values: [T(22), H(48), B(18)] },
        { id: 'bair', zone: bed, name: 'Air monitor', values: [T(19.2), H(52), n('measure_co2', 'CO₂', 1140, 'ppm')] },
        { id: 'window', zone: bed, name: 'Window', values: [n('alarm_contact', 'Contact', true), B(91)] },
      ]);
    },
  };

  /** The frame Homey gives a widget that isn't transparent, as in screenshots.html. */
  const FRAME = {
    electricity: 'card', charts: 'card', totals: 'card', scatter: 'card', compare: 'card', timeline: 'card', stacked: 'card', lines: 'card', gauge: 'card',
    dailyrange: 'card', typicalday: 'card', dayssince: 'card', thermostat: 'card tw-frame', varpresets: 'card tw-frame', media: 'card mw-frame',
    weather: 'card wf-frame', heatmap: 'card hm-frame', keypad: 'card kp-frame', pollen: 'card pw-frame', webpage: 'wp-dash',
  };

  const LIGHT = { key: 'light', label: 'Light', light: true };
  const VIVID = { key: 'vivid', label: 'Vivid', opts: { colorStyle: 'deep' } };
  const v = (key, label, opts, light = false) => ({ key, label, opts, light });
  const lightVivid = v('light-vivid', 'Light · Vivid', { colorStyle: 'deep' }, true);

  const VARIANTS = {
    cameras: [LIGHT, v('top', 'Three, the first large', { layout: 'top', count: 3 }), v('single', 'One camera at a time', { layout: 'single' })],
    charts: [LIGHT, VIVID,
      v('overlay', 'Two values on one chart', { overlay: true, charts: [{ span: '24h', color: 'purple', smooth: true }, { span: '24h', style: 'bars', color: 'orange' }] }),
      v('line', 'Light · Lines, no header', { showHeader: false, charts: [{ span: '24h', style: 'line', color: 'green' }, { span: '24h', style: 'line', color: 'blue' }] }, true)],
    clock: [LIGHT, v('time', 'Without the weather', { showWeather: false }), v('12h', 'Light · 12-hour clock', { timeFormat: '12' }, true)],
    compare: [LIGHT, VIVID, v('no-range', 'Without the range', { showRange: false }), v('green', 'Light · Green', { color: 'green' }, true)],
    curtains: [LIGHT, VIVID, v('purple', 'Vivid purple', { colorStyle: 'deep', color: 'purple' }), v('no-state', 'Light · Without the state', { showState: false }, true)],
    dailyrange: [LIGHT, VIVID, v('no-average', 'Without the average', { average: false, color: 'orange' }), v('zero', 'Light · From zero', { range: 'zero', color: 'green' }, true)],
    dayssince: [LIGHT, VIVID, v('days', 'Counted in days', { units: 'days' }), v('due', 'Light · Only what is due', { show: 'due' }, true)],
    electricity: [LIGHT, VIVID, v('compact', 'Compact', { layout: 'compact' }),
      v('separate', 'Light · Usage apart, in purple', { settings: { separateUsage: true, usageColor: 'purple' } }, true)],
    flows: [LIGHT, VIVID, v('one', 'One column', { columns: '1' }), lightVivid],
    gauge: [LIGHT, VIVID, v('dial', 'Dial', { layout: 'dial' }), v('light-dial', 'Light · Dial, Vivid', { layout: 'dial', colorStyle: 'deep' }, true)],
    heatmap: [LIGHT, VIVID, v('purple', 'Purple', { color: 'purple' }), v('green', 'Light · Green, without the legend', { color: 'green', showLegend: false }, true)],
    keypad: [LIGHT, VIVID, v('tap', 'Keypad on a tap', { keypad: 'tap' }), v('compact', 'Light · Compact', { layout: 'compact', keypad: 'tap' }, true)],
    lightrooms: [LIGHT, VIVID, v('no-moods', 'Without Moods', { showMoods: false }), v('light-vivid', 'Light · Vivid', { colorStyle: 'deep' }, true)],
    lights: [LIGHT, VIVID, v('wide', 'Five lights, the last tile wide', { wideLast: true, count: 5 }), lightVivid],
    lines: [LIGHT, VIVID, v('area', 'Areas', { style: 'area' }), v('smooth', 'Light · Smooth, legend below', { smooth: true, legend: 'below' }, true)],
    locks: [LIGHT, VIVID, v('summary', 'Summary', { view: 'summary' }), v('light-summary', 'Light · Summary', { view: 'summary' }, true)],
    media: [LIGHT, VIVID, v('large', 'Large', { layout: 'large' }), v('line', 'Light · Large, volume slider', { layout: 'large', volumeLayout: 'line' }, true)],
    pollen: [LIGHT, VIVID, v('detailed', 'Detailed', { density: 'detailed' }), v('light-detailed', 'Light · Detailed', { density: 'detailed' }, true)],
    popups: [LIGHT,
      v('message', 'A message', { popup: { kind: 'message', text: 'The washing machine is done', buttons: [], picture: null } }),
      v('light-message', 'Light · A message', { popup: { kind: 'message', text: 'The washing machine is done', buttons: [], picture: null } }, true)],
    price: [LIGHT, VIVID, v('24', '24 hours', { hours: '24' }), v('no-tint', 'Light · Without the tint', { tint: false }, true)],
    quickactions: [LIGHT, VIVID, v('pill', 'Pill tiles', { columns: '2', tileStyle: 'pill' }), v('purple', 'Light · Vivid purple', { colorStyle: 'deep', color: 'purple' }, true)],
    roomhealth: [LIGHT, VIVID, v('bars', 'Bars', { layout: 'bars' }), v('green', 'Light · Green when fine', { greenWhenFine: true }, true)],
    scatter: [LIGHT, VIVID, v('no-trend', 'Without the trend line', { trend: false, color: 'orange' }), v('no-fade', 'Light · Without the fade', { fade: false, color: 'green' }, true)],
    sensoralarms: [LIGHT, VIVID, v('three', 'Three columns', { columns: '3' }), lightVivid],
    sensordots: [LIGHT, VIVID, v('closed', 'Panel closed', { closed: true }), v('colours', 'Light · Green idle, red active', { closed: true, idleColor: 'green', activeColor: 'red' }, true)],
    shortcuts: [LIGHT, VIVID, v('one', 'One column', { columns: '1' }), lightVivid],
    sparklines: [LIGHT, VIVID, v('one', 'One column', { columns: '1' }), lightVivid],
    stack: [LIGHT, VIVID, v('large-dots', 'Large dots', { dotsSize: 'large' }), v('dots-above', 'Light · Dots above', { dotsPosition: 'above' }, true)],
    stacked: [LIGHT, VIVID, v('bars', 'Bars', { style: 'bars' }), v('legend', 'Light · Legend below', { legend: 'below' }, true)],
    textline: [LIGHT, VIVID, v('large', 'Large, centred, wrapped', { size: 'large', align: 'center', overflow: 'wrap' }), lightVivid],
    thermostat: [LIGHT, VIVID, v('compact', 'Compact', { layout: 'compact' }), v('light-compact', 'Light · Compact', { layout: 'compact' }, true)],
    timeline: [LIGHT, VIVID, v('no-header', 'Without the header', { showHeader: false }), lightVivid],
    timers: [LIGHT, VIVID, v('done', 'A timer done', { done: true }), v('purple', 'Light · Vivid purple', { colorStyle: 'deep', color: 'purple' }, true)],
    totals: [LIGHT, VIVID, v('month', 'This month, a bar a day', { period: 'thisMonth', compare: false, color: 'green' }), v('week', 'Light · This week', { period: 'thisWeek', compare: false, color: 'orange' }, true)],
    typicalday: [LIGHT, VIVID, v('no-band', 'Without the band', { band: false, color: 'purple' }), v('smooth', 'Light · Smooth', { smooth: true, color: 'green' }, true)],
    valuematrix: [LIGHT, VIVID, v('devices', 'A row per device', { rows: 'devices' }), v('no-legend', 'Light · Without the legend', { showLegend: false }, true)],
    combined: [LIGHT, VIVID, v('no-chart', 'Without the chart', { chart: false }), v('orange', 'Light · Orange', { color: 'orange' }, true)],
    flowtiles: [LIGHT, VIVID, v('pill', 'Pill tiles', { tileStyle: 'pill' }), v('three', 'Light · Three per row', { columns: '3' }, true)],
    valueboard: [LIGHT, VIVID, v('compact', 'Compact', { layout: 'compact' }), v('green', 'Light · Green when fine', { greenWhenFine: true }, true)],
    values: [LIGHT, VIVID, v('pill', 'Pill tiles', { columns: '2', tileStyle: 'pill' }), v('no-fill', 'Light · Without the fills', { percentFill: false }, true)],
    variables: [LIGHT, VIVID, v('two', 'Two columns', { columns: '2' }), v('read-only', 'Light · Read only', { readOnly: true }, true)],
    varpresets: [LIGHT, VIVID, v('compact', 'Compact', { layout: 'compact' }), v('yellow', 'Light · Yellow', { color: 'yellow' }, true)],
    weather: [LIGHT,
      v('vivid', 'Vivid', { theme: 'vivid' }), v('card', 'Card', { theme: 'card' }),
      v('detailed', 'Detailed', { density: 'detailed' }), v('light-rows', 'Light · Two rows', { rows: 2, step: 2 }, true)],
    webpage: [LIGHT, v('one-page', 'A single page', { onePage: true })],
  };

  window.VARIANTS = VARIANTS;

  const params = new URLSearchParams(location.search);
  const id = params.get('w');
  const list = Object.entries(VARIANTS).flatMap(([w, vs]) => vs.map(x => ({ id: w, key: x.key, label: x.label, light: !!x.light })));
  document.body.dataset.variants = encodeURIComponent(JSON.stringify(list));
  if (!id) {
    // Without ?w=: links to every variant, and the list for the render script.
    for (const x of list) {
      const a = document.body.appendChild(document.createElement('a'));
      a.href = `?w=${x.id}&v=${x.key}${x.light ? '&mode=light' : ''}`;
      a.textContent = `${x.id}: ${x.label}`;
      a.style.display = 'block';
    }
    return;
  }

  const variant = VARIANTS[id].find(x => x.key === params.get('v'));
  // The mode is set in variants.html's head, before the styles; this draws the caption and the widget.
  const panel = document.body.appendChild(document.createElement('div'));
  panel.className = 'panel';
  panel.appendChild(document.createElement('div')).className = 'cap';
  panel.firstChild.textContent = variant.label;
  const host = panel.appendChild(document.createElement('div'));
  if (FRAME[id]) host.className = FRAME[id];
  const opts = { ...variant.opts };
  try {
    if (id === 'popups') {
      host.className = 'pp-phone';
      host.innerHTML = '<div class="pp-screen"><div class="pp-browser"><b>Done</b><span>192.168.1.20</span><i></i></div><iframe title="Popup"></iframe></div>';
      BASE.popups(host.querySelector('iframe'), { ...opts, light: !!variant.light });
    } else {
      BASE[id](host.appendChild(document.createElement('div')), opts);
    }
  } catch (err) {
    host.appendChild(Object.assign(document.createElement('pre'), { className: 'error', textContent: String((err && err.stack) || err) }));
    document.body.dataset.error = String(err);
  }
})();
