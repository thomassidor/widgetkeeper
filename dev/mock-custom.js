// The Widget Builder's made-up designs (the house Solbakken) for the dev pages, screenshots and Looks:
// `mockCustomState(scene)` is a `/state` answer as lib/CustomWidgetService.ts gives it. Scenes: living (the default, the
// README screenshot), container (a gradient container on the fine grid), free (free-form over a picture-like gradient,
// with a Flow's message), rules (colours and a hidden part by rules), controls (stepper, choice, variables).
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
    slot('hall:alarm_motion', 'Hall sensor', cap('Motion alarm', 'boolean', null, null), true),
    slot('meter:measure_power', 'Electricity meter', cap('Power', 'number', 'W', 0), 2410),
    slot('solar:measure_power', 'Solar inverter', cap('Power', 'number', 'W', 0), 1120),
    slot('garage:alarm_contact', 'Garage door', cap('Contact alarm', 'boolean', null, null), true),
    slot('garagelight:onoff', 'Garage light', cap('Turned on', 'boolean', null, null), false),
    slot('charger:measure_power', 'Car charger', cap('Power', 'number', 'kW', 1), 0),
    slot('bell:measure_battery', 'Doorbell', cap('Battery', 'number', '%', 0), 12),
    slot('tank:measure_water', 'Rain tank', cap('Level', 'number', '%', 0), 68),
    slot('porch:onoff', 'Porch light', cap('Turned on', 'boolean', null, null), true),
    slot('lock:locked', 'Front door', cap('Locked', 'boolean', null, null), true),
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
          part('h', 'text', at(0, 0, 7, 4), { text: 'Living room', size: 'heading', tile: false }),
          part('m', 'status', at(7, 0, 5, 4), { slot: 'hall:alarm_motion', name: 'Motion', tile: false }),
          part('t', 'value', at(0, 4, 7, 11), { slot: 'lr:measure_temperature', name: 'Temperature', tile: false }),
          part('g', 'gauge', at(7, 4, 5, 11), { slot: 'lr:measure_humidity', name: 'Humidity', min: 0, max: 100, color: 'teal', tile: false }),
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
          part('clock', 'text', at(62, 4, 36, 14), { text: 'Front door', size: 'heading', align: 'right', tile: false }),
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
  };
  const NAMES = { living: 'Living room', container: 'Living room card', free: 'Entrance', rules: 'Garage', controls: 'Bedroom' };
  // What Flows set: the entrance's message.
  const FLOW = { free: { msg: { value: 'Parcel by the door', color: 'orange', at: NOW - 13 * 60e3 } } };

  window.mockCustomState = function (scene = 'living') {
    const parts = DESIGNS[scene] || DESIGNS.living;
    return JSON.parse(JSON.stringify({
      design: { id: `d-${scene}`, name: NAMES[scene] || scene, updatedAt: 1, parts },
      values: VALUES, variables: VARIABLES, flows: FLOWS, histories: HISTORIES, flow: FLOW[scene] || {}, now: NOW,
    }));
  };
})();
