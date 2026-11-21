// The Widget Builder's made-up designs (the house Solbakken) for the dev pages, screenshots and Looks:
// `mockCustomState(scene)` is a `/state` answer as lib/CustomWidgetService.ts gives it. Scenes: living (the default, the
// README screenshot), container (a gradient container on the fine grid), free (free-form over a picture-like gradient,
// with a Flow's message), rules (colours and a hidden part by rules), controls (stepper, choice, variables), blocks
// (a text with values, calculated values, a clock, the time since motion, and shapes coloured by another value), more
// (a widget state picking a pages container's page, a ring and a picture on it, a repeater of open doors, a button's
// actions and a yes/no state), split (a segmented bar and a donut of the power, trends over the day).
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

  const DESIGNS = {
    living: [
      part('t', 'value', at(0, 0, 2, 2), { slot: 'lr:measure_temperature', name: 'Living room', show: 'chart', span: '24h' }),
      part('h', 'value', at(2, 0), { slot: 'lr:measure_humidity', name: 'Humidity' }),
      part('c', 'value', at(3, 0), { slot: 'air:measure_co2', name: 'CO₂', rules: [{ op: 'above', value: '1000', look: 'orange' }] }),
      part('l', 'switch', at(2, 1, 2), { slot: 'lamp:onoff', name: 'Floor lamp', icon: 'bulb', color: 'yellow' }),
      part('d', 'slider', at(0, 2, 3), { slot: 'ceiling:dim', name: 'Ceiling', icon: 'sun' }),
      part('m', 'button', at(3, 2), { flowId: 'flow:movie', name: 'Movie', icon: 'tv', color: 'purple' }),
    ],
    container: [
      part('box', 'container', at(0, 0, 4, 3), {
        mode: 'grid', background: { kind: 'gradient', from: '#2d4c7a', to: '#2a1958', angle: 135 }, parts: [
          part('h', 'text', at(0, 0, 7, 4), { text: 'Living room', size: 'heading', style: 'none' }),
          part('m', 'status', at(7, 0, 5, 4), { slot: 'hall:alarm_motion', name: 'Motion', style: 'none' }),
          part('t', 'value', at(0, 4, 7, 11), { slot: 'lr:measure_temperature', name: 'Temperature', style: 'none' }),
          part('g', 'gauge', at(7, 4, 5, 11), { slot: 'lr:measure_humidity', name: 'Humidity', min: 0, max: 100, color: 'teal', style: 'none' }),
          part('l', 'switch', at(0, 15, 6, 8), { slot: 'lamp:onoff', name: 'Floor lamp', icon: 'bulb', color: 'yellow' }),
          part('s', 'choice', at(6, 15, 6, 8), { variable: 'v1', name: 'House mode', color: 'purple',
            choices: [{ label: 'Home', value: 'home' }, { label: 'Away', value: 'away' }, { label: 'Night', value: 'night' }] }),
        ],
      }),
      part('p', 'value', at(0, 3, 2), { slot: 'meter:measure_power', name: 'Using now', icon: 'bolt', color: 'orange' }),
      part('s', 'value', at(2, 3, 2), { slot: 'solar:measure_power', name: 'Solar', icon: 'sun' }),
    ],
    free: [
      part('box', 'container', at(0, 0, 4, 4), {
        mode: 'free', background: { kind: 'gradient', from: '#3a4a5e', to: '#2c3a2e', angle: 160 }, parts: [
          part('clock', 'text', at(62, 4, 36, 14), { text: 'Front door', size: 'heading', align: 'right', style: 'none' }),
          part('msg', 'flowvalue', at(4, 36, 58, 24), { name: 'Message', text: '', color: 'orange', flow: { value: true, color: true } }),
          part('lock', 'status', at(4, 72, 40, 24), { slot: 'lock:locked', name: 'Locked', color: 'green' }),
          part('ring', 'button', at(68, 66, 28, 30), { name: 'Ring', icon: 'bell', color: 'yellow' }),
        ],
      }),
      part('porch', 'switch', at(0, 4, 2), { slot: 'porch:onoff', name: 'Porch light', icon: 'bulb', color: 'yellow' }),
      part('bat', 'level', at(2, 4, 2), { slot: 'bell:measure_battery', name: 'Doorbell', min: 0, max: 100,
        rules: [{ op: 'below', value: '20', look: 'red' }] }),
    ],
    rules: [
      part('h', 'text', at(0, 0, 4), { text: 'Garage', size: 'heading' }),
      part('door', 'status', at(0, 1, 2), { slot: 'garage:alarm_contact', name: 'Garage door', rules: [{ op: 'is', value: 'open', look: 'red' }] }),
      part('light', 'switch', at(2, 1, 2), { slot: 'garagelight:onoff', name: 'Garage light', icon: 'bulb' }),
      part('car', 'value', at(0, 2, 2), { slot: 'charger:measure_power', name: 'Car charging', icon: 'car', rules: [{ op: 'below', value: '0.1', look: 'hide' }] }),
      part('tank', 'level', at(2, 2, 2), { slot: 'tank:measure_water', name: 'Rain tank', min: 0, max: 100 }),
    ],
    controls: [
      part('set', 'stepper', at(0, 0, 2), { slot: 'heat:target_temperature', name: 'Bedroom', step: 0.5, min: 15, max: 25 }),
      part('mode', 'choice', at(2, 0, 2), { slot: 'heat:thermostat_mode', name: 'Heating', color: 'orange',
        choices: [{ label: 'Auto', value: 'auto' }, { label: 'Heat', value: 'heat' }, { label: 'Off', value: 'off' }] }),
      part('guests', 'variable', at(0, 1), { variable: 'v3', name: 'Guests' }),
      part('away', 'variable', at(1, 1), { variable: 'v2', name: 'Vacation', color: 'purple' }),
      part('power', 'gauge', at(2, 1, 2, 2), { slot: 'meter:measure_power', name: 'Using now', min: 0, max: 5000, color: 'orange' }),
      part('chart', 'chart', at(0, 2, 2), { slot: 'meter:measure_power', name: 'Today', span: '24h', color: 'orange' }),
    ],
    blocks: [
      part('txt', 'text', at(0, 0, 4), { text: 'Inside {1} · humidity {2}', size: 'body', style: 'none',
        refs: [{ slot: 'lr:measure_temperature' }, { slot: 'lr:measure_humidity' }] }),
      part('net', 'calc', at(0, 1, 2, 2), { name: 'From the grid', op: 'formula', formula: 'a - b', units: 'W', decimals: 0, icon: 'plugzap', color: 'orange',
        inputs: [{ slot: 'meter:measure_power' }, { slot: 'solar:measure_power' }], rules: [{ op: 'above', value: '2000', look: 'orange' }] }),
      part('open', 'calc', at(2, 1), { name: 'Open', op: 'count', test: { op: 'is', value: 'on' }, icon: 'dooropen',
        inputs: [{ slot: 'garage:alarm_contact' }, { slot: 'window:alarm_contact' }], rules: [{ op: 'above', value: '0', look: 'red' }] }),
      part('clock', 'time', at(3, 1), { timeMode: 'clock' }),
      part('motion', 'time', at(2, 2, 2), { timeMode: 'since', slot: 'hall:alarm_motion', name: 'Hall motion', icon: 'footprints' }),
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
    part('tt', 'trend', at(2, 2, 2), { slot: 'lr:measure_temperature', span: '24h', name: 'Living room', flat: 0.2, color: 'orange' }),
    part('tp', 'trend', at(2, 3, 2), { slot: 'meter:measure_power', span: '24h', name: 'Power', percent: true, color: 'blue' }),
  ];
  // The repeaters' devices, as the app finds them (every device with the capability, by name).
  const REPEATS = { more: { doors: ['back:alarm_contact', 'window:alarm_contact', 'garage:alarm_contact', 'shed:alarm_contact'] } };
  REPEATS.more.open = REPEATS.more.doors;
  const NAMES = { living: 'Living room', container: 'Living room card', free: 'Entrance', rules: 'Garage', controls: 'Bedroom', blocks: 'At a glance', more: 'Home', split: 'Energy' };
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
