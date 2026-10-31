import { describe, expect, it, vi } from 'vitest';
import { homeyApiMock, keyApis } from './helpers/fakeHomey.js';
import { webApp } from './helpers/webApp.js';
import { WEB_REMOTE_SETTING } from '../lib/WebDashboardService.js';
import { normalizeCode, WEB_SCREENS_SECRET } from '../lib/WebScreens.js';
import Secrets from '../lib/secrets.js';
import api from '../api.js';

vi.mock('homey-api', () => homeyApiMock);

const KEY = 'screen-key:aaaa:bbbb';

/** The web app with a screen key Homey accepts (`scopes`), on a clock the test moves. */
function setup(scopes = ['homey']) {
  let at = 1_800_000_000_000;
  const app = webApp({ now: () => at });
  keyApis.set(KEY, { sessions: { getSessionMe: async () => ({ scopes }) } });
  app.homey.app.keypad = { listCodes: () => [] }; // /web/setup's codes
  return { ...app, tick: (ms: number) => { at += ms; } };
}

describe('web dashboards: screens without a keyboard', () => {
  it('adds a screen with a key Homey accepts, and shows its code only once', async () => {
    const { homey, screens } = setup();
    await expect(screens.add('', KEY)).resolves.toEqual({ ok: false, reason: 'name' });
    await expect(screens.add('x'.repeat(41), KEY)).resolves.toEqual({ ok: false, reason: 'name' });
    await expect(screens.add('Kitchen', 'not-a-key')).resolves.toEqual({ ok: false, reason: 'keyInvalid' });
    await expect(screens.add('Kitchen', '')).resolves.toEqual({ ok: false, reason: 'keyInvalid' });
    const res = await screens.add('  Kitchen  ', KEY) as any;
    expect(res).toMatchObject({ ok: true, devices: true, screens: [{ name: 'Kitchen', used: 0, needsPassword: false }] });
    // Four and four of the letters and digits that can't be mistaken for each other.
    expect(res.code).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
    // The list and the secret never hold the code; the secret keeps its hash beside the key.
    expect(JSON.stringify(screens.list())).not.toContain(res.code.replace('-', ''));
    expect(JSON.stringify(screens.list())).not.toContain(KEY);
    const stored = JSON.stringify(Secrets.for(homey).get(WEB_SCREENS_SECRET));
    expect(stored).not.toContain(res.code.replace('-', ''));
    expect(stored).toContain(KEY);
    expect(homey.settings.get(WEB_SCREENS_SECRET)).toBeNull();
    await expect(api.getWebScreens({ homey })).resolves.toEqual({ screens: screens.list() });
  });

  it('says when the key may not control devices', async () => {
    const { screens } = setup(['homey.app.control']);
    await expect(screens.add('Hall', KEY)).resolves.toMatchObject({ ok: true, devices: false });
  });

  it('swaps a code for the key, typed in any case, with or without its dash', async () => {
    const { screens, tick } = setup();
    const { code } = await screens.add('Kitchen', KEY) as any;
    await expect(screens.redeem(code)).resolves.toEqual({ ok: true, key: KEY });
    await expect(screens.redeem(` ${code.replace('-', '').toLowerCase()} `)).resolves.toEqual({ ok: true, key: KEY });
    expect(screens.list()[0].used).toBe(1_800_000_000_000);
    tick(1000);
    await screens.redeem(code);
    expect(screens.list()[0].used).toBe(1_800_000_000_000); // saved at most hourly
    await expect(screens.redeem('ABCD-EFGH')).resolves.toEqual({ ok: false, reason: 'wrong' });
    await expect(screens.redeem({ code })).resolves.toEqual({ ok: false, reason: 'wrong' });
    expect(normalizeCode('abcd efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCD-EFG0')).toBeNull(); // no 0, 1, I, L, O or U
  });

  it('locks every code after five wrong ones in a row, a burst included, longer each time', async () => {
    const { screens, tick } = setup();
    const { code } = await screens.add('Kitchen', KEY) as any;
    const results = await Promise.all([...Array.from({ length: 6 }, () => screens.redeem('AAAA-AAAA')), screens.redeem(code)]);
    expect(results.slice(0, 4)).toEqual(Array(4).fill({ ok: false, reason: 'wrong' }));
    expect(results[4]).toEqual({ ok: false, reason: 'locked', retryAfter: 30 });
    expect(results.at(-1)).toMatchObject({ ok: false, reason: 'locked' });
    tick(30_000);
    await expect(screens.redeem('AAAA-AAAA')).resolves.toEqual({ ok: false, reason: 'locked', retryAfter: 60 });
    tick(60_000);
    await expect(screens.redeem(code)).resolves.toEqual({ ok: true, key: KEY });
    // The right one starts the count again.
    await expect(screens.redeem('AAAA-AAAA')).resolves.toEqual({ ok: false, reason: 'wrong' });
    expect(screens.describe()).toEqual({ screens: 1, needPassword: 0, locked: false, failures: 1 });
  });

  it('stops a removed screen\'s code', async () => {
    const { homey, screens } = setup();
    const { code, id } = await screens.add('Kitchen', KEY) as any;
    await expect(api.deleteWebScreen({ homey, params: { id: 'nope' } })).resolves.toEqual({ ok: false, screens: screens.list() });
    await expect(api.deleteWebScreen({ homey, params: { id } })).resolves.toEqual({ ok: true, screens: [] });
    await expect(screens.redeem(code)).resolves.toEqual({ ok: false, reason: 'wrong' });
    expect(Secrets.for(homey).get(WEB_SCREENS_SECRET)).toBeNull();
  });

  it('keeps at most 20 screens', async () => {
    const { screens } = setup();
    for (let i = 0; i < 20; i++) expect((await screens.add(`Screen ${i}`, KEY)).ok).toBe(true);
    await expect(screens.add('One more', KEY)).resolves.toEqual({ ok: false, reason: 'full' });
  });
});

describe('web dashboards: a screen and the password', () => {
  it('takes the current password to add a screen, counting wrong ones toward the lock', async () => {
    const { homey, password } = setup();
    await password.setPassword('correct horse');
    // Anyone whose key may call the app reaches the route: without the password a key could buy itself a session.
    await expect(api.postWebScreen({ homey, body: { name: 'Kitchen', key: KEY } })).resolves.toEqual({ ok: false, reason: 'wrong' });
    for (let i = 0; i < 3; i++) await api.postWebScreen({ homey, body: { name: 'Kitchen', key: KEY, current: 'nope' } });
    await expect(api.postWebScreen({ homey, body: { name: 'Kitchen', key: KEY, current: 'nope' } })).resolves.toMatchObject({ ok: false, reason: 'locked' });
    expect(password.describe().failures).toBe(5);
  });

  it('gives the screen a session of its own, which the page\'s routes take', async () => {
    const { homey, screens, password } = setup();
    await password.setPassword('correct horse');
    const { code } = await api.postWebScreen({ homey, body: { name: 'Kitchen', key: KEY, current: 'correct horse' } }) as any;
    const res = await api.postWebScreenCode({ homey, query: {}, body: { code } }) as any;
    expect(res).toEqual({ ok: true, key: KEY, session: expect.any(String) });
    // The same session on every load, so a screen that forgets it doesn't fill the browsers' list.
    await expect(screens.redeem(code)).resolves.toEqual(res);
    expect(password.describe().sessions).toBe(0);
    await expect(api.getWebSetup({ homey, query: { session: res.session } })).resolves.toHaveProperty('dashboards');
    await expect(api.getWebPopups({ homey, query: { session: res.session } })).resolves.toBeDefined();
    expect(screens.checkSession('nope')).toBe(false);
  });

  it('asks for the password again on the settings page once it changes, or is set after the screen', async () => {
    const { homey, screens, password } = setup();
    const { code, id } = await screens.add('Kitchen', KEY) as any;
    // No password: the key is enough.
    await expect(screens.redeem(code)).resolves.toEqual({ ok: true, key: KEY });
    await password.setPassword('correct horse');
    expect(screens.list()[0].needsPassword).toBe(true);
    await expect(screens.redeem(code)).resolves.toEqual({ ok: true, key: KEY });
    await expect(api.putWebScreen({ homey, params: { id }, body: { current: 'wrong' } })).resolves.toEqual({ ok: false, reason: 'wrong' });
    await expect(api.putWebScreen({ homey, params: { id: 'nope' }, body: { current: 'correct horse' } })).resolves.toEqual({ ok: false, reason: 'missing' });
    await expect(api.putWebScreen({ homey, params: { id }, body: { current: 'correct horse' } })).resolves.toMatchObject({ ok: true, screens: [{ needsPassword: false }] });
    const { session } = await screens.redeem(code) as any;
    await expect(api.getWebSetup({ homey, query: { session } })).resolves.toHaveProperty('dashboards');
    // A changed password: the screen's session no longer counts, and the screen asks for it.
    await password.setPassword('battery staple', 'correct horse');
    expect(screens.checkSession(session)).toBe(false);
    await expect(api.getWebSetup({ homey, query: { session } })).resolves.toMatchObject({ passwordRequired: true });
    expect(screens.describe()).toMatchObject({ screens: 1, needPassword: 1 });
    await expect(screens.redeem(code)).resolves.toEqual({ ok: true, key: KEY });
    // Removed: no session is needed at all.
    await password.setPassword('', 'battery staple');
    expect(screens.list()[0].needsPassword).toBe(false);
  });
});

describe('web dashboards: a screen\'s code route', () => {
  it('answers without a key only while the web dashboards are on, and away from home with remote access', async () => {
    const { homey, screens, web } = setup();
    const { code } = await screens.add('Kitchen', KEY) as any;
    await expect(api.postWebScreenCode({ homey, query: { away: '1' }, body: { code } })).rejects.toThrow(/turned off away from home/);
    homey.settings.set(WEB_REMOTE_SETTING, true);
    await expect(api.postWebScreenCode({ homey, query: { away: '1' }, body: { code } })).resolves.toEqual({ ok: true, key: KEY });
    vi.spyOn(web, 'enabled', 'get').mockReturnValue(false);
    await expect(api.postWebScreenCode({ homey, query: {}, body: { code } })).rejects.toThrow(/turned off/);
  });
});
