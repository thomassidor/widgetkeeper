// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { runFile } from './helpers/loadWidget.js';

// settings/dashboard-sync.js: taking in what a sync changed on the web side (.claude/rules/web-sync.md).
function mount(wd: Record<string, any>) {
  let part: ((wd: any) => void) | undefined;
  (window as any).WidgetkeeperWeb = { part: (_name: string, fn: (wd: any) => void) => { part = fn; } };
  runFile('settings/dashboard-sync.js');
  const fresh = { id: 'web1', name: 'From Homey' };
  const page = {
    el: () => document.createElement('div'), button: vi.fn(), confirmButton: vi.fn(), failed: vi.fn(), icon: vi.fn(), t: (s: string) => s, toast: vi.fn(),
    request: vi.fn(async () => ({ dashboards: [fresh], sync: {} })),
    renderDashboard: vi.fn(), renderList: vi.fn(),
    APP_ID: 'app', listeners: new Map<string, Set<(data: any) => void>>(), listenerKey: (uri: string, event: string) => `${uri}\n${event}`,
    saving: Promise.resolve(), ...wd,
  };
  part!(page);
  const send = (data: unknown) => { for (const f of page.listeners.get('homey:app:app\nwebsync:state')!) f(data); };
  send({ id: 'web1', link: { syncing: true, prefer: 'homey', lastSync: null } });
  return { page, send, fresh };
}
const synced = { id: 'web1', link: { syncing: false, prefer: 'homey', lastSync: { at: 5, ok: true, changes: { web: { updated: 1 } } } } };
const editing = () => ({ current: { dashboard: { id: 'web1' }, editing: true } });

describe('a sync that changed the dashboard on screen', () => {
  it('redraws it', async () => {
    const { page, send, fresh } = mount(editing());
    send(synced);
    await vi.waitFor(() => expect(page.renderDashboard).toHaveBeenCalledWith(fresh, true));
  });

  // The redraw ends them (`syncGrid()`). Left as it was, the drop would save the dashboard from before the sync.
  it.each([['a drag', { drag: { id: 'a' } }], ['a resize', { resizing: { id: 'a' } }]])('redraws it during %s too', async (_what, state) => {
    const { page, send, fresh } = mount({ ...editing(), ...state });
    send(synced);
    await vi.waitFor(() => expect(page.renderDashboard).toHaveBeenCalledWith(fresh, true));
  });
});
