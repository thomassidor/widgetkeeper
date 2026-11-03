// Progress for the render scripts: each written file as `[3/36] wrote … · ~4 min left`, the time left from the
// average so far, and the last one with the whole run's time. Renders take long on a slow machine (the NAS build box:
// previews ~9 min, screenshots ~11), and a bare `wrote …` didn't say how far a run was (the user's ask, 2026-11-03).

/** A duration as `45 s`, `3 min 20 s` or `1 h 5 min`. */
export function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
}

/** The time left as a rough figure: seconds under a minute, else whole minutes. */
function roughly(ms) {
  return ms < 60000 ? `~${Math.max(1, Math.round(ms / 1000))} s` : `~${Math.round(ms / 60000)} min`;
}

/**
 * Returns `wrote(...parts)`, which logs `[n/total] wrote <parts> · <time>` for each of `total` files. `now` is for
 * the tests.
 */
export function progress(total, { log = console.log, now = Date.now } = {}) {
  const start = now();
  let done = 0;
  return (...parts) => {
    done += 1;
    const spent = now() - start;
    const time = done >= total ? `done in ${duration(spent)}` : `${roughly(spent / done * (total - done))} left`;
    log(`[${done}/${total}] wrote`, ...parts, `· ${time}`);
  };
}
