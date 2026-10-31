/*
 * Made-up readings for Chart · Gauge's previews and renders (never real ones): the showcase house's office CO₂ today,
 * rising through the working day, its kitchen humidity and a door sensor's battery, as `/state` gives them (a point
 * every 20 minutes on the clock's marks, the value now the last point's, so the renders' ticking clock can't change them).
 * Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const MIN = 60e3;
  const CAPS = {
    co2: { id: 'measure_co2', name: 'Office', cap: { title: 'CO₂', type: 'number', units: 'ppm', decimals: 0, min: null, max: null, values: null, icon: null } },
    humidity: { id: 'measure_humidity', name: 'Kitchen', cap: { title: 'Humidity', type: 'number', units: '%', decimals: 0, min: 0, max: 100, values: null, icon: null } },
    battery: { id: 'measure_battery', name: 'Front door', cap: { title: 'Battery', type: 'number', units: '%', decimals: 0, min: 0, max: 100, values: null, icon: null } },
  };
  /** Each value at a time of day (hours from midnight). */
  const CURVES = {
    co2: h => (h < 8 ? 430 : h < 16 ? 430 + (h - 8) * 85 : 1110 - (h - 16) * 60),
    humidity: h => 48 + 14 * Math.exp(-(((h - 18.5) / 1.2) ** 2)) + 8 * Math.exp(-(((h - 7.5) / 0.8) ** 2)),
    battery: h => 23 - h / 24,
  };

  /** Chart · Gauge's state (`/state`'s `charts`) for `kind` over `span` at `now`. */
  function gaugeState(kind = 'co2', span = '1d!', now = Date.now()) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    const { id, name, cap } = CAPS[kind];
    const points = [];
    for (let t = Math.ceil(w.from / (20 * MIN)) * 20 * MIN; t < w.end; t += 20 * MIN) {
      const d = new Date(t);
      points.push([t, Math.round(CURVES[kind](d.getHours() + d.getMinutes() / 60))]);
    }
    return [{ deviceId: kind, capabilityId: id, name, capability: cap, value: points.length ? points[points.length - 1][1] : null, points }];
  }

  window.mockGauge = { gaugeState };
})();
