import { describe, expect, it, vi } from 'vitest';
import api from '../widgets/totals/api.js';

/** A Homey whose app answers the chart windows and the price history with fakes. */
function homey(prices: () => Promise<unknown>) {
  const app = {
    sparklines: { getWindows: vi.fn(async (rs: any[]) => rs.map(r => ({ deviceId: 'm1', capabilityId: 'meter_power', name: 'Meter', points: [], slot: r.slot }))) },
    electricity: { getPriceHistory: vi.fn(prices) },
    log: vi.fn(),
    debug: vi.fn(),
  };
  return { app, i18n: { getLanguage: () => 'en' } } as any;
}

describe('Chart · Totals /state', () => {
  const charts = 'm1:meter_power~1d!~1000~5000~day~use';

  it('answers the totals alone without prices=', async () => {
    const h = homey(async () => ({}));
    const res: any = await api.getState({ homey: h, query: { charts } });
    expect(res.charts).toHaveLength(1);
    expect('prices' in res).toBe(false);
    expect(h.app.electricity.getPriceHistory).not.toHaveBeenCalled();
  });

  it('adds the price history over the span asked for (Show: Cost)', async () => {
    const answer = { currency: 'DKK', fixed: null, hours: [[0, 1]], missing: 0, pending: 0 };
    const h = homey(async () => answer);
    const res: any = await api.getState({ homey: h, query: { charts, prices: '1000~5000' } });
    expect(h.app.electricity.getPriceHistory).toHaveBeenCalledWith(1000, 5000);
    expect(res).toMatchObject({ language: 'en', prices: answer });
    expect(res.charts).toHaveLength(1);
  });

  it("gives the totals with prices null when the prices can't be read, and ignores a broken span", async () => {
    const h = homey(async () => { throw new Error('Too many requests'); });
    const res: any = await api.getState({ homey: h, query: { charts, prices: '1000~5000' } });
    expect(res.prices).toBeNull();
    expect(res.charts).toHaveLength(1);
    expect(h.app.log).toHaveBeenCalledWith('Totals prices failed:', expect.any(Error));
    const broken: any = await api.getState({ homey: h, query: { charts, prices: '5000~1000' } });
    expect('prices' in broken).toBe(false);
  });
});
