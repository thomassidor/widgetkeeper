// A simulated Widgetkeeper app API for the web dashboards page (settings/dashboard.js), shared by web-preview.html
// and web-showcase.html. Load it before dashboard.js, from a served repo root (it fetches /app.json and
// /locales/<lang>.json). It answers the page's `fetch('/api/app/<appId>/…')` calls; everything else goes through.
// `mockWebApi({lang, dashboards, front, zones, devices, readings})`: the dashboards (and the front page's sections in
// `front`), and for the device and value pickers a
// made-up house (`zones`: id → [name, parent id]; `devices`: {id, name, zone, class, capabilities, icon};
// `readings`: capability → {title, type, units, …, value (or a function of the device)}).

// The editor's sections, as lib/WebDashboardService.ts's settingSections() makes them: test/web-dashboards.test.ts
// checks the two agree on every widget's settings in every language.
function mockSettingSections(settings, lang) {
  const SUB_ROW = /^\s+–\s*/;
  const NUMBERED = /^(.*\S)\s+\d+$/;
  const capitalize = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
  const loc = (text) => (text && typeof text === 'object' ? text[lang] || text.en : text) || '';
  const en = settings.map(s => (s.title && s.title.en) || s.id);
  const sub = en.map(t => SUB_ROW.test(t));
  const labels = new Map();
  const sections = [];
  let plain = null;
  for (let i = 0; i < settings.length;) {
    const title = loc(settings[i].title) || settings[i].id;
    let end = i + 1;
    while (!sub[i] && end < settings.length && sub[end]) end++;
    if (end > i + 1) {
      const enColon = en[i].indexOf(':');
      const colon = title.indexOf(':');
      labels.set(settings[i].id, enColon < 0 || colon < 0 ? title : capitalize(title.slice(colon + 1).trim()));
      for (let j = i + 1; j < end; j++) labels.set(settings[j].id, capitalize((loc(settings[j].title) || settings[j].id).replace(SUB_ROW, '')));
      sections.push({ kind: 'group', title: enColon < 0 || colon < 0 ? title : title.slice(0, colon).trim(),
        numbered: NUMBERED.test(enColon < 0 ? en[i] : en[i].slice(0, enColon)), ids: settings.slice(i, end).map(s => s.id) });
      plain = null;
      i = end;
      continue;
    }
    const base = !sub[i] && !en[i].includes(':') ? (NUMBERED.exec(en[i]) || [])[1] : undefined;
    let last = i;
    if (base) {
      while (last + 1 < settings.length && !sub[last + 1] && !sub[last + 2] && settings[last + 1].type === settings[i].type
        && (NUMBERED.exec(en[last + 1]) || [])[1] === base) last++;
    }
    if (last > i) {
      for (let j = i; j <= last; j++) labels.set(settings[j].id, loc(settings[j].title) || settings[j].id);
      sections.push({ kind: 'slots', ids: settings.slice(i, last + 1).map(s => s.id) });
      plain = null;
      i = last + 1;
      continue;
    }
    labels.set(settings[i].id, sub[i] ? capitalize(title.replace(SUB_ROW, '')) : title);
    if (!plain) sections.push({ kind: 'plain', ids: plain = [] });
    plain.push(settings[i].id);
    i++;
  }
  return { sections, labels };
}

// `popups`: the open popups (wk-084), as `/web/popups` lists them; their pictures are a drawn front door, never a real
// camera image (or a popup's own `image`, `{type, data}` or a promise of it: the web showcase's made-up camera picture),
// and one with `elsewhere` answers as if another screen had been first.
/** Made-up Keypad codes for a dashboard's code (the app keeps only fingerprints; the preview knows the digits). */
const MOCK_CODES = [{ id: '0a1b2c3d4e5f', name: 'Anna', digits: '1234' }, { id: 'f5e4d3c2b1a0', name: 'Kids', digits: '2580' }];

/** Answers a WebRTC offer from a second connection in the page, sending a drawn canvas: never a real camera image. */
async function mockVideoAnswer(offer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const g = canvas.getContext('2d');
  setInterval(() => {
    const x = (Date.now() / 8) % 1280;
    g.fillStyle = '#26303a'; g.fillRect(0, 0, 1280, 720);
    g.fillStyle = '#3c4a57'; g.fillRect(440, 160, 400, 560);
    g.fillStyle = '#e8b04b'; g.beginPath(); g.arc(x, 110, 44, 0, Math.PI * 2); g.fill();
  }, 100);
  const pc = new RTCPeerConnection();
  for (const track of canvas.captureStream(10).getTracks()) pc.addTrack(track);
  await pc.setRemoteDescription({ type: 'offer', sdp: offer });
  await pc.setLocalDescription(await pc.createAnswer());
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(undefined); return; }
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve(undefined); });
    setTimeout(resolve, 2000);
  });
  return { answer: pc.localDescription.sdp, streamId: 'mock' };
}

function mockWebApi({ lang = 'en', dashboards = [], front: frontIn = {}, zones = {}, devices = [], readings = {}, popups = [], codes = MOCK_CODES, sync = {} } = {}) {
  try { localStorage.setItem('widgetkeeper.web.key', 'preview'); } catch (e) { /* private mode */ }
  const loc = (text) => (text && typeof text === 'object' ? text[lang] || text.en : text) || '';

  let manifest = null;
  let front = { widgets: true, sections: [], ...frontIn };
  const codeLock = { wrong: 0, until: 0 };
  let strings = null;
  const ready = Promise.all([
    fetch('/app.json').then(r => r.json()).then((m) => { manifest = m; }),
    fetch(`/locales/${lang}.json`).then(r => r.json()).then((s) => { strings = s; }),
  ]);
  const pathOf = (z) => { const out = []; let p = zones[z][1]; while (p) { out.unshift(zones[p][0]); p = zones[p][1]; } return out; };
  const zoneOf = (d) => (d.zone ? { id: d.zone, name: zones[d.zone][0], path: pathOf(d.zone) } : null);
  const passes = (d, filter) => {
    if (!filter) return true;
    const any = (v) => String(v).split('|');
    if (filter.class && !any(filter.class).includes(d.class)) return false;
    if (filter.capabilities && !any(filter.capabilities).some(c => d.capabilities.includes(c))) return false;
    return true;
  };

  const HOMEY_DASHBOARDS = [{ id: 'h-kitchen', name: 'Kitchen' }, { id: 'h-phone', name: 'Phone' }, { id: 'h-energy', name: 'Energy' }];
  let syncSchedule = { nightly: true, time: '03:00' };
  /** The dashboards synced with Homey dashboards (`LinkStatus` by web dashboard id). */
  /** @type {Record<string, any>} */
  const syncLinks = { ...sync };

  async function answer(method, path, body) {
    await ready;
    const [p, qs] = path.split('?');
    const q = new URLSearchParams(qs || '');
    if (p === '/web/setup') {
      const widgets = Object.entries(manifest.widgets).map(([type, w]) => {
        const { sections, labels } = mockSettingSections(w.settings || [], lang);
        return {
          type,
          name: loc(w.name) || type,
          height: w.height ?? null,
          transparent: !!w.transparent,
          devices: w.devices ? { singular: w.devices.singular === true } : null,
          settings: (w.settings || []).map(s => ({
            id: s.id, type: s.type, title: loc(s.title) || s.id, label: labels.get(s.id), hint: loc(s.hint) || null, value: s.value ?? null,
            ...(typeof s.min === 'number' ? { min: s.min } : {}),
            ...(typeof s.max === 'number' ? { max: s.max } : {}),
            ...(s.values ? { values: s.values.map(v => ({ id: String(v.id), title: loc(v.title) || String(v.id) })) } : {}),
            ...(((type === 'values' || type === 'sparklines') && /^slot\d+$/.test(s.id)) || (type === 'charts' && /^chart\d$/.test(s.id)) || (type === 'totals' && s.id === 'slot') || (type === 'scatter' && /^[xy]Value$/.test(s.id)) || (type === 'typicalday' && /^slot$/.test(s.id)) || (type === 'dailyrange' && /^slot$/.test(s.id)) || (type === 'compare' && /^slot\d$/.test(s.id)) || (type === 'timeline' && /^slot\d$/.test(s.id)) || (type === 'stacked' && /^(total|slot\d)$/.test(s.id)) || (type === 'lines' && /^slot\d$/.test(s.id)) || (type === 'gauge' && s.id === 'slot') ? { picker: 'capability' } : {}),
          })),
          sections,
        };
      });
      return {
        appId: 'com.thomassidor.widgetkeeper', homeyId: 'preview', language: lang, strings, widgets, dashboards, front,
        maxDashboards: 64, maxWidgets: 60, maxSections: 20, popups: { popups, now: Date.now() }, dim: { flows: {}, now: Date.now() },
        codes: codes.map(({ id, name, digits }) => ({ id, name, digits: digits.length })),
        sync: syncLinks,
      };
    }
    // Syncing with Homey dashboards (lib/WebSyncService.ts): made-up Homey dashboards; a sync changes nothing here.
    if (p === '/web/sync' && method === 'GET') return { schedule: syncSchedule, links: syncLinks };
    if (p === '/web/sync' && method === 'PUT') { syncSchedule = { ...syncSchedule, ...body }; return syncSchedule; }
    if (p === '/web/sync' && method === 'POST') return { results: {} };
    if (p === '/web/sync/homey') {
      return { ok: true, dashboards: HOMEY_DASHBOARDS.map(h => ({ ...h, linked: Object.keys(syncLinks).find(id => syncLinks[id].homeyId === h.id) || null })) };
    }
    const syncRoute = p.match(/^\/web\/dashboards\/([^/]+)\/sync$/);
    if (syncRoute) {
      const id = syncRoute[1];
      const lastSync = { at: Date.now(), ok: true, conflicts: [], changes: { web: { added: 0, removed: 0, updated: 0, moved: false, renamed: false }, homey: { added: 0, removed: 0, updated: 0, moved: false, renamed: false } } };
      if (method === 'DELETE') { const removed = !!syncLinks[id]; delete syncLinks[id]; return { removed }; }
      if (method === 'PUT') {
        if (body.homeyId === undefined) { syncLinks[id].prefer = body.prefer === 'web' ? 'web' : 'homey'; return { ok: true, link: syncLinks[id] }; }
        syncLinks[id] = { homeyId: body.homeyId === 'new' ? 'h-new' : body.homeyId, prefer: body.prefer === 'web' ? 'web' : 'homey', lastSync, syncing: false };
        return { ok: true, link: syncLinks[id], lastSync };
      }
      if (syncLinks[id]) syncLinks[id].lastSync = lastSync;
      return lastSync;
    }
    if (p === '/web/dim') return { flows: {}, now: Date.now() };
    if (p === '/web/popups') return { popups, now: Date.now() };
    const popupImage = p.match(/^\/web\/popups\/([^/]+)\/image$/);
    if (popupImage) {
      const own = popups.find(x => x.id === popupImage[1])?.image;
      if (own) return await own;
      // A drawn front door; a camera's lamp changes with every read, so the refresh shows.
      const lamp = popups.find(x => x.id === popupImage[1])?.picture?.source === 'camera' ? (Date.now() / 3000 | 0) % 2 : 0;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#2B3A4A"/>`
        + '<rect y="250" width="640" height="110" fill="#3D4A3A"/><rect x="250" y="70" width="140" height="210" rx="6" fill="#6B3E26"/>'
        + '<circle cx="365" cy="180" r="7" fill="#E8C66A"/><rect x="230" y="60" width="180" height="14" fill="#1C2733"/>'
        + `<circle cx="450" cy="110" r="16" fill="${lamp ? '#FFE9A8' : '#E8C66A'}"/></svg>`;
      return { type: 'image/svg+xml', data: btoa(svg) };
    }
    // A popup's camera, live: real WebRTC in the page, its "camera" a drawn canvas (`?popup=live`); `?popup=full` has no streams.
    const popupVideos = p.match(/^\/web\/popups\/([^/]+)\/videos$/);
    if (popupVideos) return { videos: popups.find(x => x.id === popupVideos[1])?.live ? ['mock-stream'] : [], h265: [] };
    if (p === '/web/call' && body.type === 'cameras' && body.path === '/video/offer') return mockVideoAnswer(body.body.offer);
    if (p === '/web/call' && body.type === 'cameras') return { ok: true };
    const popupAnswer = p.match(/^\/web\/popups\/([^/]+)\/answer$/);
    if (popupAnswer) {
      const popup = popups.find(x => x.id === popupAnswer[1]);
      popups = popups.filter(x => x.id !== popupAnswer[1]);
      if (popup && popup.elsewhere) return { ok: false, reason: 'closed', answer: true, button: popup.buttons[0] };
      return popup
        ? { ok: true, answer: body.answer === true, button: popup.buttons[body.answer === true ? 0 : 1] }
        : { ok: false, reason: 'closed', answer: null, button: null };
    }
    if (p === '/web/devices') {
      // Another app's widget sends its filter (the made-up app has no devices of its own, so `app=1` is left out).
      const filter = String(q.get('type')).startsWith('homey:app:')
        ? { class: q.get('class') || undefined, capabilities: q.get('capabilities') || undefined }
        : manifest.widgets[q.get('type')]?.devices?.filter;
      return devices.filter(d => passes(d, filter))
        .map(d => ({ id: d.id, name: d.name, zone: zoneOf(d), icon: d.icon }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (p === '/web/values') {
      // Made-up readings: each device's capabilities as the value picker gets them (Sparklines and Charts: numbers only).
      const numbersOnly = q.get('type') === 'sparklines' || q.get('type') === 'charts' || q.get('type') === 'totals' || q.get('type') === 'scatter' || q.get('type') === 'typicalday' || q.get('type') === 'dailyrange' || q.get('type') === 'compare' || q.get('type') === 'gauge';
      return devices
        .map(d => ({
          id: d.id, name: d.name, zone: zoneOf(d), icon: d.icon,
          caps: d.capabilities.filter(c => readings[c] && (!numbersOnly || readings[c].type === 'number'))
            .map((c, i) => ({ id: c, ...readings[c], value: typeof readings[c].value === 'function' ? readings[c].value(d, i) : readings[c].value })),
        }))
        .filter(d => d.caps.length)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (p === '/web/dashboards' && method === 'PUT') {
      const saved = { ...body, id: body.id || Math.random().toString(36).slice(2, 10) };
      const i = dashboards.findIndex(d => d.id === saved.id);
      if (i >= 0) dashboards[i] = saved; else dashboards.push(saved);
      return saved;
    }
    if (p === '/web/front' && method === 'PUT') {
      // As the app: sections (all of them), the dashboards' placement, then the order.
      if (Array.isArray(body.sections)) front = { ...front, sections: body.sections };
      if (typeof body.widgets === 'boolean') front = { ...front, widgets: body.widgets };
      const known = new Set(front.sections.map(x => x.id));
      dashboards = dashboards.map((d) => {
        const section = body.placement && d.id in body.placement ? body.placement[d.id] : d.section;
        const { section: _, ...rest } = d;
        return known.has(section) ? { ...rest, section } : rest;
      });
      if (Array.isArray(body.order)) dashboards.sort((a, b) => body.order.indexOf(a.id) - body.order.indexOf(b.id));
      return { dashboards, front };
    }
    if (p === '/web/backup' && method === 'GET') {
      const ids = q.has('ids') ? q.get('ids').split(',').filter(Boolean) : null;
      const chosen = ids ? dashboards.filter(d => ids.includes(d.id)) : dashboards;
      return { format: 'widgetkeeper-web-dashboards', version: 1, app: '1.0.2', exportedAt: new Date().toISOString(), dashboards: chosen, front, tileNames: {} };
    }
    if (p === '/web/backup' && method === 'PUT') {
      // As the app: a stored id is replaced in place, a new one added while there's room; the others stay.
      let restored = 0, widgets = 0, skipped = 0;
      for (const d of body.dashboards) {
        const i = dashboards.findIndex(x => x.id === d.id);
        if (i >= 0) dashboards[i] = d;
        else if (dashboards.length < 64) dashboards.push(d);
        else { skipped++; continue; }
        restored++;
        widgets += d.columns.flat().length;
      }
      if (body.complete === true) front = { widgets: !(body.front && body.front.widgets === false), sections: (body.front && body.front.sections) || [] };
      return { dashboards: restored, widgets, skipped };
    }
    // A dashboard's code: the made-up codes' digits are in `MOCK_CODES`; five wrong ones in a row lock it 30 s.
    const unlock = p.match(/^\/web\/dashboards\/([^/]+)\/unlock$/);
    if (unlock && method === 'POST') {
      const d = dashboards.find(x => x.id === decodeURIComponent(unlock[1]));
      if (!d) return { ok: false, reason: 'missing' };
      const wanted = !d.code ? [] : d.code.id === 'any' ? codes : codes.filter(c => c.id === d.code.id);
      if (!wanted.length) return { ok: true };
      if (Date.now() < codeLock.until) return { ok: false, reason: 'locked', retryAfter: Math.ceil((codeLock.until - Date.now()) / 1000) };
      if (wanted.some(c => c.digits === body.code)) { codeLock.wrong = 0; return { ok: true }; }
      codeLock.wrong += 1;
      if (codeLock.wrong < 5) return { ok: false, reason: 'wrongCode', left: 5 - codeLock.wrong };
      codeLock.until = Date.now() + 30e3;
      return { ok: false, reason: 'locked', retryAfter: 30 };
    }
    const copy = p.match(/^\/web\/dashboards\/([^/]+)\/copy$/);
    if (copy && method === 'POST') {
      const i = dashboards.findIndex(d => d.id === decodeURIComponent(copy[1]));
      if (i < 0) throw new Error('No such dashboard');
      if (dashboards.length >= 64) throw new Error('At most 64 dashboards');
      const dashboard = { ...JSON.parse(JSON.stringify(dashboards[i])), id: Math.random().toString(36).slice(2, 10), name: `${dashboards[i].name || 'Dashboard'} (copy)` };
      dashboards.splice(i + 1, 0, dashboard);
      return { dashboard, dashboards };
    }
    // Copy to… (the app's `copyWidget()` in lib/WebDashboardService.ts, simplified: on another dashboard a wide widget's copy is one column wide).
    const widgetCopy = p.match(/^\/web\/dashboards\/([^/]+)\/widgets\/([^/]+)\/copy$/);
    if (widgetCopy && method === 'POST') {
      const from = dashboards.find(d => d.id === decodeURIComponent(widgetCopy[1]));
      const t = dashboards.findIndex(d => d.id === body.to);
      if (!from || t < 0) throw new Error('No such dashboard');
      const wid = decodeURIComponent(widgetCopy[2]);
      const c = from.columns.findIndex(col => col.some(w => w.id === wid));
      if (c < 0) throw new Error('No such widget');
      const i = from.columns[c].findIndex(w => w.id === wid);
      const to = JSON.parse(JSON.stringify(dashboards[t]));
      if (to.columns.flat().length >= 60) throw new Error('At most 60 widgets');
      const ids = new Set(to.columns.flat().map(w => w.id));
      const free = x => typeof x === 'string' && x && !ids.has(x);
      let id = free(body.as) ? body.as : free(wid) ? wid : Math.random().toString(36).slice(2, 10);
      while (ids.has(id)) id = Math.random().toString(36).slice(2, 10);
      const copy = { ...JSON.parse(JSON.stringify(from.columns[c][i])), id };
      if (to.id === from.id) to.columns[c].splice(i + 1, 0, copy);
      else {
        delete copy.span;
        delete copy.at;
        to.columns[Math.min(Math.max(Number(body.column) || 0, 0), to.columns.length - 1)].push(copy);
      }
      dashboards[t] = to;
      return { dashboard: to, widget: id, dashboards };
    }
    if (p.startsWith('/web/dashboards/') && method === 'DELETE') {
      dashboards = dashboards.filter(d => d.id !== p.split('/').pop());
      return { removed: true };
    }
    if (p === '/web/autocomplete') return [];
    throw new Error(`Not in the preview: ${method} ${p}`);
  }
  // Homey's own API, for other apps' widgets: a made-up app's two, its (empty) strings and autocompletes.
  const OTHER_APP = 'com.example.garden';
  const OTHER_WIDGETS = {
    [`homey:app:${OTHER_APP}:plants`]: {
      id: `homey:app:${OTHER_APP}:plants`, ownerUri: `homey:app:${OTHER_APP}`, ownerName: 'Garden Helper', name: 'Plant status',
      devices: { type: 'app', singular: false, filter: { class: 'sensor' } }, height: 160, transparent: null, deprecated: null,
      settings: [
        { id: 'show', type: 'dropdown', title: 'Show', hint: null, values: [{ id: 'all', title: 'All plants' }, { id: 'thirsty', title: 'Thirsty ones' }], units: null, value: 'all' },
        { id: 'refresh', type: 'number', title: 'Refresh every', hint: 'How often it reads the sensors.', units: 'min', value: 15 },
        { id: 'names', type: 'checkbox', title: 'Show names', hint: null, value: true },
      ],
    },
    [`homey:app:${OTHER_APP}:watering`]: {
      id: `homey:app:${OTHER_APP}:watering`, ownerUri: `homey:app:${OTHER_APP}`, ownerName: 'Garden Helper', name: 'Watering',
      devices: null, height: null, transparent: true, deprecated: null,
      settings: [{ id: 'zone', type: 'autocomplete', title: 'Zone', hint: null, value: null }],
    },
  };
  function homeyAnswer(p) {
    if (p === '/manager/dashboards/appwidget') return OTHER_WIDGETS;
    if (/^\/manager\/dashboards\/appwidget\/[^/]+\/autocomplete/.test(p)) return [{ id: 'front', name: 'Front lawn' }, { id: 'beds', name: 'Flower beds' }];
    if (/^\/manager\/apps\/app\/[^/]+\/locale$/.test(p)) return {};
    throw new Error(`Not in the preview: ${p}`);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const h = String(url).match(/^\/api(\/manager\/[^?]*)/);
    if (h) {
      try {
        return new Response(JSON.stringify(homeyAnswer(h[1])), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 404 });
      }
    }
    const m = String(url).match(/^\/api\/app\/[^/]+(\/.*)$/);
    if (!m) return realFetch(url, init);
    try {
      const data = await answer(init.method || 'GET', m[1], init.body ? JSON.parse(init.body) : undefined);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  };
}
