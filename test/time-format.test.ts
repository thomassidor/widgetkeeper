// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api.js';
import Diagnostics from '../lib/Diagnostics.js';
import { TIME_FORMAT_EVENT, TIME_FORMAT_SETTING, setTimeFormat, timeFormatOf, timeFormatRoutes } from '../lib/timeFormat.js';
import { fakeApi, fakeHomey } from './helpers/fakeHomey.js';
import { runFile } from './helpers/loadWidget.js';

// The app's Time format (1.3.0): one app setting, set on the settings page, which every widget that shows a time follows.
runFile('widgets/spacer/public/kit.js');
const kit = (window as any).WidgetkeeperKit;
const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 4, h, m, s).getTime();

describe('the app setting', () => {
  it('is Automatic until it is set, and when it is broken', () => {
    const homey = fakeHomey(fakeApi());
    expect(timeFormatOf(homey as any)).toBe('auto');
    homey.settings.set(TIME_FORMAT_SETTING, '13');
    expect(timeFormatOf(homey as any)).toBe('auto');
  });

  it('stores a choice and tells open widgets when it changed', async () => {
    const homey = fakeHomey(fakeApi());
    expect(await (api as any).putTimeFormat({ homey, body: { timeFormat: '12' } })).toEqual({ ok: true, timeFormat: '12' });
    expect(homey.settings.get(TIME_FORMAT_SETTING)).toBe('12');
    expect(homey.api.realtime).toHaveBeenCalledWith(TIME_FORMAT_EVENT, { timeFormat: '12' });
    homey.api.realtime.mockClear();
    setTimeFormat(homey as any, { timeFormat: '12' });
    expect(homey.api.realtime).not.toHaveBeenCalled();
    expect(await (api as any).getTimeFormat({ homey })).toEqual({ timeFormat: '12' });
    // The widgets' route answers the same.
    expect(await timeFormatRoutes.getTimeFormat({ homey: homey as any })).toEqual({ timeFormat: '12' });
  });

  it('refuses another value', () => {
    const homey = fakeHomey(fakeApi());
    expect(setTimeFormat(homey as any, { timeFormat: 'am' })).toEqual({ ok: false });
    expect(setTimeFormat(homey as any, null)).toEqual({ ok: false });
    expect(homey.settings.get(TIME_FORMAT_SETTING)).toBeNull();
  });

  it('is in the diagnostics report', async () => {
    const homey = fakeHomey(fakeApi());
    homey.settings.set(TIME_FORMAT_SETTING, '24');
    expect((await new Diagnostics(homey as any).report(undefined)).timeFormat).toBe('24');
  });
});

describe('the kit', () => {
  afterEach(() => { kit.setTimeFormat('auto'); });

  it('writes clock times as the widgets did in 24 hours, the locale\'s way in 12', () => {
    kit.setTimeFormat('24');
    expect(kit.clockTime(at(6, 5))).toBe('06:05');
    expect(kit.clockTime(at(6, 5), { pad: false })).toBe('6:05');
    expect(kit.clockTime(at(18, 5, 9), { seconds: true })).toBe('18:05:09');
    expect(kit.hourLabel(6)).toBe('06');
    expect(kit.hourLabel(24)).toBe('24');
    expect(kit.hourLabel(at(14))).toBe('14');
    kit.setTimeFormat('12');
    expect(kit.clockTime(at(18, 5), { locale: 'en-US' })).toMatch(/^6:05\sPM$/);
    expect(kit.clockTime(at(18, 5, 9), { locale: 'en-US', seconds: true })).toMatch(/^6:05:09\sPM$/);
    expect(kit.hourLabel(6, { locale: 'en-US' })).toMatch(/^6\sAM$/);
    expect(kit.hourLabel(24, { locale: 'en-US' })).toMatch(/^12\sAM$/);
    // A widget's own format wins over the app's.
    expect(kit.clockTime(at(18, 5), { timeFormat: '24' })).toBe('18:05');
  });

  it('follows the locale when Automatic', () => {
    kit.setTimeFormat('auto');
    expect(kit.uses12Hours('en-US')).toBe(true);
    expect(kit.uses12Hours('da-DK')).toBe(false);
    expect(kit.clockTime(at(18, 5), { locale: 'da-DK' })).toBe('18:05');
    expect(kit.timeFormatter('en-GB').format(at(18, 5))).toBe('18:05');
  });

  it('keeps the last format for the next load, and reads anything else as Automatic', () => {
    expect(kit.setTimeFormat('12')).toBe(true);
    expect(kit.setTimeFormat('12')).toBe(false);
    expect(window.localStorage.getItem('widgetkeeper.timeFormat')).toBe('12');
    runFile('widgets/spacer/public/kit.js');
    expect((window as any).WidgetkeeperKit.getTimeFormat()).toBe('12');
    expect(kit.setTimeFormat('x')).toBe(true);
    expect(kit.getTimeFormat()).toBe('auto');
  });

  describe('wireTimeFormat()', () => {
    beforeEach(() => { vi.useFakeTimers(); kit.setTimeFormat('24'); });
    afterEach(() => { vi.useRealTimers(); });

    it('asks after the widget\'s own request, then follows the realtime event', async () => {
      const handlers: Record<string, (d: any) => void> = {};
      const Homey = { api: vi.fn(async () => ({ timeFormat: '12' })), on: (e: string, fn: any) => { handlers[e] = fn; } };
      const changed = vi.fn();
      kit.wireTimeFormat(Homey, changed);
      expect(Homey.api).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(0);
      expect(Homey.api).toHaveBeenCalledWith('GET', '/time-format');
      expect([kit.getTimeFormat(), changed.mock.calls.length]).toEqual(['12', 1]);
      handlers['timeformat:state']({ timeFormat: '12' });
      expect(changed).toHaveBeenCalledTimes(1);
      handlers['timeformat:state']({ timeFormat: '24' });
      expect([kit.getTimeFormat(), changed.mock.calls.length]).toEqual(['24', 2]);
    });

    it('keeps the format it has when the app answers without one or fails', async () => {
      const changed = vi.fn();
      kit.wireTimeFormat({ api: vi.fn(async () => ({ charts: [] })), on: () => {} }, changed);
      kit.wireTimeFormat({ api: vi.fn(async () => { throw new Error('Not Found'); }), on: () => {} }, changed);
      kit.wireTimeFormat({ api: () => { throw new Error('no api'); }, on: () => { throw new Error('no on'); } }, changed);
      await vi.advanceTimersByTimeAsync(0);
      expect([kit.getTimeFormat(), changed.mock.calls.length]).toEqual(['24', 0]);
    });
  });
});
