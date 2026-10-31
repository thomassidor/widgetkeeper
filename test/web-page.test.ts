import { describe, expect, it, vi } from 'vitest';
import { webPageSource } from './helpers/webPage.js';

/**
 * The web dashboards page's pure helpers, run from its own source (settings/dashboard.js and its parts): the page is one closure
 * (no module to import), so each function is read out by name, with what it uses from around it given in.
 */
const SOURCE = webPageSource();

/** A function's whole source (`function name(…) {…}`), found by its name. */
function fn(name: string): string {
  const start = SOURCE.indexOf(`function ${name}(`);
  expect(start, `function ${name} in the web dashboards page`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = SOURCE.indexOf('{', SOURCE.indexOf(')', start)); i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}' && --depth === 0) return SOURCE.slice(start, i + 1);
  }
  throw new Error(`No end to function ${name}`);
}

/** A `const NAME = …;` line. */
function constant(name: string): string {
  const m = SOURCE.match(new RegExp(`\\n\\s*(const ${name} = [^\\n]*;)\\n`));
  expect(m, `const ${name} in the web dashboards page`).toBeTruthy();
  return m![1];
}

const PAGE = 'http://192.168.1.20/app/com.thomassidor.widgetkeeper/settings/dashboard.html';

function load(homeyRequest = vi.fn(async (method: string, path: string, body?: unknown) => ({ method, path, body }))) {
  const location = new URL(`${PAGE}#/`);
  const helpers = new Function('location', 'homeyRequest', 'APP_ID', [
    constant('HEX'), fn('hexEncode'), fn('hexDecode'), fn('bracketQuery'), fn('appWidget'), fn('appApi'), fn('dashboardLink'),
    'return { hexEncode, hexDecode, bracketQuery, appWidget, appApi, dashboardLink };',
  ].join('\n'))(location, homeyRequest, 'com.thomassidor.widgetkeeper');
  return { ...helpers, homeyRequest };
}

describe('web dashboards page: crossframe messages (hexEncode/hexDecode)', () => {
  it("encodes each UTF-16 unit as 4 hex digits, as Homey's SDK reads them, and back", () => {
    const { hexEncode, hexDecode } = load();
    expect(hexEncode('A{')).toBe('0041007b');
    for (const text of ['', 'Æblegrød', '{"type":"tx","data":{"a":[1,2]}}', 'Ünïcødé 🍎 中文 \u0000￿']) {
      expect(hexDecode(hexEncode(text))).toBe(text);
    }
  });
});

describe("web dashboards page: another app's widget API (appApi)", () => {
  const garden = { appId: 'com.example.garden', widgetId: 'plants' };
  const BASE = '/app/com.example.garden/widget/plants/api';

  it("calls the widget's own route with the page's key", async () => {
    const { appApi, homeyRequest } = load();
    await appApi(garden, 'GET', '/state', 'a=1&b=2');
    await appApi(garden, 'POST', 'water', '', null);
    await appApi(garden, 'PUT', '/a/b', '', { x: 1 });
    expect(homeyRequest.mock.calls).toEqual([
      ['GET', `${BASE}/state?a=1&b=2`, undefined],
      ['POST', `${BASE}/water`, {}],
      ['PUT', `${BASE}/a/b`, { x: 1 }],
    ]);
  });

  it.each([
    '/../../manager/users', '/..', '/./../x', '/%2e%2e/%2e%2e/manager/users', '/%2E%2E/x', '\\..\\..\\manager', '/x/../../y',
    '/state#frag', '/state?x=1',
  ])('refuses %s, which would leave the widget route', async (path) => {
    const { appApi, homeyRequest } = load();
    await expect(appApi(garden, 'GET', path, '')).rejects.toThrow(/Not a widget route/);
    expect(homeyRequest).not.toHaveBeenCalled();
  });

  it('keeps whatever it lets through under the widget route', async () => {
    const { appApi, homeyRequest } = load();
    for (const path of ['//evil.example/x', 'https://evil.example/x', '/%2Fmanager', '/a%2F..%2F..%2Fb', '/~x']) {
      await appApi(garden, 'GET', path, '').catch(() => {});
    }
    for (const [, path] of homeyRequest.mock.calls) expect(path.startsWith(`${BASE}/`)).toBe(true);
  });

  it("can't be pointed at another app or route through its ids", async () => {
    const { appApi, homeyRequest } = load();
    await expect(appApi({ appId: '..', widgetId: 'x' }, 'GET', '/state', '')).rejects.toThrow(/Not a widget route/);
    await appApi({ appId: 'a/b', widgetId: 'c?d' }, 'GET', '/state', '');
    expect(homeyRequest.mock.calls[0][1]).toBe('/app/a%2Fb/widget/c%3Fd/api/state');
  });

  it("reads another app's widget type, never our own app's", () => {
    const { appWidget } = load();
    expect(appWidget('homey:app:com.example.garden:plants')).toEqual(garden);
    expect(appWidget('homey:app:com.thomassidor.widgetkeeper:clock')).toBeNull();
    for (const type of [
      'clock', 'homey:app:com.example.garden', 'homey:app:com.example garden:plants', 'homey:app:x:y/z', 'homey:device:abc:x', null,
      // `/app/../widgets/<id>` would be the Homey's `/widgets/<id>`
      'homey:app:..:plants', 'homey:app:.:plants', 'homey:app:.hidden:plants',
    ]) {
      expect([type, appWidget(type)]).toEqual([type, null]);
    }
  });

  it("puts another app's autocomplete settings in Homey's bracketed query form", () => {
    const { bracketQuery } = load();
    const q = bracketQuery(new URLSearchParams({ settingId: 'plant' }), { device: { id: 'd1', name: 'Fern' }, n: 2, skip: null, on: false }, 'settings');
    expect(q.toString()).toBe('settingId=plant&settings%5Bdevice%5D%5Bid%5D=d1&settings%5Bdevice%5D%5Bname%5D=Fern&settings%5Bn%5D=2&settings%5Bon%5D=false');
  });
});

describe("web dashboards page: a widget's link to a dashboard (dashboardLink)", () => {
  const frame = { iframe: { src: '../widgets/shortcuts/index.html?widgetInstanceId=web-a-w1' } };
  const FRAME_PAGE = 'http://192.168.1.20/app/com.thomassidor.widgetkeeper/widgets/shortcuts/index.html';

  it("opens a dashboard of this page, linked from the page or from the frame's own document", () => {
    const { dashboardLink } = load();
    expect(dashboardLink('#/d/hall', frame)).toBe('hall');
    expect(dashboardLink(`${PAGE}#/d/Hall_2-b`, frame)).toBe('Hall_2-b');
    expect(dashboardLink(`${FRAME_PAGE}#/d/hall`, frame)).toBe('hall');
  });

  it.each([
    'http://evil.example/app/com.thomassidor.widgetkeeper/settings/dashboard.html#/d/hall',
    'http://192.168.1.20/app/com.other/settings/dashboard.html#/d/hall',
    '#/d/hall/edit', '#/d/../x', '#/d/a b', '#/d/', '#/', 'javascript:alert(1)//#/d/hall', 'http://[', '',
  ])('opens no dashboard for %s', (url) => {
    const { dashboardLink } = load();
    expect(dashboardLink(url, frame)).toBeNull();
  });
});

describe("web dashboards page: a screen's code (takeCode, useCode)", () => {
  /** The page's code helpers, on an address, with `fetch` answering `answer` (status 200 unless given). */
  function codePage(hash: string, answer: unknown = null, status = 200) {
    const location = new URL(`${PAGE}${hash}`);
    const history = { replaceState: vi.fn((_s: unknown, _t: string, url: string) => { location.href = new URL(url, location.href).href; }) };
    const stored = new Map<string, string | null>([['widgetkeeper.web.key', 'old-key'], ['widgetkeeper.web.session', 'old-session']]);
    const fetch = vi.fn(async () => ({ ok: status < 400, json: async () => answer }));
    const wd: any = { key: 'old-key', session: 'old-session' };
    const forgetKey = vi.fn(() => { wd.key = null; stored.set('widgetkeeper.web.key', null); });
    const helpers = new Function('location', 'history', 'fetch', 'wd', 'storageSet', 'forgetKey', 't', 'APP_ID', 'AWAY',
      'KEY_STORAGE', 'SESSION_STORAGE', [
        constant('isScreenCode'), fn('takeCode'), `async ${fn('useCode')}`, 'return { isScreenCode, takeCode, useCode };',
      ].join('\n'))(location, history, fetch, wd, (k: string, v: string | null) => stored.set(k, v), forgetKey,
      (k: string, tokens?: object) => `${k}${tokens ? JSON.stringify(tokens) : ''}`, 'com.thomassidor.widgetkeeper', false,
      'widgetkeeper.web.key', 'widgetkeeper.web.session');
    return { ...helpers, location, fetch, wd, stored, forgetKey };
  }

  it('takes the code out of the address, alone or after a dashboard', () => {
    const alone = codePage('#code=ABCD-EFGH');
    expect(alone.takeCode()).toBe('ABCD-EFGH');
    expect(alone.location.hash).toBe('');
    const after = codePage('#/d/kitchen?code=abcdefgh');
    expect(after.takeCode()).toBe('abcdefgh');
    expect(after.location.hash).toBe('#/d/kitchen');
    expect(codePage('#/d/kitchen').takeCode()).toBeNull();
  });

  it('tells a typed code from an API key', () => {
    const { isScreenCode } = codePage('#/');
    expect(['ABCD-EFGH', 'abcdefgh', 'abcd efgh'].map(isScreenCode)).toEqual([true, true, true]);
    expect(['3b1c7d0e-1111-2222-3333-444455556666:aaaa:bbbb', 'ABCDEFG', ''].map(isScreenCode)).toEqual([false, false, false]);
  });

  it('swaps a code for the key and session without a key of its own', async () => {
    const page = codePage('#/', { ok: true, key: 'screen-key', session: 'screen-session' });
    await expect(page.useCode('ABCD-EFGH')).resolves.toBeNull();
    expect(page.fetch).toHaveBeenCalledWith('/api/app/com.thomassidor.widgetkeeper/web/screen-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"ABCD-EFGH"}',
    });
    expect([page.wd.key, page.wd.session]).toEqual(['screen-key', 'screen-session']);
    expect(page.stored.get('widgetkeeper.web.key')).toBe('screen-key');
    // Without a session (no password, or one the screen needs again), the one stored stays.
    const noSession = codePage('#/', { ok: true, key: 'screen-key' });
    await noSession.useCode('ABCD-EFGH');
    expect(noSession.wd.session).toBe('old-session');
  });

  it('forgets what this browser stored for a removed code, but not for the lock or a failure', async () => {
    const wrong = codePage('#/', { ok: false, reason: 'wrong' });
    await expect(wrong.useCode('ABCD-EFGH')).resolves.toBe('screenCodeWrong');
    expect([wrong.forgetKey.mock.calls.length, wrong.wd.session, wrong.stored.get('widgetkeeper.web.session')]).toEqual([1, null, null]);
    const locked = codePage('#/', { ok: false, reason: 'locked', retryAfter: 60 });
    await expect(locked.useCode('ABCD-EFGH')).resolves.toBe('screenCodeLocked{"seconds":60}');
    expect(locked.forgetKey).not.toHaveBeenCalled();
    const off = codePage('#/', { error: 'Web dashboards are turned off' }, 500);
    await expect(off.useCode('ABCD-EFGH')).resolves.toBe('off');
    const down = codePage('#/', null, 502);
    await expect(down.useCode('ABCD-EFGH')).resolves.toBe('loadFailed');
    expect(down.wd.key).toBe('old-key');
  });
});
