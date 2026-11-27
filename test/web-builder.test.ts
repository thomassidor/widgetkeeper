import { describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import api from '../api.js';
import CustomWidgetService from '../lib/CustomWidgetService.js';
import { WEB_ENABLED_SETTING } from '../lib/WebDashboardService.js';
import WebPassword from '../lib/WebPassword.js';

vi.mock('homey-api', () => homeyApiMock);

// The Widget Builder's page routes (`/web/designs…`, api.ts): web routes like the dashboards', so on and signed in.
function setup() {
  const homey = fakeHomey(fakeApi({}));
  homey.settings.set(WEB_ENABLED_SETTING, true);
  const log = vi.fn();
  const web = { enabled: true, remote: false, assertEnabled: vi.fn() };
  const deps = {
    values: { getState: vi.fn(async (slots: string[]) => slots.map(s => ({ deviceId: s.split(':')[0], capabilityId: s.split(':')[1], name: 'Sensor', capability: {}, value: 21 }))) },
    variables: { getState: vi.fn(async () => []), set: vi.fn(), listVariables: vi.fn(async () => [{ id: 'v1', name: 'Guests' }]) },
    flows: { getState: vi.fn(async () => []), trigger: vi.fn(), listFlows: vi.fn(async () => [{ id: 'flow:f1', name: 'Movie' }]) },
    sparklines: { getState: vi.fn(async () => []) },
  };
  const custom = new CustomWidgetService(homey as any, deps as any, log);
  homey.app = { web, webPassword: new WebPassword(homey, log), custom, variables: deps.variables, flows: deps.flows, log, debug: vi.fn() };
  return { homey, web, custom, deps };
}

describe('web dashboards: the Widget Builder', () => {
  it('saves, duplicates and deletes designs, answering the library each time', async () => {
    const { homey } = setup();
    const saved = await api.putWebDesign({ homey, body: { name: 'Hall', parts: [{ kind: 'text', id: 't', text: 'Hi', at: { x: 0, y: 0, w: 4, h: 1 } }] } });
    expect(saved.designs.map(d => d.name)).toEqual(['Hall']);
    const copy = await api.postWebDesignCopy({ homey, params: { id: saved.design.id } });
    expect(copy.designs.map(d => d.name)).toEqual(['Hall', 'Hall (copy)']);
    const gone = await api.deleteWebDesign({ homey, params: { id: saved.design.id } });
    expect(gone).toMatchObject({ removed: true });
    expect(gone.designs.map(d => d.name)).toEqual(['Hall (copy)']);
  });

  it("previews a design that isn't saved, reading only what it shows", async () => {
    const { homey, deps, custom } = setup();
    const state: any = await api.postWebDesignPreview({ homey, body: { design: { name: 'Draft', parts: [{ kind: 'text', text: '{1}', refs: [{ slot: 'd1:measure_temperature' }], at: { x: 0, y: 0, w: 2, h: 1 } }] } } });
    expect(deps.values.getState).toHaveBeenCalledWith(['d1:measure_temperature'], [], { rooms: false });
    expect(state.values['d1:measure_temperature']).toMatchObject({ value: 21 });
    expect(custom.list()).toEqual([]);
    await expect(api.postWebDesignPreview({ homey, body: { design: null } })).rejects.toThrow('Not a design');
  });

  it("lists Flows and variables to pick, as the widgets' autocompletes do", async () => {
    const { homey } = setup();
    expect(await api.postWebDesignPick({ homey, body: { what: 'flow', query: '' } })).toEqual([{ id: 'flow:f1', name: 'Movie' }]);
    expect(await api.postWebDesignPick({ homey, body: { what: 'variable', query: '' } })).toEqual([{ id: 'v1', name: 'Guests' }]);
    await expect(api.postWebDesignPick({ homey, body: { what: 'device' } })).rejects.toThrow('Nothing to pick');
  });

  it("answers nothing while the web dashboards are off, or without the password's session", async () => {
    const { homey, web } = setup();
    web.assertEnabled.mockImplementation(() => { throw new Error('Web dashboards are turned off'); });
    await expect(api.putWebDesign({ homey, body: { name: 'X', parts: [] } })).rejects.toThrow(/turned off/);
    web.assertEnabled.mockReset();
    await homey.app.webPassword.setPassword('correct horse');
    for (const call of [
      () => api.putWebDesign({ homey, body: { name: 'X', parts: [] } }),
      () => api.deleteWebDesign({ homey, params: { id: 'x' } }),
      () => api.postWebDesignCopy({ homey, params: { id: 'x' } }),
      () => api.postWebDesignPreview({ homey, body: { design: { parts: [] } } }),
      () => api.postWebDesignPick({ homey, body: { what: 'flow' } }),
    ]) await expect(call()).rejects.toThrow(/password required/);
  });
});
