/*
 * Made-up readings for Chart · Compare's previews and renders: the showcase house's room temperatures today (never real
 * ones), each swinging between its own low and high, as `/state` gives them (a point every 20 minutes, the value now).
 * Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const MIN = 60e3;
  const round = v => Math.round(v * 10) / 10;
  const temp = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };
  /** Each room: its sensor's id and name, its night low and afternoon high. */
  const ROOMS = [
    ['living', 'Living room', 20.4, 22.9], ['kitchen', 'Kitchen', 19.8, 23.4], ['bathroom', 'Bathroom', 21.8, 24.6],
    ['office', 'Office', 18.9, 21.7], ['bedroom', 'Bedroom', 17.6, 19.9], ['hall', 'Hall', 17.1, 19.2],
  ];

  function roomAt(lo, hi, t) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    return lo + (hi - lo) * (0.5 + 0.5 * Math.sin((h - 9) / 24 * 2 * Math.PI));
  }

  /** Chart · Compare's states over `span` at `now`, one per room (the first `count`). */
  function compareState(span = '1d!', now = Date.now(), count = ROOMS.length) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    return ROOMS.slice(0, count).map(([id, name, lo, hi]) => {
      // A point every 20 minutes (on the step's clock marks, and the value now the last point's, so the renders' ticking clock can't change them).
      const points = [];
      for (let t = Math.ceil(w.from / (20 * MIN)) * 20 * MIN; t < w.end; t += 20 * MIN) points.push([t, round(roomAt(lo, hi, t))]);
      return { deviceId: id, capabilityId: 'measure_temperature', name, capability: temp, value: points.length ? points[points.length - 1][1] : null, points };
    });
  }

  window.mockCompare = { compareState };
})();
