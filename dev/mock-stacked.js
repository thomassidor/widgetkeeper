/*
 * Made-up readings for Chart · Stacked's previews and renders: the showcase house's meter, heat pump, oven and EV charger
 * (never real ones), as `/state` gives them (a point every 5 minutes on the clock's marks, the value now the last
 * point's, so the renders' ticking clock can't change them), and a solar inverter below zero. Load after the kit.
 */
(function () {
  const MIN = 60e3;
  const power = { title: 'Power', type: 'number', units: 'W', decimals: 0, min: null, max: null, values: null, icon: null };
  const hourOf = (t) => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60; };
  const between = (h, a, b) => h >= a && h < b;
  /** Each value: its id, name and its watts at an hour of the day. */
  const LAYERS = {
    heatpump: ['Heat pump', h => Math.round(900 + 550 * Math.cos((h - 5) / 24 * 2 * Math.PI) + (between(h, 6, 7.5) ? 600 : 0))],
    oven: ['Oven', h => (between(h, 17.25, 18.1) ? 2100 : between(h, 12, 12.3) ? 1200 : 0)],
    ev: ['EV charger', h => (between(h, 0, 4.5) || between(h, 22.5, 24) ? 7200 : 0)],
    solar: ['Solar', h => (between(h, 7.5, 17.5) ? -Math.round(2600 * Math.sin((h - 7.5) / 10 * Math.PI)) : 0)],
  };
  /** The rest of the house: a base load, more in the evening. */
  const rest = h => Math.round(260 + (between(h, 17, 23) ? 380 : between(h, 6.5, 8.5) ? 240 : 0));

  /**
   * Chart · Stacked's states over `span` at `now`: with `total`, the meter first (the layers plus the rest of the house),
   * then the layers named in `ids` (default heat pump, oven, EV).
   */
  function stackedState(span = '24h', now = Date.now(), { total = true, ids = ['heatpump', 'oven', 'ev'] } = {}) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    const times = [];
    for (let t = Math.ceil(w.from / (5 * MIN)) * 5 * MIN; t < w.end; t += 5 * MIN) times.push(t);
    const slot = (id, name, f) => {
      const points = times.map(t => [t, f(hourOf(t))]);
      return { deviceId: id, capabilityId: 'measure_power', name, capability: power, value: points.length ? points[points.length - 1][1] : null, points };
    };
    const layers = ids.map(id => slot(id, LAYERS[id][0], LAYERS[id][1]));
    if (!total) return layers;
    const meter = slot('meter', 'Electricity meter', h => ids.reduce((a, id) => a + LAYERS[id][1](h), rest(h)));
    return [meter, ...layers];
  }

  window.mockStacked = { stackedState };
})();
