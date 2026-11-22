// The Widget Builder's made-up designs (the house Solbakken) for the dev pages, screenshots and Looks:
// `mockCustomState(scene)` is a `/state` answer as lib/CustomWidgetService.ts gives it. Scenes: living (the default, the
// README screenshot), container (a gradient container on the fine grid), free (free-form over a picture-like gradient,
// with a Flow's message), rules (colours and a hidden part by rules), controls (stepper, choice, variables), blocks
// (a text with values, calculated values, a clock, the time since motion, and shapes coloured by another value), more
// (a widget state picking a pages container's page, a ring and a picture on it, a repeater of open doors, a button's
// actions and a yes/no state), split (a segmented bar and a donut of the power, trends over the day), bare (built-in
// components with their parts turned off, a big text, an icon following a lock, a tappable circle).
(function () {
  const NOW = Date.now();
  const HOUR = 3600e3;
  const cap = (title, type, units, decimals, extra = {}) => ({ title, type, units, decimals, min: null, max: null, values: null, icon: null, ...extra });
  const slot = (id, name, capability, value) => {
    const [deviceId, capabilityId] = id.split(':');
    return { deviceId, capabilityId, name, capability, value };
  };
  const VALUES = Object.fromEntries([
    slot('lr:measure_temperature', 'Living room sensor', cap('Temperature', 'number', '°C', 1), 22.4),
    slot('lr:measure_humidity', 'Living room sensor', cap('Humidity', 'number', '%', 0), 46),
    slot('air:measure_co2', 'Air monitor', cap('CO₂', 'number', 'ppm', 0), 640),
    slot('lamp:onoff', 'Floor lamp', cap('Turned on', 'boolean', null, null), true),
    slot('ceiling:dim', 'Ceiling light', cap('Dim level', 'number', '%', 0, { min: 0, max: 1 }), 0.65),
    { ...slot('hall:alarm_motion', 'Hall sensor', cap('Motion alarm', 'boolean', null, null), true), updatedAt: NOW - 8 * 60e3 },
    slot('meter:measure_power', 'Electricity meter', cap('Power', 'number', 'W', 0), 2410),
    slot('solar:measure_power', 'Solar inverter', cap('Power', 'number', 'W', 0), 1120),
    slot('heatpump:measure_power', 'Heat pump', cap('Power', 'number', 'W', 0), 1180),
    slot('oven:measure_power', 'Oven', cap('Power', 'number', 'W', 0), 640),
    slot('washer:measure_power', 'Washing machine', cap('Power', 'number', 'W', 0), 310),
    slot('garage:alarm_contact', 'Garage door', cap('Contact alarm', 'boolean', null, null), true),
    slot('garagelight:onoff', 'Garage light', cap('Turned on', 'boolean', null, null), false),
    slot('charger:measure_power', 'Car charger', cap('Power', 'number', 'kW', 1), 0),
    slot('bell:measure_battery', 'Doorbell', cap('Battery', 'number', '%', 0), 12),
    slot('tank:measure_water', 'Rain tank', cap('Level', 'number', '%', 0), 68),
    slot('porch:onoff', 'Porch light', cap('Turned on', 'boolean', null, null), true),
    slot('lock:locked', 'Front door', cap('Locked', 'boolean', null, null), true),
    slot('window:alarm_contact', 'Bedroom window', cap('Contact alarm', 'boolean', null, null), false),
    slot('back:alarm_contact', 'Back door', cap('Contact alarm', 'boolean', null, null), false),
    slot('shed:alarm_contact', 'Shed door', cap('Contact alarm', 'boolean', null, null), true),
    slot('heat:target_temperature', 'Bedroom thermostat', cap('Target temperature', 'number', '°C', 1, { min: 5, max: 30 }), 19.5),
    slot('heat:thermostat_mode', 'Bedroom thermostat', cap('Mode', 'enum', null, null,
      { values: [{ id: 'auto', title: 'Auto' }, { id: 'heat', title: 'Heat' }, { id: 'off', title: 'Off' }] }), 'heat'),
  ].map(s => [`${s.deviceId}:${s.capabilityId}`, s]));
  const VARIABLES = {
    v1: { id: 'v1', name: 'House mode', type: 'string', value: 'home' },
    v2: { id: 'v2', name: 'Vacation', type: 'boolean', value: false },
    v3: { id: 'v3', name: 'Guests tonight', type: 'number', value: 4 },
  };
  const FLOWS = { 'flow:movie': { id: 'flow:movie', name: 'Movie night', enabled: true, triggerable: true } };
  // A day's temperature and power, a point every 30 min, ending now.
  const curve = (n, f) => Array.from({ length: n }, (_, i) => [NOW - (n - 1 - i) * HOUR / 2, f(i / (n - 1))]);
  const HISTORIES = {
    '24h\nlr:measure_temperature': curve(49, x => Math.round((21 + 1.2 * Math.sin(x * 6.3 - 1.6) + x * 0.8) * 10) / 10),
    '24h\nmeter:measure_power': curve(49, x => Math.round(900 + 1200 * Math.abs(Math.sin(x * 9)) + 500 * x)),
  };
  const at = (x, y, w = 1, h = 1) => ({ x, y, w, h });
  const part = (id, kind, place, o = {}) => ({ id, kind, name: '', at: place, color: null, icon: null, tile: true, rules: [], flow: {}, reset: 'never', ...o });

  // A ready-made tile as the builder puts it together (settings/dashboard-builder.js' readyParts()): a free-form
  // container of primitives, per cent of its box, bound to one device value.
  const kid = (id, kind, place, o = {}) => part(id, kind, place, { style: 'none', ...o });
  const value = (id, place, slot, o = {}) => kid(id, 'text', place, { text: '{1}', refs: [{ slot }], size: 'heading', align: 'right', ...o });
  const label = (id, place, slot, o = {}) => kid(id, 'text', place, { text: '{1}', refs: [{ slot, show: 'name' }], size: 'body', weight: 'bold', ...o });
  const box = (id, place, parts, o = {}) => part(id, 'container', place, { mode: 'free', background: { kind: 'none' }, style: 'tile', parts, ...o });
  const READY = {
    value: (id, place, slot, o = {}) => box(id, place, place.w === 1 ? [
      // One column: the icon over the value, as the old Value tile did.
      kid(`${id}i`, 'icon', at(0, 0, 40, 45), { slot, icon: o.icon || null, color: o.color || null }),
      value(`${id}v`, at(0, 45, 100, 55), slot, { size: 'body', weight: 'bold', align: 'left' }),
    ] : [
      kid(`${id}i`, 'icon', at(0, 0, 18, 50), { slot, icon: o.icon || null, color: o.color || null }), value(`${id}v`, at(20, 0, 80, 50), slot),
      label(`${id}n`, at(0, 55, 100, 45), slot, o.name ? { text: o.name, refs: [] } : {}),
    ], { rules: o.rules || [] }),
    chart: (id, place, slot, o = {}) => box(id, place, [
      label(`${id}n`, at(0, 0, 60, 40), slot, o.name ? { text: o.name, refs: [] } : {}), value(`${id}v`, at(60, 0, 40, 40), slot, { size: 'body' }),
      kid(`${id}s`, 'sparkline', at(0, 45, 100, 55), { slot, span: '24h', color: o.color || null }),
    ]),
    gauge: (id, place, slot, o = {}) => box(id, place, [
      kid(`${id}a`, 'arc', at(5, 0, 90, 80), { src: { slot }, min: o.min, max: o.max, color: o.color || null }),
      value(`${id}v`, at(10, 32, 80, 25), slot, { align: 'center' }),
      label(`${id}n`, at(0, 80, 100, 20), slot, { align: 'center', size: 'small', weight: undefined, ...(o.name ? { text: o.name, refs: [] } : {}) }),
    ]),
    level: (id, place, slot, o = {}) => box(id, place, [
      label(`${id}n`, at(0, 0, 60, 50), slot, o.name ? { text: o.name, refs: [] } : {}), value(`${id}v`, at(60, 0, 40, 50), slot, { size: 'body' }),
      kid(`${id}b`, 'bar', at(0, 60, 100, 40), { src: { slot }, min: 0, max: 100, color: o.color || null }),
    ], { rules: o.rules || [] }),
    status: (id, place, slot, o = {}) => box(id, place, [
      kid(`${id}d`, 'shape', at(0, 15, 10, 30), { shape: 'circle', background: { kind: 'none' }, opacity: 100, rules: [{ op: 'is', value: 'on', look: o.on || 'green', of: { slot } }] }),
      label(`${id}n`, at(14, 0, 86, 60), slot, o.name ? { text: o.name, refs: [] } : {}),
    ], { rules: o.rules || [] }),
    slider: (id, place, slot, o = {}) => box(id, place, [
      kid(`${id}s`, 'slider', at(0, 0, 100, 100), { slot, color: o.color || null }), kid(`${id}i`, 'icon', at(3, 25, 7, 50), { icon: o.icon || null, slot: o.icon ? undefined : slot }),
      label(`${id}n`, at(12, 0, 55, 100), slot, o.name ? { text: o.name, refs: [] } : {}), value(`${id}v`, at(67, 0, 30, 100), slot, { size: 'body' }),
    ]),
    trend: (id, place, slot, o = {}) => {
      const of = { part: `${id}c` };
      return box(id, place, [
        kid(`${id}c`, 'calc', at(86, 0, 14, 25), { inputs: [{ slot }], op: 'change', span: '24h', percent: !!o.percent, units: '' }),
        kid(`${id}i`, 'icon', at(0, 0, 18, 50), { icon: 'right', color: o.color || null, rules: [{ op: 'above', value: '0', look: 'same', icon: 'up', of }, { op: 'below', value: '0', look: 'same', icon: 'down', of }] }),
        kid(`${id}v`, 'text', at(20, 0, 64, 50), { text: '{1}', refs: [of], size: 'heading', align: 'right' }),
        kid(`${id}n`, 'text', at(0, 55, 100, 45), { text: `${o.name || '{1}'} · {2}`, refs: [{ slot, show: 'name' }, { slot }], size: 'small' }),
      ]);
    },
  };

  const DESIGNS = {
    living: [
      box('t', at(0, 0, 2, 2), [
        kid('ti', 'icon', at(0, 0, 20, 25), { slot: 'lr:measure_temperature' }),
        kid('tv', 'text', at(0, 22, 100, 30), { text: '{1}', refs: [{ slot: 'lr:measure_temperature' }], size: 'display' }),
        kid('tn', 'text', at(0, 50, 100, 18), { text: 'Living room', weight: 'bold' }),
        kid('ts', 'sparkline', at(0, 68, 100, 32), { slot: 'lr:measure_temperature', span: '24h' }),
      ]),
      READY.value('h', at(2, 0), 'lr:measure_humidity', { name: 'Humidity' }),
      READY.value('c', at(3, 0), 'air:measure_co2', { name: 'CO₂', rules: [{ op: 'above', value: '1000', look: 'orange', of: { slot: 'air:measure_co2' } }] }),
      part('l', 'switch', at(2, 1, 2), { slot: 'lamp:onoff', name: 'Floor lamp', icon: 'bulb', color: 'yellow' }),
      READY.slider('d', at(0, 2, 3), 'ceiling:dim', { name: 'Ceiling', icon: 'sun' }),
      part('m', 'button', at(3, 2), { flowId: 'flow:movie', name: 'Movie', icon: 'tv', color: 'purple' }),
    ],
    container: [
      part('box', 'container', at(0, 0, 4, 3), {
        mode: 'grid', background: { kind: 'gradient', from: '#2d4c7a', to: '#2a1958', angle: 135 }, parts: [
          kid('h', 'text', at(0, 0, 7, 4), { text: 'Living room', size: 'heading' }),
          kid('md', 'shape', at(7, 1, 1, 2), { shape: 'circle', background: { kind: 'none' }, rules: [{ op: 'is', value: 'on', look: 'green', of: { slot: 'hall:alarm_motion' } }] }),
          kid('mt', 'text', at(8, 0, 4, 4), { text: 'Motion', size: 'small' }),
          kid('tv', 'text', at(0, 4, 7, 6), { text: '{1}', refs: [{ slot: 'lr:measure_temperature' }], size: 'display' }),
          kid('tn', 'text', at(0, 10, 7, 3), { text: 'Temperature', size: 'small' }),
          kid('ga', 'arc', at(7, 4, 5, 9), { src: { slot: 'lr:measure_humidity' }, min: 0, max: 100, color: 'teal' }),
          kid('gv', 'text', at(7, 7, 5, 3), { text: '{1}', refs: [{ slot: 'lr:measure_humidity' }], align: 'center', weight: 'bold' }),
          part('l', 'switch', at(0, 15, 6, 8), { slot: 'lamp:onoff', name: 'Floor lamp', icon: 'bulb', color: 'yellow' }),
          part('s', 'choice', at(6, 15, 6, 8), { variable: 'v1', name: 'House mode', color: 'purple',
            choices: [{ label: 'Home', value: 'home' }, { label: 'Away', value: 'away' }, { label: 'Night', value: 'night' }] }),
        ],
      }),
      READY.value('p', at(0, 3, 2), 'meter:measure_power', { name: 'Using now', icon: 'bolt', color: 'orange' }),
      READY.value('s', at(2, 3, 2), 'solar:measure_power', { name: 'Solar', icon: 'sun' }),
    ],
    free: [
      part('box', 'container', at(0, 0, 4, 4), {
        mode: 'free', background: { kind: 'gradient', from: '#3a4a5e', to: '#2c3a2e', angle: 160 }, parts: [
          kid('clock', 'text', at(62, 4, 36, 14), { text: 'Front door', size: 'heading', align: 'right' }),
          part('msgbg', 'shape', at(4, 36, 58, 24), { shape: 'rect', radius: 10, background: { kind: 'none' }, color: 'orange', opacity: 30, style: 'none' }),
          kid('msg', 'text', at(8, 36, 52, 24), { text: '', name: 'Message', size: 'body', weight: 'bold', flow: { value: true, text: true, color: true } }),
          kid('lockd', 'shape', at(6, 80, 4, 8), { shape: 'circle', background: { kind: 'none' }, rules: [{ op: 'is', value: 'on', look: 'green', of: { slot: 'lock:locked' } }] }),
          kid('lockt', 'text', at(12, 72, 40, 24), { text: 'Locked', weight: 'bold' }),
          part('ring', 'button', at(68, 66, 28, 30), { name: 'Ring', icon: 'bell', color: 'yellow' }),
        ],
      }),
      part('porch', 'switch', at(0, 4, 2), { slot: 'porch:onoff', name: 'Porch light', icon: 'bulb', color: 'yellow' }),
      READY.level('bat', at(2, 4, 2), 'bell:measure_battery', { name: 'Doorbell', rules: [{ op: 'below', value: '20', look: 'red', of: { slot: 'bell:measure_battery' } }] }),
    ],
    rules: [
      kid('h', 'text', at(0, 0, 4), { text: 'Garage', size: 'heading' }),
      READY.status('door', at(0, 1, 2), 'garage:alarm_contact', { name: 'Garage door', on: 'red', rules: [{ op: 'is', value: 'open', look: 'red', of: { slot: 'garage:alarm_contact' } }] }),
      part('light', 'switch', at(2, 1, 2), { slot: 'garagelight:onoff', name: 'Garage light', icon: 'bulb' }),
      READY.value('car', at(0, 2, 2), 'charger:measure_power', { name: 'Car charging', icon: 'car', rules: [{ op: 'below', value: '0.1', look: 'hide', of: { slot: 'charger:measure_power' } }] }),
      READY.level('tank', at(2, 2, 2), 'tank:measure_water', { name: 'Rain tank' }),
    ],
    controls: [
      part('set', 'stepper', at(0, 0, 2), { slot: 'heat:target_temperature', name: 'Bedroom', step: 0.5, min: 15, max: 25 }),
      part('mode', 'choice', at(2, 0, 2), { slot: 'heat:thermostat_mode', name: 'Heating', color: 'orange',
        choices: [{ label: 'Auto', value: 'auto' }, { label: 'Heat', value: 'heat' }, { label: 'Off', value: 'off' }] }),
      part('guests', 'variable', at(0, 1), { variable: 'v3', name: 'Guests' }),
      part('away', 'variable', at(1, 1), { variable: 'v2', name: 'Vacation', color: 'purple' }),
      READY.gauge('power', at(2, 1, 2, 2), 'meter:measure_power', { name: 'Using now', min: 0, max: 5000, color: 'orange' }),
      READY.chart('chart', at(0, 2, 2), 'meter:measure_power', { name: 'Today', color: 'orange' }),
    ],
    blocks: [
      kid('txt', 'text', at(0, 0, 4), { text: 'Inside {1} · humidity {2}', size: 'body',
        refs: [{ slot: 'lr:measure_temperature' }, { slot: 'lr:measure_humidity' }] }),
      part('netc', 'calc', at(3, 0), { name: 'From the grid', op: 'formula', formula: 'a - b', units: 'W', decimals: 0,
        inputs: [{ slot: 'meter:measure_power' }, { slot: 'solar:measure_power' }] }),
      part('openc', 'calc', at(3, 0), { name: 'Open', op: 'count', test: { op: 'is', value: 'on' },
        inputs: [{ slot: 'garage:alarm_contact' }, { slot: 'window:alarm_contact' }] }),
      box('net', at(0, 1, 2, 2), [
        kid('ni', 'icon', at(0, 0, 18, 22), { icon: 'plugzap', color: 'orange' }),
        kid('nv', 'text', at(0, 22, 100, 34), { text: '{1}', refs: [{ part: 'netc' }], size: 'display' }),
        kid('nn', 'text', at(0, 56, 100, 20), { text: 'From the grid', weight: 'bold' }),
      ], { rules: [{ op: 'above', value: '2000', look: 'orange', of: { part: 'netc' } }] }),
      box('open', at(2, 1), [
        kid('oi', 'icon', at(0, 0, 40, 50), { icon: 'dooropen' }),
        kid('ov', 'text', at(0, 50, 100, 50), { text: '{1} open', refs: [{ part: 'openc' }], weight: 'bold' }),
      ], { rules: [{ op: 'above', value: '0', look: 'red', of: { part: 'openc' } }] }),
      box('clock', at(3, 1), [kid('ck', 'text', at(0, 0, 100, 100), { text: '{1}', refs: [{ time: 'clock' }], size: 'heading', align: 'center' })]),
      box('motion', at(2, 2, 2), [
        kid('mi', 'icon', at(0, 0, 18, 50), { icon: 'footprints' }),
        kid('mv', 'text', at(20, 0, 80, 50), { text: '{1}', refs: [{ since: 'hall:alarm_motion' }], size: 'heading', align: 'right' }),
        kid('mn', 'text', at(0, 55, 100, 45), { text: 'Hall motion', weight: 'bold' }),
      ]),
      part('door', 'container', at(0, 3, 4, 1), { mode: 'free', background: { kind: 'none' }, parts: [
        part('bg', 'shape', at(0, 0, 100, 100), { shape: 'rect', radius: 14, opacity: 25, color: 'green', style: 'none',
          rules: [{ op: 'is', value: 'off', look: 'red', of: { slot: 'lock:locked' } }] }),
        part('dot', 'shape', at(5, 37, 4, 26), { shape: 'circle', color: 'green', style: 'none',
          rules: [{ op: 'is', value: 'off', look: 'red', of: { slot: 'lock:locked' } }] }),
        part('lbl', 'text', at(13, 28, 84, 44), { text: 'Front door locked', size: 'body', style: 'none' }),
      ] }),
    ],
    more: [
      part('view', 'state', at(0, 0, 4), { stateType: 'choice', initial: 'climate', style: 'none', name: '',
        choices: [{ label: 'Climate', value: 'climate' }, { label: 'Doors', value: 'doors' }] }),
      part('box', 'container', at(0, 1, 4, 2), { mode: 'pages', nav: 'state', pageBy: { part: 'view' }, background: { kind: 'none' },
        pages: [{ name: 'Climate' }, { name: 'Doors' }], parts: [
          part('ring', 'ring', at(0, 0, 6, 14), { name: 'Living room', center: 'value', page: 0, rings: [
            { src: { slot: 'lr:measure_temperature' }, min: 15, max: 30, color: 'orange' },
            { src: { slot: 'lr:measure_humidity' }, min: 0, max: 100, color: 'teal' },
            { src: { slot: 'air:measure_co2' }, min: 400, max: 1500, color: 'green' },
          ] }),
          part('img', 'image', at(6, 0, 6, 14), { image: { kind: 'url', url: 'cameras/garden.webp' }, fit: 'cover', page: 0 }),
          part('doors', 'repeat', at(0, 0, 12, 14), { capability: 'alarm_contact', page: 1 }),
        ] }),
      part('open', 'repeat', at(0, 3, 2, 2), { name: 'Open now', capability: 'alarm_contact', test: { op: 'is', value: 'on' }, text: 'All closed' }),
      part('night', 'button', at(2, 3, 2), { name: 'Good night', icon: 'moon', color: 'indigo', press: 'confirm', actions: [
        { do: 'set', slot: 'lamp:onoff', value: 'off' }, { do: 'state', part: 'view', value: 'doors' },
      ] }),
      part('guests', 'state', at(2, 4, 2), { stateType: 'toggle', initial: 'true', name: 'Guests', icon: 'users', color: 'purple' }),
    ],
  };
  DESIGNS.split = [
    part('bar', 'segments', at(0, 0, 4, 2), { name: 'Using now', units: 'W', segments: [
      { src: { slot: 'heatpump:measure_power' }, color: 'orange', label: '' }, { src: { slot: 'oven:measure_power' }, color: 'red', label: '' },
      { src: { slot: 'washer:measure_power' }, color: 'blue', label: 'Laundry' },
    ] }),
    part('donut', 'segments', at(0, 2, 2, 2), { name: 'Of 3 kW', barStyle: 'donut', scale: 'max', max: 3000, segments: [
      { src: { slot: 'heatpump:measure_power' }, color: 'orange', label: 'Heat' }, { src: { slot: 'oven:measure_power' }, color: 'red', label: 'Oven' },
    ] }),
    READY.trend('tt', at(2, 2, 2), 'lr:measure_temperature', { name: 'Living room', color: 'orange' }),
    READY.trend('tp', at(2, 3, 2), 'meter:measure_power', { name: 'Power', percent: true, color: 'blue' }),
  ];
  // The primitives on their own: a big text, an icon following a lock, a bar, a line, an arc, a dot, a toggle, a circle.
  DESIGNS.bare = [
    kid('big', 'text', at(0, 0, 3), { text: '{1}', refs: [{ slot: 'lr:measure_temperature' }], size: 'display' }),
    kid('lock', 'icon', at(3, 0), { slot: 'lock:locked', icon: null, color: 'green', rules: [{ op: 'is', value: 'off', look: 'red', icon: 'unlock' }] }),
    part('tank', 'bar', at(0, 1, 4), { src: { slot: 'tank:measure_water' }, min: 0, max: 100, color: 'teal', style: 'pill', thickness: 10 }),
    kid('line', 'sparkline', at(0, 2, 4), { slot: 'meter:measure_power', span: '24h', color: 'orange' }),
    part('arc', 'arc', at(0, 3), { src: { slot: 'lr:measure_humidity' }, min: 0, max: 100, color: 'blue', style: 'tile' }),
    part('dot', 'shape', at(1, 3), { shape: 'circle', background: { kind: 'none' }, color: 'green', opacity: 100, style: 'none', rules: [{ op: 'is', value: 'off', look: 'grey', of: { slot: 'hall:alarm_motion' } }] }),
    part('tog', 'switch', at(2, 3), { slot: 'lamp:onoff', color: 'yellow', hide: ['icon', 'name'] }),
    part('tap', 'shape', at(3, 3), { shape: 'circle', color: 'purple', opacity: 60, style: 'none', actions: [{ do: 'flow', flowId: 'flow:movie' }] }),
  ];
  // The repeaters' devices, as the app finds them (every device with the capability, by name).
  const REPEATS = { more: { doors: ['back:alarm_contact', 'window:alarm_contact', 'garage:alarm_contact', 'shed:alarm_contact'] } };
  REPEATS.more.open = REPEATS.more.doors;
  const NAMES = { living: 'Living room', container: 'Living room card', free: 'Entrance', rules: 'Garage', controls: 'Bedroom', blocks: 'At a glance', more: 'Home', split: 'Energy', bare: 'Bare parts' };
  // What Flows set: the entrance's message.
  const FLOW = { free: { msg: { value: 'Parcel by the door', color: 'orange', at: NOW - 13 * 60e3 } } };

  window.mockCustomState = function (scene = 'living') {
    const parts = DESIGNS[scene] || DESIGNS.living;
    return JSON.parse(JSON.stringify({
      design: { id: `d-${scene}`, name: NAMES[scene] || scene, updatedAt: 1, parts },
      values: VALUES, variables: VARIABLES, flows: FLOWS, histories: HISTORIES, flow: FLOW[scene] || {}, repeats: REPEATS[scene] || {}, language: 'en', timeFormat: '24', now: NOW,
    }));
  };
})();
