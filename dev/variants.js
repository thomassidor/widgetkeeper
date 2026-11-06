// Draws one of the widget pages' "Looks" (the list and what it means: variants-list.js), with the README screenshot's
// made-up data (mock-dashboard.js) where it has one, or the scene a variant's `opts.scene` picks in `BASE` below, always
// made up here so the README's screenshots keep their readings.
(function () {
  const withOpts = (w, o) => ({ ...w, opts: { ...w.opts, ...o } });
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;

  // ---- Made-up readings for the scenes (never a real home's): a value's capability, a value, a series on the fixed clock.
  const cap = (title, units = null, decimals = 0, type = 'number') => ({ title, type, units, decimals, min: null, max: null, values: null, icon: null });
  const TEMP = cap('Temperature', '°C', 1), HUMIDITY = cap('Humidity', '%'), POWER = cap('Power', 'W'), BATTERY = cap('Battery', '%'), CO2 = cap('CO₂', 'ppm');
  const reading = (deviceId, capabilityId, name, capability, value, more) => ({ deviceId, capabilityId, name, capability, value, ...more });
  const jitter = i => (Math.sin(i * 12.9898) * 43758.5453) % 1; // -1 to 1, the same on every render
  /** A series of `hours` hours to now, a point every `stepMin` minutes, `f(hours before now, i)` its value. */
  const series = (deviceId, capabilityId, name, capability, hours, stepMin, f) => {
    const points = [];
    const n = Math.round(hours * 60 / stepMin);
    for (let i = 0; i <= n; i++) points.push([SHOWCASE_NOW - (n - i) * stepMin * MIN, f((n - i) * stepMin / 60, i)]);
    return { deviceId, capabilityId, name, capability, value: points[n][1], points };
  };
  const hourAt = ago => (18.67 - ago + 2400) % 24; // the fixed clock's 18:40, `ago` hours before
  const wave = (ago, lo, hi, peak = 15) => lo + (hi - lo) * (0.5 + 0.5 * Math.cos((hourAt(ago) - peak) / 24 * 2 * Math.PI));
  const round1 = x => Math.round(x * 10) / 10;
  /** A heater's or an oven's power: a base with noise and bursts. */
  const loadCurve = (base, burst, seed) => (ago, i) => Math.max(0, Math.round(base + base * 0.5 * jitter(i + seed) + (Math.sin((ago + seed) / 1.7) > 0.7 ? burst : 0)));
  const offlineIn = (list, ...ids) => list.map(d => (ids.includes(d.id) || ids.includes(d.deviceId) ? { ...d, offline: true } : d));

  // The widgets the README shows as a clip, not a screenshot, and Smart Stack's and Timers' own.
  const curtains = SHOWCASE.livingroom.columns.flat().find(w => w.type === 'curtains');
  const kitchenTimer = SHOWCASE.kitchen.columns.flat().find(w => w.type === 'timers');
  const curtain = (id, name, value, zone, state = 'idle', kind = 'curtain') => ({ id, name, kind, zone, caps: { windowcoverings_set: { value, setable: true }, windowcoverings_state: { value: state, setable: true } } });
  const CURTAINS = [...curtains.devices,
    { id: 'ec3', name: 'Bedroom blind', kind: 'blind', caps: { windowcoverings_set: { value: 1, setable: true }, windowcoverings_state: { value: 'idle', setable: true } } },
    { id: 'ec4', name: 'Office', kind: 'curtain', caps: { windowcoverings_set: { value: 0.6, setable: true } } }];

  // ---- Value Board's house, as dev/valueboard-preview.html's rooms.
  const n = (capabilityId, title, value, units = null, more = {}) => ({
    capabilityId, title, type: typeof value === 'boolean' ? 'boolean' : 'number', units, decimals: null, min: null, max: null, values: null, value, ...more,
  });
  const T = t => n('measure_temperature', 'Temperature', t, '°C', { decimals: 1 });
  const H = h => n('measure_humidity', 'Humidity', h, '%');
  const B = b => n('measure_battery', 'Battery', b, '%');
  const W = w => n('measure_power', 'Power', w, 'W');
  const living = { id: 'living', name: 'Living room' }, kitchen = { id: 'kitchen', name: 'Kitchen' }, bed = { id: 'bed', name: 'Bedroom' };
  const CONTACT = open => n('alarm_contact', 'Contact', open);
  const BOARD = [
    { id: 'thermo', zone: living, name: 'Thermostat', values: [T(21.4), H(41)] },
    { id: 'tv', zone: living, name: 'TV', values: [W(86)] },
    { id: 'balcony', zone: living, name: 'Balcony door', values: [CONTACT(false), B(64)] },
    { id: 'fridge', zone: kitchen, name: 'Fridge', values: [T(4.1), W(42)] },
    { id: 'kair', zone: kitchen, name: 'Air sensor', values: [T(22), H(48), B(18)] },
    { id: 'bair', zone: bed, name: 'Air monitor', values: [T(19.2), H(52), n('measure_co2', 'CO₂', 1140, 'ppm')] },
    { id: 'window', zone: bed, name: 'Window', values: [CONTACT(true), B(91)] },
  ];
  const BOARD_SCENES = {
    few: BOARD.slice(0, 5),
    // `Everything`: what can be switched and set too, not only the readings.
    all: [{ id: 'lamp', zone: living, name: 'Floor lamp', values: [n('onoff', 'Turned on', true), n('dim', 'Brightness', 0.6, '%', { min: 0, max: 1 }), W(12)] },
      { id: 'thermo', zone: living, name: 'Thermostat', values: [T(21.4), n('target_temperature', 'Target temperature', 22, '°C', { decimals: 1 })] }],
    offline: BOARD.slice(0, 5).map(d => (d.id === 'kair' ? { ...d, offline: true } : d)),
  };

  // ---- Combined Value: batteries against an OK range, or the rooms' spread.
  const combinedCap = (id, title, units, decimals) => ({ id, title, units, decimals, min: null, max: null });
  const combinedDevices = list => list.map(([name, value], i) => ({ id: `cv${i}`, name, value }));
  const BATTERIES = [['Motion, hall', 18], ['Front door', 82], ['Smoke, attic', 12], ['Leak, laundry', 55], ['Back door', 77], ['Window, office', 95]];
  const ROOMS_NOW = [['Living room', 21.8], ['Kitchen', 22.4], ['Bedroom', 19.6], ['Office', 23.1], ['Bathroom', 22.9], ['Kids’ room', 20.7]];
  const combined = (el, { scene, ...o } = {}) => {
    const tempCap = combinedCap('measure_temperature', 'Temperature', '°C', 1), battCap = combinedCap('measure_battery', 'Battery', '%', 0);
    const one = (opts, capability, list) => MOUNT.combined(el, { opts: { ...opts, ...o }, state: { capability, devices: combinedDevices(list) } });
    if (scene === 'out') {
      const w = createCombinedWidget(el, { name: 'Low batteries', show: 'out', okRange: '>20', range: false, ...o });
      w.setState({ capability: battCap, devices: combinedDevices(BATTERIES) });
      if (w.toggle) w.toggle(); else el.querySelector('.cv-tile, [class*="tile"]').click();
    } else if (scene === 'fine') one({ name: 'Low batteries', show: 'out', okRange: '>20', range: false, greenWhenFine: true }, battCap, BATTERIES.map(([d, b]) => [d, Math.max(b, 40)]));
    else if (scene === 'range') one({ name: 'Warmest and coolest', show: 'range' }, tempCap, ROOMS_NOW);
    else if (scene === 'pill') one({ name: 'Median temperature', show: 'median', tileStyle: 'pill', color: 'orange' }, tempCap, ROOMS_NOW);
    else SCREENSHOTS.combined(el, o);
  };

  // ---- Device Values: anything a device reports, not only batteries.
  const second = (capabilityId, capability, value) => ({ capabilityId, capability, value });
  const MIXED = [
    reading('r1', 'measure_temperature', 'Living room', TEMP, 21.4, { second: second('measure_humidity', HUMIDITY, 47) }),
    reading('r2', 'measure_co2', 'Bedroom', CO2, 1140, { second: second('measure_temperature', TEMP, 19.2) }),
    reading('r3', 'measure_power', 'Oven', POWER, 980),
    reading('r4', 'onoff', 'Floor lamp', cap('Turned on', null, 0, 'boolean'), true, { second: second('measure_power', POWER, 45) }),
    reading('r5', 'alarm_contact', 'Back door', cap('Contact alarm', null, 0, 'boolean'), false, { second: second('measure_battery', BATTERY, 64) }),
    reading('r6', 'measure_battery', 'Car', BATTERY, 86),
  ];

  // ---- Locks and Doors.
  const lock = (id, name, kind, caps) => ({ id, name, icon: (window.ICONS || {})[kind] || null,
    caps: Object.fromEntries(Object.entries(caps).map(([c, [value, ago]]) => [c, { value, setable: c !== 'alarm_contact', lastUpdated: SHOWCASE_NOW - ago * MIN }])) });
  const secureDoors = () => [
    lock('k1', 'Front door', 'lock', { locked: [true, 52], alarm_contact: [false, 53] }), lock('k2', 'Back door', 'lock', { locked: [true, 95] }),
    lock('k3', 'Shed', 'lock', { locked: [true, 41] }), lock('k4', 'Garage', 'garage-door', { garagedoor_closed: [true, 23] }),
  ];

  // ---- Sensor Alarms.
  const allAlarms = () => findWidget('sensoralarms', 1).devices;
  const quietly = d => ({ ...d, alarms: d.alarms.map(a => ({ ...a, value: false })) });

  // ---- Flow Tiles' board.
  const TILES = [
    { name: 'Car', kind: 'number', number: 214, units: 'km', decimals: '0', icon: 'car', fill: 82, color: 'green', second: '82 %' },
    { name: 'Bins', text: 'Paper', icon: 'trash', color: 'purple' },
    { name: 'Internet', text: 'Down', icon: 'wifi', color: 'red' },
    { name: 'Washer', text: 'Done', icon: 'washer', tappable: true },
    { name: 'Heat pump', text: 'Eco', icon: 'flame', color: 'orange' },
    { name: 'Post', text: 'Here', icon: 'gift', tappable: true },
  ];
  const AGES = [3, 140, 4, 22, 300, 95];

  const BASE = {
    ...SCREENSHOTS,
    combined,
    // The state's colour is on Homey's frame, the widget's parent here.
    keypad: (el, o = {}) => SCREENSHOTS.keypad(el, o.background ? { frame: el.parentElement, ...o } : o),
    flowtiles: (el, { scene, ...o } = {}) => {
      if (!scene) return SCREENSHOTS.flowtiles(el, o);
      const opts = { columns: '2', ...o };
      const tiles = TILES.map((t, i) => (scene === 'age' ? { ...t, updatedAt: SHOWCASE_NOW - AGES[i] * MIN } : t));
      return MOUNT.flowtiles(el, { opts, tiles });
    },
    charts: (el, { scene, ...o } = {}) => {
      const outdoorNow = ago => round1(wave(ago, 7, 13.6));
      const house = loadCurve(620, 2400, 3);
      if (scene === 'one') {
        return MOUNT.charts(el, { opts: { charts: [{ span: '24h', color: 'blue' }], ...o }, charts: [series('t', 'measure_temperature', 'Living room', TEMP, 24, 12, ago => round1(wave(ago, 20.2, 22.4, 19)))] });
      }
      if (scene === 'shared') {
        return MOUNT.charts(el, { opts: { charts: [{ span: '24h', color: 'orange', style: 'line' }, { span: '24h', color: 'blue', style: 'line' }], ...o },
          charts: [series('i', 'measure_temperature', 'Indoors', TEMP, 24, 12, ago => round1(wave(ago, 20.2, 22.4, 19))), series('o', 'measure_temperature', 'Outdoors', TEMP, 24, 12, outdoorNow)] });
      }
      if (scene === 'spans') {
        return MOUNT.charts(el, { opts: { charts: [{ span: '7d', style: 'bars', color: 'orange' }, { span: '6h', style: 'line', color: 'teal' }], ...o },
          charts: [series('m', 'measure_power', 'Main meter', POWER, 24 * 7, 60, house), series('h', 'measure_humidity', 'Bathroom', HUMIDITY, 6, 5, (ago, i) => Math.round(54 + 26 * Math.exp(-(((ago - 2.5) / 0.4) ** 2)) + 1.5 * jitter(i)))] });
      }
      if (scene === 'negative') {
        return MOUNT.charts(el, { opts: { charts: [{ span: '24h', negative: true, color: 'blue', smooth: true }, { span: '24h', style: 'bars', negative: true, color: 'green', range: 'zero' }], ...o },
          charts: [series('f', 'measure_temperature', 'Frosty morning', TEMP, 24, 12, ago => round1(wave(ago, -4.5, 6))),
            series('s', 'measure_power', 'Solar, net of the house', POWER, 24, 60, ago => Math.round(wave(ago, -900, 2600, 13)))] });
      }
      return SCREENSHOTS.charts(el, o);
    },
    compare: (el, { scene, ...o } = {}) => (scene === 'week'
      ? MOUNT.compare(el, { opts: o, state: mockCompare.compareState('7d', SHOWCASE_NOW, 3) })
      : SCREENSHOTS.compare(el, o)),
    curtains: (el, { scene, ...o } = {}) => {
      const down = { id: 'z1', name: 'Living room' }, bedroom = { id: 'z2', name: 'Bedroom' };
      const devices = scene === 'rooms'
        ? [curtain('c1', 'Left', 0.6, down), curtain('c2', 'Right', 0.6, down), curtain('c3', 'Terrace door', 0.6, down), curtain('c4', 'Blackout', 0, bedroom), curtain('c5', 'Voile', 0, bedroom), curtain('c6', 'Office', 1, { id: 'z3', name: 'Office' })]
        : scene === 'three' ? CURTAINS.slice(0, 3)
          : scene === 'offline' ? offlineIn(CURTAINS, 'ec3') : CURTAINS;
      return MOUNT.curtains(el, { opts: o, devices });
    },
    dailyrange: (el, { scene, ...o } = {}) => {
      if (scene === 'indoor') {
        // Four weeks of a living room: 19 to 24 °C, so a fitted scale and one from zero look nothing alike.
        const state = mockDailyRange.dailyRangeState('4w', SHOWCASE_NOW).map(s => ({
          ...s, name: 'Living room', value: 21.8,
          points: s.points.map(([t, x]) => [t, round1(21.5 + (x - 9) * 0.32)]),
        }));
        return MOUNT.dailyrange(el, { opts: o, state });
      }
      return SCREENSHOTS.dailyrange(el, o);
    },
    flows: (el, { scene, ...o } = {}) => {
      if (scene !== 'icons') return SCREENSHOTS.flows(el, o);
      const list = [['Garden hose', 'teal', 'droplets'], ['Dinner', 'pink', 'utensils'], ['Bins out', 'green', 'recycle'], ['Guests', 'cyan', 'users'], ['Laundry', 'indigo', 'washer'], ['Pet door', 'brown', 'paw']];
      return MOUNT.flows(el, {
        opts: { columns: '2', buttons: list.map(([, color, icon], i) => ({ id: `flow:i${i}`, color, icon })), ...o },
        flows: list.map(([name], i) => ({ id: `flow:i${i}`, name, enabled: true, triggerable: true, advanced: false })),
      });
    },
    gauge: (el, { scene, ...o } = {}) => (scene
      ? MOUNT.gauge(el, { opts: o, state: mockGauge.gaugeState(scene, '1d!', SHOWCASE_NOW) })
      : SCREENSHOTS.gauge(el, o)),
    heatmap: (el, { scene, ...o } = {}) => {
      const lux = scene === 'lux' ? mockHeatmapLux('2026-10-06', 18) : scene === 'lux14' ? mockHeatmapLux('2026-10-06', 18, 14) : null;
      return lux ? MOUNT.heatmap(el, { ...findWidget('heatmap'), data: { ...lux, name: 'Garden sensor' }, opts: { ...findWidget('heatmap').opts, ...o } }) : SCREENSHOTS.heatmap(el, o);
    },
    lightrooms: (el, { scene, ...o } = {}) => {
      const w = window.SHOWCASE_ROOMS;
      return MOUNT.lightrooms(el, withOpts(scene === 'offline' ? { ...w, devices: w.devices.map(d => (d.zone && d.zone.id === 'z3' ? { ...d, offline: true } : d)) } : w, o));
    },
    lights: (el, { count, scene, ...o } = {}) => {
      const w = findWidget('lights');
      const devices = w.devices.slice(0, count);
      return MOUNT_LIGHTS(el, { ...w, devices: scene === 'offline' ? offlineIn(devices, 'l5', 'l3') : devices }, o);
    },
    lines: (el, { scene, ...o } = {}) => {
      if (scene === 'six') {
        const rooms = mockLines.linesState('24h', SHOWCASE_NOW);
        const extra = [['Bathroom', 1.6, 0], ['Hall', -2.1, 1]].map(([name, by, i]) => ({
          ...rooms[i], deviceId: name, name, value: round1(rooms[i].value + by), points: rooms[i].points.map(([t, x], k) => [t, round1(x + by + 0.5 * Math.sin(k / 9))]),
        }));
        return MOUNT.lines(el, { opts: o, state: [...rooms, ...extra] });
      }
      if (scene === 'power') {
        const state = [['Heat pump', 620, 900, 1], ['Oven', 40, 2100, 5], ['Dishwasher', 30, 1300, 9]].map(([name, base, burst, seed]) =>
          series(name, 'measure_power', name, POWER, 24, 15, loadCurve(base, burst, seed)));
        return MOUNT.lines(el, { opts: o, state });
      }
      return SCREENSHOTS.lines(el, o);
    },
    locks: (el, { scene, ...o } = {}) => {
      if (!scene) return SCREENSHOTS.locks(el, o);
      if (scene === 'one') {
        const doors = secureDoors();
        doors[1] = lock('k2', 'Back door', 'lock', { locked: [false, 12] });
        return MOUNT.locks(el, { devices: doors, opts: o });
      }
      if (scene === 'offline') return MOUNT.locks(el, { devices: offlineIn(secureDoors(), 'k3'), opts: { view: 'list', ...o } });
      const doors = secureDoors();
      doors[0] = { ...doors[0], open: 'open' };
      return MOUNT.locks(el, { devices: doors, opts: { view: 'list', ...o } });
    },
    pollen: (el, { scene, ...o } = {}) => {
      if (!scene) return SCREENSHOTS.pollen(el, o);
      const at = new Date('2026-06-16T13:00:00').getTime();
      const day = pollen => ({ date: '2026-06-16', uv: { max: scene === 'low' ? 1.2 : 6.1, level: scene === 'low' ? 1 : 3, at }, pollen });
      const on = (value, level) => ({ value, level });
      return MOUNT.pollen(el, { opts: scene === 'all' ? { types: ['alder', 'birch', 'olive', 'grass', 'mugwort', 'ragweed'], ...o } : o, data: { outside: false, uvNow: scene === 'low' ? 0 : 3, days: [scene === 'all'
        ? day({ alder: on(120, 4), birch: on(34, 2), olive: on(8, 1), grass: on(64, 3), mugwort: on(4, 1), ragweed: on(0, 0) })
        : day({ birch: on(0, 0), grass: on(0, 0), mugwort: on(0, 0) })] } });
    },
    quickactions: (el, { scene, ...o } = {}) => {
      if (!scene) return SCREENSHOTS.quickactions(el, o);
      const devices = [...findWidget('quickactions', 0).devices, ...findWidget('quickactions', 2).devices];
      return MOUNT.quickactions(el, { opts: o, devices: scene === 'five' ? devices.slice(0, 5) : offlineIn(devices, 'q3') });
    },
    roomhealth: (el, { scene, ...o } = {}) => {
      const w = findWidget('roomhealth');
      return MOUNT.roomhealth(el, { ...withOpts(scene === 'offline' ? { ...w, devices: w.devices.map(d => (d.zone.id === 'z7' ? { ...d, offline: true } : d)) } : w, o), open: o.open });
    },
    scatter: (el, { scene, ...o } = {}) => (scene === 'month'
      ? MOUNT.scatter(el, { opts: o, state: mockScatter.scatterState('30d', SHOWCASE_NOW) })
      : SCREENSHOTS.scatter(el, o)),
    sensoralarms: (el, { scene, ...o } = {}) => {
      if (!scene) return SCREENSHOTS.sensoralarms(el, o);
      const list = allAlarms();
      const opts = { includeStates: true, ...o };
      if (scene === 'clear') return MOUNT.sensoralarms(el, { opts, devices: list.map(quietly) });
      if (scene === 'five') return MOUNT.sensoralarms(el, { opts, devices: list.slice(0, 5) });
      if (scene === 'offline') return MOUNT.sensoralarms(el, { opts, devices: offlineIn(list, 's2') });
      const short = { s1: 'Stove', s2: 'Hall', s3: 'Bed', s4: 'Wash', s5: 'Door', s6: 'Shed' };
      return MOUNT.sensoralarms(el, { opts, devices: list.map(d => ({ ...d, name: short[d.id] || d.name })) });
    },
    sparklines: (el, { scene, ...o } = {}) => {
      const slots = findWidget('sparklines').slots;
      if (scene === 'six') {
        const energy = SHOWCASE.energy.columns.flat().find(w => w.type === 'sparklines').slots;
        return MOUNT.sparklines(el, { opts: o, slots: [...slots, ...energy].slice(0, 6) });
      }
      if (scene === 'offline') return MOUNT.sparklines(el, { opts: o, slots: slots.map((s, i) => (i === 1 ? { ...s, offline: true } : s)) });
      return MOUNT.sparklines(el, { opts: o, slots });
    },
    stacked: (el, { scene, ...o } = {}) => (scene === 'no-total'
      ? MOUNT.stacked(el, { opts: { count: 3, colors: ['orange', 'red', 'green'], ...o }, state: mockStacked.stackedState('24h', SHOWCASE_NOW, { total: false }) })
      : SCREENSHOTS.stacked(el, o)),
    textline: (el, { scene, ...o } = {}) => {
      const board = (text, color = null) => ({ key: 'note', name: 'Note', text, color, updatedAt: SHOWCASE_NOW });
      const add = (opts, state) => { const d = el.appendChild(document.createElement('div')); d.style.marginBottom = '8px'; MOUNT.textline(d, { opts, ...state }); };
      if (scene === 'colours') {
        add({ source: 'flow', icon: 'heart', ...o }, { board: board('Happy birthday, Emma!', 'pink') });
        add({ source: 'flow', icon: 'leaf', colorStyle: 'deep', ...o }, { board: board('Water the greenhouse', 'teal') });
        add({ style: 'postit', seed: 'kitchen', color: 'pink', message: 'Back at 5', ...o }, {});
        add({ style: 'postit', seed: 'hall', color: 'blue', message: 'Feed the cat', ...o }, {});
        return undefined;
      }
      if (scene === 'variable') {
        add({ source: 'variable', variableChosen: true, icon: 'home', ...o }, { variable: { id: 'v1', name: 'Today', type: 'string', value: 'Cleaner comes at 10' } });
        return undefined;
      }
      return SCREENSHOTS.textline(el, o);
    },
    thermostat: (el, { scene, ...o } = {}) => {
      const w = findWidget('thermostat');
      const state = { ...w.state };
      if (scene === 'sensor') state.sensor = { deviceId: 'room', capabilityId: 'measure_temperature', capability: TEMP, value: 21.8 };
      if (scene === 'off') state.values = { ...state.values, onoff: false };
      if (scene === 'offline') state.offline = true;
      return MOUNT.thermostat(el, withOpts({ ...w, state }, o));
    },
    timeline: (el, { scene, ...o } = {}) => {
      if (scene === 'week') return MOUNT.timeline(el, { opts: { colors: ['orange', 'yellow', 'red', 'blue'], ...o }, state: mockTimeline.timelineState('7d', SHOWCASE_NOW) });
      if (scene === 'threshold') {
        return MOUNT.timeline(el, { opts: o, state: [series('hp', 'measure_power', 'Heat pump running', POWER, 18.67, 10, ago => Math.round(wave(ago, 200, 1700, 7) + 200 * jitter(Math.round(ago * 6)))),
          series('br', 'measure_temperature', 'Bedroom under 19 °C', TEMP, 18.67, 10, ago => round1(wave(ago, 17.6, 21, 15)))] });
      }
      return SCREENSHOTS.timeline(el, o);
    },
    totals: (el, { period = 'thisYear', show, ...o } = {}) => {
      if (show !== 'cost') return SCREENSHOTS.totals(el, { period, ...o });
      const hours = [];
      const { from } = window.WidgetkeeperKit.timeSpan(period, SHOWCASE_NOW, 1);
      for (let t = Math.floor(from / HOUR) * HOUR; t < SHOWCASE_NOW; t += HOUR) {
        const h = new Date(t).getHours();
        hours.push([t, round1(1.4 + 1.2 * Math.exp(-(((h - 8) / 2) ** 2)) + 1.8 * Math.exp(-(((h - 18) / 2.5) ** 2))) ]);
      }
      const opts = { period, show, ...o };
      createTotalsWidget(el, { locale: LOCALE, language: 'en', now: () => SHOWCASE_NOW, ...opts }).setState(mockTotals.totalsState(period, SHOWCASE_NOW), 'en', { currency: 'DKK', fixed: null, hours });
      return undefined;
    },
    typicalday: (el, { scene, ...o } = {}) => (scene === 'usual3'
      ? MOUNT.typicalday(el, { opts: o, state: mockTypicalDay.typicalDayState(3, SHOWCASE_NOW) })
      : SCREENSHOTS.typicalday(el, o)),
    // A row per device: two sensors in the kitchen and the bedroom show as one row per room, or one each.
    valuematrix: (el, { scene, ...o } = {}) => {
      const w = findWidget('valuematrix');
      if (scene === 'offline') return MOUNT.valuematrix(el, withOpts({ ...w, state: { ...w.state, devices: w.state.devices.map(d => (d.zone.id === 'z7' ? { ...d, offline: true } : d)) } }, o));
      if (scene !== 'devices') return MOUNT.valuematrix(el, withOpts(w, o));
      const row = (id, name, zone, values) => ({ id, name, zone, values });
      const devices = [
        row('a1', 'Stove sensor', { id: 'z2', name: 'Kitchen' }, { measure_temperature: 23.4, measure_humidity: 64 }),
        row('a2', 'Fridge top', { id: 'z2', name: 'Kitchen' }, { measure_temperature: 21.2, measure_humidity: 52 }),
        row('a3', 'Air monitor', { id: 'b1', name: 'Bedroom' }, { measure_temperature: 18.2, measure_humidity: 48, measure_co2: 1210 }),
        row('a4', 'Bed sensor', { id: 'b1', name: 'Bedroom' }, { measure_temperature: 19, measure_humidity: 50 }),
        row('a5', 'Radon box', { id: 'z4', name: 'Office' }, { measure_temperature: 19.4, measure_radon: 162 }),
      ];
      return MOUNT.valuematrix(el, withOpts({ ...w, state: { ...w.state, devices } }, o));
    },
    values: (el, { scene, ...o } = {}) => {
      if (!scene) return SCREENSHOTS.values(el, o);
      const slots = scene === 'mixed' ? MIXED : scene === 'five' ? MIXED.slice(0, 5) : offlineIn(MIXED, 'r4');
      return MOUNT.values(el, { slots, opts: scene === 'offline' ? o : { percentFill: true, ...o } });
    },
    variables: (el, { scene, ...o } = {}) => {
      if (scene === 'short') {
        return MOUNT.variables(el, { opts: o, vars: [{ id: 'f1', name: 'Away', type: 'boolean', value: false }, { id: 'f2', name: 'Guests', type: 'boolean', value: true }, { id: 'f3', name: 'Quiet', type: 'boolean', value: false }, { id: 'f4', name: 'Night', type: 'number', value: 18.5 }] });
      }
      if (scene === 'text') {
        return MOUNT.variables(el, { opts: o, vars: [{ id: 'e1', name: 'Guests staying over', type: 'boolean', value: true }, { id: 'e2', name: 'Note on the TV', type: 'string', value: 'Pizza at 19!' }, { id: 'e3', name: 'Night setpoint', type: 'number', value: 18.5 }] });
      }
      return SCREENSHOTS.variables(el, o);
    },
    varpresets: (el, { scene, ...o } = {}) => {
      if (scene !== 'switch') return SCREENSHOTS.varpresets(el, o);
      const yesNo = (value, name) => ({ id: `boolean:${value}`, name, value, type: 'boolean' });
      return MOUNT.varpresets(el, { opts: { icon: 'moon', ...o }, settings: { value1: yesNo(true, 'Quiet'), value2: yesNo(false, 'Normal') }, variable: { id: 'q', name: 'Quiet hours', type: 'boolean', value: true } });
    },
    media: (el, { scene, ...o } = {}) => {
      const w = findWidget('media');
      if (scene === 'idle') return MOUNT.media(el, { speaker: ['Living room', 0, { track: null, playing: false }], opts: { ...w.opts, buttons: undefined, ...o } });
      return MOUNT.media(el, withOpts(w, o));
    },
    timers: (el, { done, scene, ...o } = {}) => {
      if (scene === 'presets') return MOUNT.timers(el, { presets: kitchenTimer.presets, opts: o, timers: [] });
      if (scene === 'paused') return MOUNT.timers(el, { presets: kitchenTimer.presets, opts: o, timers: [{ id: 'p1', label: 'Pasta', duration: 10 * MIN, endsAt: null, remaining: 6 * MIN + 12e3, doneAt: null }] });
      return MOUNT.timers(el, done
        ? { presets: kitchenTimer.presets, opts: o, timers: [{ id: 'd1', label: 'Eggs', duration: 7 * MIN, endsAt: SHOWCASE_NOW - 20e3, remaining: null, doneAt: SHOWCASE_NOW - 20e3 }] }
        : withOpts(kitchenTimer, o));
    },
    sensordots: (el, { closed, scene, ...o } = {}) => {
      const w = findWidget('sensordots', 1);
      const devices = scene === 'offline' ? w.devices.map((d, i) => (i === 1 || i === 3 ? { ...d, offline: true } : d)) : w.devices;
      MOUNT.sensordots(el, withOpts({ ...w, devices, open: closed ? null : w.open, ...(scene === 'offline' ? { opts: { ...w.opts, title: '' } } : {}) }, o));
    },
    stack: (el, { first = 0, ...o } = {}) => {
      const w = findWidget('stack');
      const pages = [...w.pages.slice(first), ...w.pages.slice(0, first)];
      MOUNT.stack(el, withOpts({ ...w, pages }, o));
    },
    // A made-up house's rooms, as dev/valueboard-preview.html's: Value Board has no README screenshot.
    valueboard: (el, { scene, ...o } = {}) => { createValueBoardWidget(el, o).setState(BOARD_SCENES[scene] || BOARD); },
  };
  /** Light Controls with its Moods for the `moods` palette (the living room's, by zone). */
  function MOUNT_LIGHTS(el, w, o) {
    const x = createLightsWidget(el, { onSet: async () => {}, onMood: async () => {}, ...w.opts, ...o });
    x.setState(w.devices);
    if (o.palette === 'moods') x.setMoods(window.SHOWCASE_ROOMS.moods.map(m => ({ ...m, zone: 'z1' })));
    return x;
  }

  /** The frame Homey gives a widget that isn't transparent, as in screenshots.html. */
  const FRAME = {
    electricity: 'card', charts: 'card', totals: 'card', scatter: 'card', compare: 'card', timeline: 'card', stacked: 'card', lines: 'card', gauge: 'card',
    dailyrange: 'card', typicalday: 'card', dayssince: 'card', thermostat: 'card tw-frame', varpresets: 'card tw-frame', media: 'card mw-frame',
    weather: 'card wf-frame', heatmap: 'card hm-frame', keypad: 'card kp-frame', pollen: 'card pw-frame', webpage: 'wp-dash',
  };

  const VARIANTS = window.VARIANTS; // variants-list.js

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
      if (variant.act) {
        const [selector, index = 0] = [].concat(variant.act);
        const target = host.querySelectorAll(selector)[index];
        if (!target) throw new Error(`Nothing to click: ${selector}`);
        target.click();
      }
    }
  } catch (err) {
    host.appendChild(Object.assign(document.createElement('pre'), { className: 'error', textContent: String((err && err.stack) || err) }));
    document.body.dataset.error = String(err);
  }
})();
