/* Chart · Timeline's `/state` (lib/timelineState.ts): a boolean's recorded changes, a number's Insights points. */
import { describe, expect, it, vi } from 'vitest';
import { timelineState } from '../lib/timelineState.js';

const cap = (type: string) => ({ title: type, type, units: null, decimals: null, min: null, max: null, values: null, icon: null });

function setup() {
  const app = {
    log: vi.fn(),
    debug: vi.fn(),
    values: {
      getState: vi.fn(async (slots: string[]) => slots.map((s) => {
        const [deviceId, capabilityId] = s.split(':');
        if (deviceId === 'gone') return { deviceId, capabilityId, missing: true };
        return { deviceId, capabilityId, name: deviceId, capability: cap(capabilityId === 'measure_power' ? 'number' : 'boolean'), value: null };
      })),
    },
    sparklines: { histories: vi.fn(async (requests: any[]) => requests.map(() => ({ points: [[150, 80]] }))) },
    heatmap: { getChanges: vi.fn(async () => ({ changes: [[120, 1]], since: 110 })) },
  };
  const homey = { app, i18n: { getLanguage: () => 'en' } } as any;
  return { app, homey };
}

describe('timelineState', () => {
  it("gives a boolean its recorded changes and a number its Insights points over the window, in order", async () => {
    const { app, homey } = setup();
    const res = await timelineState(homey, { slots: 'h:measure_power,d:alarm_contact,gone:onoff', from: '100', end: '200', unit: 'day', span: '1d!' });
    expect(app.sparklines.histories).toHaveBeenCalledWith([{ slot: 'h:measure_power', from: 100, end: 200, unit: 'day', fine: true, span: '1d!' }]);
    expect(app.values.getState).toHaveBeenCalledTimes(1); // the number's state isn't read again with its history
    expect(app.heatmap.getChanges).toHaveBeenCalledTimes(1);
    expect(app.heatmap.getChanges).toHaveBeenCalledWith('d', 'alarm_contact', 100);
    expect(res.rows.map((r: any) => r.points ?? r.changes ?? 'missing')).toEqual([[[150, 80]], [[120, 1]], 'missing']);
  });

  it('ends the window now for a page that sends no end (before numbers)', async () => {
    const { app, homey } = setup();
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    await timelineState(homey, { slots: 'h:measure_power', from: '100' });
    vi.useRealTimers();
    expect(app.sparklines.histories).toHaveBeenCalledWith([expect.objectContaining({ from: 100, end: 5000, unit: null })]);
  });

  it("keeps a boolean whose changes can't be read, unknown", async () => {
    const { app, homey } = setup();
    app.heatmap.getChanges.mockRejectedValueOnce(new Error('busy'));
    const res = await timelineState(homey, { slots: 'd:alarm_contact', from: '100', end: '200' });
    expect(res.rows[0]).toMatchObject({ changes: [], since: null });
  });
});
