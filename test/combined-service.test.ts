import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { DEVICE_NAMES_SETTING } from '../lib/deviceNames.js';
import CombinedService from '../lib/CombinedService.js';
import ValueMatrixService, { VM_STATE_EVENT } from '../lib/ValueMatrixService.js';

vi.mock('homey-api', () => homeyApiMock);

const T = 'measure_temperature';
const sensor = (id: string, name: string, value: number | null, extra: object = {}) => fakeDevice({
  id, name, zone: 'z',
  caps: { [T]: { type: 'number', value, units: '°C', decimals: 1, title: 'Temperature', ...extra }, measure_battery: { type: 'number', value: 80, units: '%' } },
});
const plug = () => fakeDevice({ id: 'plug', name: 'Plug', caps: { measure_power: { type: 'number', value: 12, units: 'W' }, onoff: { type: 'boolean', value: true } } });

function setup(devices = [sensor('b', 'Bedroom', 19.6), sensor('a', 'Attic', 14.2), sensor('k', 'Kitchen', null), plug()]) {
  const api = fakeApi({ devices, zones: { z: { name: 'Upstairs' } } });
  const homey = fakeHomey(api);
  const log = vi.fn();
  const matrix = new ValueMatrixService(homey, () => {});
  return { homey, api, devices, log, service: new CombinedService(homey, matrix, log) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('CombinedService', () => {
  it('without devices picked counts every device with the value, by name, and describes it from the first', async () => {
    const { service } = setup();
    expect(await service.getState(T, [])).toEqual({
      capability: { id: T, title: 'Temperature', units: '°C', decimals: 1, min: null, max: null },
      devices: [
        { id: 'a', name: 'Attic', value: 14.2 },
        { id: 'b', name: 'Bedroom', value: 19.6 },
        { id: 'k', name: 'Kitchen', value: null },
      ],
    });
  });

  it('counts the picked devices that have the value, in order; one without it isn\'t counted, a deleted one is missing', async () => {
    const { service, log } = setup();
    const state = await service.getState(T, ['k', 'plug', 'gone', 'b', 'k']);
    expect(state.devices).toEqual([
      { id: 'k', name: 'Kitchen', value: null },
      { id: 'b', name: 'Bedroom', value: 19.6 },
      { id: 'gone', missing: true },
    ]);
    expect(log).toHaveBeenCalledWith('Combined value: 1 picked device(s) not found');
  });

  it('has no capability when none of the devices has the value', async () => {
    const { service } = setup();
    expect(await service.getState(T, ['plug'])).toEqual({ capability: null, devices: [] });
    expect(await service.getState('measure_co2', [])).toEqual({ capability: null, devices: [] });
  });

  it('describes a 0–1 percentage with its range, so the widget scales it', async () => {
    const lamp = fakeDevice({ id: 'l', name: 'Lamp', caps: { dim: { type: 'number', value: 0.4, units: '%', min: 0, max: 1, decimals: 2, title: 'Brightness' } } });
    const { service } = setup([lamp]);
    expect((await service.getState('dim', [])).capability).toEqual({ id: 'dim', title: 'Brightness', units: '%', decimals: 2, min: 0, max: 1 });
  });

  it('shows the names as the device names setting says', async () => {
    const { homey, service } = setup([sensor('b', 'Sensor | Bedroom', 19.6)]);
    homey.settings.set(DEVICE_NAMES_SETTING, { mode: 'before', separator: '|' });
    expect((await service.getState(T, [])).devices).toEqual([{ id: 'b', name: 'Sensor', value: 19.6 }]);
  });

  it("tracks the counted devices through Value Matrix, so their changes come as its realtime event", async () => {
    const { homey, service, devices } = setup();
    await service.getState(T, ['b']);
    devices[0].report(T, 20.1);
    expect(homey.api.realtime).toHaveBeenCalledWith(VM_STATE_EVENT, { deviceId: 'b', capabilityId: T, value: 20.1 });
    expect((await service.getState(T, ['b'])).devices).toEqual([{ id: 'b', name: 'Bedroom', value: 20.1 }]);
  });

  it('lists the capabilities as Value Matrix\'s columns', async () => {
    const { service } = setup();
    const items = await service.listCapabilities('');
    expect(items[0].id).toBe('none');
    expect(items.find(i => i.id === T)).toMatchObject({ name: 'Temperature' });
    expect(items.some(i => i.id === 'onoff')).toBe(false);
  });

  it('fails when the devices can\'t be read', async () => {
    const { api, service } = setup();
    api.devices.getDevices.mockRejectedValueOnce(new Error('Homey busy'));
    await expect(service.getState(T, [])).rejects.toThrow('Homey busy');
  });
});
