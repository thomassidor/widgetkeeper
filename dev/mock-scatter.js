/*
 * Made-up readings for Chart · Scatter (XY)'s previews and renders: the showcase house's outdoor temperature and its heat
 * pump's power (never real ones), the pump working harder the colder it is, as `/state` gives them (a point every 30
 * minutes, the value now). Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const MIN = 60e3, HOUR = 60 * MIN;
  const frac = x => x - Math.floor(x);
  const round = v => Math.round(v * 100) / 100;
  const temp = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };
  const power = { title: 'Power', type: 'number', units: 'kW', decimals: 2, min: null, max: null, values: null, icon: null };

  /** °C at `t`: an autumn day's swing, colder at night, each day a little different. */
  function outdoor(t) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const day = Math.floor(t / (24 * HOUR));
    return 6 + 3 * Math.sin(day * 0.9) + 4 * Math.sin((h - 9) / 24 * 2 * Math.PI) + 1.5 * (frac(Math.sin(t / HOUR * 12.9898) * 43758.5453) - 0.5);
  }

  /** kW at `t`: more the colder it is, with some scatter. */
  function pump(t) {
    return Math.max(0.2, 2.4 - 0.16 * outdoor(t) + 0.5 * (frac(Math.sin(t / HOUR * 78.233) * 12345.678) - 0.5));
  }

  /** A point every 30 minutes (on the step's clock marks, and the value now the last point's, so the renders' ticking clock can't change them). */
  function series(f, from, now, extra) {
    const points = [];
    for (let t = Math.ceil(from / (30 * MIN)) * 30 * MIN; t < now; t += 30 * MIN) points.push([t, round(f(t))]);
    return { value: points.length ? points[points.length - 1][1] : null, points, ...extra };
  }

  /** Chart · Scatter (XY)'s `[x, y]` over `span` at `now`. */
  function scatterState(span = '7d', now = Date.now()) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    return [
      series(outdoor, w.from, w.end, { deviceId: 'outdoor', capabilityId: 'measure_temperature', name: 'Outdoor sensor', capability: temp }),
      series(pump, w.from, w.end, { deviceId: 'heatpump', capabilityId: 'measure_power', name: 'Heat pump', capability: power }),
    ];
  }

  window.mockScatter = { outdoor, pump, scatterState };
})();
