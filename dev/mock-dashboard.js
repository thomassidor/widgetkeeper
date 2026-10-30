// The widgets of dev/screenshots.html: the real widget code with the made-up home of showcase-data.js ("Solbakken",
// the showcase dashboards' data, so no real home's names or readings end up in the README), mounted into the elements
// with the ids w-elec, w-thermo, w-qa, w-sa, w-roomhealth, w-valuematrix, w-weather, w-heatmap, w-cameras, w-values, w-sparklines, w-charts, w-totals, w-scatter, w-compare, w-timeline, w-stacked, w-dailyrange, w-typicalday, w-variables,
// w-varpresets, w-keypad, w-flows, w-price, w-locks, w-clock, w-textline(-note), w-dayssince, w-shortcuts, w-lightrooms,
// w-pollen and w-webpage, and the Popups prompt page into the frame w-popup. Most go through showcase-mount.js's MOUNT with a
// showcase entry (`findWidget()`); only the README's own changes are here. Needs the widget scripts,
// temp/screenshot-icons.js, showcase-data.js and showcase-mount.js loaded first, and the showcase's fixed clock
// (fixed-clock.js), so every render is the same.
(function () {
  const el = id => document.getElementById(id);

  const elec = findWidget('electricity');
  MOUNT.electricity(el('w-elec'), { ...elec, settings: { ...elec.settings, liveWindow: 10, smooth: false, nextLow: 'both' } });

  MOUNT.thermostat(el('w-thermo'), findWidget('thermostat'));

  // Home's lock, coffee machine and TV, then the security dashboard's garage door, doorbell and router.
  MOUNT.quickactions(el('w-qa'), { devices: [...findWidget('quickactions', 0).devices, ...findWidget('quickactions', 2).devices] });

  MOUNT.sensoralarms(el('w-sa'), findWidget('sensoralarms', 1)); // security: with the door contacts

  MOUNT.values(el('w-values'), findWidget('values', 1)); // security: batteries in red, yellow and green

  MOUNT.sparklines(el('w-sparklines'), { slots: findWidget('sparklines').slots });

  // The Energy dashboard's Charts is one overlaid chart: the README shows two stacked, from the sparklines' made-up 24 hours (outdoor, main meter).
  const sparkSlot = (deviceId) => {
    for (let n = 0; findWidget('sparklines', n); n++) {
      const s = findWidget('sparklines', n).slots.find(x => x.deviceId === deviceId);
      if (s) return s;
    }
    return null;
  };
  MOUNT.charts(el('w-charts'), {
    opts: { charts: [{ span: '24h', color: 'purple', smooth: true }, { span: '24h', style: 'bars', color: 'orange' }] },
    charts: [['g1', 'Temperature'], ['m1', 'Power']].map(([id, title]) => {
      const s = sparkSlot(id);
      return { ...s, capability: { ...s.capability, title } };
    }),
  });

  // Chart · Totals: the main meter's year so far against last year, a month a bar (mock-totals.js, on the fixed clock).
  MOUNT.totals(el('w-totals'), { opts: { period: 'thisYear', compare: true }, state: mockTotals.totalsState('thisYear', SHOWCASE_NOW) });

  // Chart · Scatter (XY): the heat pump's power against the outdoor temperature over a week, a dot an hour (mock-scatter.js).
  // Chart · TypicalDay: the house's power today over its usual day, a little high (mock-typicalday.js).
  if (el('w-typicalday')) MOUNT.typicalday(el('w-typicalday'), { opts: {}, state: mockTypicalDay.typicalDayState(7, SHOWCASE_NOW) });
  // Chart · DailyRange: the outdoor temperature's low to high each day of the last 4 weeks (mock-dailyrange.js).
  if (el('w-dailyrange')) MOUNT.dailyrange(el('w-dailyrange'), { opts: {}, state: mockDailyRange.dailyRangeState('4w', SHOWCASE_NOW) });
  // Chart · Ranking: six rooms' temperatures now and today's range, warmest first (mock-compare.js).
  if (el('w-compare')) MOUNT.compare(el('w-compare'), { opts: { count: 6 }, state: mockCompare.compareState('1d!', SHOWCASE_NOW) });
  // Chart · Timeline: the heating, hall motion, front door and TV today, in the mock-up's colours (mock-timeline.js).
  if (el('w-timeline')) MOUNT.timeline(el('w-timeline'), { opts: { colors: ['orange', 'yellow', 'red', 'blue'] }, state: mockTimeline.timelineState('1d!', SHOWCASE_NOW) });
  // Chart · Stacked: the meter's last 24 hours as the heat pump, the oven, the EV charger and the rest (mock-stacked.js).
  if (el('w-stacked')) MOUNT.stacked(el('w-stacked'), { opts: { total: true, count: 3, colors: ['orange', 'red', 'green'] }, state: mockStacked.stackedState('24h', SHOWCASE_NOW) });
  if (el('w-scatter')) MOUNT.scatter(el('w-scatter'), { opts: { span: '7d' }, state: mockScatter.scatterState('7d', SHOWCASE_NOW) });

  // The Climate dashboard's rooms, with the kitchen humid after dinner, a stuffy bedroom and the office's radon far over.
  MOUNT.roomhealth(el('w-roomhealth'), findWidget('roomhealth'));
  MOUNT.valuematrix(el('w-valuematrix'), findWidget('valuematrix'));

  // Not on a showcase dashboard any more (Home's flags made way for Flow Buttons): the README's own four.
  MOUNT.variables(el('w-variables'), { vars: [
    { id: 'f1', name: 'Away mode', type: 'boolean', value: false },
    { id: 'f2', name: 'Guests staying over', type: 'boolean', value: true },
    { id: 'f3', name: 'Pause the hallway motion lights', type: 'boolean', value: false },
    { id: 'f4', name: 'Night setpoint', type: 'number', value: 18.5 },
  ] });

  // The Climate dashboard has a heating mode: the README's house mode, a text variable with four buttons, Away lit.
  const mode = value => ({ id: `string:${JSON.stringify(value)}`, name: value, value, type: 'string' });
  MOUNT.varpresets(el('w-varpresets'), {
    opts: { icon: 'home' },
    settings: { value1: mode('Home'), value2: mode('Away'), value3: mode('Night'), value4: mode('Holiday') },
    variable: { id: 'm1', name: 'House mode', type: 'string', value: 'Away' },
  });

  // A made-up alarm, armed, its keypad always shown with two digits typed: Arm and Night without the code, Disarm behind it.
  const alarmValue = (value, name) => ({ id: `string:${JSON.stringify(value)}`, name, value, type: 'string' });
  MOUNT.keypad(el('w-keypad'), {
    settings: {
      state: { id: 'cap:alarm:homealarm_state' }, title: 'Alarm', code: { id: 'c1', name: 'Alarm' }, keypad: 'always',
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
  for (const k of ['1', '2']) [...el('w-keypad').querySelectorAll('.kp-key')].find(b => b.textContent === k).click();

  // Home's two flows side by side, and two more below them for the README.
  const flows = findWidget('flows');
  const more = [
    [{ id: 'advanced:3', color: 'orange', icon: 'tv' }, { id: 'advanced:3', name: 'Movie time', enabled: true, triggerable: true, advanced: true }],
    [{ id: 'flow:4', color: 'blue', icon: 'leave' }, { id: 'flow:4', name: 'Leaving home', enabled: true, triggerable: true, advanced: false }],
  ];
  MOUNT.flows(el('w-flows'), {
    opts: { ...flows.opts, buttons: [...flows.opts.buttons, ...more.map(m => m[0])] },
    flows: [...flows.flows, ...more.map(m => m[1])],
  });

  MOUNT.price(el('w-price'), findWidget('price')); // energy: the evening peak

  const doors = findWidget('locks'); // security: the shed unlocked and the garage open, here with the list showing
  MOUNT.locks(el('w-locks'), { ...doors, opts: { ...doors.opts, view: 'list' } });

  MOUNT.cameras(el('w-cameras'), { cameras: findWidget('cameras', 1).cameras.slice(0, 4) });

  MOUNT.heatmap(el('w-heatmap'), findWidget('heatmap'));

  MOUNT.weather(el('w-weather'), { hours: findWidget('weather').hours });

  MOUNT.clock(el('w-clock'), findWidget('clock'));

  // Notes' two looks: a tile a Flow wrote on in blue, and the Kitchen's Post-it.
  const board = (text, color = null) => ({ key: 'note', name: 'Note', text, color, updatedAt: SHOWCASE_NOW });
  MOUNT.textline(el('w-textline'), { opts: { source: 'flow', icon: 'bell' }, board: board('The washing machine is done', 'blue') });
  MOUNT.textline(el('w-textline-note'), findWidget('textline'));

  // The Kitchen's Days Since has its own chores: the README's household, one row amber, one red, and Fish just fed (Undo).
  const DAY = 864e5;
  MOUNT.dayssince(el('w-dayssince'), { counters: [
    { name: 'Plants watered', icon: 'leaf', amber: 5, red: 7, ago: 6 * DAY + 3 * 3600e3 },
    { name: 'Vacuum filter', icon: 'vacuum', amber: 75, red: 90, ago: 92 * DAY },
    { name: 'Bedsheets', icon: 'bed', amber: 12, red: 14, ago: 9 * DAY },
    { name: 'Fish fed', icon: 'paw', amber: 2, red: 3, ago: 26 * 3600e3 },
    { name: 'Descale coffee machine', icon: 'coffee', amber: 50, red: 60, ago: 23 * DAY },
    { name: 'Smoke alarm test', icon: 'bell', amber: 25, red: 30, ago: 12 * DAY },
  ] });
  el('w-dayssince').querySelectorAll('.ds-row')[3].click();

  // Dashboard Shortcuts (web dashboards only): six of the showcase's dashboards as a menu, on Home.
  const menu = [['home', 'purple', 'home'], ['energy', 'green', 'bolt'], ['security', 'red', 'shield'],
    ['climate', 'blue', 'thermometer'], ['evening', 'orange', 'moon'], ['kitchen', 'yellow', 'utensils']];
  MOUNT.shortcuts(el('w-shortcuts'), {
    current: 'home', opts: { tiles: menu.map(([, color, icon]) => ({ color, icon })) },
    dashboards: menu.map(([id]) => ({ id, name: SHOWCASE[id].title })),
  });

  // The Evening dashboard's lights by room, the living room open with its Moods; the Climate dashboard's rain radar.
  MOUNT.lightrooms(el('w-lightrooms'), findWidget('lightrooms'));
  MOUNT.webpage(el('w-webpage'), findWidget('webpage'));

  // Pollen and UV: the Garden dashboard's October has only the seasons' last grains, so the README has a June day of
  // its own: grass high, the birch season's tail, the UV peak at 13.
  const june = (values, uv) => ({
    date: '2026-06-16', uv: { max: uv, level: 3, at: new Date('2026-06-16T13:00:00').getTime() },
    pollen: Object.fromEntries(Object.entries(values).map(([type, [value, level]]) => [type, { value, level }])),
  });
  MOUNT.pollen(el('w-pollen'), { data: { outside: false, uvNow: 3, days: [june({ birch: [34, 2], grass: [64, 3], mugwort: [4, 1] }, 6.1)] } });

  // Popups: the real prompt page (settings/popup.html's script) in dark mode against a simulated app, as on the 1.1.0
  // teaser (whats-next.html): someone at the front door, the hallway camera's made-up picture, Unlock highlighted.
  const picture = fetch('cameras/door.webp').then(r => r.arrayBuffer()).then((buf) => {
    let bin = '';
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return { type: 'image/webp', data: btoa(bin) };
  });
  const frame = el('w-popup');
  frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="../settings/popup.css"><script src="../widgets/spacer/public/kit.js"><\/script><script src="../settings/popup.js"><\/script>'
    + '<style>.pp { --pp-bg: #111217; --pp-card: #1F2029; --pp-raised: #2B2C36; --pp-text: #E4E4E7; --pp-muted: #999AA3; --pp-accent: #339BFB; }</style>'
    + '</head><body><main id="app" class="pp"></main></body></html>';
  frame.addEventListener('load', () => {
    const json = body => new Response(JSON.stringify(body));
    const popup = { kind: 'ask', text: 'Someone is at the front door. Unlock it?', buttons: ['Unlock', 'Not now'], picture: { source: 'camera' } };
    frame.contentWindow.mountPopupPage(frame.contentWindow.document.getElementById('app'), {
      hash: '#id=p1&t=readme',
      fetch: async url => (url.endsWith('/image') ? json(await picture)
        : json({ closed: false, ...popup, now: Date.now(), until: Date.now() + 60e3, language: 'en' })),
    });
  });
})();
