import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, FakeApiOptions, fakeDevice, fakeHomey, homeyApiMock, memoryStorage } from './helpers/fakeHomey.js';
import ElectricityService, { hoursDays, LIVE_EVENT, priceInterval } from '../lib/ElectricityService.js';
import { HOUR, MINUTE } from '../lib/series.js';

vi.mock('homey-api', () => homeyApiMock);

// Runs in Europe/Copenhagen (vitest.config.ts), like the Homey these were verified on.
const NOW = new Date('2026-01-15T10:20:00').getTime();
const HOUR_START = new Date('2026-01-15T10:00:00').getTime();

/** Homey's response for a local day: one hourly price per hour of that day (23–25 of them). */
function dayPrices(date: string, price: (start: number) => number = start => new Date(start).getHours() / 10) {
  const start = new Date(`${date}T00:00:00`).getTime();
  const end = new Date(new Date(start + 26 * HOUR).toDateString()).getTime(); // next local midnight
  const pricesPerInterval = [];
  for (let t = start; t < end; t += HOUR) {
    pricesPerInterval.push({ periodStart: new Date(t).toISOString(), periodEnd: new Date(t + HOUR).toISOString(), value: price(t) });
  }
  return { priceUnit: 'DKK', interval: 60, pricesPerInterval };
}

function meter(caps: Record<string, any> = { measure_power: { value: 512.4 } }) {
  return fakeDevice({ id: 'm1', name: 'Electricity Meter', caps });
}

function setup(opts: FakeApiOptions = {}) {
  const api = fakeApi({
    devices: [meter()],
    logs: [{ id: 'homey:device:m1:energy_power', ownerUri: 'homey:device:m1', ownerId: 'energy_power' }],
    prices: ({ date }) => dayPrices(date),
    ...opts,
  });
  const homey = fakeHomey(api);
  const service = new ElectricityService(homey, () => {});
  return { api, homey, service };
}

function fetchesFor(api: ReturnType<typeof fakeApi>, date: string) {
  return api.energy.fetchDynamicElectricityPrices.mock.calls.filter(([a]) => a.date === date).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

describe('price slots', () => {
  it('returns 49 hourly slots with the current hour at index 24', async () => {
    const { service } = setup();
    const { prices, currency, language } = await service.getSnapshot(null);
    expect(prices).toHaveLength(49);
    expect(prices[24].start).toBe(HOUR_START);
    expect(prices[0].start).toBe(HOUR_START - 24 * HOUR);
    expect(prices[24].price).toBe(1); // 10:00
    expect(prices[0].price).toBe(1); // yesterday 10:00
    expect(prices.every(p => p.price != null)).toBe(true);
    expect(currency).toBe('DKK');
    expect(language).toBe('en');
  });

  it('looks up to 36 hours ahead with futureHours, the day after tomorrow quietly empty', async () => {
    vi.setSystemTime(new Date('2026-01-15T18:20:00').getTime());
    const log = vi.fn();
    const { api, homey } = setup({
      prices: ({ date }) => { if (date === '2026-01-17') throw new Error('Not published yet'); return dayPrices(date); },
    });
    const service = new ElectricityService(homey, log);
    const { prices, priceError } = await service.getSnapshot(null, { futureHours: 36 });
    expect(prices).toHaveLength(61);
    expect(prices[60].start).toBe(new Date('2026-01-17T06:00:00').getTime());
    expect(prices[53].price).toBe(2.3); // 23:00 tomorrow
    expect(prices.slice(54).every(p => p.price == null)).toBe(true);
    expect(priceError).toBeNull();
    expect(fetchesFor(api, '2026-01-17')).toBe(1);
    expect(log.mock.calls.some(([msg]) => String(msg).includes('2026-01-17'))).toBe(false);
    // Capped at 36, and never below the Electricity Overview's 24.
    expect((await service.getSnapshot(null, { futureHours: 99 })).prices).toHaveLength(61);
    expect((await service.getSnapshot(null, { futureHours: 6 })).prices).toHaveLength(49);
  });

  it('leaves only the slots of a day that failed empty', async () => {
    const { service } = setup({
      prices: ({ date }) => {
        if (date === '2026-01-16') throw new Error('Not published yet');
        return dayPrices(date);
      },
    });
    const { prices } = await service.getSnapshot(null);
    const tomorrow = 24 + 14; // 00:00 on the 16th
    expect(prices.slice(0, tomorrow).every(p => p.price != null)).toBe(true);
    expect(prices.slice(tomorrow).every(p => p.price == null)).toBe(true);
  });

  it("reports an error only when today's prices failed", async () => {
    const tomorrowFails = setup({
      prices: ({ date }) => { if (date === '2026-01-16') throw new Error('Not published yet'); return dayPrices(date); },
    });
    expect((await tomorrowFails.service.getSnapshot(null)).priceError).toBeNull();
    const todayFails = setup({
      prices: ({ date }) => { if (date === '2026-01-15') throw new Error('Too many requests.'); return dayPrices(date); },
    });
    const snap = await todayFails.service.getSnapshot(null);
    expect(snap.priceError).toBe('Too many requests.');
    expect(snap.prices[24].price).toBeNull();
    const notSetUp = setup({ prices: () => ({}) });
    expect((await notSetUp.service.getSnapshot(null)).priceError).toBeNull();
  });

  it('remembers a day that failed: a coming one for 15 minutes, today for 1', async () => {
    let todayFails = true;
    const { homey, api } = setup({
      prices: ({ date }) => {
        if (date === '2026-01-16') throw new Error('Not published yet');
        if (date === '2026-01-15' && todayFails) throw new Error('Too many requests.');
        return dayPrices(date);
      },
    });
    const log = vi.fn();
    const service = new ElectricityService(homey, log);
    const priceErrors = () => log.mock.calls.map(([msg]) => String(msg)).filter(msg => msg.startsWith('Price error'));
    expect((await service.getSnapshot(null)).priceError).toBe('Too many requests.');
    expect((await service.getSnapshot(null)).priceError).toBe('Too many requests.'); // from the failure kept
    expect(fetchesFor(api, '2026-01-15')).toBe(1);
    expect(fetchesFor(api, '2026-01-16')).toBe(1);
    // Logged once per failed fetch, not for every snapshot that gets the remembered failure.
    expect(priceErrors().sort()).toEqual(['Price error for 2026-01-15', 'Price error for 2026-01-16']);
    todayFails = false;
    vi.setSystemTime(NOW + MINUTE + 1);
    expect((await service.getSnapshot(null)).priceError).toBeNull();
    expect(fetchesFor(api, '2026-01-15')).toBe(2);
    expect(fetchesFor(api, '2026-01-16')).toBe(1);
    vi.setSystemTime(NOW + 15 * MINUTE + 1);
    await service.getSnapshot(null);
    expect(fetchesFor(api, '2026-01-16')).toBe(2);
    expect(priceErrors().filter(msg => msg.endsWith('2026-01-16'))).toHaveLength(2);
  });

  it('reads the usage history while the prices are still on their way', async () => {
    let releasePrices: () => void = () => {};
    const pricesHeld = new Promise<void>((resolve) => { releasePrices = resolve; });
    const { service, api } = setup();
    await service.getSnapshot('m1'); // tracks the meter
    vi.setSystemTime(NOW + 6 * MINUTE); // the usage is due again
    api.energy.getElectricityPriceType.mockImplementationOnce(async () => { await pricesHeld; return 'dynamic'; });
    (service as any).priceType = null; // re-read the price settings: held until released
    const snap = service.getSnapshot('m1');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.insights.getLogEntries.mock.calls.filter(([a]) => a.resolution === 'last24Hours')).toHaveLength(2);
    releasePrices();
    expect((await snap).priceError).toBeNull();
  });

  it('keeps complete days cached and retries partial ones after 15 minutes', async () => {
    const { service, api } = setup({ prices: ({ date }) => (date === '2026-01-16' ? {} : dayPrices(date)) });
    await service.getSnapshot(null);
    vi.setSystemTime(NOW + 10 * MINUTE);
    await service.getSnapshot(null);
    expect(fetchesFor(api, '2026-01-15')).toBe(1);
    expect(fetchesFor(api, '2026-01-16')).toBe(1);
    vi.setSystemTime(NOW + 16 * MINUTE);
    await service.getSnapshot(null);
    expect(fetchesFor(api, '2026-01-14')).toBe(1);
    expect(fetchesFor(api, '2026-01-15')).toBe(1);
    expect(fetchesFor(api, '2026-01-16')).toBe(2);
  });

  it.each([
    ['spring forward (23 h)', '2026-03-29T12:20:00', '2026-03-29'],
    ['fall back (25 h)', '2026-10-25T12:20:00', '2026-10-25'],
  ])('fills every slot across a DST change: %s', async (_, now, day) => {
    vi.setSystemTime(new Date(now).getTime());
    const { service, api } = setup({ prices: ({ date }) => dayPrices(date, t => t / HOUR % 1000) });
    const { prices } = await service.getSnapshot(null);
    expect(prices.every(p => p.price === p.start / HOUR % 1000)).toBe(true);
    vi.setSystemTime(new Date(now).getTime() + 16 * MINUTE); // past the partial-day retry
    await service.getSnapshot(null);
    expect(fetchesFor(api, day)).toBe(1); // a 23-hour day counts as complete
  });

  it('reads the currency once, from a string or an object', async () => {
    const { service, api } = setup({ currency: { currency: 'EUR' } });
    expect((await service.getSnapshot(null)).currency).toBe('EUR');
    await service.getSnapshot(null);
    expect(api.energy.getCurrency).toHaveBeenCalledTimes(1);
  });
});

describe('an older Homey Pro (homey-api V2: no price methods)', () => {
  /** homey-api's V2 energy manager, as an older Homey Pro (2016–2019) gets it: none of the price methods. */
  function v2Setup() {
    const ctx = setup();
    const lines: string[] = [];
    ctx.api.energy = { getOptionCurrency: vi.fn(), getLiveReport: vi.fn() } as any;
    const service = new ElectricityService(ctx.homey, (...args: unknown[]) => { lines.push(args.map(String).join(' ')); });
    return { ...ctx, service, lines };
  }

  it('has no prices and no error, like prices not set up, and logs each missing method once', async () => {
    const { service, lines } = v2Setup();
    const snap = await service.getSnapshot(null);
    expect(snap.priceError).toBeNull();
    expect(snap.fixedPrice).toBeNull();
    expect(snap.currency).toBeNull();
    expect(snap.prices).toHaveLength(49);
    expect(snap.prices.every(p => p.price == null)).toBe(true);
    vi.setSystemTime(NOW + 20 * MINUTE); // past the price settings' 5 min and a partial day's 15
    await service.getSnapshot(null);
    expect(lines.filter(l => l.includes('TypeError'))).toEqual([]);
    expect(lines.filter(l => l.includes('energy.')).sort()).toEqual([
      'getCurrency', 'getDynamicElectricityPriceUserCosts', 'getElectricityPriceType', 'fetchDynamicElectricityPrices',
    ].sort().map(m => `This Homey's API has no energy.${m}(); left out (an older Homey Pro has no dynamic electricity prices)`));
  });

  it('still shows the meter, and names the missing methods in the diagnostics', async () => {
    const { service } = v2Setup();
    const snap = await service.getSnapshot('m1');
    expect(snap.meterError).toBeFalsy();
    expect((await service.describe()).missingEnergyMethods).toEqual(expect.arrayContaining(['getElectricityPriceType', 'fetchDynamicElectricityPrices']));
  });

  it('gives the price history as missing days, not an error', async () => {
    const { service } = v2Setup();
    const answer = await service.getPriceHistory(NOW - 2 * 24 * HOUR, NOW);
    expect(answer.fixed).toBeNull();
    expect(answer.hours).toEqual([]);
  });
});

describe('fixed price', () => {
  const fixed = { priceType: 'fixed', fixedPrice: { value: { costs: { user_fixed_base: { value: 2 } } } } };

  it("fills every slot with Homey's fixed price and skips the spot prices", async () => {
    const { service, api } = setup(fixed);
    const { prices, fixedPrice, currency } = await service.getSnapshot(null);
    expect(fixedPrice).toBe(2);
    expect(prices).toHaveLength(49);
    expect(prices[24].start).toBe(HOUR_START);
    expect(prices.every(p => p.price === 2)).toBe(true);
    expect(currency).toBe('DKK');
    expect(api.energy.fetchDynamicElectricityPrices).not.toHaveBeenCalled();
  });

  it("uses the spot prices with dynamic prices, or when the type can't be read", async () => {
    const dynamic = setup();
    expect((await dynamic.service.getSnapshot(null)).fixedPrice).toBeNull();
    const failing = setup();
    failing.api.energy.getElectricityPriceType.mockRejectedValue(new Error('Not supported'));
    const snap = await failing.service.getSnapshot(null);
    expect(snap.fixedPrice).toBeNull();
    expect(snap.prices[24].price).toBe(1);
  });

  it('falls back to the spot prices when the fixed price is missing', async () => {
    const { service } = setup({ priceType: 'fixed' });
    const snap = await service.getSnapshot(null);
    expect(snap.fixedPrice).toBeNull();
    expect(snap.prices[24].price).toBe(1);
  });

  it('reads the price type again after 5 minutes', async () => {
    const { service, api } = setup(fixed);
    await service.getSnapshot(null);
    await service.getSnapshot(null);
    expect(api.energy.getElectricityPriceType).toHaveBeenCalledTimes(1);
    api.energy.getElectricityPriceType.mockResolvedValue('dynamic');
    vi.setSystemTime(NOW + 5 * MINUTE);
    expect((await service.getSnapshot(null)).fixedPrice).toBeNull();
    expect(api.energy.getElectricityPriceType).toHaveBeenCalledTimes(2);
  });
});

describe('price costs', () => {
  const costs = { priceCosts: { mathExpression: '{{([[price]]+0.5)*1.25}}' } };

  it("puts Homey Energy's costs on the spot prices, like its Energy tab", async () => {
    const { service } = setup(costs);
    const { prices, fixedPrice } = await service.getSnapshot(null);
    expect(fixedPrice).toBeNull();
    expect(prices[24].price).toBe(1.875); // (1 + 0.5) * 1.25
    expect(prices[0].price).toBe(1.875);
    expect(await service.describe()).toMatchObject({ priceType: 'dynamic', priceCosts: '{{([[price]]+0.5)*1.25}}' });
  });

  it('gives the bare spot prices with costs: false, without touching the shared costs', async () => {
    const { service } = setup(costs);
    expect((await service.getSnapshot(null, { costs: false })).prices[24].price).toBe(1);
    expect((await service.getSnapshot(null)).prices[24].price).toBe(1.875);
  });

  it("keeps the spot prices when the costs can't be read or used", async () => {
    const failing = setup();
    failing.api.energy.getDynamicElectricityPriceUserCosts.mockRejectedValue(new Error('Not Found'));
    expect((await failing.service.getSnapshot(null)).prices[24].price).toBe(1);
    const unknown = setup({ priceCosts: { mathExpression: '{{[[price]] * tariff()}}' } });
    expect((await unknown.service.getSnapshot(null)).prices[24].price).toBe(1);
  });

  it('ignores the costs with a fixed price', async () => {
    const { service, api } = setup({ ...costs, priceType: 'fixed', fixedPrice: { value: { costs: { user_fixed_base: { value: 2 } } } } });
    expect((await service.getSnapshot(null)).prices[24].price).toBe(2);
    expect(api.energy.getDynamicElectricityPriceUserCosts).not.toHaveBeenCalled();
  });

  it('reads a changed expression after 5 minutes, without fetching the spot prices again', async () => {
    const { service, api } = setup(costs);
    await service.getSnapshot(null);
    api.energy.getDynamicElectricityPriceUserCosts.mockResolvedValue({ mathExpression: '{{[[price]]*2}}' });
    vi.setSystemTime(NOW + 5 * MINUTE);
    expect((await service.getSnapshot(null)).prices[24].price).toBe(2);
    expect(fetchesFor(api, '2026-01-15')).toBe(1);
  });
});

describe('meter', () => {
  it('seeds the live readings from insights plus the current value', async () => {
    const { service, api } = setup({
      logEntries: ({ resolution }) => (resolution === 'lastHour'
        ? { values: [{ t: new Date(NOW - 10e3).toISOString(), v: 300.6 }, { t: new Date(NOW - 5e3).toISOString(), v: 400.2 }] }
        : { values: [] }),
    });
    const snap = await service.getSnapshot('m1');
    expect(snap.meterError).toBeNull();
    expect(snap.live).toEqual([{ t: NOW - 10e3, w: 301 }, { t: NOW - 5e3, w: 400 }, { t: NOW, w: 512 }]);
    expect(api.insights.getLogEntries).toHaveBeenCalledWith({ uri: 'homey:device:m1', id: 'homey:device:m1:energy_power', resolution: 'lastHour' });
  });

  it('falls back to the measure_power log', async () => {
    const { service, api } = setup({
      logs: [
        { id: 'homey:device:other:energy_power', ownerUri: 'homey:device:other', ownerId: 'energy_power' },
        { id: 'homey:device:m1:measure_power', ownerUri: 'homey:device:m1', ownerId: 'measure_power' },
      ],
    });
    await service.getSnapshot('m1');
    const read = (id: string) => api.insights.getLogEntries.mock.calls.filter(([a]) => a.id === id).map(([a]) => a.resolution);
    expect(read('homey:device:m1:measure_power').sort()).toEqual(['last24Hours', 'lastHour']);
    expect(api.insights.getLogs).not.toHaveBeenCalled();

    // Remembered after the meter is dropped: only measure_power is read again.
    service.start();
    await vi.advanceTimersByTimeAsync(11 * MINUTE);
    api.insights.getLogEntries.mockClear();
    await service.getSnapshot('m1');
    expect(api.insights.getLogEntries.mock.calls.every(([a]) => a.id === 'homey:device:m1:measure_power')).toBe(true);
    await service.stop();
  });

  it('shares one fetch per price day between concurrent snapshots', async () => {
    const { service, api } = setup();
    await Promise.all([service.getSnapshot(null), service.getSnapshot(null)]);
    expect(fetchesFor(api, '2026-01-15')).toBe(1);
    expect(api.energy.getCurrency).toHaveBeenCalledTimes(1);
  });

  it('reports a device without measure_power as a meter error, and still returns prices', async () => {
    const { service } = setup({ devices: [meter({ onoff: { value: true } })] });
    const snap = await service.getSnapshot('m1');
    expect(snap.meterError).toBe('Device Electricity Meter has no measure_power capability');
    expect(snap.live).toEqual([]);
    expect(snap.prices).toHaveLength(49);
  });

  it('pushes readings at most once a second, latest first', async () => {
    const device = meter();
    const { service, homey } = setup({ devices: [device] });
    await service.getSnapshot('m1');
    device.report('measure_power', 100);
    device.report('measure_power', 200);
    await vi.advanceTimersByTimeAsync(0);
    expect(homey.api.realtime.mock.calls).toEqual([[LIVE_EVENT, { deviceId: 'm1', t: NOW, w: 200 }]]);

    await vi.advanceTimersByTimeAsync(200);
    device.report('measure_power', 300);
    await vi.advanceTimersByTimeAsync(300);
    device.report('measure_power', 400.4);
    await vi.advanceTimersByTimeAsync(400);
    expect(homey.api.realtime).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100); // 1 s after the first push
    expect(homey.api.realtime).toHaveBeenCalledTimes(2);
    expect(homey.api.realtime.mock.calls[1]).toEqual([LIVE_EVENT, { deviceId: 'm1', t: NOW + 500, w: 400 }]);
    expect((await service.getSnapshot('m1')).live.map(p => p.w)).toEqual([512, 100, 200, 300, 400]);
  });

  it('trims readings past the hour but keeps one older than the window', async () => {
    const at = (min: number) => ({ t: new Date(NOW - min * MINUTE).toISOString(), v: min });
    const { service } = setup({
      logEntries: ({ resolution }) => ({ values: resolution === 'lastHour' ? [at(70), at(65), at(63), at(10)] : [] }),
    });
    service.start();
    await service.getSnapshot('m1');
    await vi.advanceTimersByTimeAsync(MINUTE); // one tick: cutoff = now - 62 min
    const { live } = await service.getSnapshot('m1');
    expect(live.map(p => p.w)).toEqual([63, 10, 512]);
    await service.stop();
  });

  it('stops tracking a meter after 10 minutes without a snapshot', async () => {
    const device = meter();
    const { service } = setup({ devices: [device] });
    service.start();
    await service.getSnapshot('m1');
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(device.listenerCount('measure_power')).toBe(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(device.listenerCount('measure_power')).toBe(0);
    await service.getSnapshot('m1');
    expect(device.listenerCount('measure_power')).toBe(1); // tracked again on request
    await service.stop();
  });

  it('re-reads a tracked meter: a deleted one is a meter error, not a frozen line', async () => {
    const device = meter();
    const devices = [device];
    const { service } = setup({ devices });
    expect((await service.getSnapshot('m1')).meterError).toBeNull();
    devices.length = 0;
    const snap = await service.getSnapshot('m1');
    expect(snap.meterError).toBe('No device m1');
    expect(snap.live).toEqual([]);
    expect(device.listenerCount('measure_power')).toBe(0);
  });

  it('keeps a tracked meter when a re-read only failed to answer in time', async () => {
    const device = meter();
    const { service, api } = setup({ devices: [device] });
    await service.getSnapshot('m1');
    api.devices.getDevice.mockRejectedValueOnce(Object.assign(new Error('Too many requests.'), { statusCode: 429 }));
    const snap = await service.getSnapshot('m1');
    expect(snap.meterError).toBeNull();
    expect(snap.live.length).toBeGreaterThan(0);
    expect(device.listenerCount('measure_power')).toBe(1);
  });

  it('subscribes to nothing when stopped while a meter is being tracked', async () => {
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    const device = meter();
    const { service, api } = setup({ devices: [device] });
    api.insights.getLogEntries.mockImplementation(async () => { await held; return { values: [] }; });
    service.start();
    const snap = service.getSnapshot('m1');
    await vi.advanceTimersByTimeAsync(0);
    await service.stop();
    release();
    expect((await snap).meterError).toMatch(/Stopped before m1 was tracked/);
    expect(device.listenerCount('measure_power')).toBe(0);
  });
});

describe('usage', () => {
  it('averages the 24 h log into 5-minute buckets from the first price slot', async () => {
    const first = HOUR_START - 24 * HOUR;
    const { service, api } = setup({
      logEntries: ({ resolution }) => (resolution === 'last24Hours'
        ? { values: [{ t: new Date(first + 6 * MINUTE).toISOString(), v: 100.4 }, { t: new Date(first + 8 * MINUTE).toISOString(), v: 200 }] }
        : { values: [] }),
    });
    const { usage } = await service.getSnapshot('m1');
    // No data for the first bucket; the second is the average; the rest carry it to now (10:20).
    expect(usage[0]).toEqual({ t: first + 5 * MINUTE, w: 150 });
    expect(usage.at(-1)).toEqual({ t: HOUR_START + 20 * MINUTE, w: 150 });
    expect(usage).toHaveLength(24 * 12 + 4);

    vi.setSystemTime(NOW + 4 * MINUTE);
    await service.getSnapshot('m1');
    vi.setSystemTime(NOW + 6 * MINUTE);
    await service.getSnapshot('m1');
    const reads = api.insights.getLogEntries.mock.calls.filter(([a]) => a.resolution === 'last24Hours').length;
    expect(reads).toBe(2); // cached for 5 minutes
  });

  it('looks for the power log again when none could be read at first', async () => {
    let busy = true;
    const { service } = setup({
      logEntries: ({ resolution }) => {
        if (busy) throw new Error('Too many requests.');
        return resolution === 'last24Hours'
          ? { values: [{ t: new Date(NOW - 30 * MINUTE).toISOString(), v: 300 }] }
          : { values: [{ t: new Date(NOW - 20 * MINUTE).toISOString(), v: 250 }] };
      },
    });
    const first = service.getSnapshot('m1');
    await vi.advanceTimersByTimeAsync(2e3); // the usage's second look waits out the Insights pause after a busy answer
    expect((await first).usage).toEqual([]);
    busy = false;
    vi.setSystemTime(NOW + 6 * MINUTE);
    const { usage, live } = await service.getSnapshot('m1');
    expect(usage.at(-1)?.w).toBe(300);
    expect(live[0]).toEqual({ t: NOW - 20 * MINUTE, w: 250 }); // the hour's history before the first reading
  });
});

describe('15-minute prices', () => {
  const QUARTER = 15 * MINUTE;
  /** Homey's response for a local day in a quarter-hour market: the hour / 10, plus 0.04 per quarter into it. */
  function quarterDayPrices(date: string) {
    const start = new Date(`${date}T00:00:00`).getTime();
    const end = new Date(new Date(start + 26 * HOUR).toDateString()).getTime();
    const pricesPerInterval = [];
    for (let t = start; t < end; t += QUARTER) {
      const d = new Date(t);
      pricesPerInterval.push({ periodStart: d.toISOString(), periodEnd: new Date(t + QUARTER).toISOString(), value: d.getHours() / 10 + d.getMinutes() / 15 * 0.04 });
    }
    return { priceUnit: 'EUR', interval: 15, pricesPerInterval };
  }

  it('adds the quarters, with index 96 at the current hour, and keeps the hourly averages', async () => {
    const { service } = setup({ prices: ({ date }) => quarterDayPrices(date) });
    const { prices, quarters } = await service.getSnapshot(null);
    expect(prices).toHaveLength(49);
    expect(prices[24].price).toBeCloseTo(1.06); // 10:00–11:00: 1 + (0 + 0.04 + 0.08 + 0.12) / 4
    expect(quarters).toHaveLength(196);
    expect(quarters![96]).toEqual({ start: HOUR_START, price: 1 });
    expect(quarters![97]).toEqual({ start: HOUR_START + QUARTER, price: 1.04 });
    expect(quarters![0].start).toBe(HOUR_START - 24 * HOUR);
    expect(quarters!.every(q => q.price != null)).toBe(true);
    expect((await service.getSnapshot(null, { futureHours: 36 })).quarters).toHaveLength(244);
    expect(await service.describe()).toMatchObject({ priceInterval: 15 });
  });

  it('puts the costs on each quarter', async () => {
    const { service } = setup({ prices: ({ date }) => quarterDayPrices(date), priceCosts: { mathExpression: '{{([[price]]+0.5)*1.25}}' } });
    const { quarters } = await service.getSnapshot(null);
    expect(quarters![97].price).toBe(1.925); // (1.04 + 0.5) * 1.25
    expect((await service.getSnapshot(null, { costs: false })).quarters![97].price).toBe(1.04);
  });

  it('repeats the hourly price for a day that has only hours', async () => {
    const { service } = setup({ prices: ({ date }) => (date === '2026-01-16' ? dayPrices(date) : quarterDayPrices(date)) });
    const { quarters } = await service.getSnapshot(null);
    const tomorrow = quarters!.filter(q => q.start >= new Date('2026-01-16T03:00:00').getTime() && q.start < new Date('2026-01-16T04:00:00').getTime());
    expect(tomorrow.map(q => q.price)).toEqual([0.3, 0.3, 0.3, 0.3]);
  });

  it('reports the real interval in the diagnostics: 30 minutes is not 15', async () => {
    /** A 30-minute market's day, with or without Homey's `interval` field. */
    const halfHourDay = (date: string, withInterval: boolean) => {
      const res: any = quarterDayPrices(date);
      res.pricesPerInterval = res.pricesPerInterval.filter((_: any, i: number) => i % 2 === 0);
      if (withInterval) res.interval = 30;
      else delete res.interval;
      return res;
    };
    for (const withInterval of [true, false]) {
      const { service } = setup({ prices: ({ date }) => halfHourDay(date, withInterval) });
      const { quarters } = await service.getSnapshot(null);
      expect(quarters![97]).toEqual({ start: HOUR_START + QUARTER, price: 1 }); // the 10:00–10:30 price
      expect(await service.describe()).toMatchObject({ priceInterval: 30 });
    }
  });

  it("takes Homey's interval, else the shortest gap between prices", () => {
    const at = (minutes: number) => ({ t: HOUR_START + minutes * MINUTE, w: 1 });
    expect(priceInterval({ interval: 15 }, [at(0), at(60)])).toBe(15);
    expect(priceInterval({}, [at(0), at(30), at(60)])).toBe(30);
    expect(priceInterval({ interval: 'x' }, [at(0), at(15), at(60)])).toBe(15);
    expect(priceInterval(null, [at(0)])).toBeNull();
    expect(priceInterval({ interval: 0 }, [])).toBeNull();
  });

  it('has no quarters in an hourly market or with a fixed price', async () => {
    const hourly = setup();
    expect((await hourly.service.getSnapshot(null)).quarters).toBeNull();
    expect(await hourly.service.describe()).toMatchObject({ priceInterval: 60 });
    const fixed = setup({ prices: ({ date }) => quarterDayPrices(date), priceType: 'fixed', fixedPrice: { value: { costs: { user_fixed_base: { value: 2 } } } } });
    expect((await fixed.service.getSnapshot(null)).quarters).toBeNull();
  });
});

describe('price history (Chart · Totals\' cost, 1.2.0)', () => {
  it('finds the same local days as asking for every hour, over DST changes and with few asks', () => {
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' });
    const known = new Map<number, string>();
    const local = (t: number) => {
      if (!known.has(t)) known.set(t, format.format(t));
      return known.get(t)!;
    };
    const everyHour = (start: number, end: number) => {
      const days = new Set<string>();
      for (let t = start; t < end; t += HOUR) days.add(local(t));
      return days;
    };
    // Every start and length around the 23-hour day (29 March 2026) and the 25-hour one (25 October 2026).
    for (const around of [Date.UTC(2026, 2, 29), Date.UTC(2026, 9, 25)]) {
      for (let s = -30; s < 30; s++) {
        for (let hours = 0; hours < 80; hours++) {
          const start = around + s * HOUR;
          expect(hoursDays(start, start + hours * HOUR, local)).toEqual(everyHour(start, start + hours * HOUR));
          expect(hoursDays(start, start + hours * HOUR - 1, local)).toEqual(everyHour(start, start + hours * HOUR - 1));
        }
      }
    }
    const asked = vi.fn(local);
    const start = Date.UTC(2024, 0, 1);
    const end = start + 734 * 24 * HOUR;
    expect(hoursDays(start, end, asked)).toEqual(everyHour(start, end));
    expect(asked.mock.calls.length).toBeLessThan(1500);
  });

  const day = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
  function history(opts: FakeApiOptions = {}, storage = memoryStorage()) {
    const api = fakeApi({ devices: [], prices: ({ date }) => dayPrices(date), ...opts });
    const homey = fakeHomey(api);
    const log = vi.fn();
    const service = new ElectricityService(homey, log, () => {}, storage);
    return { api, homey, service, storage, log };
  }

  it('gives every hour from the start to now, with the costs, and keeps finished days in its file', async () => {
    const storage = memoryStorage();
    const { api, service } = history({ priceCosts: { mathExpression: '{{[[price]]*2}}' } }, storage);
    const from = day('2026-01-05');
    const res = await service.getPriceHistory(from, NOW);
    expect(res).toMatchObject({ currency: 'DKK', fixed: null, missing: 0, pending: 0 });
    expect(res.hours).toHaveLength(10 * 24 + 11); // ten whole days and today's hours up to the current one, 10:00
    expect(res.hours[0]).toEqual([from, 0]);
    expect(res.hours[13]).toEqual([from + 13 * HOUR, 2.6]); // 13:00 at 1.3, doubled
    expect(res.hours.at(-1)).toEqual([HOUR_START, 2]);
    expect(api.energy.fetchDynamicElectricityPrices).toHaveBeenCalledTimes(11);
    // Written 30 s later, the ten finished days only; another start reads them from there.
    await vi.advanceTimersByTimeAsync(30e3);
    expect(Object.keys(JSON.parse(storage.text!).days)).toHaveLength(10);
    const again = history({}, storage);
    expect((await again.service.getPriceHistory(from, NOW)).hours).toHaveLength(251);
    expect(again.api.energy.fetchDynamicElectricityPrices.mock.calls.map(([a]) => a.date)).toEqual(['2026-01-15']);
    expect(await again.service.describe()).toMatchObject({ priceHistoryDays: 10 });
  });

  it('counts a day without prices as missing, and asks for it again only after 6 hours', async () => {
    const { api, service } = history({ prices: ({ date }) => (date === '2026-01-10' ? { pricesPerInterval: [] } : dayPrices(date)) });
    const res = await service.getPriceHistory(day('2026-01-09'), day('2026-01-12'));
    expect([res.hours.length, res.missing, res.pending]).toEqual([2 * 24, 1, 0]);
    await service.getPriceHistory(day('2026-01-09'), day('2026-01-12'));
    expect(fetchesFor(api, '2026-01-10')).toBe(1);
    vi.setSystemTime(NOW + 6 * HOUR);
    await service.getPriceHistory(day('2026-01-09'), day('2026-01-12'));
    expect(fetchesFor(api, '2026-01-10')).toBe(2);
    expect(fetchesFor(api, '2026-01-09')).toBe(1);
  });

  it('answers within 8 s with the days read so far, reading three at a time', async () => {
    let running = 0, most = 0;
    const { service } = history({
      prices: async ({ date }) => {
        running++;
        most = Math.max(most, running);
        await new Promise(r => setTimeout(r, 1000));
        running--;
        return dayPrices(date);
      },
    });
    const p = service.getPriceHistory(day('2025-12-01'), day('2026-01-01'));
    await vi.advanceTimersByTimeAsync(8e3);
    const res = await p;
    expect(res.hours.length / 24).toBeGreaterThan(20); // 24 days read
    expect(res.pending).toBeGreaterThan(0);
    expect(most).toBe(3);
    await vi.advanceTimersByTimeAsync(5e3);
    const done = await service.getPriceHistory(day('2025-12-01'), day('2026-01-01'));
    expect([done.hours.length, done.missing, done.pending]).toEqual([31 * 24, 0, 0]);
  });

  it('gives the fixed price instead of hours', async () => {
    const { service } = history({ priceType: 'fixed', fixedPrice: { value: { costs: { user_fixed_base: { value: 2 } } } } });
    expect(await service.getPriceHistory(day('2026-01-01'), NOW)).toEqual({ currency: 'DKK', fixed: 2, hours: [], missing: 0, pending: 0 });
  });

  it('lets go of the kept days 10 minutes after the last ask, writing them first, and reads them again from the file', async () => {
    const storage = memoryStorage();
    const { api, service } = history({}, storage);
    const kept = () => (service as any).history.loaded;
    await service.getPriceHistory(day('2026-01-09'), day('2026-01-12'));
    expect(kept()).toBe(true);
    await vi.advanceTimersByTimeAsync(9 * 60e3);
    await service.getPriceHistory(day('2026-01-09'), day('2026-01-12')); // asked again: kept 10 min from now
    await vi.advanceTimersByTimeAsync(9 * 60e3);
    expect(kept()).toBe(true);
    await vi.advanceTimersByTimeAsync(60e3);
    expect(kept()).toBe(false);
    expect(Object.keys(JSON.parse(storage.text!).days)).toEqual(['2026-01-09', '2026-01-10', '2026-01-11']);
    api.energy.fetchDynamicElectricityPrices.mockClear();
    expect((await service.getPriceHistory(day('2026-01-09'), day('2026-01-12'))).hours).toHaveLength(3 * 24);
    expect(api.energy.fetchDynamicElectricityPrices).not.toHaveBeenCalled();
    await service.stop();
  });

  it("counts the kept days for the diagnostics without keeping them, and writes nothing for a read that ends after stop", async () => {
    const storage = memoryStorage(JSON.stringify({ v: 1, days: { '2026-01-09': [[day('2026-01-09'), 1]] } }));
    let answer: () => void = () => {};
    const { service } = history({
      prices: async ({ date }) => { await new Promise<void>((r) => { answer = r; }); return dayPrices(date); },
    }, storage);
    expect(await service.describe()).toMatchObject({ priceHistoryDays: 1 });
    expect((service as any).history.loaded).toBe(false);
    const write = vi.spyOn(storage, 'write');
    const p = service.getPriceHistory(day('2026-01-10'), day('2026-01-11'));
    await vi.advanceTimersByTimeAsync(8e3);
    await p; // answered without the day, still being read
    await service.stop();
    answer();
    await vi.advanceTimersByTimeAsync(60e3);
    expect(write).not.toHaveBeenCalled();
  });

  it('reads a damaged file as empty and logs it', async () => {
    const { service, log } = history({}, memoryStorage('{not json'));
    expect((await service.getPriceHistory(day('2026-01-14'), day('2026-01-15'))).hours).toHaveLength(24);
    expect(log).toHaveBeenCalledWith('The price history file could not be read:', expect.any(String));
  });
});
