// The README screenshots' widgets, one mount per shot: `SCREENSHOTS[shot](el, o)` mounts the real widget code with the
// made-up home of showcase-data.js ("Solbakken", the showcase dashboards' data, so no real home's names or readings end
// up in the README) into `el`, with `o` over the widget's options, so dev/variants.html can draw the same widget in
// another mode. Most go through showcase-mount.js's MOUNT with a showcase entry (`findWidget()`); only the README's own
// changes are here. Needs the widget scripts, temp/screenshot-icons.js, showcase-data.js and showcase-mount.js loaded
// first, and the showcase's fixed clock (fixed-clock.js), so every render is the same.
const SCREENSHOTS = (function () {
  const withOpts = (w, o) => ({ ...w, opts: { ...w.opts, ...o } });

  const elec = findWidget('electricity');
  const electricity = (el, { settings, ...o } = {}) => MOUNT.electricity(el, withOpts({ ...elec, settings: { ...elec.settings, liveWindow: 10, smooth: false, nextLow: 'both', ...settings } }, o));

  const thermostat = (el, o) => MOUNT.thermostat(el, withOpts(findWidget('thermostat'), o));

  // Home's lock, coffee machine and TV, then the security dashboard's garage door, doorbell and router.
  const quickactions = (el, o) => MOUNT.quickactions(el, { opts: o, devices: [...findWidget('quickactions', 0).devices, ...findWidget('quickactions', 2).devices] });

  const sensoralarms = (el, o) => MOUNT.sensoralarms(el, withOpts(findWidget('sensoralarms', 1), o)); // security: with the door contacts

  const values = (el, o) => MOUNT.values(el, withOpts(findWidget('values', 1), o)); // security: batteries in red, yellow and green

  // Combined Value: the rooms' average temperature with the dots, the big users' power as shares, the lowest battery as a pill.
  const combined = (el, o) => {
    const cap = (id, title, units, decimals) => ({ id, title, units, decimals, min: null, max: null });
    const devices = list => list.map(([name, value], i) => ({ id: `cv${i}`, name, value }));
    el.style.cssText = 'display: flex; flex-direction: column; gap: 12px';
    const add = (opts, state) => MOUNT.combined(el.appendChild(document.createElement('div')), { opts: { ...opts, ...o }, state });
    add({ name: 'Indoor temperature' }, { capability: cap('measure_temperature', 'Temperature', '°C', 1),
      devices: devices([['Living room', 21.8], ['Kitchen', 22.4], ['Bedroom', 19.6], ['Office', 23.1], ['Bathroom', 22.9], ['Kids’ room', 20.7]]) });
    add({ name: 'Power now', show: 'sum', range: false }, { capability: cap('measure_power', 'Power', 'W', 0),
      devices: devices([['Heat pump', 1240], ['Oven', 980], ['Dishwasher', 610], ['Lights', 210], ['TV', 140], ['Fridge', 85]]) });
    add({ name: 'Lowest battery', show: 'min', range: false, tileStyle: 'pill' }, { capability: cap('measure_battery', 'Battery', '%', 0),
      devices: devices([['Motion, hall', 18], ['Front door', 82], ['Smoke, attic', 64], ['Leak, laundry', 55], ['Back door', 77], ['Window, office', 95]]) });
  };

  const sparklines = (el, o) => MOUNT.sparklines(el, { opts: o, slots: findWidget('sparklines').slots });

  // The Energy dashboard's Charts is one overlaid chart: the README shows two stacked, from the sparklines' made-up 24 hours (outdoor, main meter).
  const sparkSlot = (deviceId) => {
    for (let n = 0; findWidget('sparklines', n); n++) {
      const s = findWidget('sparklines', n).slots.find(x => x.deviceId === deviceId);
      if (s) return s;
    }
    return null;
  };
  const charts = (el, o) => MOUNT.charts(el, {
    opts: { charts: [{ span: '24h', color: 'purple', smooth: true }, { span: '24h', style: 'bars', color: 'orange' }], ...o },
    charts: [['g1', 'Temperature'], ['m1', 'Power']].map(([id, title]) => {
      const s = sparkSlot(id);
      return { ...s, capability: { ...s.capability, title } };
    }),
  });

  // Chart · Totals: the main meter's year so far against last year, a month a bar (mock-totals.js, on the fixed clock).
  const totals = (el, { period = 'thisYear', ...o } = {}) => MOUNT.totals(el, { opts: { period, compare: true, ...o }, state: mockTotals.totalsState(period, SHOWCASE_NOW) });

  // Chart · Scatter (XY): the heat pump's power against the outdoor temperature over a week, a dot an hour (mock-scatter.js).
  // Chart · TypicalDay: the house's power today over its usual day, a little high (mock-typicalday.js).
  const typicalday = (el, o) => MOUNT.typicalday(el, { opts: { ...o }, state: mockTypicalDay.typicalDayState(7, SHOWCASE_NOW) });
  // Chart · DailyRange: the outdoor temperature's low to high each day of the last 4 weeks (mock-dailyrange.js).
  const dailyrange = (el, o) => MOUNT.dailyrange(el, { opts: { ...o }, state: mockDailyRange.dailyRangeState('4w', SHOWCASE_NOW) });
  // Chart · Ranking: six rooms' temperatures now and today's range, warmest first (mock-compare.js).
  const compare = (el, o) => MOUNT.compare(el, { opts: { count: 6, ...o }, state: mockCompare.compareState('1d!', SHOWCASE_NOW) });
  // Chart · Timeline: the heating, hall motion, front door and TV today, in the mock-up's colours (mock-timeline.js).
  const timeline = (el, o) => MOUNT.timeline(el, { opts: { colors: ['orange', 'yellow', 'red', 'blue'], ...o }, state: mockTimeline.timelineState('1d!', SHOWCASE_NOW) });
  // Chart · Stacked: the meter's last 24 hours as the heat pump, the oven, the EV charger and the rest (mock-stacked.js).
  const stacked = (el, o) => MOUNT.stacked(el, { opts: { total: true, count: 3, colors: ['orange', 'red', 'green'], ...o }, state: mockStacked.stackedState('24h', SHOWCASE_NOW) });
  // Chart · Lines: four rooms' temperatures over the last 24 hours (mock-lines.js).
  const lines = (el, o) => MOUNT.lines(el, { opts: { count: 4, ...o }, state: mockLines.linesState('24h', SHOWCASE_NOW) });
  // Chart · Gauge: the office's CO₂ today, green to red as it rises (mock-gauge.js), as a bar (the default) and a dial.
  const co2Levels = { zones: 'rising', yellowAt: 1000, redAt: 1400 };
  const gauge = (el, o) => MOUNT.gauge(el, { opts: { ...co2Levels, ...o }, state: mockGauge.gaugeState('co2', '1d!', SHOWCASE_NOW) });
  const gaugedial = (el, o) => gauge(el, { layout: 'dial', ...o });
  const scatter = (el, o) => MOUNT.scatter(el, { opts: { span: '7d', ...o }, state: mockScatter.scatterState('7d', SHOWCASE_NOW) });

  // The Climate dashboard's rooms, with the kitchen humid after dinner, a stuffy bedroom and the office's radon far over.
  const roomhealth = (el, o) => MOUNT.roomhealth(el, withOpts(findWidget('roomhealth'), o));
  const valuematrix = (el, o) => MOUNT.valuematrix(el, withOpts(findWidget('valuematrix'), o));

  // Not on a showcase dashboard any more (Home's flags made way for Flow Buttons): the README's own four.
  const variables = (el, o) => MOUNT.variables(el, { opts: o, vars: [
    { id: 'f1', name: 'Away mode', type: 'boolean', value: false },
    { id: 'f2', name: 'Guests staying over', type: 'boolean', value: true },
    { id: 'f3', name: 'Pause the hallway motion lights', type: 'boolean', value: false },
    { id: 'f4', name: 'Night setpoint', type: 'number', value: 18.5 },
  ] });

  // The Climate dashboard has a heating mode: the README's house mode, a text variable with four buttons, Away lit.
  const mode = value => ({ id: `string:${JSON.stringify(value)}`, name: value, value, type: 'string' });
  const varpresets = (el, o) => MOUNT.varpresets(el, {
    opts: { icon: 'home', ...o },
    settings: { value1: mode('Home'), value2: mode('Away'), value3: mode('Night'), value4: mode('Holiday') },
    variable: { id: 'm1', name: 'House mode', type: 'string', value: 'Away' },
  });

  // A made-up alarm, armed, its keypad always shown with two digits typed: Arm and Night without the code, Disarm behind it.
  const alarmValue = (value, name) => ({ id: `string:${JSON.stringify(value)}`, name, value, type: 'string' });
  const keypad = (el, { keypad: shown = 'always', layout, ...o } = {}) => { MOUNT.keypad(el, {
    opts: o,
    settings: {
      state: { id: 'cap:alarm:homealarm_state' }, title: 'Alarm', code: { id: 'c1', name: 'Alarm' }, keypad: shown, layout,
      value1: alarmValue('armed', 'Armed'), label1: 'Arm', icon1: { id: 'shield' }, color1: 'red', code1: false,
      value2: alarmValue('partially_armed', 'Partially armed'), label2: 'Night', icon2: { id: 'moon' }, color2: 'purple', code2: false,
      value3: alarmValue('disarmed', 'Disarmed'), label3: 'Disarm', icon3: { id: 'unlock' }, color3: 'green',
    },
    state: {
      source: {
        kind: 'capability', deviceId: 'alarm', capabilityId: 'homealarm_state', name: 'Alarm system', value: 'armed',
        capability: { title: 'Home Alarm state', type: 'enum', values: [{ id: 'armed', title: 'Armed' }, { id: 'disarmed', title: 'Disarmed' }, { id: 'partially_armed', title: 'Partially armed' }] },
      },
      flows: [],
      code: { id: 'c1', name: 'Alarm', digits: 4 },
    },
  });
  if (shown === 'always') for (const k of ['1', '2']) [...el.querySelectorAll('.kp-key')].find(b => b.textContent === k).click();
  };

  // Home's two flows side by side, and two more below them for the README.
  const flows = findWidget('flows');
  const more = [
    [{ id: 'advanced:3', color: 'orange', icon: 'tv' }, { id: 'advanced:3', name: 'Movie time', enabled: true, triggerable: true, advanced: true }],
    [{ id: 'flow:4', color: 'blue', icon: 'leave' }, { id: 'flow:4', name: 'Leaving home', enabled: true, triggerable: true, advanced: false }],
  ];
  const flowButtons = (el, o) => MOUNT.flows(el, {
    opts: { ...flows.opts, buttons: [...flows.opts.buttons, ...more.map(m => m[0])], ...o },
    flows: [...flows.flows, ...more.map(m => m[1])],
  });

  const price = (el, o) => MOUNT.price(el, withOpts(findWidget('price'), o)); // energy: the evening peak

  const doors = findWidget('locks'); // security: the shed unlocked and the garage open, here with the list showing
  const locks = (el, o) => MOUNT.locks(el, { ...doors, opts: { ...doors.opts, view: 'list', ...o } });

  const cameras = (el, { count = 4, ...o } = {}) => MOUNT.cameras(el, { opts: o, cameras: findWidget('cameras', 1).cameras.slice(0, count) });

  const heatmap = (el, o) => MOUNT.heatmap(el, withOpts(findWidget('heatmap'), o));

  const weather = (el, o) => MOUNT.weather(el, { opts: o, hours: findWidget('weather').hours });

  const clock = (el, { showWeather = true, ...o } = {}) => MOUNT.clock(el, withOpts({ ...findWidget('clock'), weather: showWeather ? findWidget('clock').weather : null }, { showWeather, ...o }));

  // Notes' two looks: a tile a Flow wrote on in blue, and the Kitchen's Post-it.
  const board = (text, color = null) => ({ key: 'note', name: 'Note', text, color, updatedAt: SHOWCASE_NOW });
  const textline = (el, o) => {
    MOUNT.textline(el.appendChild(document.createElement('div')), { opts: { source: 'flow', icon: 'bell', ...o }, board: board('The washing machine is done', 'blue') });
    const note = el.appendChild(document.createElement('div'));
    note.style.marginTop = '8px';
    MOUNT.textline(note, withOpts(findWidget('textline'), o));
  };

  // The Kitchen's Days Since has its own chores: the README's household, one row amber, one red, and Fish just fed (Undo).
  const DAY = 864e5;
  const dayssince = (el, o) => { MOUNT.dayssince(el, { opts: o, counters: [
    { name: 'Plants watered', icon: 'leaf', amber: 5, red: 7, ago: 6 * DAY + 3 * 3600e3 },
    { name: 'Vacuum filter', icon: 'vacuum', amber: 75, red: 90, ago: 92 * DAY },
    { name: 'Bedsheets', icon: 'bed', amber: 12, red: 14, ago: 9 * DAY },
    { name: 'Fish fed', icon: 'paw', amber: 2, red: 3, ago: 26 * 3600e3 },
    { name: 'Descale coffee machine', icon: 'coffee', amber: 50, red: 60, ago: 23 * DAY },
    { name: 'Smoke alarm test', icon: 'bell', amber: 25, red: 30, ago: 12 * DAY },
  ] });
  const fed = el.querySelectorAll('.ds-row')[3];
  if (fed) fed.click();
  };

  // Dashboard Shortcuts (web dashboards only): six of the showcase's dashboards as a menu, on Home.
  const menu = [['home', 'purple', 'home'], ['energy', 'green', 'bolt'], ['security', 'red', 'shield'],
    ['climate', 'blue', 'thermometer'], ['livingroom', 'orange', 'sofa'], ['kitchen', 'yellow', 'utensils']];
  const shortcuts = (el, o) => MOUNT.shortcuts(el, {
    current: 'home', opts: { tiles: menu.map(([, color, icon]) => ({ color, icon })), ...o },
    dashboards: menu.map(([id]) => ({ id, name: SHOWCASE[id].title })),
  });

  // Every room's lights, the living room open with its Moods; the Climate dashboard's rain radar.
  const lightrooms = (el, o) => MOUNT.lightrooms(el, withOpts(window.SHOWCASE_ROOMS, o));
  const webpage = (el, { onePage, ...o } = {}) => {
    const w = findWidget('webpage');
    MOUNT.webpage(el, withOpts(onePage ? { ...w, buttons: w.buttons.slice(0, 1) } : w, o));
  };

  // Pollen and UV: the Garden dashboard's October has only the seasons' last grains, so the README has a June day of
  // its own: grass high, the birch season's tail, the UV peak at 13.
  const june = (values, uv) => ({
    date: '2026-06-16', uv: { max: uv, level: 3, at: new Date('2026-06-16T13:00:00').getTime() },
    pollen: Object.fromEntries(Object.entries(values).map(([type, [value, level]]) => [type, { value, level }])),
  });
  const pollen = (el, o) => MOUNT.pollen(el, { opts: o, data: { outside: false, uvNow: 3, days: [june({ birch: [34, 2], grass: [64, 3], mugwort: [4, 1] }, 6.1)] } });

  // Popups: the real prompt page (settings/popup.html's script) in dark mode against a simulated app, as on the 1.1.0
  // teaser (whats-next.html): someone at the front door, the hallway camera's made-up picture, Unlock highlighted.
  const picture = fetch('cameras/door.webp').then(r => r.arrayBuffer()).then((buf) => {
    let bin = '';
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return { type: 'image/webp', data: btoa(bin) };
  });
  const popups = (frame, { light = false, popup = {} } = {}) => {
  frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="../settings/popup.css"><script src="../widgets/spacer/public/kit.js"><\/script><script src="../settings/popup.js"><\/script>'
    + (light ? '' : '<style>.pp { --pp-bg: #111217; --pp-card: #1F2029; --pp-raised: #2B2C36; --pp-text: #E4E4E7; --pp-muted: #999AA3; --pp-accent: #339BFB; }</style>')
    + '</head><body><main id="app" class="pp"></main></body></html>';
  frame.addEventListener('load', () => {
    const json = body => new Response(JSON.stringify(body));
    const shown = { kind: 'ask', text: 'Someone is at the front door. Unlock it?', buttons: ['Unlock', 'Not now'], picture: { source: 'camera' }, ...popup };
    frame.contentWindow.mountPopupPage(frame.contentWindow.document.getElementById('app'), {
      hash: '#id=p1&t=readme',
      fetch: async url => (url.endsWith('/image') ? json(await picture)
        : json({ closed: false, ...shown, now: Date.now(), until: Date.now() + 60e3, language: 'en' })),
    });
  });
  };

  return {
    electricity, thermostat, quickactions, sensoralarms, roomhealth, valuematrix, weather, heatmap, cameras, values, combined, variables, varpresets,
    keypad, flows: flowButtons, price, locks, sparklines, charts, totals, scatter, compare, timeline, stacked, lines, gauge, gaugedial,
    dailyrange, typicalday, clock, textline, dayssince, shortcuts, lightrooms, pollen, webpage, popups,
  };
})();
