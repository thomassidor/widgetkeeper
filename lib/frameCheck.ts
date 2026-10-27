import type Homey from 'homey';

const FETCH_TIMEOUT = 10e3;
/** How long an address's answer is kept. */
const KEEP = 30 * 60e3;
const MAX_KEPT = 50;

/** All the Web Page widget learns of a page: whether it refuses to be shown in a frame. */
export type FrameAnswer = { refused: boolean };

/**
 * Why a page's response refuses to be shown in a frame on another site (the Homey's), or null, as browsers decide it:
 * an enforced `Content-Security-Policy` with `frame-ancestors` (Report-Only isn't enforced, so isn't read) decides,
 * and only without one `X-Frame-Options` (`DENY`, `SAMEORIGIN`; `ALLOW-FROM` is ignored by browsers). `frame-ancestors`
 * allows it here only with `*` or a scheme (`https:`): `'self'`, `'none'` and lists of hosts never name the Homey.
 */
export function frameRefusal(headers: Headers): string | null {
  // Repeated headers come joined by ', ': each part is a policy of its own, its directives split by ';'.
  const policies = (headers.get('content-security-policy') || '').split(',');
  const ancestors: string[][] = [];
  for (const policy of policies) {
    for (const directive of policy.split(';')) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      // A policy's first frame-ancestors counts; a repeated one is ignored.
      if (name.toLowerCase() === 'frame-ancestors') { ancestors.push(sources); break; }
    }
  }
  if (ancestors.length) {
    const refusing = ancestors.find(sources => !sources.some(s => s === '*' || /^[a-z][a-z0-9+.-]*:$/i.test(s)));
    return refusing ? `frame-ancestors ${refusing.join(' ').slice(0, 100) || "'none'"}` : null;
  }
  // The HTML standard's rule: several different values block if any of them would; else DENY and SAMEORIGIN do.
  const raw = headers.get('x-frame-options') || '';
  const values = new Set(raw.split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
  const blocking = values.size > 1
    ? [...values].some(v => v === 'deny' || v === 'sameorigin' || v === 'allowall')
    : values.has('deny') || values.has('sameorigin');
  return blocking ? `X-Frame-Options: ${raw.trim().slice(0, 100)}` : null;
}

/**
 * Whether a Web Page widget's page refuses to be shown in a frame (iOS shows such a frame as plain white): the Homey
 * reads the page's headers, kept 30 min per address (at most 50), one fetch at a time. Only a 2xx answer counts, so
 * a challenge page (Cloudflare's says SAMEORIGIN), an error or a timeout is never called a refusal. The answer holds
 * nothing else of the page, and the log only its host (an address may hold the Homey's location).
 */
export default class FrameCheck {

  private kept = new Map<string, { at: number, answer: Promise<FrameAnswer> }>();

  constructor(
    private homey: Homey.App['homey'],
    private log: (...args: any[]) => void,
    private debug: (...args: any[]) => void,
  ) {}

  check(address: string): Promise<FrameAnswer> {
    let url: URL;
    try {
      url = new URL(address);
    } catch (err) {
      return Promise.resolve({ refused: false });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.resolve({ refused: false });
    const now = Date.now();
    const kept = this.kept.get(url.href);
    if (kept && now - kept.at < KEEP) return kept.answer;
    const answer = this.read(url);
    // Map order is insertion order: re-added, it's the newest, and the oldest go first.
    this.kept.delete(url.href);
    this.kept.set(url.href, { at: now, answer });
    for (const key of this.kept.keys()) {
      if (this.kept.size <= MAX_KEPT) break;
      this.kept.delete(key);
    }
    return answer;
  }

  private async read(url: URL): Promise<FrameAnswer> {
    const headers = {
      'User-Agent': `Widgetkeeper/${this.homey.manifest?.version ?? '0'} github.com/thomassidor/widgetkeeper`,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    };
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT) : undefined;
    try {
      const res = await fetch(url, { headers, signal });
      // Only the headers are wanted.
      res.body?.cancel().catch(() => {});
      if (!res.ok) {
        this.debug(`Web Page: ${url.host} answered HTTP ${res.status}, not checked`);
        return { refused: false };
      }
      const reason = frameRefusal(res.headers);
      if (reason) this.log(`Web Page: ${url.host} doesn't allow being shown in a frame (${reason})`);
      return { refused: !!reason };
    } catch (err) {
      this.debug(`Web Page: ${url.host} not checked:`, err instanceof Error ? err.message : err);
      return { refused: false };
    }
  }

}
