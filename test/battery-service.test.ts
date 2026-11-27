import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { DEVICE_NAMES_SETTING } from '../lib/deviceNames.js';
import BatteryService, { BATTERY_STATE_EVENT } from '../lib/BatteryService.js';

vi.mock('homey-api', () => homeyApiMock);

const motion = () => fakeDevice({
  id: 'motion', name: 'Hallway | Motion', zone: 'hall',
  caps: {
    alarm_motion: { type: 'boolean', value: false },
    measure_temperature: { type: 'number', value: 21, units: '°C' },
    measure_battery: { type: 'number', value: 64, units: '%' },
    alarm_battery: { type: 'boolean', value: false },
  },
});
const remote = () => fakeDevice({ id: 'remote', name: 'Remote', zone: 'hall', caps: { alarm_battery: { type: 'boolean', value: true } } });
const plug = () => fakeDevice({ id: 'plug', name: 'Plug', zone: 'hall', caps: { onoff: { type: 'boolean', value: true } } });
const sub = () => fakeDevice({ id: 'lock', name: 'Lock', zone: 'hall', caps: { 'measure_battery.main': { type: 'number', value: 12, units: '%' } } });

function setup(devices = [motion(), remote(), plug(), sub()]) {
  const api = fakeApi({ devices, zones: { hall: { name: 'Hallway' } } });
  const homey = fakeHomey(api);
  return { homey, service: new BatteryService(homey, () => {}), devices };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('BatteryService', () => {
  it('gives each device its level and low alarm, in the order asked; none for a device without a battery; missing for a deleted one', async () => {
    const { service } = setup();
    expect(await service.getState(['remote', 'plug', 'gone', 'motion', 'lock'])).toEqual([
      { id: 'remote', name: 'Remote', level: null, low: true },
      { id: 'plug', name: 'Plug', none: true },
      { id: 'gone', missing: true },
      { id: 'motion', name: 'Hallway | Motion', level: 64, low: false },
      { id: 'lock', name: 'Lock', level: 12, low: null },
    ]);
  });

  it('shows the name as the device names setting says', async () => {
    const { service, homey } = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|' });
    expect(await service.getState(['motion'])).toMatchObject([{ name: 'Motion' }]);
  });

  it('listens to the battery only, sends each change as an event, and the next read has it', async () => {
    const { service, homey, devices } = setup();
    await service.getState(['motion', 'lock']);
    expect(devices[0].listenerCount('measure_temperature')).toBe(0);
    devices[0].report('measure_battery', 9);
    expect(homey.api.realtime).toHaveBeenCalledWith(BATTERY_STATE_EVENT, { deviceId: 'motion', capabilityId: 'measure_battery', value: 9 });
    devices[0].report('alarm_battery', true);
    expect(homey.api.realtime).toHaveBeenLastCalledWith(BATTERY_STATE_EVENT, { deviceId: 'motion', capabilityId: 'alarm_battery', value: true });
    // A sub-capability is sent by its base id.
    devices[3].report('measure_battery.main', 11);
    expect(homey.api.realtime).toHaveBeenLastCalledWith(BATTERY_STATE_EVENT, { deviceId: 'lock', capabilityId: 'measure_battery', value: 11 });
    expect(await service.getState(['motion', 'lock'])).toMatchObject([{ level: 9, low: true }, { level: 11 }]);
  });

  it('lets go of a deleted device', async () => {
    const { service, devices } = setup();
    const m = devices[0];
    await service.getState(['motion']);
    expect(m.listenerCount('measure_battery')).toBe(1);
    devices.splice(0, 1);
    expect(await service.getState(['motion'])).toEqual([{ id: 'motion', missing: true }]);
    expect(m.listenerCount('measure_battery')).toBe(0);
  });
});
