import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type Homey from 'homey';
import PersonalApiKey, { scopesAllow } from './PersonalApiKey.js';
import Secrets from './secrets.js';
import type WebPassword from './WebPassword.js';
import type { Checked } from './WebPassword.js';

/**
 * The secret with the screens (`Secrets`): `[{id, name, code, key, created, used, session, stamp}]`, `code` the SHA-256
 * of the code as typed without its dash, `key` the screen's personal API key, `session` its web password session (with
 * `stamp`, the password it was granted with; `WebPassword.stamp`).
 */
export const WEB_SCREENS_SECRET = 'webScreens';

/** No 0/O, 1/I/L or U: a code read off one screen and typed on another. 30^8, about 39 bits. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_SCREENS = 20;
const MAX_NAME = 40;
/** `used` is saved at most this often. */
const SAVE_USED_MS = 3600e3;
/** After this many wrong codes in a row, every code waits: 30 s, doubling to 15 min (as the web password). */
const FREE_TRIES = 5;
const LOCK_MS = 30e3;
const MAX_LOCK_MS = 15 * 60e3;

type Screen = {
  id: string, name: string, code: string, key: string, created: number, used: number,
  session?: string, stamp?: string,
};

export type ScreenItem = { id: string, name: string, created: number, used: number, needsPassword: boolean };

type Refused = { ok: false, reason: 'wrong' | 'locked', retryAfter?: number };
export type RedeemResult = { ok: true, key: string, session?: string } | Refused;
export type AddResult =
  | { ok: true, id: string, code: string, devices: boolean, screens: ScreenItem[] }
  | { ok: false, reason: 'name' | 'keyInvalid' | 'full' } | Refused;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** A code as typed: upper case, without spaces or dashes; null when it can't be one. */
export function normalizeCode(code: unknown): string | null {
  if (typeof code !== 'string' || code.length > 20) return null;
  const plain = code.toUpperCase().replace(/[\s-]/g, '');
  return plain.length === CODE_LENGTH && [...plain].every(c => ALPHABET.includes(c)) ? plain : null;
}

/** `ABCD-EFGH`: how a code is shown. */
export const showCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

function newCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * Screens that can't type a personal API key (a Nest Hub the dashboard is cast to, a wall tablet without a keyboard):
 * the app settings page adds one with a name and a key made for it, and shows its short code once. The web dashboards
 * page swaps the code for the key (`redeem()`, a public route: the screen has no key yet) on every load, so a screen
 * that forgets what it stored (a cast) still gets in. While the web password is set, adding a screen takes it, and
 * the screen gets a session of its own, valid while that password stays (a changed one asks for it again on the
 * settings page). Wrong codes lock every code for a while, like wrong passwords. Kept with the secrets: the code only
 * as a hash, never sent back after it's made.
 */
export default class WebScreens {

  private failures = 0;
  private lockedUntil = 0;
  /** The code checks, one at a time, so a burst of guesses can't all be checked before the lock is set. */
  private attempts: Promise<unknown> = Promise.resolve();
  private secrets: Secrets;

  constructor(
    homey: Homey.App['homey'],
    private password: WebPassword,
    private log: (...args: any[]) => void,
    private now: () => number = Date.now,
    private apiKey: Pick<PersonalApiKey, 'scopesOf'> = PersonalApiKey.for(homey, log),
  ) {
    this.secrets = Secrets.for(homey, log);
  }

  private get screens(): Screen[] {
    const saved = this.secrets.get(WEB_SCREENS_SECRET);
    return Array.isArray(saved) ? saved.filter(s => s && typeof s.id === 'string' && typeof s.code === 'string' && typeof s.key === 'string') : [];
  }

  private save(screens: Screen[]) {
    if (screens.length) this.secrets.set(WEB_SCREENS_SECRET, screens);
    else this.secrets.unset(WEB_SCREENS_SECRET);
  }

  /** Whether a screen's session still counts: only with the password it was granted with. */
  private signedIn(screen: Screen) {
    const stamp = this.password.stamp;
    return !stamp || (!!screen.session && screen.stamp === stamp);
  }

  /** The screens for the settings page: names and dates, never a code or a key. */
  list(): ScreenItem[] {
    return this.screens.map(s => ({ id: s.id, name: s.name, created: s.created, used: s.used, needsPassword: !this.signedIn(s) }));
  }

  /**
   * A new screen, `{name, key, current}`: the key must be one Homey accepts (a key made for the screen, which only
   * moves it to another device: no permission is gained), and while the password is set, `current` must be it (else
   * any key holder could add a screen to get a session). Answers the code, this once.
   */
  async add(name: unknown, key: unknown, current?: unknown): Promise<AddResult> {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > MAX_NAME) return { ok: false, reason: 'name' };
    if (this.screens.length >= MAX_SCREENS) return { ok: false, reason: 'full' };
    const token = typeof key === 'string' ? key.trim() : '';
    // A passing failure (Homey busy) throws, so a good key isn't called invalid.
    const scopes = token && token.length <= 500 ? await this.apiKey.scopesOf(token) : null;
    if (!scopes) return { ok: false, reason: 'keyInvalid' };
    const checked = await this.password.confirm(current);
    if (!checked.ok) return checked;
    const screens = this.screens;
    if (screens.length >= MAX_SCREENS) return { ok: false, reason: 'full' };
    let code = newCode();
    while (screens.some(s => s.code === sha256(code))) code = newCode();
    const at = this.now();
    const screen: Screen = { id: randomBytes(8).toString('hex'), name: trimmed, code: sha256(code), key: token, created: at, used: 0 };
    this.grant(screen);
    screens.push(screen);
    this.save(screens);
    this.log(`Web dashboards: screen "${trimmed}" added`);
    return { ok: true, id: screen.id, code: showCode(code), devices: scopesAllow(scopes, 'devices'), screens: this.list() };
  }

  /** A session for the password set now (none without one). */
  private grant(screen: Screen) {
    const stamp = this.password.stamp;
    delete screen.session;
    delete screen.stamp;
    if (stamp) Object.assign(screen, { session: randomBytes(32).toString('base64url'), stamp });
  }

  /** A screen added before the password was set or changed: signed in again with the current one. */
  async signIn(id: unknown, current: unknown): Promise<{ ok: true, screens: ScreenItem[] } | Refused | { ok: false, reason: 'missing' }> {
    if (!this.screens.some(s => s.id === id)) return { ok: false, reason: 'missing' };
    const checked: Checked = await this.password.confirm(current);
    if (!checked.ok) return checked;
    const screens = this.screens;
    const screen = screens.find(s => s.id === id);
    if (!screen) return { ok: false, reason: 'missing' };
    this.grant(screen);
    this.save(screens);
    return { ok: true, screens: this.list() };
  }

  remove(id: unknown): { ok: boolean, screens: ScreenItem[] } {
    const screens = this.screens;
    const left = screens.filter(s => s.id !== id);
    if (left.length !== screens.length) {
      this.save(left);
      this.log('Web dashboards: a screen was removed');
    }
    return { ok: left.length !== screens.length, screens: this.list() };
  }

  /**
   * The web dashboards page's code (`#code=` or typed on the key screen) → the screen's key, and its session while the
   * password it was granted with is set. One check at a time; wrong ones lock every code for a while.
   */
  redeem(code: unknown): Promise<RedeemResult> {
    const run = this.attempts.then(() => this.check(code));
    this.attempts = run.catch(() => undefined);
    return run;
  }

  private check(code: unknown): RedeemResult {
    const now = this.now();
    if (now < this.lockedUntil) return { ok: false, reason: 'locked', retryAfter: Math.ceil((this.lockedUntil - now) / 1000) };
    const plain = normalizeCode(code);
    const hash = plain ? sha256(plain) : '';
    const screens = this.screens;
    const screen = hash ? screens.find(s => sameHash(s.code, hash)) : undefined;
    if (!screen) {
      this.failures++;
      if (this.failures >= FREE_TRIES) {
        const wait = Math.min(LOCK_MS * 2 ** (this.failures - FREE_TRIES), MAX_LOCK_MS);
        this.lockedUntil = now + wait;
        this.log(`Web dashboards: ${this.failures} wrong screen codes in a row, codes locked for ${wait / 1000} s`);
        return { ok: false, reason: 'locked', retryAfter: Math.ceil(wait / 1000) };
      }
      return { ok: false, reason: 'wrong' };
    }
    this.failures = 0;
    if (now - screen.used > SAVE_USED_MS) {
      screen.used = now;
      try { this.save(screens); } catch (err) { this.log('Web dashboards: a screen\'s use could not be saved:', String((err as any)?.message ?? err)); }
    }
    return this.signedIn(screen) && screen.session ? { ok: true, key: screen.key, session: screen.session } : { ok: true, key: screen.key };
  }

  /** Whether a web password session token is a screen's (granted with the password set now). */
  checkSession(token: unknown): boolean {
    if (typeof token !== 'string' || !token || !this.password.stamp) return false;
    return this.screens.some(s => !!s.session && s.session.length === token.length && sameHash(s.session, token) && this.signedIn(s));
  }

  describe() {
    const list = this.list();
    return { screens: list.length, needPassword: list.filter(s => s.needsPassword).length, locked: this.now() < this.lockedUntil, failures: this.failures };
  }
}
