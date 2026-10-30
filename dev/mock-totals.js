/*
 * Made-up meter readings for Chart · Totals' previews and renders: the showcase house's main meter (never a real one's),
 * using more in the morning, the evening and winter, as `/state` gives it (the running total at each log step's middle,
 * the value now). Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const HOUR = 36e5;
  const frac = x => x - Math.floor(x);
  const round = v => Math.round(v * 1000) / 1000;

  /** kWh an hour at `t`: a night base, a morning and an evening peak, a winter that uses more, each day a little different. */
  function perHour(t) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const season = 1 + 0.45 * Math.cos((d.getMonth() + 0.5) / 12 * 2 * Math.PI);
    const day = 0.8 + 0.4 * frac(Math.sin(Math.floor(t / (24 * HOUR)) * 12.9898) * 43758.5453);
    const daily = 0.3 + 0.55 * Math.exp(-((h - 7.5) ** 2) / 2) + 1.1 * Math.exp(-((h - 18.5) ** 2) / 5);
    return daily * season * day;
  }

  /**
   * A meter's running total over `[from, to)` in steps of `stepMs` (a point at each step's middle, as Insights logs
   * them), its value at `now` (at most `to`), and the meter's count (`meter`) to carry on with.
   */
  function meter(from, to, stepMs, now, extra = {}) {
    const points = [];
    let total = 0;
    for (let t = from; t + stepMs <= Math.min(to, now); t += stepMs) {
      const use = perHour(t + stepMs / 2) * stepMs / HOUR;
      points.push([t + stepMs / 2, round(total + use / 2)]);
      total += use;
    }
    for (let t = from + points.length * stepMs; t < Math.min(to, now); t += HOUR) total += perHour(t) * Math.min(HOUR, Math.min(to, now) - t) / HOUR;
    return {
      deviceId: 'meter', capabilityId: 'meter_power', name: 'Main meter',
      capability: { title: 'Energy', type: 'number', units: 'kWh', decimals: 2, min: null, max: null, values: null, icon: null },
      value: round(total), points, meter: { offset: 0, high: round(total) }, ...extra,
    };
  }

  /** Chart · Totals' `[current, previous]` for `period` at `now`, each in the step Insights logs it in (an hour for a day or week). */
  function totalsState(period, now = Date.now()) {
    const { timeSpan } = window.WidgetkeeperKit;
    const w = timeSpan(period, now), p = timeSpan(period, now, 1);
    const step = w.unit === 'month' || w.unit === 'year' ? 6 * HOUR : HOUR;
    return [meter(w.from - step, w.to, step, now), meter(p.from - step, p.to + step, step, now)];
  }

  window.mockTotals = { perHour, meter, totalsState };
})();
