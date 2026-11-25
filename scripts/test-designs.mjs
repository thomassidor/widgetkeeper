// The Widget Builder's test designs for `npm run test-dashboards -- custom`: designs (ids `test-…`, named `Test · …`)
// that push the builder's components and options hard, written to the app setting `customDesigns` next to the user's own
// (which stay), with the Flow inputs they read (`customInputs`, ids `test-…`) and a first value for each
// (`customInputValues`). The app reads designs when it starts, so test-dashboards restarts it after writing them.
// Devices, variables and Flows are picked by capability, class and type, never by name, as for every test dashboard.

/** Design, part and input ids here start with this, so a re-run replaces only these. */
export const TEST_PREFIX = 'test-';

const at = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const part = (id, kind, place, o = {}) => ({ id, kind, name: '', at: place, color: null, icon: null, rules: [], ...o });
/** A component sitting right on its background. */
const bare = (id, kind, place, o = {}) => part(id, kind, place, { style: 'none', ...o });
const text = (id, place, value, o = {}) => bare(id, 'text', place, { text: value, size: 'small', ...o });
const free = (id, place, parts, o = {}) => part(id, 'container', place, { mode: 'free', background: { kind: 'none' }, style: 'tile', parts, ...o });
const grid = (id, place, parts, o = {}) => part(id, 'container', place, { mode: 'grid', background: { kind: 'none' }, style: 'tile', parts, ...o });

/**
 * The designs, the Flow inputs and their values, and the widgets showing them (`[title, designId, extra]`), from the
 * Homey's devices, variables and Flows.
 */
export function testDesigns({ devices, variables, flows }) {
  const ok = devices.filter(d => d.available !== false);
  const has = (d, ...caps) => caps.every(c => d.capabilities?.includes(c));
  const all = (fn, n = Infinity) => ok.filter(fn).slice(0, n);
  const one = fn => all(fn, 1)[0];
  const slot = (d, cap) => (d ? `${d.id}:${cap}` : `missing-device-0000:${cap}`);
  const cls = d => d.virtualClass || d.class;

  const climate = one(d => has(d, 'measure_temperature', 'measure_humidity')) ?? one(d => has(d, 'measure_temperature'));
  const temps = all(d => has(d, 'measure_temperature') && cls(d) !== 'thermostat', 6);
  const co2 = one(d => has(d, 'measure_co2'));
  const radon = one(d => has(d, 'measure_radon'));
  const humid = all(d => has(d, 'measure_humidity'), 3);
  const powers = all(d => has(d, 'measure_power'), 6);
  const meter = one(d => has(d, 'meter_power')) ?? powers[0];
  const lights = all(d => cls(d) === 'light' && has(d, 'onoff', 'dim'), 6);
  const modeLight = one(d => cls(d) === 'light' && has(d, 'light_mode')) ?? lights[0];
  const contacts = all(d => has(d, 'alarm_contact'), 8);
  const motion = one(d => has(d, 'alarm_motion'));
  const lock = one(d => has(d, 'locked'));
  const lux = one(d => has(d, 'measure_luminance'));
  const speaker = one(d => has(d, 'volume_set'));
  const thermostat = one(d => has(d, 'target_temperature'));
  const camera = one(d => ['camera', 'doorbell'].includes(cls(d)) && d.images?.length) ?? one(d => d.images?.length);
  const progress = one(d => d.capabilities?.some(c => /progress_percentage$/.test(c)));
  const progressCap = progress?.capabilities.find(c => /progress_percentage$/.test(c));
  const countdown = one(d => d.capabilities?.filter(c => c.startsWith('days_until')).length >= 2);
  const batteries = all(d => has(d, 'measure_battery'), 4);

  const varOf = type => variables.find(v => v.type === type);
  const [vBool, vNum, vText] = [varOf('boolean'), varOf('number'), varOf('string')];
  const safeFlow = flows[0];

  // ------------------------------------------------------------------ Flow inputs (app-wide, Flows set them)
  const inputs = [
    { id: 'test-msg', name: 'Test · Message', type: 'text', reset: 'hour' },
    { id: 'test-num', name: 'Test · Counter', type: 'number', reset: 'never' },
    { id: 'test-alert', name: 'Test · Alert', type: 'yesno', reset: 'midnight' },
    { id: 'test-tint', name: 'Test · Tint', type: 'color', reset: 'never' },
    { id: 'test-icon', name: 'Test · Icon', type: 'icon', reset: 'never' },
    { id: 'test-page', name: 'Test · Page', type: 'number', reset: 'never' },
    { id: 'test-perdev', name: 'Test · Per device note', type: 'text', perDevice: true, reset: 'never' },
  ];
  const now = Date.now();
  const v = value => ({ value, at: now });
  const values = {
    'test-msg': { all: v('Set by a Flow · test-dashboards') },
    'test-num': { all: { value: 42, units: 'pts', at: now } },
    'test-alert': { all: v(true) },
    'test-tint': { all: v('teal') },
    'test-icon': { all: v('rocket') },
    'test-page': { all: v(2) },
    'test-perdev': {
      all: v('Shared note'),
      ...(temps[0] ? { devices: { [temps[0].id]: v('This device has its own note') } } : {}),
    },
  };

  // ------------------------------------------------------------------ ready-mades (for a Repeater and a linked one)
  const readyLight = {
    id: 'test-ready-light', name: 'Test · Light tile', ready: true, updatedAt: now, parts: [
      free('rl', at(0, 0, 2, 1), [
        bare('rli', 'icon', at(0, 0, 16, 46), { slot: '@:onoff', icon: 'bulb' }),
        text('rln', at(18, 0, 82, 46), '{1}', { refs: [{ slot: '@:onoff', show: 'name' }], weight: 'bold', overflow: 'ellipsis' }),
        part('rls', 'slider', at(0, 52, 100, 48), { slot: '@:dim', color: 'yellow' }),
      ], { rules: [{ op: 'is', value: 'on', look: 'yellow', of: { slot: '@:onoff' } }] }),
    ],
  };
  const readyNote = {
    id: 'test-ready-note', name: 'Test · Device and note', ready: true, updatedAt: now, parts: [
      free('rn', at(0, 0, 2, 1), [
        text('rnn', at(0, 0, 60, 46), '{1}', { refs: [{ slot: '@:measure_temperature', show: 'name' }], weight: 'bold', overflow: 'ellipsis' }),
        text('rnv', at(60, 0, 40, 46), '{1}', { refs: [{ slot: '@:measure_temperature' }], align: 'right' }),
        text('rnt', at(0, 54, 100, 46), '{1}', { refs: [{ input: 'test-perdev' }], muted: true, overflow: 'scroll' }),
      ]),
    ],
  };

  // ------------------------------------------------------------------ the designs
  const T = slot(climate, 'measure_temperature');
  const H = slot(climate, 'measure_humidity');
  const C = slot(co2, 'measure_co2');

  /** Climate: a widget state turning a pages container (rings, gauges, a 3-series chart), sums over every sensor. */
  const climateDesign = [
    part('view', 'state', at(0, 0, 4), { stateType: 'choice', initial: 'now', style: 'none',
      choices: [{ label: 'Now', value: 'now' }, { label: 'Air', value: 'air' }, { label: 'Day', value: 'day' }] }),
    part('cavg', 'calc', at(0, 0), { name: 'Average', op: 'avg', decimals: 1, inputs: temps.map(d => ({ slot: slot(d, 'measure_temperature') })) }),
    part('cmin', 'calc', at(1, 0), { name: 'Coldest', op: 'min', inputs: temps.map(d => ({ slot: slot(d, 'measure_temperature') })) }),
    part('cmax', 'calc', at(2, 0), { name: 'Warmest', op: 'max', inputs: temps.map(d => ({ slot: slot(d, 'measure_temperature') })) }),
    part('cdif', 'calc', at(3, 0), { name: 'Spread', op: 'formula', formula: 'b - a', decimals: 1, units: '°',
      inputs: temps.slice(0, 2).map(d => ({ slot: slot(d, 'measure_temperature') })) }),
    part('pg', 'container', at(0, 1, 4, 4), { mode: 'pages', nav: 'state', pageBy: { part: 'view' }, background: { kind: 'none' }, style: 'none',
      pages: [{ name: 'Now' }, { name: 'Air' }, { name: 'Day' }], parts: [
        part('rg', 'ring', at(0, 0, 6, 24), { page: 0, name: 'Here', center: 'value', rings: [
          { src: { slot: T }, min: 15, max: 30, color: 'orange' },
          { src: { slot: H }, min: 0, max: 100, color: 'cyan' },
          { src: { slot: C }, min: 400, max: 1600, color: 'green' },
        ] }),
        text('big', at(6, 0, 6, 7), '{1}', { page: 0, refs: [{ slot: T }], size: 'display', align: 'right' }),
        text('hum', at(6, 7, 6, 3), 'Humidity {1} · CO₂ {2}', { page: 0, refs: [{ slot: H }, { slot: C, plain: true }], align: 'right', muted: true }),
        text('avg', at(6, 12, 6, 3), 'Home {1}', { page: 0, refs: [{ part: 'cavg' }], align: 'right', weight: 'bold',
          rules: [{ op: 'below', value: '19', look: 'blue', of: { part: 'cavg' } }, { op: 'above', value: '24', look: 'red', of: { part: 'cavg' } }] }),
        text('cold', at(6, 16, 6, 3), '❄ {1} {2}', { page: 0, refs: [{ part: 'cmin', show: 'name' }, { part: 'cmin' }], align: 'right', overflow: 'ellipsis' }),
        text('warm', at(6, 20, 6, 3), '☀ {1} {2}', { page: 0, refs: [{ part: 'cmax', show: 'name' }, { part: 'cmax' }], align: 'right', overflow: 'ellipsis' }),
        part('ac', 'arc', at(0, 0, 6, 20), { page: 1, src: { slot: C }, min: 400, max: 2000, zones: 'rising', yellowAt: 1000, redAt: 1400, rangeSpan: '24h', thickness: 16, style: 'none' }),
        text('acv', at(0, 8, 6, 4), '{1}', { page: 1, refs: [{ slot: C }], size: 'large', align: 'center' }),
        text('acn', at(0, 20, 6, 3), 'CO₂ · 24 h range', { page: 1, align: 'center', muted: true }),
        part('ar', 'arc', at(6, 0, 6, 20), { page: 1, src: { slot: slot(radon, 'measure_radon') }, min: 0, max: 300, zones: 'rising', yellowAt: 100, redAt: 200, style: 'none' }),
        text('arv', at(6, 8, 6, 4), '{1}', { page: 1, refs: [{ slot: slot(radon, 'measure_radon') }], size: 'default', align: 'center' }),
        text('arn', at(6, 20, 6, 3), 'Radon', { page: 1, align: 'center', muted: true }),
        ...humid.map((d, i) => part(`hb${i}`, 'bar', at(i * 4, 24, 3, 6), { page: 1, src: { slot: slot(d, 'measure_humidity') }, min: 0, max: 100, thickness: 8,
          zones: 'falling', yellowAt: 35, redAt: 25, style: 'none' })),
        part('ch', 'chart', at(0, 0, 12, 30), { page: 2, name: 'Temperatures', span: '24h', chartStyle: 'area', smooth: true, header: true, chartLegend: 'below',
          series: temps.slice(0, 3).map((d, i) => ({ slot: slot(d, 'measure_temperature'), color: ['orange', 'blue', 'pink'][i] })) }),
      ] }),
    free('tr', at(0, 5, 4), [
      bare('trc', 'calc', at(86, 0, 14, 25), { inputs: [{ slot: T }], op: 'change', span: '24h', units: '' }),
      bare('tri', 'icon', at(0, 0, 10, 100), { icon: 'right', color: 'grey', rules: [
        { op: 'above', value: '0.3', look: 'red', icon: 'up', of: { part: 'trc' } }, { op: 'below', value: '-0.3', look: 'blue', icon: 'down', of: { part: 'trc' } }] }),
      text('trt', at(12, 0, 58, 100), 'Since yesterday {1}', { refs: [{ part: 'trc' }], weight: 'bold' }),
      bare('trs', 'sparkline', at(70, 10, 30, 80), { slot: T, span: '24h', smooth: true, color: 'orange' }),
    ]),
  ];

  /** Energy: segments, a donut, a formula, a gradient tile tinted by a sum, a week's bars and a gauge bar by level. */
  const P = powers.map(d => ({ slot: slot(d, 'measure_power') }));
  const energyDesign = [
    part('psum', 'calc', at(0, 0), { name: 'Total', op: 'sum', units: 'W', decimals: 0, inputs: P }),
    part('pkw', 'calc', at(0, 0), { name: 'Total kW', op: 'formula', formula: 'round((a + b + c + d + e + f) / 10) / 100', units: 'kW', inputs: P }),
    part('seg', 'segments', at(0, 0, 4, 2), { name: 'Using now', units: 'W', legend: true,
      segments: P.map((src, i) => ({ src, color: ['orange', 'red', 'blue', 'purple', 'teal', 'pink'][i], label: '' })) }),
    part('donut', 'segments', at(0, 2, 2, 2), { name: 'Of 5 kW', barStyle: 'donut', scale: 'max', max: 5000, legend: false,
      segments: P.slice(0, 3).map((src, i) => ({ src, color: ['yellow', 'green', 'indigo'][i], label: `#${i + 1}` })) }),
    free('tot', at(2, 2, 2, 2), [
      bare('toti', 'icon', at(0, 0, 20, 24), { icon: 'plugzap', grow: true }),
      text('totv', at(0, 26, 100, 30), '{1}', { refs: [{ part: 'pkw' }], size: 'display' }),
      text('totn', at(0, 58, 100, 14), 'In total · {1}', { refs: [{ part: 'psum' }], weight: 'bold' }),
      bare('tots', 'sparkline', at(0, 74, 100, 26), { slot: P[0]?.slot ?? T, span: '6h', color: 'yellow' }),
    ], { style: 'none', background: { kind: 'gradient', from: 'indigo', to: 'purple', angle: 200, dim: 'full' },
      rules: [{ op: 'above', value: '3000', look: 'red', of: { part: 'psum' } }] }),
    part('wk', 'chart', at(0, 4, 4, 3), { name: 'This week', span: '1w!', chartStyle: 'bars', chartScale: 'zero', chartLegend: 'above',
      series: P.slice(0, 2).map((x, i) => ({ slot: x.slot, color: i ? 'green' : 'orange', title: `Meter ${i + 1}` })) }),
    part('lvl', 'bar', at(0, 7, 4), { src: P[0] ?? { slot: T }, min: 0, max: 4000, thickness: 14, zones: 'rising', yellowAt: 2000, redAt: 3200, rangeSpan: '1d!', style: 'pill' }),
    ...(meter ? [part('mtr', 'sparkline', at(0, 8, 4), { slot: slot(meter, meter.capabilities.includes('meter_power') ? 'meter_power' : 'measure_power'), span: '1w!-', color: 'teal', style: 'tile' })] : []),
  ];

  /** Doors and motion: a count tinting a header, lists by test and sort, an icon following a lock, the time since motion. */
  const CT = contacts.map(d => ({ slot: slot(d, 'alarm_contact') }));
  const doorsDesign = [
    part('nopen', 'calc', at(0, 0), { name: 'Open', op: 'count', test: { op: 'is', value: 'on' }, inputs: CT }),
    grid('hdr', at(0, 0, 4), [
      bare('hi', 'icon', at(0, 0, 2, 6), { icon: 'dooropen', rules: [{ op: 'is', value: '0', look: 'same', icon: 'door', of: { part: 'nopen' } }] }),
      text('ht', at(2, 0, 7, 6), '{1} of {2} open', { refs: [{ part: 'nopen' }, { part: 'lst' }], size: 'default' }),
      bare('hd', 'shape', at(10, 2, 1, 2), { shape: 'circle', color: 'green', rules: [{ op: 'above', value: '0', look: 'red', of: { part: 'nopen' } }] }),
    ], { rules: [{ op: 'above', value: '0', look: 'orange', of: { part: 'nopen' } }] }),
    part('lst', 'repeat', at(0, 1, 4, 3), { name: 'Open now', capability: 'alarm_contact', test: { op: 'is', value: 'on' }, text: 'Everything is closed 🎉', sort: 'name', columns: 2 }),
    part('bat', 'repeat', at(0, 4, 4, 2), { name: 'Batteries, lowest first', capability: 'measure_battery', sort: 'up', limit: 8, itemStyle: 'tile', columns: 4 }),
    free('lk', at(0, 6, 2), [
      bare('lki', 'icon', at(0, 10, 30, 80), { slot: slot(lock, 'locked'), grow: true, color: 'green', rules: [{ op: 'is', value: 'off', look: 'red', icon: 'unlock' }] }),
      text('lkt', at(34, 0, 66, 100), '{1}', { refs: [{ slot: slot(lock, 'locked'), show: 'name' }], weight: 'bold', overflow: 'ellipsis' }),
    ], { style: 'pill' }),
    free('mo', at(2, 6, 2), [
      bare('moi', 'shape', at(0, 35, 10, 30), { shape: 'circle', color: 'grey', rules: [{ op: 'is', value: 'on', look: 'green', of: { slot: slot(motion, 'alarm_motion') } }] }),
      text('mot', at(14, 0, 86, 50), 'Motion {1}', { refs: [{ since: slot(motion, 'alarm_motion') }], weight: 'bold' }),
      text('mon', at(14, 50, 86, 50), '{1}', { refs: [{ slot: slot(motion, 'alarm_motion'), show: 'name' }], muted: true, overflow: 'ellipsis' }),
    ], { style: 'pill' }),
    bare('div', 'shape', at(0, 7, 4), { shape: 'line', thickness: 2, dir: 'horizontal', color: 'grey', opacity: 40 }),
    part('luxa', 'arc', at(0, 8), { src: { slot: slot(lux, 'measure_luminance') }, min: 0, max: 1000, color: 'yellow', style: 'tile' }),
    text('luxt', at(1, 8, 3), 'Light outside {1}', { refs: [{ slot: slot(lux, 'measure_luminance') }], size: 'default',
      rules: [{ op: 'between', value: '', to: '10', look: 'indigo', of: { slot: slot(lux, 'measure_luminance') } }] }),
  ];

  /** Lights: a Repeater of a ready-made, a linked one with its own device, a pill, a choice on an enum, a long press, a confirm. */
  const lightsDesign = [
    part('rep', 'each', at(0, 0, 4, 3), { ready: 'test-ready-light', devices: lights.slice(0, 6).map(d => d.id), columns: 2 }),
    part('one', 'use', at(0, 3, 2), { ready: 'test-ready-light', ...(lights.at(-1) ? { device: lights.at(-1).id } : {}) }),
    part('sw', 'switch', at(2, 3, 2), { slot: slot(lights[0], 'onoff'), name: 'Hold to switch', icon: 'lamp', color: 'pink', style: 'pill', active: 'lighter', press: 'long' }),
    part('mode', 'choice', at(0, 4, 4), { slot: slot(modeLight, 'light_mode'), name: 'Mode', color: 'cyan',
      choices: [{ label: 'Colour', value: 'color' }, { label: 'White', value: 'temperature' }] }),
    part('dim', 'slider', at(0, 5, 4), { slot: slot(lights[0], 'dim'), step: 0.1, color: 'orange' }),
    part('off', 'button', at(0, 6, 4), { name: 'All these off (tap twice)', icon: 'bulboff', color: 'red', press: 'confirm',
      actions: lights.slice(0, 3).map(d => ({ do: 'set', slot: slot(d, 'onoff'), value: 'off' })) }),
  ];

  /** Any device: every value is the widget's device's, so each placed copy shows another device. */
  const anyDesign = [
    free('box', at(0, 0, 4, 2), [
      bare('i', 'icon', at(0, 0, 12, 30), { slot: '@:measure_battery' }),
      text('n', at(14, 0, 86, 30), '{1}', { refs: [{ slot: '@:measure_battery', show: 'name' }], size: 'default', overflow: 'ellipsis' }),
      part('a', 'arc', at(0, 32, 40, 68), { src: { slot: '@:measure_battery' }, min: 0, max: 100, zones: 'falling', yellowAt: 30, redAt: 15, style: 'none' }),
      text('v', at(0, 56, 40, 20), '{1}', { refs: [{ slot: '@:measure_battery' }], size: 'default', align: 'center', weight: 'bold' }),
      bare('s', 'sparkline', at(44, 40, 56, 50), { slot: '@:measure_battery', span: '30d', color: 'green' }),
      text('t', at(44, 88, 56, 12), 'Last 30 days', { muted: true, align: 'right' }),
    ], { fillBy: { slot: '@:measure_battery' }, redBelow: 15, yellowBelow: 30 }),
  ];

  /** Flow inputs: every binding (text, colour, fill, icon, shown, page), inputs as sources and rules, actions setting them. */
  const inputsDesign = [
    text('msg', at(0, 0, 4), 'No message yet', { size: 'default', weight: 'bold', overflow: 'scroll', bind: { text: 'test-msg' } }),
    free('alert', at(0, 1, 4), [
      bare('ai', 'icon', at(0, 10, 14, 80), { icon: 'siren', color: '#ffffff' }),
      text('at', at(16, 0, 84, 100), 'Alert is on: shown by a yes/no input', { weight: 'bold', textColor: '#ffffff' }),
    ], { style: 'pill', background: { kind: 'color', from: 'red', dim: 'full' }, bind: { shown: 'test-alert' } }),
    free('tint', at(0, 2, 2, 2), [
      bare('ti', 'icon', at(30, 4, 40, 50), { icon: 'star', grow: true, bind: { icon: 'test-icon', color: 'test-tint' } }),
      text('tt', at(0, 60, 100, 40), 'Icon and colour from inputs', { align: 'center', weight: 'bold' }),
    ], { bind: { fill: 'test-tint' }, background: { kind: 'color', from: 'grey', dim: 'half' } }),
    free('cnt', at(2, 2, 2, 2), [
      text('cv', at(0, 0, 100, 50), '{1}', { refs: [{ input: 'test-num' }], size: 'display', align: 'center',
        rules: [{ op: 'above', value: '50', look: 'red', of: { input: 'test-num' } }, { op: 'between', value: '40', to: '50', look: 'yellow', of: { input: 'test-num' } }] }),
      part('cm', 'shape', at(4, 60, 44, 36), { shape: 'rect', radius: 12, color: 'blue', actions: [{ do: 'input', input: 'test-num', value: '-1' }] }),
      text('cmt', at(4, 60, 44, 36), '−1', { size: 'large', align: 'center', textColor: '#ffffff' }),
      part('cp', 'shape', at(52, 60, 44, 36), { shape: 'rect', radius: 12, color: 'green', actions: [{ do: 'input', input: 'test-num', value: '+2' }] }),
      text('cpt', at(52, 60, 44, 36), '+2', { size: 'large', align: 'center', textColor: '#ffffff' }),
    ]),
    part('pg', 'container', at(0, 4, 4, 2), { mode: 'pages', nav: 'dots', background: { kind: 'none' }, bind: { page: 'test-page' },
      pages: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }], parts: [
        text('p1', at(0, 0, 12, 12), 'Page 1 · the input *Test · Page* turns these', { page: 0, size: 'default' }),
        text('p2', at(0, 0, 12, 12), 'Page 2 · set it to 1, 2 or 3 from a Flow', { page: 1, size: 'default', textColor: 'teal' }),
        text('p3', at(0, 0, 12, 12), 'Page 3 · or a page\'s name', { page: 2, size: 'default', textColor: 'pink' }),
      ] }),
    part('tog', 'button', at(0, 6, 2), { name: 'Toggle alert', icon: 'bell', color: 'red', actions: [{ do: 'input', input: 'test-alert', value: 'toggle' }] }),
    part('pick', 'button', at(2, 6, 2), { name: 'Purple tint', icon: 'paintbrush', color: 'purple', actions: [
      { do: 'input', input: 'test-tint', value: 'purple' }, { do: 'input', input: 'test-icon', value: 'heart' }, { do: 'input', input: 'test-msg', value: 'Set by a button' }] }),
    part('each', 'each', at(0, 7, 4, 2), { ready: 'test-ready-note', capability: 'measure_temperature', limit: 4, columns: 2 }),
  ];

  /** Controls: each variable type, steppers, a slider on a variable, widget states, a long-press chain of actions. */
  const controlsDesign = [
    part('guest', 'state', at(0, 0, 2), { stateType: 'toggle', initial: 'false', name: 'Guest mode', icon: 'users', color: 'purple' }),
    part('scene', 'state', at(2, 0, 2), { stateType: 'choice', initial: 'b', name: 'Scene',
      choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }, { label: 'C', value: 'c' }] }),
    text('st', at(0, 1, 4), 'Guests {1} · scene {2}', { refs: [{ part: 'guest' }, { part: 'scene' }], size: 'default',
      rules: [{ op: 'is', value: 'on', look: 'purple', of: { part: 'guest' } }] }),
    ...(vText ? [part('vt', 'variable', at(0, 2, 4), { variable: vText.id, name: 'Text variable (tap to type)' }),
      part('vc', 'choice', at(0, 3, 4), { variable: vText.id, name: 'Same variable as a choice', color: 'indigo',
        choices: [{ label: 'Home', value: 'home' }, { label: 'Away', value: 'away' }, { label: 'Night', value: 'night' }] })] : []),
    ...(vNum ? [part('vn', 'variable', at(0, 4, 4), { variable: vNum.id, name: 'Number · step 5 · 0–100', step: 5, min: 0, max: 100, units: 'pcs', decimals: 0 }),
      part('vs', 'slider', at(0, 5, 4), { variable: vNum.id, min: 0, max: 100, step: 5, color: 'teal' })] : []),
    ...(vBool ? [part('vb', 'variable', at(0, 6, 2), { variable: vBool.id, name: 'Yes/no', color: 'green' }),
      part('vr', 'variable', at(2, 6, 2), { variable: vBool.id, name: 'Read only', readOnly: true, color: 'green' })] : []),
    part('thr', 'stepper', at(0, 7, 4), { slot: slot(thermostat, 'target_temperature'), name: 'Thermostat · 0.5 steps', step: 0.5, min: 16, max: 24, color: 'orange' }),
    part('vol', 'slider', at(0, 8, 4), { slot: slot(speaker, 'volume_set'), color: 'blue', step: 0.05 }),
    part('chain', 'button', at(0, 9, 2), { name: 'Hold: state, variable, Flow', icon: 'rocket', color: 'indigo', press: 'long', actions: [
      { do: 'state', part: 'guest', value: 'toggle' }, { do: 'state', part: 'scene', value: 'c' },
      ...(vBool ? [{ do: 'variable', variable: vBool.id, value: 'toggle' }] : []),
      ...(safeFlow ? [{ do: 'flow', flowId: safeFlow.id }] : [])] }),
    part('dash', 'shape', at(2, 9, 2), { shape: 'rect', radius: 32, color: 'cyan', opacity: 70, press: 'confirm', actions: [{ do: 'dashboard', dashboard: 'test-every' }] }),
    text('dasht', at(2, 9, 2), 'Tap twice: Every widget', { align: 'center', weight: 'bold' }),
  ];

  /** Free-form art: a gradient, shapes over each other, a camera picture, Post-its, every text size, the time in four ways. */
  const artDesign = [
    free('art', at(0, 0, 4, 4), [
      bare('sun', 'shape', at(58, 6, 36, 36), { shape: 'circle', color: 'yellow', opacity: 85 }),
      bare('halo', 'shape', at(52, 0, 48, 48), { shape: 'circle', color: 'orange', opacity: 25 }),
      bare('hill', 'shape', at(0, 70, 100, 30), { shape: 'rect', radius: 32, background: { kind: 'gradient', from: 'green', to: 'teal', angle: 90 } }),
      bare('hz', 'shape', at(0, 69, 100, 2), { shape: 'line', thickness: 2, color: '#ffffff', opacity: 60 }),
      bare('pole', 'shape', at(14, 30, 2, 40), { shape: 'line', thickness: 3, dir: 'vertical', color: 'brown' }),
      text('clk', at(4, 4, 50, 20), '{1}', { refs: [{ time: 'seconds' }], size: 'display', textColor: '#ffffff' }),
      text('day', at(4, 22, 50, 8), '{1}', { refs: [{ time: 'date' }], weight: 'bold', textColor: '#ffffff' }),
      text('til', at(4, 34, 50, 8), 'Bedtime {1}', { refs: [{ until: '22:30' }], textColor: 'yellow' }),
      text('lbl', at(4, 80, 92, 16), 'Free placement · per cent of the box', { size: 'default', align: 'center', textColor: '#ffffff' }),
    ], { style: 'tile', background: { kind: 'gradient', from: '#1b2a6b', to: '#e26a3a', angle: 170, dim: 'full' } }),
    ...(camera ? [part('cam', 'image', at(0, 4, 4, 3), { image: { kind: 'device', device: camera.id }, fit: 'cover', refresh: 1, style: 'tile' })] : []),
    text('pi', at(0, 7, 2, 2), 'Post-it in yellow, Caveat font', { style: 'postit', color: 'yellow', size: 'default' }),
    text('pi2', at(2, 7, 2, 2), 'And a pink one', { style: 'postit', color: 'pink', size: 'large' }),
    text('xl', at(0, 9, 4), 'Extra large', { size: 'display', style: 'tile' }),
    text('lg', at(0, 10, 2), 'Large', { size: 'large', textColor: 'orange' }),
    text('nm', at(2, 10, 2), 'Normal medium', { size: 'default', weight: 'medium' }),
    text('sm', at(0, 11, 2), 'Small, dimmed, centred', { muted: true, align: 'center' }),
    text('sc', at(2, 11, 2), 'A long line that scrolls sideways because it never fits in half a widget', { overflow: 'scroll', style: 'pill' }),
  ];

  /** Countdowns: a device's days-until values, each tinted when close. */
  const cds = countdown ? countdown.capabilities.filter(c => c.startsWith('days_until')).slice(0, 6) : [];
  const countdownDesign = [
    text('h', at(0, 0, 4), '{1}', { refs: [{ slot: slot(countdown, cds[0] ?? 'days_until'), show: 'name' }], size: 'default', weight: 'bold' }),
    ...cds.flatMap((c, i) => {
      const s = slot(countdown, c);
      const label = c.split('.').slice(1).join('.') || c;
      const x = (i % 2) * 2, y = 1 + Math.floor(i / 2);
      return [free(`cd${i}`, at(x, y, 2), [
        text(`cd${i}v`, at(0, 0, 100, 55), '{1}', { refs: [{ slot: s, plain: true, decimals: 0 }], size: 'large' }),
        text(`cd${i}n`, at(0, 58, 100, 42), label, { muted: true, overflow: 'ellipsis' }),
      ], { rules: [{ op: 'is', value: '0', look: 'red', of: { slot: s } }, { op: 'below', value: '2', look: 'orange', of: { slot: s } }, { op: 'above', value: '30', look: 'hide', of: { slot: s } }] })];
    }),
    ...(progress ? [part('wash', 'ring', at(0, 1 + Math.ceil(cds.length / 2), 2, 2), { name: 'Progress', center: 'value', rings: [{ src: { slot: slot(progress, progressCap) }, min: 0, max: 100, color: 'blue' }] })] : []),
  ];

  /** Edge cases: missing device, variable and Flow, a bad formula, a division by zero, refs past the end, empty parts. */
  const edgeDesign = [
    text('miss', at(0, 0, 4), 'Missing device: {1} · name {2}', { refs: [{ slot: 'missing-device-0000:measure_temperature' }, { slot: 'missing-device-0000:measure_temperature', show: 'name' }] }),
    part('bad', 'calc', at(0, 0), { name: 'Bad', op: 'formula', formula: 'a +* b', inputs: [{ slot: T }] }),
    part('div', 'calc', at(0, 0), { name: 'Zero', op: 'formula', formula: 'a / 0', inputs: [{ slot: T }] }),
    text('calc', at(0, 1, 4), 'Bad formula {1} · ÷0 {2} · past the end {7}', { refs: [{ part: 'bad' }, { part: 'div' }] }),
    part('mv', 'variable', at(0, 2, 2), { variable: 'missing-variable-0000', name: 'Deleted variable' }),
    part('mf', 'button', at(2, 2, 2), { name: 'Deleted Flow', flowId: 'flow:missing-flow-0000' }),
    part('ms', 'switch', at(0, 3, 2), { slot: 'missing-device-0000:onoff', name: 'Gone switch' }),
    part('er', 'ring', at(2, 3, 1), { name: 'No rings', rings: [] }),
    part('ec', 'chart', at(3, 3, 1), { name: 'No series', series: [] }),
    grid('empty', at(0, 4, 2), []),
    text('blank', at(2, 4, 2), ''),
    text('hid', at(0, 5, 4), 'You should never see this (hidden by a rule)', { rules: [{ op: 'isNot', value: 'nothing-is-this', look: 'hide', of: { slot: T } }] }),
    part('nb', 'bar', at(0, 5, 4), { src: { slot: 'missing-device-0000:measure_battery' }, min: 0, max: 100 }),
    part('rp', 'repeat', at(0, 6, 4, 2), { name: 'Nothing matches', capability: 'onoff', test: { op: 'between', value: '5', to: '6' }, text: 'Empty list text shows' }),
  ];

  const d = (id, name, parts, o = {}) => ({ id, name, updatedAt: now, parts, ...o });
  const designs = [
    readyLight, readyNote,
    d('test-climate', 'Test · Climate pages', climateDesign),
    d('test-energy', 'Test · Energy', energyDesign),
    d('test-doors', 'Test · Doors and motion', doorsDesign),
    d('test-lights', 'Test · Light lab', lightsDesign),
    d('test-any', 'Test · Any device', anyDesign, batteries[0] ? { sample: batteries[0].id } : {}),
    d('test-inputs', 'Test · Flow inputs', inputsDesign),
    d('test-controls', 'Test · Controls and states', controlsDesign),
    d('test-art', 'Test · Free-form art', artDesign),
    d('test-countdown', 'Test · Countdowns', countdownDesign),
    d('test-edge', 'Test · Edge cases', edgeDesign),
    d('test-empty', 'Test · Empty design', []),
    d('test-wide', 'Test · Three columns wide', energyDesign.map(p => ({ ...p })), { span: 3 }),
  ];

  const widgets = [
    ['Climate · a state turns the pages', 'test-climate'],
    ['Energy · Vivid', 'test-energy', { colorStyle: 'deep' }],
    ['Energy · Muted', 'test-energy'],
    ['Doors and motion', 'test-doors'],
    ['Light lab · Repeater and linked', 'test-lights'],
    ...batteries.slice(0, 3).map((b, i) => [`Any device · device ${i + 1}`, 'test-any', {}, b]),
    ['Any device · none picked', 'test-any'],
    ['Flow inputs', 'test-inputs'],
    ['Flow inputs · Vivid', 'test-inputs', { colorStyle: 'deep' }],
    ['Controls and states', 'test-controls'],
    ['Free-form art', 'test-art'],
    ['Countdowns', 'test-countdown'],
    ['Edge cases', 'test-edge'],
    ['Empty design', 'test-empty'],
    ['Deleted design', 'test-gone-0000'],
    ['Nothing picked', null],
  ];
  return { designs, inputs, values, widgets, wide: 'test-wide' };
}
