import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { DEVICE_NAMES_SETTING } from '../lib/deviceNames.js';
import ValueBoardService, { VB_STATE_EVENT, isReading } from '../lib/ValueBoardService.js';

vi.mock('homey-api', () => homeyApiMock);

const sensor = () => fakeDevice({
  id: 'air', name: 'Bedroom | Air monitor', zone: 'bed',
  caps: {
    measure_temperature: { type: 'number', value: 19.2, units: '°C', decimals: 1, title: 'Temperature' },
    measure_co2: { type: 'number', value: 1140, units: 'ppm', title: 'CO2' },
    alarm_contact: { type: 'boolean', value: false, title: 'Contact alarm' },
    measure_battery: { type: 'number', value: 91, units: '%', title: 'Battery' },
    measure_hidden: { type: 'number', value: 3, getable: false },
  },
});
const plug = () => fakeDevice({
  id: 'plug', name: 'Desk plug', zone: 'office',
  caps: {
    onoff: { type: 'boolean', value: true, title: 'Turned on' },
    measure_power: { type: 'number', value: 134, units: 'W', title: 'Power' },
    meter_power: { type: 'number', value: 2.6, units: 'kWh', title: 'Energy' },
    mode: { type: 'enum', value: 'eco', title: 'Mode', values: [{ id: 'eco', title: 'Eco' }] },
  },
});
const ZONES = { bed: { name: 'Bedroom' }, office: { name: 'Office' } };

function setup(devices = [sensor(), plug()]) {
  const api = fakeApi({ devices, zones: ZONES });
  const homey = fakeHomey(api);
  const service = new ValueBoardService(homey, () => {});
  return { homey, api, service, devices };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('isReading', () => {
  it('is a measured value, a meter or an alarm, sub-capabilities too', () => {
    expect(['measure_temperature', 'measure_temperature.outdoor', 'meter_power', 'alarm_contact'].map(isReading)).toEqual([true, true, true, true]);
    expect(['onoff', 'dim', 'target_temperature', 'thermostat_mode', 'measurement'].map(isReading)).toEqual([false, false, false, false, false]);
  });
});

describe('getState', () => {
  it('gives each device in the order asked, with its zone and its readings in its own order; a deleted one is missing', async () => {
    const { service } = setup();
    expect(await service.getState(['plug', 'gone', 'air'])).toEqual([
      {
        id: 'plug', name: 'Desk plug', zone: { id: 'office', name: 'Office' },
        values: [
          { capabilityId: 'measure_power', title: 'Power', type: 'number', units: 'W', decimals: null, min: null, max: null, values: null, value: 134 },
          { capabilityId: 'meter_power', title: 'Energy', type: 'number', units: 'kWh', decimals: null, min: null, max: null, values: null, value: 2.6 },
        ],
      },
      { id: 'gone', missing: true },
      {
        id: 'air', name: 'Bedroom | Air monitor', zone: { id: 'bed', name: 'Bedroom' },
        values: [
          expect.objectContaining({ capabilityId: 'measure_temperature', value: 19.2, decimals: 1 }),
          expect.objectContaining({ capabilityId: 'measure_co2', value: 1140 }),
          expect.objectContaining({ capabilityId: 'alarm_contact', type: 'boolean', value: false }),
          expect.objectContaining({ capabilityId: 'measure_battery', value: 91 }),
        ],
      },
    ]);
  });

  it('with `all` adds switches, modes and the rest, never one that cannot be read', async () => {
    const { service } = setup();
    const [d] = await service.getState(['plug'], 'all') as any[];
    expect(d.values.map((v: any) => v.capabilityId)).toEqual(['onoff', 'measure_power', 'meter_power', 'mode']);
    expect(d.values[3]).toMatchObject({ type: 'enum', values: [{ id: 'eco', title: 'Eco' }], value: 'eco' });
    const [air] = await service.getState(['air'], 'all') as any[];
    expect(air.values.map((v: any) => v.capabilityId)).not.toContain('measure_hidden');
  });

  it('shows the name as the device names setting says', async () => {
    const { service, homey } = setup();
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'after', separator: '|' });
    expect(await service.getState(['air'])).toMatchObject([{ name: 'Air monitor' }]);
  });

  it('sends each change as an event, and the next read has it', async () => {
    const { service, homey, devices } = setup();
    await service.getState(['air']);
    devices[0].report('measure_co2', 1600);
    expect(homey.api.realtime).toHaveBeenCalledWith(VB_STATE_EVENT, { deviceId: 'air', capabilityId: 'measure_co2', value: 1600 });
    devices[0].report('alarm_contact', true);
    expect(homey.api.realtime).toHaveBeenLastCalledWith(VB_STATE_EVENT, { deviceId: 'air', capabilityId: 'alarm_contact', value: true });
    expect(await service.getState(['air'])).toMatchObject([{ values: [{}, { value: 1600 }, { value: true }, {}] }]);
  });

  it('tracks a device once for both settings, and lets go when it is deleted', async () => {
    const { service, devices } = setup();
    const air = devices[0];
    await service.getState(['air']);
    await service.getState(['air'], 'all');
    expect(air.listenerCount('measure_co2')).toBe(1);
    expect(air.listenerCount('measure_hidden')).toBe(0);
    devices.splice(0, 1);
    expect(await service.getState(['air'])).toEqual([{ id: 'air', missing: true }]);
    expect(air.listenerCount('measure_co2')).toBe(0);
  });
});
