import { describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import {
  DEVICE_NAMES_EVENT, DEVICE_NAMES_SETTING, deviceNamer, deviceNamesState, nameRule, roomNamer, setDeviceNames, shortName,
  shownFlowName, shownName, withoutRoom, type NameRule,
} from '../lib/deviceNames.js';
import CurtainService from '../lib/CurtainService.js';
import FlowService from '../lib/FlowService.js';
import QuickActionService from '../lib/QuickActionService.js';
import { thermostatState } from '../widgets/thermostat/api.js';
import Diagnostics from '../lib/Diagnostics.js';
import api from '../api.js';

vi.mock('homey-api', () => homeyApiMock);

const rule = (mode: NameRule['mode'], separator = '|'): NameRule => ({ mode, separator, apply: ['devices'] });

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

describe('withoutRoom', () => {
  it('takes the room off the start, keeping a capital', () => {
    expect(withoutRoom('Kitchen ceiling lamp', 'Kitchen')).toBe('Ceiling lamp');
    expect(withoutRoom('kitchen ceiling lamp', 'Kitchen')).toBe('ceiling lamp');
    expect(withoutRoom('Kitchen - ceiling lamp', 'Kitchen')).toBe('Ceiling lamp');
    expect(withoutRoom('Kitchen | Ceiling lamp', 'Kitchen')).toBe('Ceiling lamp');
    expect(withoutRoom('Living room: floor lamp', 'Living room')).toBe('Floor lamp');
    expect(withoutRoom('Køkken loftlampe', 'køkken')).toBe('Loftlampe');
  });

  it('takes the room off the end, in brackets too', () => {
    expect(withoutRoom('Ceiling lamp Kitchen', 'Kitchen')).toBe('Ceiling lamp');
    expect(withoutRoom('Ceiling lamp (Kitchen)', 'Kitchen')).toBe('Ceiling lamp');
    expect(withoutRoom('Ceiling lamp - kitchen', 'Kitchen')).toBe('Ceiling lamp');
  });

  it('only takes whole words, and nothing without a room', () => {
    expect(withoutRoom('Kitchenette lamp', 'Kitchen')).toBe('');
    expect(withoutRoom('Lamp in the Kitchen area', 'Kitchen')).toBe('');
    expect(withoutRoom('Kitchen', 'Kitchen')).toBe('');
    expect(withoutRoom('Kitchen lamp', null)).toBe('');
    expect(withoutRoom('Kitchen lamp', '  ')).toBe('');
    expect(withoutRoom('Room (1) lamp', 'Room (1)')).toBe('Lamp');
  });

  it('keeps the whole name in the room mode when the room isn\'t in it', () => {
    expect(shortName('Kitchen ceiling lamp', rule('room'), 'Kitchen')).toBe('Ceiling lamp');
    expect(shortName('Kitchen', rule('room'), 'Kitchen')).toBe('Kitchen');
    expect(shortName('Desk lamp', rule('room'), 'Kitchen')).toBe('Desk lamp');
    expect(shortName('Kitchen lamp', rule('room'))).toBe('Kitchen lamp');
    expect(shortName('Kitchen lamp', rule('before'), 'Kitchen')).toBe('Kitchen lamp');
  });
});

describe('nameRule', () => {
  it('reads a missing or broken setting as full names with `|`', () => {
    for (const v of [null, undefined, 'before', 42, [], {}, { mode: 'first' }, { mode: '__proto__' }]) {
      expect(nameRule(v)).toEqual({ mode: 'full', separator: '|', apply: ['devices'] });
    }
  });

  it('applies to devices only when stored before the checkboxes; keeps known kinds once, in order', () => {
    expect(nameRule({ mode: 'after', separator: '|' }).apply).toEqual(['devices']);
    expect(nameRule({ mode: 'after', apply: 'rooms' }).apply).toEqual(['devices']);
    expect(nameRule({ mode: 'after', apply: [] }).apply).toEqual([]);
    expect(nameRule({ mode: 'after', apply: ['flows', 'rooms', 'flows', 'zones', '__proto__'] }).apply).toEqual(['rooms', 'flows']);
  });

  it('keeps a known mode and a separator of 1–5 characters', () => {
    expect(nameRule({ mode: 'after', separator: ' - ' })).toMatchObject({ mode: 'after', separator: ' - ' });
    expect(nameRule({ mode: 'before', separator: '' })).toMatchObject({ mode: 'before', separator: '|' });
    expect(nameRule({ mode: 'before', separator: '123456' })).toMatchObject({ mode: 'before', separator: '|' });
    expect(nameRule({ mode: 'lastWord', separator: 7 })).toMatchObject({ mode: 'lastWord', separator: '|' });
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
    expect(await deviceNamesState(homey, vi.fn())).toEqual({ mode: 'full', separator: '|', apply: ['devices'], examples: [], changed: 0, total: 5 });
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'before', separator: '|' });
    expect(await api.getDeviceNames({ homey })).toEqual({
      mode: 'before',
      separator: '|',
      apply: ['devices'],
      examples: [
        { name: 'Bed | Bedroom', shown: 'Bed' },
        { name: 'Ceiling lamp | Kitchen', shown: 'Ceiling lamp' },
        { name: 'Desk | Office', shown: 'Desk' },
      ],
      changed: 4,
      total: 5,
    });
  });

  it('names devices by their room with Leave out the room, reading the zones only then', async () => {
    const devices = [
      fakeDevice({ id: 'lamp', name: 'Kitchen lamp', zone: 'k', caps: { onoff: { type: 'boolean', value: true } }, ui: { quickAction: 'onoff' } }),
      fakeDevice({ id: 'desk', name: 'Office desk', zone: 'gone', caps: {} }),
    ];
    const homey = fakeHomey(fakeApi({ devices, zones: { k: { name: 'Kitchen' } } }));
    homey.app = { log: vi.fn(), debug: vi.fn() };
    const show = await deviceNamer(homey, null, vi.fn(), 'Test');
    expect(show('Kitchen lamp', 'k')).toBe('Kitchen lamp');
    expect(homey.fakeApi.zones.getZones).not.toHaveBeenCalled();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'room', separator: '|' });
    const room = await deviceNamer(homey, null, vi.fn(), 'Test');
    expect(room('Kitchen lamp', 'k')).toBe('Lamp');
    expect(room('Office desk', 'gone')).toBe('Office desk');
    expect(room('Kitchen lamp', null)).toBe('Kitchen lamp');
    expect(room('Kitchen lamp', '__proto__')).toBe('Kitchen lamp');
    // Through a service's answer, and on the settings page.
    expect(await new QuickActionService(homey, () => {}).getState(['lamp'])).toMatchObject([{ id: 'lamp', name: 'Lamp' }]);
    expect(await deviceNamesState(homey, vi.fn())).toEqual({
      mode: 'room', separator: '|', apply: ['devices'], examples: [{ name: 'Kitchen lamp', shown: 'Lamp' }], changed: 1, total: 2,
    });
  });

  it('names a thermostat by its room, without sending the zone on', async () => {
    const homey = fakeHomey(fakeApi({ zones: { k: { name: 'Kitchen' } } }));
    homey.app = { log: vi.fn() };
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'room', separator: '|' });
    const app = { thermostat: { getState: vi.fn(async () => ({ name: 'Kitchen thermostat', zone: 'k', icon: null, values: {}, caps: {} })) }, values: { getState: vi.fn() } };
    const state = await thermostatState(homey, app as any, 't1');
    expect(state).toEqual({ name: 'Thermostat', icon: null, values: {}, caps: {} });
  });

  it('answers the rule alone when the devices can\'t be read', async () => {
    const { homey, log } = setup();
    homey.fakeApi.devices.getDevices.mockRejectedValue(new Error('Too many requests'));
    expect(await deviceNamesState(homey, log)).toEqual({ mode: 'full', separator: '|', apply: ['devices'] });
    expect(log).toHaveBeenCalledWith('Device names: the devices could not be read:', expect.any(Error));
  });

  it('stores a choice and tells open widgets when it changed', async () => {
    const { homey } = setup();
    const saved = await api.putDeviceNames({ homey, body: { mode: 'after', separator: ' | ' } });
    expect(saved).toMatchObject({ ok: true, mode: 'after', separator: ' | ', changed: 4, total: 5 });
    expect(homey.settings.get(DEVICE_NAMES_SETTING)).toEqual({ mode: 'after', separator: ' | ', apply: ['devices'] });
    expect(homey.api.realtime).toHaveBeenCalledWith(DEVICE_NAMES_EVENT, { mode: 'after', separator: ' | ', apply: ['devices'] });
    homey.api.realtime.mockClear();
    // The same again changes nothing a widget shows; without a separator, the stored one stays.
    await setDeviceNames(homey, vi.fn(), { mode: 'after' });
    expect(homey.api.realtime).not.toHaveBeenCalled();
    await setDeviceNames(homey, vi.fn(), { mode: 'lastWord' });
    expect(homey.settings.get(DEVICE_NAMES_SETTING)).toEqual({ mode: 'lastWord', separator: ' | ', apply: ['devices'] });
    expect(homey.api.realtime).toHaveBeenCalledTimes(1);
    // Ticking a kind is a change too; without `apply` the stored one stays.
    await setDeviceNames(homey, vi.fn(), { mode: 'lastWord', apply: ['rooms', 'devices'] });
    expect(homey.settings.get(DEVICE_NAMES_SETTING)).toEqual({ mode: 'lastWord', separator: ' | ', apply: ['devices', 'rooms'] });
    expect(homey.api.realtime).toHaveBeenCalledTimes(2);
    await setDeviceNames(homey, vi.fn(), { mode: 'lastWord' });
    expect(homey.api.realtime).toHaveBeenCalledTimes(2);
    await expect(setDeviceNames(homey, vi.fn(), { mode: 'lastWord', apply: 'rooms' })).rejects.toThrow('Invalid apply');
  });

  it('is in the diagnostics report', async () => {
    const { homey } = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: ' - ' });
    expect((await new Diagnostics(homey).report(undefined)).deviceNames).toEqual({ mode: 'after', separator: ' - ', apply: ['devices'] });
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

describe('rooms and Flows', () => {
  const FLOWS = {
    f1: { id: 'f1', name: 'Lights | Evening', triggerable: true },
    f2: { id: 'f2', name: 'Alarm | Night', triggerable: true },
    f3: { id: 'f3', name: 'Hidden | Not by hand', triggerable: false },
  };
  function setup() {
    const devices = [
      fakeDevice({ id: 'c1', name: 'Blind | Kitchen', zone: 'k', caps: { windowcoverings_set: { type: 'number', value: 0.5 } } }),
    ];
    const api = { ...fakeApi({ devices, zones: { k: { id: 'k', name: '1st | Kitchen' }, l: { id: 'l', name: 'Living room' } } }),
      flow: { getFlows: vi.fn(async () => FLOWS), getAdvancedFlows: vi.fn(async () => ({})), getFlowFolders: vi.fn(async () => ({})) } };
    const homey = fakeHomey(api as any);
    homey.app = { log: vi.fn(), debug: vi.fn() };
    return homey;
  }

  it('shortens them only when ticked, and never by Leave out the room', () => {
    const homey = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|' });
    expect([roomNamer(homey)('1st | Kitchen'), shownFlowName(homey, 'Lights | Evening'), shownName(homey, 'Blind | Kitchen')])
      .toEqual(['1st | Kitchen', 'Lights | Evening', 'Kitchen']);
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|', apply: ['rooms', 'flows'] });
    expect([roomNamer(homey)('1st | Kitchen'), shownFlowName(homey, 'Lights | Evening'), shownName(homey, 'Blind | Kitchen')])
      .toEqual(['Kitchen', 'Evening', 'Blind | Kitchen']);
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'room', separator: '|', apply: ['devices', 'rooms', 'flows'] });
    expect([roomNamer(homey)('Kitchen'), shownFlowName(homey, 'Kitchen lights')]).toEqual(['Kitchen', 'Kitchen lights']);
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'full', separator: '|', apply: ['rooms', 'flows'] });
    expect([roomNamer(homey)('1st | Kitchen'), shownFlowName(homey, 'Lights | Evening')]).toEqual(['1st | Kitchen', 'Lights | Evening']);
  });

  it('names the rooms in a widget\'s answer, and Leave out the room still takes the room\'s own name', async () => {
    const homey = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|', apply: ['rooms'] });
    expect(await new CurtainService(homey, () => {}).getState(['c1']))
      .toMatchObject([{ id: 'c1', name: 'Blind | Kitchen', zone: { id: 'k', name: 'Kitchen' } }]);
  });

  it('names the Flows in Flow Buttons\' answer', async () => {
    const homey = setup();
    const flows = new FlowService(homey, () => {});
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|', apply: ['flows'] });
    expect(await flows.getState(['flow:f1'])).toMatchObject([{ id: 'flow:f1', name: 'Evening' }]);
  });

  it('counts the names of every ticked kind on the settings page, its examples taken in turn', async () => {
    const homey = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|', apply: ['devices', 'rooms', 'flows'] });
    // One device, two rooms, two Flows a button can start.
    expect(await deviceNamesState(homey, vi.fn())).toMatchObject({
      examples: [
        { name: 'Blind | Kitchen', shown: 'Kitchen' },
        { name: '1st | Kitchen', shown: 'Kitchen' },
        { name: 'Alarm | Night', shown: 'Night' },
      ],
      changed: 4,
      total: 5,
    });
    // Flows that can't be read are left out.
    homey.fakeApi.flow.getFlows.mockRejectedValue(new Error('Too many requests'));
    expect(await deviceNamesState(homey, vi.fn())).toMatchObject({ changed: 2, total: 3 });
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
      // With the device's room, for Leave out the room: `deviceNamer()`, or `shownName()` with its third argument.
      expect(readFileSync(`lib/${f}`, 'utf8'), f).toMatch(/deviceNamer\(this\.homey, |shownName\(this\.homey, [^,()]+, /);
    }
    expect(readFileSync('widgets/thermostat/api.ts', 'utf8')).toMatch(/deviceNamer\(homey, /);
  });

  it('names every room a service sends a widget: each zoneRef() call passes the room namer', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const calls = readdirSync('lib').filter(f => f.endsWith('Service.ts'))
      .flatMap(f => [...readFileSync(`lib/${f}`, 'utf8').matchAll(/zoneRef\(([^;]*?)\)[,;]/g)].map(m => [f, m[1]]));
    expect(calls.length).toBeGreaterThan(4);
    for (const [f, args] of calls) expect(args, f).toMatch(/, room$/);
  });
});
