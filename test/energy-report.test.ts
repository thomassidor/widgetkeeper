import { describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { parseEnergyReport, readEnergyReport } from '../lib/energyReport.js';

vi.mock('homey-api', () => homeyApiMock);

describe('energy report (diagnostics)', () => {
  it('reads a day, week, month or year as the call and its argument', () => {
    expect(parseEnergyReport('day:2026-10-30')).toEqual({ call: 'getReportDay', args: { date: '2026-10-30' } });
    expect(parseEnergyReport('week:2026-W44')).toEqual({ call: 'getReportWeek', args: { isoWeek: '2026-W44' } });
    expect(parseEnergyReport('month:2026-10')).toEqual({ call: 'getReportMonth', args: { yearMonth: '2026-10' } });
    expect(parseEnergyReport('year:2026')).toEqual({ call: 'getReportYear', args: { year: '2026' } });
    for (const bad of ['', 'day', 'day:30-10-2026', 'hour:2026-10-30', '__proto__:x', 'constructor:2026']) expect(parseEnergyReport(bad)).toBeNull();
  });

  it("gives Homey's answer as it comes, and each failure on its own", async () => {
    const api = fakeApi({});
    const report = { electricity: { imported: 12.3 } };
    (api.energy as any).getReportDay = vi.fn(async () => report);
    (api.energy as any).getReportsAvailable = vi.fn(async () => { throw new Error('Missing Scopes'); });
    const homey = fakeHomey(api);
    expect(await readEnergyReport(homey, 'day:2026-10-30')).toEqual({
      request: { getReportDay: { date: '2026-10-30' } }, report: { ok: report }, available: { error: 'Missing Scopes' },
    });
    expect((api.energy as any).getReportDay).toHaveBeenCalledWith({ date: '2026-10-30' });
    expect(await readEnergyReport(homey, 'yesterday')).toEqual({ error: expect.stringContaining('day:YYYY-MM-DD') });
  });
});
