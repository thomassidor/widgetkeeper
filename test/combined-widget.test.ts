// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadMount, loadWidget } from './helpers/loadWidget.js';

let win: any;
beforeAll(() => { win = loadWidget('combined'); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

// Expected numbers in the system locale: CI runs in en-US, a developer's machine maybe not.
const num = (n: number, digits = 0) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });

const TEMP = { id: 'measure_temperature', title: 'Temperature', units: '°C', decimals: 1, min: null, max: null };
const POWER = { id: 'measure_power', title: 'Power', units: 'W', decimals: 0, min: null, max: null };
const temps = () => [
  { id: 'l', name: 'Living room', value: 21.8 }, { id: 'b', name: 'Bedroom', value: 19.6 }, { id: 'o', name: 'Office', value: 23.1 },
];
const power = () => [
  { id: 'h', name: 'Heat pump', value: 1240 }, { id: 'v', name: 'Oven', value: 980 }, { id: 'd', name: 'Dishwasher', value: 610 },
  { id: 'l', name: 'Lights', value: 210 }, { id: 't', name: 'TV', value: 140 },
];

function widget(state: any, opts: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createCombinedWidget(root, opts);
  if (state) w.setState(state);
  const q = (s: string) => root.querySelector<HTMLElement>(s);
  const all = (s: string) => [...root.querySelectorAll<HTMLElement>(s)];
  return {
    w, root, q, all,
    value: () => q('.cv-value')!.textContent,
    line: () => (q('.cv-line')!.hidden ? null : q('.cv-line')!.textContent),
    name: () => q('.cv-name')!.textContent,
  };
}

describe('combineValues', () => {
  it('sums, averages and finds the lowest and highest, naming the first device at each', () => {
    expect(win.combineValues([{ name: 'a', value: 2 }, { name: 'b', value: 6 }, { name: 'c', value: 2 }, { name: 'd', value: 6 }]))
      .toEqual({ sum: 16, avg: 4, min: 2, max: 6, lo: 'a', hi: 'b', n: 4 });
    expect(win.combineValues([])).toBeNull();
  });
});

describe('the Combined Value widget', () => {
  it('shows no tile before its first state', () => {
    expect(widget(null).q('.cv-tile')!.style.display).toBe('none');
  });

  it('shows the average large with its units, the name, and the range under it (the default)', () => {
    const { value, line, name, q, root } = widget({ capability: TEMP, devices: temps() }, { name: 'Indoor' });
    expect(value()).toBe(`${num(21.5, 1)}°C`);
    expect(q('.cv-units')!.className).toContain('tight');
    expect(name()).toBe('Indoor');
    expect(line()).toBe(`${num(19.6, 1)}–${num(23.1, 1)}°C`);
    expect(root.dataset.chart).toBe('dots');
  });

  it("names the value by the capability's title without a typed name", () => {
    expect(widget({ capability: TEMP, devices: temps() }, { name: '  ' }).name()).toBe('Temperature');
  });

  it.each([
    ['sum', `${num(64.5, 1)}°C`, null],
    ['min', `${num(19.6, 1)}°C`, 'Bedroom'],
    ['max', `${num(23.1, 1)}°C`, 'Office'],
  ])('%s: the value, and for Lowest and Highest the device first', (show, shown, device) => {
    const { value, line } = widget({ capability: TEMP, devices: temps() }, { show });
    expect(value()).toBe(shown);
    expect(line()).toBe([device, `${num(19.6, 1)}–${num(23.1, 1)}°C`].filter(Boolean).join(' · '));
  });

  it('Lowest – highest is the value itself, so the line is left out and the name centred', () => {
    const { value, line, q } = widget({ capability: TEMP, devices: temps() }, { show: 'range' });
    expect(value()).toBe(`${num(19.6, 1)}–${num(23.1, 1)}°C`);
    expect(line()).toBeNull();
    expect(q('.cv-head')!.classList.contains('one')).toBe(true);
  });

  it('spaces the dash between negative numbers', () => {
    const devices = [{ id: 'a', name: 'Garage', value: -17.2 }, { id: 'b', name: 'Kitchen', value: -19.5 }];
    expect(widget({ capability: TEMP, devices }, { show: 'max' }).line()).toBe(`Garage · −${num(19.5, 1)} – −${num(17.2, 1)}°C`);
  });

  it('without the range shows no line (or just the device)', () => {
    expect(widget({ capability: TEMP, devices: temps() }, { range: false }).line()).toBeNull();
    expect(widget({ capability: TEMP, devices: temps() }, { range: false, show: 'min' }).line()).toBe('Bedroom');
  });

  it('dots: one per device, the average a tick, the lowest and highest named under the ends', () => {
    const { all, q } = widget({ capability: TEMP, devices: temps() });
    expect(all('.cv-dot').length).toBe(3);
    expect(q('.cv-avg')).not.toBeNull();
    expect(all('.cv-end').map(e => e.textContent)).toEqual(['Bedroom', 'Office']);
    expect(all('.cv-end.hl').length).toBe(0);
    expect(q('.cv-zero')).toBeNull();
  });

  it('dots highlight the device the value comes from, or both ends for Lowest – highest', () => {
    const max = widget({ capability: TEMP, devices: temps() }, { show: 'max' });
    expect(max.all('.cv-dot.hl').map(d => d.title)).toEqual([`Office: ${num(23.1, 1)}°C`]);
    expect(max.all('.cv-end.hl').map(e => e.textContent)).toEqual(['Office']);
    expect(max.q('.cv-avg')).toBeNull();
    const range = widget({ capability: TEMP, devices: temps() }, { show: 'range' });
    expect(range.all('.cv-dot.hl').length).toBe(2);
    expect(range.q('.cv-band.hl')).not.toBeNull();
  });

  it('puts a percentage on 0–100, scaling a 0–1 one', () => {
    const dim = { id: 'dim', title: 'Brightness', units: '%', decimals: 2, min: 0, max: 1 };
    const { all, value } = widget({ capability: dim, devices: [{ id: 'a', name: 'A', value: 0.25 }, { id: 'b', name: 'B', value: 0.75 }] });
    expect(value()).toBe('50%');
    expect(all('.cv-dot').map(d => d.style.left)).toEqual(['25.00%', '75.00%']);
  });

  it('a sum of values that are all zero or more gets the share bar: the biggest three and Others', () => {
    const { root, all, q } = widget({ capability: POWER, devices: power() }, { show: 'sum' });
    expect(root.dataset.chart).toBe('share');
    expect(all('.cv-share i').map(i => i.dataset.share)).toEqual(['blue', 'green', 'orange', 'others']);
    expect(all('.cv-key').map(k => k.textContent)).toEqual(['Heat pump39%', 'Oven31%', 'Dishwasher19%', 'Others11%']);
    expect(q('.cv-dot')).toBeNull();
  });

  it('names every part with four devices or fewer', () => {
    const { all } = widget({ capability: POWER, devices: power().slice(0, 4) }, { show: 'sum' });
    expect(all('.cv-share i').map(i => i.dataset.share)).toEqual(['blue', 'green', 'orange', 'purple']);
  });

  it('a sum with a negative value gets the dots, with a zero mark', () => {
    const devices = [{ id: 'm', name: 'Meter', value: 1830 }, { id: 's', name: 'Solar', value: -2410 }];
    const { root, q } = widget({ capability: POWER, devices }, { show: 'sum' });
    expect(root.dataset.chart).toBe('dots');
    expect(q('.cv-zero')).not.toBeNull();
    expect([q('.cv-number')!.textContent, q('.cv-units')!.textContent]).toEqual([`−${num(580)}`, 'W']);
  });

  it('without the chart shows none', () => {
    const { q, root } = widget({ capability: TEMP, devices: temps() }, { chart: false });
    expect(q('.cv-chart')!.hidden).toBe(true);
    expect(root.dataset.chart).toBe('none');
  });

  it('folds the devices that answered, saying how many didn\'t in place of the range', () => {
    const devices = [...temps(), { id: 'x', missing: true }, { id: 'k', name: 'Kitchen', value: null }];
    const { value, line, all } = widget({ capability: TEMP, devices });
    expect(value()).toBe(`${num(21.5, 1)}°C`);
    expect(line()).toBe('2 of 5 not read');
    expect(all('.cv-dot').length).toBe(3);
  });

  it('shows a dash when no device answered', () => {
    const { value, line, q } = widget({ capability: TEMP, devices: [{ id: 'x', missing: true }] });
    expect(value()).toBe('–');
    expect(line()).toBe('1 of 1 not read');
    expect(q('.cv-chart')!.hidden).toBe(true);
  });

  it("says so when none of the devices has the value", () => {
    const { q } = widget({ capability: null, devices: [] });
    expect(q('.cv-message')!.textContent).toBe('None of the devices has this value.');
    expect(q('.cv-tile')!.style.display).toBe('none');
  });

  it('takes a change of a counted device, and ignores other values and devices', () => {
    const { w, value } = widget({ capability: TEMP, devices: temps() }, { show: 'max' });
    w.pushChange({ deviceId: 'b', capabilityId: 'measure_temperature', value: 25 });
    expect(value()).toBe('25°C');
    w.pushChange({ deviceId: 'b', capabilityId: 'measure_humidity', value: 90 });
    w.pushChange({ deviceId: 'zz', capabilityId: 'measure_temperature', value: 90 });
    expect(value()).toBe('25°C');
  });

  it('pill: the value and the line under the name, the dots (or the share) on the right without names', () => {
    const { root, line, all, q } = widget({ capability: TEMP, devices: temps() }, { tileStyle: 'pill' });
    expect(root.classList.contains('cv-pill')).toBe(true);
    expect(line()).toBe(`${num(21.5, 1)}°C · ${num(19.6, 1)}–${num(23.1, 1)}°C`);
    expect(q('.cv-head .cv-chart .cv-strip')).not.toBeNull();
    expect(all('.cv-end').length).toBe(0);
    const sum = widget({ capability: POWER, devices: power() }, { tileStyle: 'pill', show: 'sum', range: false });
    expect(sum.line()).toBe(`${num(3180)} W`);
    expect(sum.q('.cv-legend')).toBeNull();
    expect(sum.all('.cv-share i').length).toBe(4);
  });

  it('a colour tints the tile, Vivid fills it; without one the tile stays plain', () => {
    const muted = widget({ capability: TEMP, devices: temps() }, { color: 'teal' });
    expect(muted.root.dataset.wkColor).toBe('teal');
    expect(muted.root.classList.contains('cv-colored')).toBe(true);
    const vivid = widget({ capability: TEMP, devices: temps() }, { color: 'teal', colorStyle: 'deep' });
    expect(vivid.root.classList.contains('wk-deep')).toBe(true);
    const plain = widget({ capability: TEMP, devices: temps() }, { color: 'default' });
    expect(plain.root.dataset.wkColor).toBeUndefined();
    expect(plain.root.classList.contains('cv-colored')).toBe(false);
  });

  it('keeps the tile on a failed refresh, with a passing message', () => {
    vi.useFakeTimers();
    const { w, q } = widget({ capability: TEMP, devices: temps() });
    w.setMessage('Could not load the value.', true);
    expect(q('.cv-tile')!.style.display).toBe('');
    expect(q('.cv-message')!.classList.contains('error')).toBe(true);
    vi.advanceTimersByTime(9000);
    expect(q('.cv-message')!.style.display).toBe('none');
  });
});

describe('the Combined Value mount', () => {
  function mount(settings: object, deviceIds: string[], answer: any = { capability: TEMP, devices: temps() }) {
    const handlers: Record<string, (data: any) => void> = {};
    const api = vi.fn(async (_method: string, _path: string) => answer);
    const Homey = {
      getSettings: () => settings, getDeviceIds: async () => deviceIds, api, __: (k: string) => k, ready: vi.fn(), setHeight: vi.fn(),
      on: (event: string, fn: (data: any) => void) => { handlers[event] = fn; },
    };
    loadMount('combined');
    const root = document.createElement('div');
    document.body.append(root);
    win.mountCombinedWidget(Homey, { root, frame: root });
    return { api, handlers, root };
  }
  const settle = () => new Promise(r => setTimeout(r, 0));

  it('asks for the value of the picked devices, or of every device with it', async () => {
    const picked = mount({ capability: { id: 'measure_temperature' } }, ['a', 'b']);
    await settle();
    expect(picked.api.mock.calls[0][1]).toMatch(/^\/state\?capabilityId=measure_temperature&deviceIds=a,b&perf=/);
    const all = mount({ capability: { id: 'measure_temperature' } }, []);
    await settle();
    expect(all.api.mock.calls[0][1]).toMatch(/^\/state\?capabilityId=measure_temperature&perf=/);
  });

  it('says to pick a value without one (or with None)', async () => {
    const { api, root } = mount({ capability: { id: 'none' } }, ['a']);
    await settle();
    expect(api).not.toHaveBeenCalled();
    expect(root.querySelector('.cv-message')!.textContent).toBe('Pick a value in the widget settings.');
    expect(root.querySelector<HTMLElement>('.cv-tile')!.style.display).toBe('none');
  });

  it("takes Value Matrix's realtime changes of the counted devices and that value only", async () => {
    const { handlers, root } = mount({ capability: { id: 'measure_temperature' }, show: 'max' }, []);
    await settle();
    handlers['valuematrix:state']({ deviceId: 'b', capabilityId: 'measure_temperature', value: 30 });
    handlers['valuematrix:state']({ deviceId: 'zz', capabilityId: 'measure_temperature', value: 40 });
    handlers['valuematrix:state']({ deviceId: 'b', capabilityId: 'measure_humidity', value: 50 });
    expect(root.querySelector('.cv-value')!.textContent).toBe('30°C');
  });
});
