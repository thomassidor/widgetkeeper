/*
 * Made-up readings for Chart · Lines' previews and renders: the showcase house's room temperatures (never real ones),
 * each its own day: the living room warmed by the stove in the evening, the kitchen by cooking, the bedroom cool at
 * night, the office warm while worked in. As `/state` gives them (a point every 12 minutes on the clock's marks, the
 * value now the last point's, so the renders' ticking clock can't change them). Load after the kit.
 */
(function () {
  const MIN = 60e3;
  const round = v => Math.round(v * 100) / 100; // averages, so not to the sensor's decimals
  const temp = { title: 'Temperature', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null };
  const hourOf = (t) => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60; };
  /** A bump of `height` around hour `at`, `width` hours wide. */
  const bump = (h, at, width, height) => height * Math.exp(-(((h - at + 36) % 24 - 12) ** 2) / (2 * width * width));
  const wave = (h, lo, hi) => lo + (hi - lo) * (0.5 + 0.5 * Math.sin((h - 9) / 24 * 2 * Math.PI));
  /** Each room: its sensor's id and name, and its temperature at an hour of the day. */
  const ROOMS = [
    ['living', 'Living room', h => wave(h, 20.2, 21.6) + bump(h, 20, 1.6, 1.4)],
    ['kitchen', 'Kitchen', h => wave(h, 19.6, 21.2) + bump(h, 17.8, 0.7, 1.8) + bump(h, 7.4, 0.5, 0.8)],
    ['office', 'Office', h => wave(h, 18.6, 19.4) + bump(h, 12.5, 2.6, 2.1)],
    ['bedroom', 'Bedroom', h => wave(h, 17.2, 18.8) - bump(h, 3, 2.5, 0.6)],
  ];

  /** Chart · Lines' states over `span` at `now`, one per room (the first `count`). */
  function linesState(span = '24h', now = Date.now(), count = ROOMS.length) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    return ROOMS.slice(0, count).map(([id, name, f]) => {
      const points = [];
      for (let t = Math.ceil(w.from / (12 * MIN)) * 12 * MIN; t < w.end; t += 12 * MIN) points.push([t, round(f(hourOf(t)))]);
      return { deviceId: id, capabilityId: 'measure_temperature', name, capability: temp, value: points.length ? points[points.length - 1][1] : null, points };
    });
  }

  window.mockLines = { linesState };
})();
