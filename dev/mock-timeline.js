/*
 * Made-up changes for Chart · Timeline's previews and renders: the showcase house's heating, hall motion, front door and
 * TV (never real ones), each day alike, as `/state` gives them (`[t, 0 | 1]` on the minute, the value now the last one's,
 * so the renders' ticking clock can't change them). Load after the kit (it uses `timeSpan()`).
 */
(function () {
  const MIN = 60e3;
  const DAY = 24 * 60 * MIN;
  const cap = title => ({ title, type: 'boolean', units: null, decimals: null, min: null, max: null, values: null, icon: null });
  /** Each row: its id, name, capability and its day as `[from, to]` local times on ('HH:MM', or 'HH:MM:SS' for seconds). */
  const ROWS = [
    ['heating', 'Heating', 'onoff', 'Turned on', [['05:30', '08:15'], ['16:00', '22:30']]],
    ['hall', 'Hall motion', 'alarm_motion', 'Motion alarm', [['07:02', '07:06'], ['07:20', '07:23'], ['07:45', '07:50'], ['12:10', '12:13'], ['16:55', '17:01'], ['17:30', '17:33'], ['18:05', '18:12'], ['18:32', '18:35']]],
    ['door', 'Front door', 'alarm_contact', 'Contact alarm', [['07:48:00', '07:48:20'], ['16:52:00', '16:52:40'], ['18:10:00', '18:10:15']]],
    ['tv', 'TV', 'onoff', 'Turned on', [['07:00', '07:25'], ['18:00', '23:10']]],
  ];
  const timeOn = (day, hhmm) => {
    const [h, m, s = 0] = hhmm.split(':').map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, s).getTime();
  };

  /** Chart · Timeline's rows over `span` at `now` (the first `count`), recorded since the day before the window. */
  function timelineState(span = '1d!', now = Date.now(), count = ROWS.length) {
    const w = window.WidgetkeeperKit.timeSpan(span, now);
    const end = Math.floor(Math.min(now, w.end) / MIN) * MIN;
    return ROWS.slice(0, count).map(([id, name, capabilityId, title, day]) => {
      const changes = [];
      for (let d = new Date(w.from - DAY); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
        for (const [a, b] of day) {
          const on = timeOn(d, a), off = timeOn(d, b);
          if (on <= end) changes.push([on, 1]);
          if (off <= end) changes.push([off, 0]);
        }
      }
      const since = new Date(w.from - DAY).setHours(0, 0, 0, 0);
      changes.unshift([since, 0]);
      return { deviceId: id, capabilityId, name, capability: cap(title), value: changes[changes.length - 1][1] === 1, changes, since };
    });
  }

  window.mockTimeline = { timelineState };
})();
