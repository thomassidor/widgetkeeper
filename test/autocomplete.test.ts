// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeDevice, fakeHomey, homeyApiMock } from './helpers/fakeHomey.js';
import { byName, filterItems, finishList, hintRow, listCapabilitySlots, listDevicesWhere, matches, MAX_ROWS, nameOrder } from '../lib/autocomplete.js';
import { capabilityReading, describeCapability } from '../lib/capabilities.js';
import CameraService from '../lib/CameraService.js';
import FlowService from '../lib/FlowService.js';
import MediaService from '../lib/MediaService.js';
import ThermostatService from '../lib/ThermostatService.js';
import { VALUE_GLYPH_IMAGES } from '../lib/valueGlyphImages.js';
import { valueGlyphImage, valueGlyphName } from '../lib/valueGlyphs.js';
import VariableService from '../lib/VariableService.js';
import { widgetAutocompletes } from '../lib/widgetAutocompletes.js';
import { loadWidget } from './helpers/loadWidget.js';

vi.mock('homey-api', () => homeyApiMock);

const homeyIn = (language: string) => ({ i18n: { getLanguage: () => language }, __: () => undefined }) as any;
const PNG = /^data:image\/png;base64,/;

describe('matches', () => {
  it('finds every word in some text, in any order', () => {
    expect(matches('living room temperature', 'Sensor · Temperature', 'Living room')).toBe(true);
    expect(matches('kitchen temp', 'Kitchen sensor · Temperature')).toBe(true);
    expect(matches('temp kitchen', 'Kitchen sensor · Temperature')).toBe(true);
    expect(matches('kitchen humidity', 'Kitchen sensor · Temperature')).toBe(false);
  });

  it('ignores case, accents and missing texts, and an empty query matches', () => {
    expect(matches('CAFE', 'Café')).toBe(true);
    expect(matches('café', 'Cafe')).toBe(true);
    expect(matches('x', undefined, null)).toBe(false);
    expect(matches('   ', undefined)).toBe(true);
  });
});

describe('filterItems', () => {
  it('searches what a row shows, and an extra text', () => {
    const rows = [{ name: 'Night', description: 'Advanced Flow · Bedroom', id: 'a' }, { name: 'Morning', id: 'b' }];
    expect(filterItems('bedroom', rows).map(r => r.id)).toEqual(['a']);
    expect(filterItems('advanced night', rows).map(r => r.id)).toEqual(['a']);
    expect(filterItems('b', rows, r => [r.id]).map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('nameOrder', () => {
  it('sorts numbers by their value', () => {
    expect(['Spot 10', 'Spot 2', 'Spot 1'].sort(nameOrder(homeyIn('en')))).toEqual(['Spot 1', 'Spot 2', 'Spot 10']);
    expect([{ name: 'Spot 10' }, { name: 'Spot 2' }].sort(byName(homeyIn('en')))[0].name).toBe('Spot 2');
  });

  it("sorts in Homey's language", () => {
    expect(['Åben', 'Zebra', 'Ananas'].sort(nameOrder(homeyIn('da')))).toEqual(['Ananas', 'Zebra', 'Åben']);
    expect(['Åben', 'Zebra', 'Ananas'].sort(nameOrder(homeyIn('en')))).toEqual(['Åben', 'Ananas', 'Zebra']);
  });

  it('survives every Homey language, and a Homey without one', () => {
    for (const lang of ['en', 'nl', 'de', 'fr', 'it', 'sv', 'no', 'es', 'da', 'ru', 'pl', 'ko', 'ar']) {
      expect(nameOrder(homeyIn(lang))('a', 'b')).toBeLessThan(0);
    }
    expect(nameOrder(homeyIn('not a language'))('a', 'b')).toBeLessThan(0);
    expect(nameOrder({} as any)('a', 'b')).toBeLessThan(0);
  });
});

describe('finishList', () => {
  const homey = homeyIn('en');

  it('puts rows whose words start with the query first, keeping the order otherwise', () => {
    const rows = [{ name: 'Clamp', id: '1' }, { name: 'Lamp 1', id: '2' }, { name: 'Clamp 2', id: '3' }, { name: 'Desk', description: 'Lamps', id: '4' }];
    expect(finishList(homey, 'lamp', rows).map(r => r.id)).toEqual(['2', '4', '1', '3']);
  });

  it('keeps None and the thermostat\'s Don\'t change on top, and a preset (no id) among the rest', () => {
    const rows = [{ name: 'Xlamp', id: 'x' }, { name: 'Lamp none', id: 'none' }, { name: 'Lamp', capabilityId: 'c' }, { name: "Don't lamp" }];
    expect(finishList(homey, 'lamp', rows).map(r => r.name)).toEqual(['Lamp none', "Don't lamp", 'Lamp', 'Xlamp']);
  });

  it('leaves the order alone without a query', () => {
    const rows = [{ name: 'B', id: 'b' }, { name: 'A', id: 'a' }];
    expect(finishList(homey, '', rows)).toEqual(rows);
  });

  it('caps a long list, the last row saying how many more; None stays and does not count', () => {
    const rows = [{ name: 'None', id: 'none' }, ...Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ name: `Row ${i}`, id: `r${i}` }))];
    const list = finishList(homey, '', rows);
    expect(list).toHaveLength(MAX_ROWS + 2);
    expect(list[0].id).toBe('none');
    expect(list.at(-1)).toEqual({ name: '5 more: keep typing', id: 'none', hint: true });
    expect(finishList(homey, '', rows.slice(0, MAX_ROWS + 1))).toHaveLength(MAX_ROWS + 1);
    expect(finishList(homey, '', rows, { cap: false })).toHaveLength(rows.length);
  });
});

describe('every setting list goes through finishList', () => {
  const long = Array.from({ length: MAX_ROWS + 3 }, (_, i) => ({ name: `Row ${i}`, id: `r${i}` }));

  function table() {
    return widgetAutocompletes({ homey: homeyIn('en'), values: { listSlots: async () => long }, flowTiles: { listBoards: () => long } } as any);
  }

  it('caps, unless test-dashboards asks for the whole list', async () => {
    expect((await table().values.slot1('', {})).at(-1)).toEqual({ name: '3 more: keep typing', id: 'none', hint: true });
    expect(await table().values.slot1('', { wholeList: { id: '1' } })).toHaveLength(long.length);
  });

  it("doesn't cap Flow Tiles' boards, whose id is the name it keeps", async () => {
    expect(await table().flowtiles.board('', {})).toHaveLength(long.length);
  });
});

describe('empty lists', () => {
  it('says so, whatever is typed, where nothing on the Homey qualifies', async () => {
    const homey = fakeHomey(fakeApi({ devices: [fakeDevice({ id: 'l', name: 'Lamp', caps: { onoff: { type: 'boolean' } } })] }));
    const row = (name: string) => [{ name, id: 'none', hint: true }];
    expect(await listDevicesWhere(homey, 'x', () => false, { empty: 'Nothing' })).toEqual(row('Nothing'));
    expect(await listDevicesWhere(homey, 'x', () => false)).toEqual([]);
    expect(await new ThermostatService(homey, () => {}).listDevices('x')).toEqual(row('No thermostats found'));
    expect(await new CameraService(homey, () => {}).listCameras('x')).toEqual(row('No cameras found'));
    expect(await new MediaService(homey, {} as any, () => {}).listDevices('x')).toEqual(row('No speakers found'));
  });

  it('tells nothing qualifying from a search without a match', async () => {
    const homey = fakeHomey(fakeApi({ devices: [fakeDevice({ id: 't', name: 'Heat', caps: { target_temperature: { type: 'number' } }, class: 'thermostat' })] }));
    expect(await new ThermostatService(homey, () => {}).listDevices('nothing like it')).toEqual([]);
  });

  it('hintRow has the id every widget skips', () => {
    expect(hintRow('A', 'B')).toEqual({ name: 'A', description: 'B', id: 'none', hint: true });
    expect(hintRow('A')).toEqual({ name: 'A', id: 'none', hint: true });
  });
});

describe('device value rows', () => {
  const sensor = () => fakeDevice({
    id: 's', name: 'Sensor', zone: 'z1', caps: {
      measure_temperature: { type: 'number', title: 'Temperature', units: '°C', decimals: 1, value: 21.44 },
      onoff: { type: 'boolean', title: 'Power', value: true },
      measure_luminance: { type: 'number', title: 'Light', units: 'lx' },
    },
  });

  it('show the reading, or the units without one, and the glyph', async () => {
    const homey = fakeHomey(fakeApi({ devices: [sensor()], zones: { z1: { name: 'Living room' } } }));
    const rows = await listCapabilitySlots(homey, '', d => Object.keys(d.capabilitiesObj));
    const row = (id: string) => rows.find(r => r.id === `s:${id}`)!;
    expect(row('measure_temperature').description).toBe('Living room · 21.4°C');
    expect(row('onoff').description).toBe('Living room · On');
    expect(row('measure_luminance').description).toBe('Living room · lx');
    expect(row('measure_temperature').image).toBe(valueGlyphImage('measure_temperature'));
  });

  it("don't search the reading, but do the units", async () => {
    const homey = fakeHomey(fakeApi({ devices: [sensor()], zones: { z1: { name: 'Living room' } } }));
    const ids = async (q: string) => (await listCapabilitySlots(homey, q, d => Object.keys(d.capabilitiesObj))).map(r => r.id);
    expect(await ids('21.4')).toEqual([]);
    expect(await ids('living temperature °C')).toEqual(['s:measure_temperature']);
  });
});

describe('capabilityReading', () => {
  it("reads as the kit's formatValue() does", () => {
    const kit = loadWidget('values').WidgetkeeperKit;
    const on = (key: string) => (key === 'on' ? 'On' : 'Off');
    const cases: [any, unknown][] = [
      [{ type: 'number', units: '°C', decimals: 1 }, 21.44], [{ type: 'number', units: 'W', decimals: 0 }, 1234.5],
      [{ type: 'number', units: '%', max: 1, min: 0 }, 0.42], [{ type: 'number', units: 'kWh' }, 3.14159],
      [{ type: 'number' }, 7], [{ type: 'boolean' }, true], [{ type: 'boolean' }, false],
      [{ type: 'enum', values: [{ id: 'heat', title: 'Heat' }] }, 'heat'], [{ type: 'enum', values: [{ id: 'a', title: 'A' }] }, 'other'], [{ type: 'string' }, 'Text'],
    ];
    for (const [cap, value] of cases) {
      const described = describeCapability(cap, 'x');
      expect(capabilityReading(homeyIn('en'), described, value)).toBe(kit.formatValue(described, value, on));
    }
  });

  it('has none for no value or a long text, and writes numbers in the language', () => {
    const cap = describeCapability({ type: 'number', units: 'W', decimals: 1 }, 'x');
    expect(capabilityReading(homeyIn('en'), cap, null)).toBeNull();
    expect(capabilityReading(homeyIn('en'), cap, '')).toBeNull();
    expect(capabilityReading(homeyIn('en'), describeCapability({ type: 'string' }, 'x'), 'x'.repeat(25))).toBeNull();
    expect(capabilityReading(homeyIn('da'), cap, 1.5)).toBe('1,5 W');
  });
});

describe('value glyph images', () => {
  const CAPABILITIES: [string, unknown?][] = [
    ['measure_temperature'], ['measure_temperature.outside'], ['target_temperature'], ['measure_humidity'], ['measure_rain'],
    ['measure_power'], ['meter_power'], ['measure_current'], ['measure_voltage'], ['measure_luminance'], ['measure_ultraviolet'],
    ['measure_co2'], ['measure_co'], ['measure_pm25'], ['measure_voc'], ['measure_tvoc'], ['measure_battery'], ['alarm_battery'],
    ['alarm_motion'], ['onoff'], ['locked', true], ['locked', false], ['locked'], ['dim'], ['measure_noise'], ['volume_set'], ['anything'],
  ];
  let kit: any;
  beforeEach(() => { kit = loadWidget('values').WidgetkeeperKit; });

  it("are drawn from the kit's current glyphs (else run `npm run value-glyphs`)", () => {
    for (const [name, { source, image }] of Object.entries(VALUE_GLYPH_IMAGES)) {
      const capability = CAPABILITIES.find(([id, value]) => valueGlyphName(id, value) === name)!;
      expect(source, name).toBe(kit.valueGlyph(capability[0], capability[1]));
      expect(image, name).toMatch(PNG);
    }
  });

  it("pick a capability's glyph as the kit does", () => {
    for (const [id, value] of CAPABILITIES) {
      expect(VALUE_GLYPH_IMAGES[valueGlyphName(id, value)].source, id).toBe(kit.valueGlyph(id, value));
    }
  });

  it('stay small: a list has up to 100, and a chosen one stays in the widget settings', () => {
    for (const { image } of Object.values(VALUE_GLYPH_IMAGES)) expect(image.length).toBeLessThan(1200);
  });
});

describe('lists that search their descriptions', () => {
  it('Flows: by folder and type', async () => {
    const api = fakeApi({ devices: [] });
    const service = new FlowService(fakeHomey(api), () => {});
    (service as any).read = async () => ({
      flows: new Map([
        ['flow:a', { id: 'flow:a', name: 'Spot 10', triggerable: true, advanced: false, folder: 'f' }],
        ['flow:b', { id: 'flow:b', name: 'Spot 2', triggerable: true, advanced: true }],
      ]),
      folders: new Map([['f', 'Bedroom']]),
    });
    expect((await service.listFlows('bedroom')).map(i => i.id)).toEqual(['flow:a']);
    expect((await service.listFlows('advanced')).map(i => i.id)).toEqual(['flow:b']);
    expect((await service.listFlows('')).map(i => i.name)).toEqual(['None', 'Spot 2', 'Spot 10']);
    (service as any).read = async () => ({ flows: new Map([['flow:c', { id: 'flow:c', name: 'Off', triggerable: false }]]), folders: new Map() });
    expect(await service.listFlows('')).toEqual([{ name: 'No Flows that can be started by hand', id: 'none', hint: true }]);
  });

  it('Variables: says when there are none', async () => {
    const api: any = fakeApi({ devices: [] });
    api.logic = { getVariables: async () => ({}) };
    const service = new VariableService(fakeHomey(api), () => {});
    expect(await service.listVariables('x')).toEqual([{ name: 'No variables found', id: 'none', hint: true }]);
  });
});

describe('the widgets read a row that only says something as nothing chosen', () => {
  it.each(['thermostat', 'heatmap', 'media'])('%s', (id) => {
    expect(readFileSync(`widgets/${id}/public/mount.js`, 'utf8')).toContain("settings.device.id !== 'none'");
  });
});

describe('the web editor\'s autocomplete list', () => {
  const ITEMS = [
    { name: 'None', id: 'none' },
    { name: 'Lamp', id: 'a' },
    { name: 'Desk', id: 'b' },
    { name: '3 more: keep typing', id: 'none', hint: true },
  ];

  async function open(current: unknown = { name: 'Desk', id: 'b' }, items: unknown[] = ITEMS) {
    const el = (tag: string, cls?: string, text?: string) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const wd: any = {
      el,
      button: (cls: string, text: string, fn: () => void) => {
        const b = el('button', cls, text) as HTMLButtonElement;
        b.addEventListener('click', fn);
        return b;
      },
      icon: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      t: (k: string) => k,
      request: async () => items,
      homeyRequest: async () => items,
      bracketQuery: () => '',
      toast: () => {},
    };
    (window as any).WidgetkeeperWeb = { part: (_: string, fn: (w: any) => void) => fn(wd) };
    new Function(readFileSync('settings/dashboard-pickers.js', 'utf8'))();
    const draft = { settings: { s: current } };
    const wrap = wd.autocompletePicker({ type: 't' }, { id: 's' }, draft);
    document.body.replaceChildren(wrap);
    (wrap.querySelector('.wd-choice') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    return { wrap, draft, wd, search: wrap.querySelector('input') as HTMLInputElement, rows: () => [...wrap.querySelectorAll('.wd-option')] as HTMLElement[] };
  }
  const key = (node: Element, name: string) => node.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  it('marks the current choice', async () => {
    const { rows } = await open();
    expect(rows().filter(r => r.classList.contains('current')).map(r => r.textContent)).toEqual(['Desk']);
    expect(rows()[2].getAttribute('aria-current')).toBe('true');
  });

  it("doesn't mark None, nor anything with nothing chosen", async () => {
    expect((await open(null)).rows().filter(r => r.classList.contains('current'))).toEqual([]);
    expect((await open({ id: 'none', name: 'None' })).rows().filter(r => r.classList.contains('current'))).toEqual([]);
  });

  it("marks the thermostat's presets, which have no id, by what they set", async () => {
    const { wd } = await open();
    const preset = { name: '21', capabilityId: 'target_temperature', value: 21 };
    expect(wd.isChosen(preset, { ...preset })).toBe(true);
    expect(wd.isChosen(preset, { ...preset, value: 22 })).toBe(false);
    expect(wd.isChosen(preset, { name: "Don't change" })).toBe(false);
  });

  it('shows a row that only says something as text, not a choice', async () => {
    const { rows, wrap } = await open();
    expect(rows().map(r => r.textContent)).toEqual(['None', 'Lamp', 'Desk']);
    expect([...wrap.querySelectorAll('.wd-options > p')].map(p => p.textContent)).toEqual(['3 more: keep typing']);
    const said = await open(null, [{ name: 'None', description: 'Pick a device first', id: 'none', hint: true }]);
    expect(said.wrap.querySelector('.wd-options > p')!.textContent).toBe('Pick a device first');
  });

  it('moves with the arrows, and Enter in the search takes the first row', async () => {
    const { search, rows, draft } = await open();
    search.focus();
    key(search, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[0]);
    key(rows()[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    key(rows()[1], 'ArrowUp');
    key(rows()[0], 'ArrowUp');
    expect(document.activeElement).toBe(search);
    key(search, 'Enter');
    expect(draft.settings.s).toMatchObject({ id: 'none' });
  });

  it('Escape on a row goes back to the search, and keeps the dialog open', async () => {
    const { search, rows } = await open();
    rows()[1].focus();
    const seen: string[] = [];
    document.body.addEventListener('keydown', e => seen.push(e.key));
    key(rows()[1], 'Escape');
    expect(document.activeElement).toBe(search);
    expect(seen).toEqual([]);
  });
});
