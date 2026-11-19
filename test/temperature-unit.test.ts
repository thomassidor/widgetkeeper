// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import api from '../api.js';
import Diagnostics from '../lib/Diagnostics.js';
import { capabilityReading } from '../lib/capabilities.js';
import HeatmapService from '../lib/HeatmapService.js';
import RoomHealthService, { RH_STATE_EVENT } from '../lib/RoomHealthService.js';
import ThermostatService from '../lib/ThermostatService.js';
import ValueBoardService, { VB_STATE_EVENT } from '../lib/ValueBoardService.js';
import ValueMatrixService, { VM_STATE_EVENT } from '../lib/ValueMatrixService.js';
import ValueService, { VALUES_STATE_EVENT, showSlot } from '../lib/ValueService.js';
import { presetLabel } from '../lib/thermostatPresets.js';
import {
  TEMPERATURE_UNIT_EVENT, TEMPERATURE_UNIT_SETTING, convertTemperature, setTemperatureUnit, showerFor, shownTemperatureScale,
  temperatureScaleOf, temperatureUnitOf, watchTemperatureUnit,
} from '../lib/temperatureUnit.js';
import { thermostatState } from '../widgets/thermostat/api.js';
import { loadWidget, runFile } from './helpers/loadWidget.js';
import { readdirSync, readFileSync } from 'node:fs';

vi.mock('homey-api', () => homeyApiMock);

// The app's Temperature unit (1.3.2): one app setting, Automatic (the Homey's units), °C or °F. The app turns every
// temperature it sends a widget into it; Thermostat Presets and Weather Forecast keep °C and show them in it.
runFile('widgets/spacer/public/kit.js');
const kit = (window as any).WidgetkeeperKit;

const imperial = (homey: any) => { homey.i18n.getUnits = () => 'imperial'; return homey; };
const thermometer = (units = '°C', value = 21.5) => fakeDevice({
  id: 'th', name: 'Thermometer', zone: 'z1',
  caps: {
    measure_temperature: { type: 'number', value, title: 'Temperature', units, decimals: 1 },
    measure_humidity: { type: 'number', value: 48, title: 'Humidity', units: '%' },
  },
});
const homeyWith = (devices: any[]) => fakeHomey(fakeApi({ devices, zones: { z1: { name: 'Living room' } } }));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('the app setting', () => {
  it("is Automatic until set, which follows the Homey's units", () => {
    const homey = fakeHomey(fakeApi());
    expect(temperatureUnitOf(homey)).toBe('auto');
    expect(shownTemperatureScale(homey)).toBe('c'); // a Homey whose units can't be read: °C
    homey.i18n.getUnits = () => 'metric';
    expect(shownTemperatureScale(homey)).toBe('c');
    imperial(homey);
    expect(shownTemperatureScale(homey)).toBe('f');
    homey.settings.set(TEMPERATURE_UNIT_SETTING, 'c');
    expect(shownTemperatureScale(homey)).toBe('c');
    homey.settings.set(TEMPERATURE_UNIT_SETTING, 'kelvin');
    expect(temperatureUnitOf(homey)).toBe('auto');
  });

  it('stores a choice through the settings page, tells open widgets, and refuses another value', async () => {
    const homey = imperial(fakeHomey(fakeApi()));
    watchTemperatureUnit(homey);
    expect(await (api as any).getTemperatureUnit({ homey })).toEqual({ temperatureUnit: 'auto', shown: 'f', homey: 'f' });
    expect(await (api as any).putTemperatureUnit({ homey, body: { temperatureUnit: 'c' } })).toEqual({ ok: true, temperatureUnit: 'c', shown: 'c' });
    expect(homey.api.realtime).toHaveBeenCalledWith(TEMPERATURE_UNIT_EVENT, { temperatureUnit: 'c' });
    homey.api.realtime.mockClear();
    setTemperatureUnit(homey, { temperatureUnit: 'c' }); // no change: nothing to tell
    expect(homey.api.realtime).not.toHaveBeenCalled();
    expect(setTemperatureUnit(homey, { temperatureUnit: 'k' })).toEqual({ ok: false });
    expect(setTemperatureUnit(homey, null)).toEqual({ ok: false });
    homey.settings.unset(TEMPERATURE_UNIT_SETTING);
    expect(homey.api.realtime).toHaveBeenCalledWith(TEMPERATURE_UNIT_EVENT, { temperatureUnit: 'f' });
  });

  it('is in the diagnostics report', async () => {
    const homey = imperial(fakeHomey(fakeApi()));
    homey.settings.set(TEMPERATURE_UNIT_SETTING, 'c');
    expect((await new Diagnostics(homey).report(undefined)).temperatureUnit).toEqual({ setting: 'c', homey: 'f' });
  });
});

describe('converting', () => {
  it('knows the units Homey and apps write a temperature in', () => {
    for (const u of ['°C', '° C', '℃', 'C', 'celsius']) expect(temperatureScaleOf(u)).toBe('c');
    for (const u of ['°F', '℉', 'F', 'Fahrenheit']) expect(temperatureScaleOf(u)).toBe('f');
    for (const u of ['K', '%', '', null, undefined, 42]) expect(temperatureScaleOf(u)).toBeNull();
    expect(convertTemperature(20, 'c', 'f')).toBe(68);
    expect(convertTemperature(68, 'f', 'c')).toBe(20);
  });

  it('turns a description, a value and points into the shown scale, and leaves anything else as it was', () => {
    const f = showerFor('f');
    const cap = { units: '°C', min: 5, max: 30, decimals: 1 };
    expect(f.cap(cap)).toEqual({ units: '°F', min: 41, max: 86, decimals: 1 });
    expect(f.value('°C', 21.5)).toBe(70.7);
    expect(f.value('°C', null)).toBeNull();
    expect(f.points('°C', [[1, 0], [2, 100]])).toEqual([[1, 32], [2, 212]]);
    const humidity = { units: '%', min: 0, max: 100 };
    expect(f.cap(humidity)).toBe(humidity);
    expect(f.value('%', 48)).toBe(48);
    expect(f.value('°F', 70)).toBe(70);
    expect(showerFor('c').value('°F', 212)).toBe(100);
  });

  it("turns a chart's slot with its second value and points", () => {
    const slot = {
      deviceId: 'd', capabilityId: 'measure_temperature', name: 'Thermometer', value: 20,
      capability: { title: 'T', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null, icon: null },
      second: { capabilityId: 'target_temperature', value: 10, capability: { title: 'S', type: 'number', units: '°C', decimals: 1, min: 5, max: 30, values: null, icon: null } },
      points: [[1, 0]] as [number, number][],
    };
    expect(showSlot(showerFor('f'), slot)).toMatchObject({
      value: 68, capability: { units: '°F' }, second: { value: 50, capability: { units: '°F', min: 41, max: 86 } }, points: [[1, 32]],
    });
    expect(showSlot(showerFor('c'), slot)).toBe(slot);
  });

  it("writes an autocomplete row's reading in the app's unit", () => {
    const homey = imperial(fakeHomey(fakeApi()));
    expect(capabilityReading(homey, { title: 'T', type: 'number', units: '°C', decimals: 1, min: null, max: null, values: null }, 21.5)).toBe('70.7°F');
  });
});

describe('the services', () => {
  it('Device Values: the state and its realtime changes in °F, with Homey\'s own value beside a converted one', async () => {
    const devices = [thermometer()];
    const homey = imperial(homeyWith(devices));
    const service = new ValueService(homey, () => {});
    const [t, h] = await service.getState(['th:measure_temperature', 'th:measure_humidity']) as any[];
    expect(t).toMatchObject({ value: 70.7, capability: { units: '°F' } });
    expect(h).toMatchObject({ value: 48, capability: { units: '%' } });
    expect((await service.getState(['th:measure_temperature'], [], { raw: true }))[0]).toMatchObject({ value: 21.5, capability: { units: '°C' } });
    devices[0].report('measure_temperature', 20);
    expect(homey.api.realtime).toHaveBeenCalledWith(VALUES_STATE_EVENT, { deviceId: 'th', capabilityId: 'measure_temperature', value: 68, raw: 20 });
    devices[0].report('measure_humidity', 50);
    expect(homey.api.realtime).toHaveBeenCalledWith(VALUES_STATE_EVENT, { deviceId: 'th', capabilityId: 'measure_humidity', value: 50 });
    // A thermometer in °F shown in °C.
    homey.settings.set(TEMPERATURE_UNIT_SETTING, 'c');
    const f = new ValueService(homeyWith([thermometer('°F', 68)]), () => {});
    expect((await f.getState(['th:measure_temperature']))[0]).toMatchObject({ value: 20, capability: { units: '°C' } });
  });

  it('Value Matrix and Value Board: each value by its own units, in the shown one', async () => {
    const devices = [thermometer()];
    const homey = imperial(homeyWith(devices));
    const matrix = new ValueMatrixService(homey, () => {});
    const state = await matrix.getState(['th'], ['measure_temperature']);
    expect(state.columns[0]).toMatchObject({ units: '°F' });
    expect(state.devices[0]).toMatchObject({ values: { measure_temperature: 70.7 } });
    devices[0].report('measure_temperature', 20);
    expect(homey.api.realtime).toHaveBeenCalledWith(VM_STATE_EVENT, { deviceId: 'th', capabilityId: 'measure_temperature', value: 68 });

    const board = new ValueBoardService(homey, () => {});
    const [read] = await board.getState(['th']) as any[];
    expect(read.values.find((v: any) => v.capabilityId === 'measure_temperature')).toMatchObject({ units: '°F', value: 68 });
    devices[0].report('measure_temperature', 10);
    expect(homey.api.realtime).toHaveBeenCalledWith(VB_STATE_EVENT, { deviceId: 'th', capabilityId: 'measure_temperature', value: 50 });
  });

  it("Room Health: a temperature in °F says so; its own scoring stays in °C", async () => {
    const devices = [thermometer('°C', 20)];
    const homey = imperial(homeyWith(devices));
    const service = new RoomHealthService(homey, () => {});
    const [read] = await service.getState(['th']) as any[];
    expect(read.measures.temperature).toEqual({ capabilityId: 'measure_temperature', value: 68, units: '°F' });
    expect(read.measures.humidity).toEqual({ capabilityId: 'measure_humidity', value: 48 });
    devices[0].report('measure_temperature', 25);
    expect(homey.api.realtime).toHaveBeenCalledWith(RH_STATE_EVENT, expect.objectContaining({ measure: 'temperature', value: 77 }));
    homey.settings.set(TEMPERATURE_UNIT_SETTING, 'c');
    expect((await service.getState(['th']) as any[])[0].measures.temperature).toEqual({ capabilityId: 'measure_temperature', value: 25 });
  });

  it("Heatmap: the value, its units and every hour", async () => {
    const homey = imperial(homeyWith([thermometer('°C', 20)]));
    const hourly = { values: [{ t: new Date(Date.now() - 3600e3).toISOString(), v: 10 }] };
    homey.fakeApi.insights.getLogEntries.mockResolvedValue(hourly);
    const heatmap = new HeatmapService(homey, () => {});
    const h = await heatmap.getHistory('th', 'measure_temperature', 7);
    expect(h.value).toBe(68);
    expect(h.capability.units).toBe('°F');
    expect(h.days.flatMap(d => d.hours).filter(v => v != null)).toContain(50);
    await heatmap.stop();
  });

  it("Thermostat Presets: Homey's values with the unit to show them in, its setpoints listed in it", async () => {
    const aircon = fakeDevice({
      id: 'ac', name: 'Aircon', class: 'thermostat',
      caps: { target_temperature: { type: 'number', value: 21, units: '°C', min: 20, max: 21, step: 0.5, setable: true } },
    });
    const homey = imperial(homeyWith([aircon]));
    const thermostat = new ThermostatService(homey, () => {});
    const state = await thermostatState(homey, { thermostat, values: new ValueService(homey, () => {}) } as any, 'ac') as any;
    expect(state).toMatchObject({ temperatureUnit: 'f', values: { target_temperature: 21 }, caps: { target_temperature: { units: '°C' } } });
    expect((await thermostat.listTemperatures('ac', '')).filter(i => 'value' in i).map(i => [i.name, (i as any).value]))
      .toEqual([['68 °F', 20], ['68.9 °F', 20.5], ['69.8 °F', 21]]);
    // The Flow cards' button names too.
    const preset = { values: [{ slot: 'temp' as const, capabilityId: 'target_temperature', value: 21 }] };
    expect(presetLabel(preset, {}, 'thermostat_mode', { off: 'Off', on: 'On' }, 'en', 'f')).toBe('69.8°');
    expect(presetLabel(preset, {}, 'thermostat_mode', { off: 'Off', on: 'On' }, 'en')).toBe('21°');
  });
});

describe('every service', () => {
  // A service that reads capabilities sends no temperature, or turns it into the app's unit. A new one that reads them
  // fails here until it does, or is listed with the reason.
  const NO_TEMPERATURES: Record<string, string> = {
    'CurtainService.ts': 'positions and on/off only',
    'ElectricityService.ts': 'power and prices only',
    'LightService.ts': "light_temperature is a colour's warmth (0–1), not degrees",
    'LockService.ts': 'locks and contacts only',
    'MediaService.ts': 'speakers only',
    'QuickActionService.ts': 'switches, buttons and modes only',
    'SensorAlarmService.ts': 'alarms only (alarm_*)',
    'KeypadService.ts': "Homey's own value, as a button's (a lit button matches it); see sourceState()",
    'WebDashboardService.ts': "the editor's pickers show what Homey has, as they show full device names",
  };

  it("turns any temperature it sends into the app's unit, or is listed with the reason", () => {
    const reads = readdirSync('lib').filter(f => f.endsWith('.ts')).filter((f) => {
      const src = readFileSync(`lib/${f}`, 'utf8');
      return /makeCapabilityInstance\(|describeCapability\(|capabilitiesObj/.test(src);
    });
    const converts = (f: string) => /temperatureUnit\.js|capabilityReading\(/.test(readFileSync(`lib/${f}`, 'utf8'));
    expect(reads.filter(f => !converts(f) && !NO_TEMPERATURES[f])).toEqual([]);
    expect(Object.keys(NO_TEMPERATURES).filter(f => !reads.includes(f) || converts(f))).toEqual([]);
  });
});

describe('the widgets', () => {
  let win: any;
  beforeAll(() => {
    win = loadWidget('roomhealth');
    loadWidget('thermostat');
    loadWidget('weather');
  });

  it("the kit: a temperature in the app's unit, Homey's °C without units", () => {
    expect(kit.temperatureIn(20, '°C', 'f')).toBe(68);
    expect(kit.temperatureIn(20, null, 'f')).toBe(68);
    expect(kit.temperatureIn(68, '°F', 'c')).toBe(20);
    expect(kit.temperatureIn(20, '°C', 'c')).toBe(20);
    expect(kit.temperatureIn(20, '%', 'f')).toBe(20);
    expect(kit.temperatureIn(20, '°C', undefined)).toBe(20);
  });

  it('the kit: a widget reads again when the unit changes, as for device names', () => {
    const handlers: Record<string, () => void> = {};
    const load = vi.fn();
    kit.onDeviceNames({ on: (event: string, fn: () => void) => { handlers[event] = fn; } }, load);
    handlers['temperatureunit:state']();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('Room Health: its range in °F, a stored °C range (the defaults 18 and 24) read as °C', () => {
    expect(win.roomHealthRange({}, 'f').temperature).toEqual({ min: 64, max: 75, margin: 5.4 });
    expect(win.roomHealthRange({ tempMin: 18, tempMax: 24 }, 'f').temperature).toEqual({ min: 64.4, max: 75.2, margin: 5.4 });
    expect(win.roomHealthRange({ tempMin: 66, tempMax: 72 }, 'f').temperature).toEqual({ min: 66, max: 72, margin: 5.4 });
    expect(win.roomHealthRange({ tempMin: 18, tempMax: 24 }).temperature).toEqual({ min: 18, max: 24 });
    const ranges = win.roomHealthRange({}, 'f');
    expect(win.roomHealthScore('temperature', 70, ranges)).toEqual({ score: 0, side: null });
    expect(win.roomHealthScore('temperature', 80.4, ranges).score).toBeCloseTo(1);

    const root = document.createElement('div');
    document.body.append(root);
    const w = win.createRoomHealthWidget(root, { locale: 'en', tempMin: 18, tempMax: 24 });
    w.setState([{ id: 's', name: 'S', zone: { id: 'z', name: 'Living room' }, measures: { temperature: { capabilityId: 'measure_temperature', value: 70.7, units: '°F' } } }]);
    const room = root.querySelector('.rh-room')!;
    expect(room.querySelector('.rh-num')!.textContent).toBe('70.7°');
    expect(room.querySelector('[data-measure="temperature"]')!.getAttribute('data-level')).toBe('good');
    expect(room.getAttribute('aria-label')).toContain('70.7°F');
  });

  it('Thermostat Presets: setpoints shown in the state\'s unit', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const w = (window as any).createThermostatWidget(root, { locale: 'en', onApply: vi.fn() });
    w.setButtons((window as any).thermostatPresetsFromSettings({ b1Temp: { capabilityId: 'target_temperature', value: 21, name: '21 °C' } }));
    const state = {
      name: 'Aircon', icon: null, values: { onoff: true, target_temperature: 23 },
      caps: { onoff: { title: 'On', units: null, values: null }, target_temperature: { title: 'Target', units: '°C', values: null } },
    };
    w.setState({ ...state, temperatureUnit: 'f' });
    expect(root.querySelector('.tw-big')!.textContent).toBe('69.8°');
    expect(root.textContent).toContain('73.4°');
    w.setState(state);
    expect(root.querySelector('.tw-big')!.textContent).toBe('21°');
  });

  it('Weather Forecast: MET\'s °C shown in °F, coloured as before', () => {
    vi.setSystemTime(Date.parse('2026-10-03T13:20:00Z'));
    const root = document.createElement('div');
    document.body.append(root);
    const w = (window as any).createWeatherWidget(root, { locale: 'en' });
    const hours = [0, 1].map(i => ({ t: new Date(Date.parse('2026-10-03T13:00:00Z') + i * 3600e3).toISOString(), symbol: 'rain', temp: i ? 20 : 4, wind: 1, windDir: 0, precip: 0 }));
    w.setForecast({ hours, language: 'en', temperatureUnit: 'f' });
    const temps = [...root.querySelectorAll('.wf-temp')];
    expect(temps.map(t => t.textContent)).toEqual(['39°', '68°']);
    expect(temps[0].classList.contains('cold')).toBe(true);
    expect([...root.querySelectorAll('.wf-range')].map(t => t.textContent)).toEqual(['↑68°', '↓39°']);
    w.setForecast({ hours, language: 'en' });
    expect([...root.querySelectorAll('.wf-temp')].map(t => t.textContent)).toEqual(['4°', '20°']);
  });
});
