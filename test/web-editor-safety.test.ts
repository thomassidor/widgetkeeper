// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFile } from './helpers/loadWidget.js';
import { webPageSource } from './helpers/webPage.js';

// What keeps work from being lost in the web dashboards' editor: a new widget Cancel takes away, a second go for
// changed settings, a failed save that stays up and a dashboard delete with an Undo. The parts run with a stand-in `wd`.
function el(tag: string, className?: string | null, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(className: string, text: string | null, onClick: () => void) {
  const b = el('button', className, text ?? '');
  b.addEventListener('click', onClick);
  return b;
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function runPart(file: string, wd: Record<string, any>) {
  (window as any).WidgetkeeperWeb = { part: (_name: string, fn: (wd: any) => void) => fn(wd) };
  runFile(file);
  return wd;
}

function base(extra: Record<string, any> = {}) {
  return {
    el, button, t: (s: string) => s, icon: () => el('i'), clone: (v: unknown) => JSON.parse(JSON.stringify(v)),
    frames: new Set(), opts: { mountWidget: () => {} }, appWidget: () => null, about: () => '', preview: () => el('img'),
    CONFIRM_MS: 3000, LAYOUT: { spanOf: () => 1 }, saving: Promise.resolve(), toast: vi.fn(), persist: vi.fn(), failed: vi.fn(),
    ...extra,
  } as Record<string, any>;
}

describe('a widget\'s settings', () => {
  beforeEach(() => {
    (window as any).WidgetkeeperKit = { COLORS: [] };
    if (!(globalThis as any).HTMLDialogElement?.prototype.showModal) (globalThis as any).HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  });
  afterEach(() => { document.body.textContent = ''; vi.useRealTimers(); });

  function mount(column: any[] = []) {
    const def = { type: 'clock', name: 'Clock', settings: [{ id: 'label', type: 'text', title: 'Label', value: '' }], sections: [{ kind: 'plain', ids: ['label'] }], height: 100 };
    const wd = base({
      typeOf: () => def, types: new Map([['clock', def]]), foreign: new Map(), foreignState: 'ok',
      current: { dashboard: { columns: [column] } }, syncGrid: vi.fn(), widgetFolder: () => '',
      find: (id: string) => { const i = column.findIndex(w => w.id === id); return i < 0 ? null : { widget: column[i], c: 0, i }; },
      newId: () => 'new1',
    });
    runPart('settings/dashboard-settings.js', wd);
    return { wd, column };
  }
  const open = () => document.querySelector('dialog.wd-settings') as HTMLDialogElement;
  const type = (value: string) => {
    const input = open().querySelectorAll('input')[1];
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const cancelButton = () => open().querySelector('.wd-actions .wd-btn.quiet') as HTMLButtonElement;
  const addClock = (wd: Record<string, any>) => {
    wd.chooseWidget(0);
    (document.querySelector('.wd-type') as HTMLButtonElement).click();
  };

  it('saves a new widget only with Save', () => {
    const { wd, column } = mount();
    addClock(wd);
    expect(column).toHaveLength(1);
    expect(wd.persist).not.toHaveBeenCalled();
    (open().querySelector('.wd-actions .primary') as HTMLButtonElement).click();
    expect(wd.persist).toHaveBeenCalledOnce();
    expect(column).toHaveLength(1);
  });

  it('takes a new widget away on Cancel, unsaved', () => {
    const { wd, column } = mount();
    addClock(wd);
    cancelButton().click();
    expect(column).toEqual([]);
    expect(wd.persist).not.toHaveBeenCalled();
  });

  it('closes unchanged settings at once, and leaves the widget', () => {
    const { wd, column } = mount([{ id: 'a', type: 'clock', settings: { label: '' }, deviceIds: [] }]);
    wd.editWidget('a');
    cancelButton().click();
    expect(open()).toBeNull();
    expect(column).toHaveLength(1);
  });

  it.each([
    ['Cancel', () => cancelButton().click()],
    ['✕', () => (open().querySelector('.wd-dialog-head button') as HTMLButtonElement).click()],
    ['Escape', () => open().dispatchEvent(new Event('cancel', { cancelable: true }))],
  ])('asks a second go on %s after a change', (_name, press) => {
    const { wd } = mount([{ id: 'a', type: 'clock', settings: { label: '' }, deviceIds: [] }]);
    wd.editWidget('a');
    type('Kitchen');
    press();
    expect(open()).not.toBeNull();
    expect(cancelButton().textContent).toBe('discardEdits');
    press();
    expect(open()).toBeNull();
    expect(wd.persist).not.toHaveBeenCalled();
  });

  it('counts a change typed back as none, and the second go runs out', () => {
    vi.useFakeTimers();
    const { wd } = mount([{ id: 'a', type: 'clock', settings: { label: '' }, deviceIds: [] }]);
    wd.editWidget('a');
    type('Kitchen');
    cancelButton().click();
    vi.advanceTimersByTime(3001);
    expect(cancelButton().textContent).toBe('cancel');
    cancelButton().click();
    expect(open()).not.toBeNull();
    type('');
    cancelButton().click();
    expect(open()).toBeNull();
  });
});

describe('deleting a dashboard', () => {
  const A = { id: 'a', name: 'A' };
  const B = { id: 'b', name: 'B' };
  function mount(request = vi.fn(async (): Promise<unknown> => ({}))) {
    const toastNode = el('div');
    const wd = base({
      dashboards: [A, B], deleted: new Set<string>(), current: null, route: vi.fn(), request,
      toast: vi.fn(() => toastNode), storageGet: () => null, storageSet: () => {},
    });
    runPart('settings/dashboard-front.js', wd);
    return wd;
  }
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('leaves the list at once and asks the app only when the Undo has run out', async () => {
    const wd = mount();
    const done = vi.fn();
    wd.deleteDashboard('a', done);
    expect(done).toHaveBeenCalledOnce();
    expect(wd.dashboards).toEqual([B]);
    expect(wd.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8000);
    expect(wd.request).toHaveBeenCalledWith('DELETE', '/web/dashboards/a', undefined, false);
    expect(wd.deleted.has('a')).toBe(true);
  });

  it('puts it back in its place on Undo, and the app never hears of it', async () => {
    const wd = mount();
    wd.deleteDashboard('a', () => {});
    wd.toast.mock.calls[0][1].run();
    expect(wd.dashboards).toEqual([A, B]);
    expect(wd.route).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9000);
    expect(wd.request).not.toHaveBeenCalled();
    expect(wd.deleted.has('a')).toBe(false);
  });

  it('sends a waiting delete when the next one comes, or the page goes', async () => {
    const wd = mount();
    wd.deleteDashboard('a', () => {});
    wd.deleteDashboard('b', () => {});
    await flush();
    expect(wd.request).toHaveBeenCalledWith('DELETE', '/web/dashboards/a', undefined, false);
    window.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(wd.request).toHaveBeenCalledWith('DELETE', '/web/dashboards/b', undefined, true);
  });

  it('puts it back when the app\'s delete fails', async () => {
    const wd = mount(vi.fn(async () => { throw new Error('busy'); }));
    wd.deleteDashboard('a', () => {});
    await vi.advanceTimersByTimeAsync(8000);
    expect(wd.dashboards).toEqual([A, B]);
    expect(wd.failed).toHaveBeenCalled();
    expect(wd.deleted.has('a')).toBe(false);
  });
});

describe('persist()', () => {
  const source = webPageSource();
  const start = source.indexOf('function persist()');
  const end = source.indexOf('return wd.saving;', start);
  function load(request: () => Promise<unknown>, extra: Record<string, any> = {}) {
    const wd: Record<string, any> = {
      saving: Promise.resolve(), dashboards: [{ id: 'a', columns: [] }], current: { editing: true, dashboard: { id: 'a', columns: [] } },
      stored: (d: unknown) => d, editable: (d: unknown) => d, syncGrid: vi.fn(), showSaveProblem: vi.fn(), clearSaveProblem: vi.fn(),
      ...extra,
    };
    const failed = vi.fn();
    const persist = new Function('wd', 'deleted', 'request', 'failed', 't', `${source.slice(start, end)}return wd.saving; }\nreturn persist;`)(wd, new Set(), request, failed, (s: string) => s);
    return { wd, failed, persist };
  }

  it('keeps a failed save up while its editor is open', async () => {
    const { wd, failed, persist } = load(async () => { throw new TypeError('offline'); });
    await persist();
    expect(wd.showSaveProblem).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });

  it.each([
    ['signed out', { unauthorized: true }, 'turned on'],
    ['the password screen', { handled: true }, 'x'],
    ['turned off', {}, 'Web dashboards are turned off'],
  ])('leaves %s to failed()', async (_name, flags, message) => {
    const { wd, failed, persist } = load(async () => { throw Object.assign(new Error(message), flags); });
    await persist();
    expect(failed).toHaveBeenCalledOnce();
    expect(wd.showSaveProblem).not.toHaveBeenCalled();
  });

  it('clears the problem when a save works', async () => {
    const { wd, persist } = load(async () => ({ id: 'a', columns: [] }));
    await persist();
    expect(wd.clearSaveProblem).toHaveBeenCalledOnce();
  });

  it('gives what a save answers to a delete still waiting, not the list', async () => {
    const pendingDelete: Record<string, any> = { id: 'a', dashboard: { id: 'a', name: 'old' } };
    const saved = { id: 'a', name: 'new' };
    const { wd, persist } = load(async () => saved, { dashboards: [], pendingDelete });
    await persist();
    expect(wd.dashboards).toEqual([]);
    expect(pendingDelete.dashboard).toBe(saved);
  });
});

describe('the viewing bar\'s list of dashboards', () => {
  const A = { id: 'a', name: 'Home' };
  const B = { id: 'b', name: 'Kitchen', section: 's1' };
  const C = { id: 'c', name: '', section: 'gone' };
  function mount(dashboards: any[], sections: any[] = [], setup: Record<string, any> = {}) {
    const wd = base({ dashboards, frontPage: { sections }, setup, root: el('div'), storageSet: vi.fn(), sizes: {}, about: undefined, preview: undefined });
    wd.dialog = () => { const d = el('dialog'); const body = el('div'); (d as any).showModal = vi.fn(); return { d, body }; };
    wd.request = vi.fn();
    return runPart('settings/dashboard-views.js', wd);
  }

  it('is just the name without another dashboard', () => {
    expect(mount([A]).dashboardJump(A)).toBeNull();
  });

  it('lists them under the front page\'s sections and marks this one', () => {
    const node = mount([A, B, C], [{ id: 's1', name: 'Tablets' }]).dashboardJump(A);
    const shown = [...node.querySelector('nav').children].map((x: any) => x.textContent);
    expect(shown).toEqual(['yourDashboards', 'Home', 'untitled', 'Tablets', 'Kitchen']); // a section that's gone: with the others
    expect(node.querySelector('[aria-current]').getAttribute('href')).toBe('#/d/a');
    expect(node.querySelector('nav').hidden).toBe(true);
  });

  it('has no headings without sections', () => {
    const node = mount([A, B]).dashboardJump(A);
    expect(node.querySelectorAll('h2')).toHaveLength(0);
  });

  it('opens and closes, on Escape and on leaving the page for a widget', () => {
    const node = mount([A, B]).dashboardJump(A);
    document.body.append(node);
    const nav = node.querySelector('nav');
    const trigger = node.querySelector('button');
    trigger.click();
    expect(nav.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(nav.hidden).toBe(true);
    trigger.click();
    window.dispatchEvent(new Event('blur'));
    expect(nav.hidden).toBe(true);
    node.remove();
  });

  it('goes straight on from a dashboard without a code, and asks for one that has it', () => {
    const open = mount([A, B]).dashboardJump(A);
    const go = (node: any) => {
      const e = new MouseEvent('click', { cancelable: true });
      node.querySelector('a[href="#/d/b"]').dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(go(open)).toBe(false);
    const coded = { ...A, code: { id: 'x', name: 'Anna' } };
    const wd = mount([coded, B], [], { codes: [{ id: 'x', name: 'Anna', digits: 4 }] });
    const locked = wd.dashboardJump(coded);
    expect(go(locked)).toBe(true);
  });
});

describe('fewer columns', () => {
  const source = webPageSource();
  const start = source.indexOf('function setColumns(n)');
  const end = source.indexOf('/**', start);
  function load(columns: any[][]) {
    const wd: Record<string, any> = { current: { dashboard: { columns } }, withUndo: vi.fn((_m: string, change: () => void) => change()) };
    const persist = vi.fn();
    const setColumns = new Function('wd', 'persist', 'syncGrid', `${source.slice(start, end)}\nreturn setColumns;`)(wd, persist, vi.fn());
    return { wd, persist, setColumns };
  }

  it('offers Undo when the last column has widgets, which move to the one before', () => {
    const { wd, persist, setColumns } = load([[{ id: 'a' }], [{ id: 'b' }]]);
    setColumns(1);
    expect(wd.withUndo).toHaveBeenCalledWith('columnRemoved', expect.any(Function));
    expect(wd.current.dashboard.columns).toEqual([[{ id: 'a' }, { id: 'b' }]]);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('offers none for an empty column or for more columns', () => {
    for (const [columns, n] of [[[[{ id: 'a' }], []], 1], [[[{ id: 'a' }]], 2]] as [any[][], number][]) {
      const { wd, persist, setColumns } = load(columns);
      setColumns(n);
      expect(wd.withUndo).not.toHaveBeenCalled();
      expect(persist).toHaveBeenCalledOnce();
      expect(wd.current.dashboard.columns).toHaveLength(n);
    }
  });
});
