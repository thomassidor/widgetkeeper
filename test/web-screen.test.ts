// @vitest-environment happy-dom
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { webPageSource } from './helpers/webPage.js';
import WebDim, { WEB_DIM_EVENT, WEB_DIM_SETTING, dimLevelArg } from '../lib/WebDim.js';

/** What a screen does by itself on the web dashboards page: Dim, Rotate dashboards; and Add widget's groups. */
const SOURCE = webPageSource();

function fn(name: string): string {
  const start = SOURCE.indexOf(`function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = SOURCE.indexOf('{', SOURCE.indexOf(') {', start)); i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}' && --depth === 0) return SOURCE.slice(start, i + 1);
  }
  throw new Error(`No end to function ${name}`);
}

const page = new Function([
  'const MAX_DIM = 80, ROTATE_MIN_SECONDS = 10, ROTATE_MAX_SECONDS = 3600, ROTATE_DEFAULT_SECONDS = 30, TOUCH_PAUSE_MS = 60000;',
  ...['dimScheduleOf', 'scheduleAt', 'dimWanted', 'dimFlowHolds', 'rotateConfigOf', 'rotationList', 'nextInRotation', 'rotationDue', 'matchesWords'].map(fn),
  'return { dimScheduleOf, scheduleAt, dimWanted, rotateConfigOf, rotationList, nextInRotation, rotationDue, matchesWords };',
].join('\n'))();

const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m);
const night = { from: 22 * 60, to: 7 * 60, level: 60 };

describe('Dim at set times', () => {
  it('reads a stored schedule, and nothing that isn\'t one', () => {
    expect(page.dimScheduleOf('{"from":"22:00","to":"07:30","level":62}')).toEqual({ from: 1320, to: 450, level: 60 });
    expect(page.dimScheduleOf({ from: '08:00', to: '09:00', level: 500 })).toMatchObject({ level: 80 });
    for (const bad of [null, '', 'nope', '{"from":"25:00","to":"07:00","level":5}', '{"from":"07:00","to":"07:00","level":5}']) {
      expect(page.dimScheduleOf(bad)).toBeNull();
    }
  });

  it('holds past midnight and says since when', () => {
    expect(page.scheduleAt(night, at(23))).toEqual({ active: true, since: at(22).getTime() });
    expect(page.scheduleAt(night, at(3))).toEqual({ active: true, since: new Date(2026, 10, 5, 22).getTime() });
    expect(page.scheduleAt(night, at(7))).toEqual({ active: false, since: at(7).getTime() });
    expect(page.scheduleAt(night, at(21, 59))).toEqual({ active: false, since: at(7).getTime() });
    expect(page.scheduleAt({ from: 480, to: 1020, level: 5 }, at(12)).active).toBe(true);
    expect(page.scheduleAt({ from: 480, to: 1020, level: 5 }, at(18)).active).toBe(false);
    expect(page.scheduleAt(null, at(12))).toEqual({ active: false, since: -Infinity });
  });

  it('picks the slider by the set times', () => {
    expect(page.dimWanted({ manual: 10, schedule: night, now: at(23) })).toBe(60);
    expect(page.dimWanted({ manual: 10, schedule: night, now: at(12) })).toBe(10);
    expect(page.dimWanted({ manual: 10, schedule: null, now: at(23) })).toBe(10);
  });

  it('lets a Flow go over them until they next start or end, or a slider moves', () => {
    const flow = { level: 30, at: at(12).getTime() };
    expect(page.dimWanted({ manual: 10, schedule: night, flow, now: at(13) })).toBe(30);
    expect(page.dimWanted({ manual: 10, schedule: night, flow, now: at(23) })).toBe(60); // the night has started since
    expect(page.dimWanted({ manual: 10, schedule: null, flow, now: at(23) })).toBe(30);
    expect(page.dimWanted({ manual: 10, schedule: night, flow, changedAt: at(12, 30).getTime(), now: at(13) })).toBe(10);
    expect(page.dimWanted({ manual: 10, schedule: night, flow: { level: 0, at: at(23).getTime() }, now: at(23, 30) })).toBe(0); // a Flow brightens the night
  });
});

describe('The Flow card Dim the web dashboards', () => {
  const setup = (stored?: unknown) => {
    const settings = new Map<string, unknown>(stored ? [[WEB_DIM_SETTING, stored]] : []);
    const realtime = vi.fn();
    const homey: any = { settings: { get: (k: string) => settings.get(k), set: (k: string, v: unknown) => settings.set(k, v) }, api: { realtime } };
    return { dim: new WebDim(homey), realtime, settings };
  };

  it('takes a level in the page\'s steps and limits', () => {
    expect([dimLevelArg(42), dimLevelArg(500), dimLevelArg(-3), dimLevelArg('x')]).toEqual([40, 80, 0, 0]);
  });

  it('keeps it per screen, as the Popups cards name them, and tells the pages', () => {
    const { dim, realtime } = setup();
    dim.set('name:Hallway', 40);
    dim.set(undefined, 20);
    expect(Object.keys(dim.state().flows)).toEqual(['name:hallway', 'all']);
    expect(dim.state().flows['name:hallway'].level).toBe(40);
    expect(realtime).toHaveBeenLastCalledWith(WEB_DIM_EVENT, expect.objectContaining({ target: 'all', level: 20 }));
  });

  it('ignores a damaged setting and caps what\'s kept', () => {
    const { dim } = setup({ 'name:a': { level: 'x', at: 1 }, 'name:b': { level: 5, at: 1 } });
    expect(Object.keys(dim.state().flows)).toEqual(['name:b']);
    for (let i = 0; i < 60; i++) dim.set(`name:n${i}`, 5);
    expect(Object.keys(dim.state().flows)).toHaveLength(50);
    expect(dim.state().flows).toHaveProperty('name:n59');
  });

  it('refuses a reserved screen name', () => {
    expect(() => setup().dim.set('name:__proto__', 5)).toThrow(/screen name/);
  });
});

describe('Rotate dashboards', () => {
  const dashboards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('reads what\'s stored, with the seconds within limits', () => {
    expect(page.rotateConfigOf('{"ids":["a","b"],"seconds":45}')).toEqual({ ids: ['a', 'b'], seconds: 45 });
    expect(page.rotateConfigOf({ ids: ['a'], seconds: 1 }).seconds).toBe(10);
    expect(page.rotateConfigOf({ ids: ['a'], seconds: 99999 }).seconds).toBe(3600);
    expect(page.rotateConfigOf({ ids: [], seconds: 'x' }).seconds).toBe(30);
    for (const off of [null, '', 'nope', '{}']) expect(page.rotateConfigOf(off)).toBeNull();
  });

  it('needs two dashboards that still exist, in the front page\'s order', () => {
    expect(page.rotationList({ ids: ['c', 'gone', 'a'] }, dashboards)).toEqual(['a', 'c']);
    expect(page.rotationList({ ids: ['a', 'gone'] }, dashboards)).toEqual([]);
    expect(page.rotationList(null, dashboards)).toEqual([]);
  });

  it('goes round, from wherever the page is', () => {
    expect(page.nextInRotation(['a', 'b'], '#/d/a')).toBe('b');
    expect(page.nextInRotation(['a', 'b'], '#/d/b')).toBe('a');
    expect(page.nextInRotation(['a', 'b'], '#/d/other')).toBe('a');
    expect(page.nextInRotation(['a', 'b'], '#/')).toBe('a');
  });

  it('waits its time, and a minute after a touch', () => {
    expect(page.rotationDue(1000, -1e9, 30)).toBe(31000); // no touch for long: its own time
    expect(page.rotationDue(0, 100000, 30)).toBe(160000);
    expect(page.rotationDue(0, 100000, 300)).toBe(400000); // never shorter than its own time
  });

  it('waits for frames and dialogs, and watches touches inside the widgets\' frames', () => {
    expect(fn('holdRotation')).toMatch(/dialog\[open\]/);
    expect(fn('holdRotation')).toMatch(/editing/);
    expect(SOURCE).toMatch(/wd\.watchTouches\(iframe\.contentWindow\)/);
  });
});

describe('Add widget', () => {
  const groups: [string, string[]][] = new Function(`return ${SOURCE.match(/const WIDGET_GROUPS = (\[[\s\S]*?\n\s*\]);/)![1]}`)();
  const en = JSON.parse(readFileSync('locales/en.json', 'utf8')).web;
  const widgets = readdirSync('widgets').filter(id => { try { return !!readFileSync(`widgets/${id}/widget.compose.json`); } catch { return false; } });

  it('has every widget in exactly one group, and a name for each group', () => {
    const grouped = groups.flatMap(g => g[1]);
    expect([...grouped].sort()).toEqual([...widgets].sort());
    for (const [key] of groups) expect(typeof en[key]).toBe('string');
  });

  it('finds by any word, in any order, without accents', () => {
    expect(page.matchesWords('', 'Clock')).toBe(true);
    expect(page.matchesWords('  ', 'Clock')).toBe(true);
    expect(page.matchesWords('price energy', 'Energy Price Strip')).toBe(true);
    expect(page.matchesWords('ENERG', 'Énergie')).toBe(true);
    expect(page.matchesWords('clock x', 'Clock')).toBe(false);
  });
});

describe('Reduced motion', () => {
  it('is cut for everything that loads the kit\'s stylesheet, but for the busy spinners', () => {
    expect(readFileSync('widgets/spacer/public/kit.css', 'utf8')).toMatch(/prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{[^}]*animation-duration: \.01ms !important[^}]*transition-duration: \.01ms !important/);
    expect(readFileSync('widgets/flows/public/widget.css', 'utf8')).toMatch(/reduced-motion: reduce\) \{ \.fb-row\.running \.fb-button::after \{ animation-duration: \.7s !important/);
    expect(readFileSync('widgets/keypad/public/widget.css', 'utf8')).toMatch(/reduced-motion: reduce\) \{ \.kp-spin \{ animation-duration: \.8s !important/);
  });
});

describe('The page\'s screen part, running', () => {
  function mount(stored: Record<string, string> = {}, dashboards = [{ id: 'a', columns: [[{ type: 'popups', settings: { name: 'Hall' } }]] }, { id: 'b', columns: [] }]) {
    const storage = new Map(Object.entries(stored));
    const listeners = new Map<string, Set<(data: unknown) => void>>();
    const applyDim = vi.fn();
    let part: (wd: any) => void = () => {};
    vi.stubGlobal('WidgetkeeperWeb', { part: (_: string, f: (wd: any) => void) => { part = f; } });
    const wd: any = {
      APP_ID: 'app', applyDim, listeners, request: vi.fn(), key: 'k', setup: {}, dashboards, current: null, drag: null,
      storageGet: (k: string) => storage.get(k) ?? null, storageSet: (k: string, v: string | null) => { if (v === null) storage.delete(k); else storage.set(k, v); },
      listenerKey: (u: string, e: string) => `${u}\n${e}`,
      screenNamesOf: (id: string) => new Set(id === 'a' ? ['name:hall'] : []),
      dimChoices: () => ({ manual: 10, schedule: null, changedAt: 0 }),
    };
    wd.dimWanted = new Function(`${fn('scheduleAt')}\n${fn('dimFlowHolds')}\n${fn('dimWanted')}\nreturn dimWanted;`)();
    wd.dimFlowHolds = new Function(`${fn('scheduleAt')}\n${fn('dimFlowHolds')}\nreturn dimFlowHolds;`)();
    new Function(readFileSync('settings/dashboard-screen.js', 'utf8'))();
    part(wd);
    const event = (data: unknown) => { for (const f of listeners.get('homey:app:app\nwebdim:state')!) f(data); };
    return { wd, applyDim, event };
  }

  it('dims from a Flow\'s event: everywhere, and a screen name only on its own dashboard', () => {
    vi.useFakeTimers();
    location.hash = '#/d/b';
    const { wd, applyDim, event } = mount();
    event({ target: 'name:hall', level: 40, at: Date.now(), now: Date.now() });
    expect(applyDim).toHaveBeenLastCalledWith(10);
    location.hash = '#/d/a';
    wd.syncDim();
    expect(applyDim).toHaveBeenLastCalledWith(40);
    expect(wd.dimFlowLevel()).toBe(40);
    location.hash = '#/d/b';
    event({ target: 'all', level: 25, at: Date.now() + 1, now: Date.now() });
    expect(applyDim).toHaveBeenLastCalledWith(25);
    vi.useRealTimers();
  });

  it('goes round the list on its time, and waits for a dialog, a touch and the editor', () => {
    vi.useFakeTimers();
    location.hash = '#/d/a';
    mount({ 'widgetkeeper.web.rotate': '{"ids":["a","b"],"seconds":10}' });
    vi.advanceTimersByTime(9000);
    expect(location.hash).toBe('#/d/a');
    vi.advanceTimersByTime(2000);
    expect(location.hash).toBe('#/d/b');
    vi.advanceTimersByTime(11000);
    expect(location.hash).toBe('#/d/a');

    // A touch: a minute before it moves on.
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(55000);
    expect(location.hash).toBe('#/d/a');
    vi.advanceTimersByTime(7000);
    expect(location.hash).toBe('#/d/b');

    // A dialog, a popup's too: held, and its full time again once it's gone.
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    vi.advanceTimersByTime(30000);
    expect(location.hash).toBe('#/d/b');
    dialog.remove();
    vi.advanceTimersByTime(8000);
    expect(location.hash).toBe('#/d/b');
    vi.advanceTimersByTime(4000);
    expect(location.hash).toBe('#/d/a');

    // The editor: stays.
    location.hash = '#/d/a/edit';
    vi.advanceTimersByTime(30000);
    expect(location.hash).toBe('#/d/a/edit');
    vi.useRealTimers();
  });

  it('stays without two dashboards to go through', () => {
    vi.useFakeTimers();
    location.hash = '#/d/a';
    mount({ 'widgetkeeper.web.rotate': '{"ids":["a","gone"],"seconds":10}' });
    vi.advanceTimersByTime(60000);
    expect(location.hash).toBe('#/d/a');
    vi.useRealTimers();
  });
});
