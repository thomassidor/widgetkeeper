/**
 * One read shared by everyone who asks while it's at most `maxAge` old, and always while it's on its way (a slow read
 * isn't joined by a second one: on a busy Homey every device read twice made it slower still). A read that fails is
 * dropped (unless a newer one already replaced it), so the next ask reads again.
 * - `keepFor`: a read is let go this long after it came in, so a large one (every device) isn't held between rare
 *   uses for the app's whole life; without it, the last read is kept until a newer one replaces it.
 */
export function sharedCache<T>(fetch: () => Promise<T>, { keepFor }: { keepFor?: number } = {}) {
  let entry: { at: number, promise: Promise<T>, done: boolean } | null = null;
  return {
    get(maxAge: number): Promise<T> {
      const now = Date.now();
      if (!entry || (entry.done && now - entry.at > maxAge)) {
        const promise: Promise<T> = fetch().catch((err: unknown) => {
          if (entry?.promise === promise) entry = null;
          throw err;
        });
        const e = { at: now, promise, done: false };
        promise.then(() => { e.done = true; }, () => {});
        entry = e;
        if (keepFor !== undefined) {
          promise.then(() => {
            // Only lets go of memory, so it mustn't keep the app (or a test) running.
            const timer = setTimeout(() => { if (entry?.promise === promise) entry = null; }, keepFor);
            (timer as { unref?: () => void }).unref?.();
          }, () => {});
        }
      }
      return entry.promise;
    },
    /** Whether a read is kept (done or on its way). */
    get cached() {
      return !!entry;
    },
  };
}
