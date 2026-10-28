/*
 * Made-up readings for Chart · Daily Range's previews and renders: the showcase house's outdoor temperature (never a real
 * sensor's), cold mornings and mild afternoons, each day its own swing, as `/state` gives it (a point an hour, the value
 * now). Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const HOUR = 36e5, DAY = 24 * HOUR;
  const frac = x => x - Math.floor(x);
  const round = v => Math.round(v * 10) / 10;
  const temp = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };

  /** °C at `t`: each day a mean drifting with the weather and a swing of its own, coldest at 05:00, warmest at 15:00. */
  function outdoor(t) {
    const d = new Date(t);
    const h = d.getHours();
    const day = Math.floor(t / DAY);
    const mean = 9 + 3 * Math.sin(day * 0.45) + 2 * (frac(Math.sin(day * 12.9898) * 43758.5453) - 0.5);
    const swing = 3 + 3 * frac(Math.sin(day * 78.233) * 12345.678);
    return mean + swing * Math.sin((h - 9) / 24 * 2 * Math.PI);
  }

  /** Chart · Daily Range's `[value]` over `span` at `now`. */
  function dailyRangeState(span = '4w', now = Date.now()) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    const points = [];
    for (let t = w.from; t < w.end; t += HOUR) points.push([t, round(outdoor(t))]);
    return [{ deviceId: 'outdoor', capabilityId: 'measure_temperature', name: 'Outdoor sensor', capability: temp, value: round(outdoor(now)), points }];
  }

  window.mockDailyRange = { outdoor, dailyRangeState };
})();
