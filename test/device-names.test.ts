import { describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import {
  DEVICE_NAMES_EVENT, DEVICE_NAMES_SETTING, deviceNamesState, nameRule, setDeviceNames, shortName, shownName, type NameRule,
} from '../lib/deviceNames.js';
import Diagnostics from '../lib/Diagnostics.js';
import api from '../api.js';

vi.mock('homey-api', () => homeyApiMock);

const rule = (mode: NameRule['mode'], separator = '|'): NameRule => ({ mode, separator });

describe('shortName', () => {
  it('shows the whole name by default', () => {
    expect(shortName('Ceiling lamp | Kitchen', rule('full'))).toBe('Ceiling lamp | Kitchen');
  });

  it('takes the part before the first separator, or after the last one, trimmed', () => {
    expect(shortName('Ceiling lamp | Kitchen', rule('before'))).toBe('Ceiling lamp');
    expect(shortName('Ceiling lamp | Kitchen | 1st', rule('before'))).toBe('Ceiling lamp');
    expect(shortName('Kitchen | Ceiling lamp', rule('after'))).toBe('Ceiling lamp');
    expect(shortName('1st | Kitchen | Ceiling lamp', rule('after'))).toBe('Ceiling lamp');
    expect(shortName('Ceiling lamp|Kitchen', rule('before'))).toBe('Ceiling lamp');
  });

  it('keeps the whole name without the separator, or when the part would be empty', () => {
    expect(shortName('Ceiling lamp', rule('before'))).toBe('Ceiling lamp');
    expect(shortName('Ceiling lamp', rule('after'))).toBe('Ceiling lamp');
    expect(shortName('| Kitchen', rule('before'))).toBe('| Kitchen');
    expect(shortName('Kitchen |  ', rule('after'))).toBe('Kitchen |  ');
    expect(shortName('', rule('before'))).toBe('');
    expect(shortName('', rule('lastWord'))).toBe('');
  });

  it('uses the separator as typed: spaces count, and it may be several characters', () => {
    expect(shortName('Wi-Fi plug - Office', rule('before', ' - '))).toBe('Wi-Fi plug');
    expect(shortName('Wi-Fi plug', rule('before', ' - '))).toBe('Wi-Fi plug');
    expect(shortName('Lamp :: Hall', rule('after', '::'))).toBe('Hall');
    expect(shortName('Kitchen ceiling lamp', rule('before', ' '))).toBe('Kitchen');
  });

  it('takes the last word', () => {
    expect(shortName('Kitchen ceiling lamp', rule('lastWord'))).toBe('lamp');
    expect(shortName('  Kitchen\tlamp  ', rule('lastWord'))).toBe('lamp');
    expect(shortName('Lamp', rule('lastWord'))).toBe('Lamp');
  });
});

describe('nameRule', () => {
  it('reads a missing or broken setting as full names with `|`', () => {
    for (const v of [null, undefined, 'before', 42, [], {}, { mode: 'first' }, { mode: '__proto__' }]) {
      expect(nameRule(v)).toEqual({ mode: 'full', separator: '|' });
    }
  });

  it('keeps a known mode and a separator of 1–5 characters', () => {
    expect(nameRule({ mode: 'after', separator: ' - ' })).toEqual({ mode: 'after', separator: ' - ' });
    expect(nameRule({ mode: 'before', separator: '' })).toEqual({ mode: 'before', separator: '|' });
    expect(nameRule({ mode: 'before', separator: '123456' })).toEqual({ mode: 'before', separator: '|' });
    expect(nameRule({ mode: 'lastWord', separator: 7 })).toEqual({ mode: 'lastWord', separator: '|' });
  });
});

describe('the setting', () => {
  function setup(names = ['Ceiling lamp | Kitchen', 'Sofa light | Living room', 'Hall', 'Desk | Office', 'Bed | Bedroom']) {
    const devices = names.map((name, i) => fakeDevice({ id: `d${i}`, name, caps: {} }));
    const homey = fakeHomey(fakeApi({ devices }));
    const log = vi.fn();
    homey.app = { log, debug: vi.fn() };
    return { homey, log };
  }

  it('shows the full names until it is set', () => {
    const { homey } = setup();
    expect(shownName(homey, 'Ceiling lamp | Kitchen')).toBe('Ceiling lamp | Kitchen');
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'before', separator: '|' });
    expect(shownName(homey, 'Ceiling lamp | Kitchen')).toBe('Ceiling lamp');
  });

  it('answers the rule with three of the names it changes, by name, and the counts', async () => {
    const { homey } = setup();
    expect(await deviceNamesState(homey, vi.fn())).toEqual({ mode: 'full', separator: '|', examples: [], changed: 0, total: 5 });
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'before', separator: '|' });
    expect(await api.getDeviceNames({ homey })).toEqual({
      mode: 'before',
      separator: '|',
      examples: [
        { name: 'Bed | Bedroom', shown: 'Bed' },
        { name: 'Ceiling lamp | Kitchen', shown: 'Ceiling lamp' },
        { name: 'Desk | Office', shown: 'Desk' },
      ],
      changed: 4,
      total: 5,
    });
  });

  it('answers the rule alone when the devices can\'t be read', async () => {
    const { homey, log } = setup();
    homey.fakeApi.devices.getDevices.mockRejectedValue(new Error('Too many requests'));
    expect(await deviceNamesState(homey, log)).toEqual({ mode: 'full', separator: '|' });
    expect(log).toHaveBeenCalledWith('Device names: the devices could not be read:', expect.any(Error));
  });

  it('stores a choice and tells open widgets when it changed', async () => {
    const { homey } = setup();
    const saved = await api.putDeviceNames({ homey, body: { mode: 'after', separator: ' | ' } });
    expect(saved).toMatchObject({ ok: true, mode: 'after', separator: ' | ', changed: 4, total: 5 });
    expect(homey.settings.get(DEVICE_NAMES_SETTING)).toEqual({ mode: 'after', separator: ' | ' });
    expect(homey.api.realtime).toHaveBeenCalledWith(DEVICE_NAMES_EVENT, { mode: 'after', separator: ' | ' });
    homey.api.realtime.mockClear();
    // The same again changes nothing a widget shows; without a separator, the stored one stays.
    await setDeviceNames(homey, vi.fn(), { mode: 'after' });
    expect(homey.api.realtime).not.toHaveBeenCalled();
    await setDeviceNames(homey, vi.fn(), { mode: 'lastWord' });
    expect(homey.settings.get(DEVICE_NAMES_SETTING)).toEqual({ mode: 'lastWord', separator: ' | ' });
    expect(homey.api.realtime).toHaveBeenCalledTimes(1);
  });

  it('is in the diagnostics report', async () => {
    const { homey } = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: ' - ' });
    expect((await new Diagnostics(homey).report(undefined)).deviceNames).toEqual({ mode: 'after', separator: ' - ' });
  });

  it('refuses an unknown mode, and an empty or too long separator', async () => {
    const { homey } = setup();
    await expect(api.putDeviceNames({ homey, body: { mode: 'first' } })).rejects.toThrow('Invalid mode');
    await expect(api.putDeviceNames({ homey, body: {} as any })).rejects.toThrow('Invalid mode');
    expect(await api.putDeviceNames({ homey, body: { mode: 'before', separator: '' } })).toEqual({ ok: false, reason: 'separator' });
    expect(await api.putDeviceNames({ homey, body: { mode: 'before', separator: '123456' } })).toEqual({ ok: false, reason: 'separator' });
    expect(await api.putDeviceNames({ homey, body: { mode: 'before', separator: 5 } })).toEqual({ ok: false, reason: 'separator' });
    expect(homey.settings.set).not.toHaveBeenCalled();
    expect(homey.api.realtime).not.toHaveBeenCalled();
  });
});

describe('where the rule is applied', () => {
  // Not in DeviceTracker, whose `name` stays full for logs and labels, but where each service builds a widget's answer. So
  // a new service that tracks devices for a widget has to apply it too, or say here why it doesn't.
  const NOT_SHOWN: Record<string, string> = {
    'ElectricityService.ts': 'the Electricity Overview shows no device name',
    'ThermostatService.ts': "its getState() keeps the full name for the Flow token; widgets/thermostat/api.ts' thermostatState() shortens it",
  };

  it('is applied by every service that tracks devices for a widget', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const tracked = readdirSync('lib').filter(f => f.endsWith('Service.ts') && readFileSync(`lib/${f}`, 'utf8').includes('new DeviceTracker'));
    expect(tracked.length).toBeGreaterThan(5);
    for (const f of tracked) {
      if (NOT_SHOWN[f]) continue;
      expect(readFileSync(`lib/${f}`, 'utf8'), f).toMatch(/shownName\(this\.homey, /);
    }
    expect(readFileSync('widgets/thermostat/api.ts', 'utf8')).toMatch(/shownName\(homey, /);
  });
});
