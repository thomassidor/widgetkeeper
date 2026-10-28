/*
 * Made-up readings for Chart · Typical Day's previews and renders: the showcase house's power use (never a real meter's),
 * a morning and an evening peak each day, today a little higher, as `/state` gives it (a point every 10 minutes, the
 * value now). Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const frac = x => x - Math.floor(x);
  const round = v => Math.round(v * 100) / 100;
  const power = { title: 'Power', type: 'number', units: 'kW', decimals: 2, min: null, max: null, values: null, icon: null };

  /** kW at `t`: a night base, a morning and an evening peak, each day a little different; today (`boost`) higher. */
  function use(t, boost = 0) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const day = 0.85 + 0.3 * frac(Math.sin(Math.floor(t / DAY) * 12.9898) * 43758.5453);
    const noise = 0.15 * (frac(Math.sin(t / (10 * MIN) * 78.233) * 12345.678) - 0.5);
    return (0.4 + 0.9 * Math.exp(-((h - 7.5) ** 2) / 2) + 1.8 * Math.exp(-((h - 18.5) ** 2) / 5)) * day + noise + boost;
  }

  function series(from, to, now, boost) {
    const points = [];
    for (let t = from; t < Math.min(to, now); t += 10 * MIN) points.push([t, round(use(t, boost))]);
    return { deviceId: 'house', capabilityId: 'measure_power', name: 'House', capability: power, value: round(use(now, boost)), points };
  }

  /** Chart · Typical Day's `[today, past]` at `now`: today's line runs a little high. */
  function typicalDayState(days = 7, now = Date.now()) {
    const today = window.WidgetkeeperKit.timeSpan('1d!', now);
    return [series(today.from, today.end, now, 0.35), series(now - days * DAY, today.from, now, 0)];
  }

  window.mockTypicalDay = { use, typicalDayState };
})();
