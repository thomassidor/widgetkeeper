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
      .toEqual({ sum: 16, avg: 4, median: 4, min: 2, max: 6, lo: 'a', hi: 'b', n: 4 });
    expect(win.combineValues([{ name: 'a', value: 9 }, { name: 'b', value: 1 }, { name: 'c', value: 2 }]).median).toBe(2);
    expect(win.combineValues([{ name: 'a', value: 1 }, { name: 'b', value: 2 }, { name: 'c', value: 10 }, { name: 'd', value: 3 }]).median).toBe(2.5);
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
    ['sum', `${num(64.5, 1)}°C`, `${num(19.6, 1)}–${num(23.1, 1)}°C`],
    ['median', `${num(21.8, 1)}°C`, `${num(19.6, 1)}–${num(23.1, 1)}°C`],
    ['min', `${num(19.6, 1)}°C`, `Bedroom · up to ${num(23.1, 1)}°C`],
    ['max', `${num(23.1, 1)}°C`, `Office · from ${num(19.6, 1)}°C`],
  ])('%s: the value, for Lowest and Highest the device first and only the range\'s other end', (show, shown, line_) => {
    const { value, line } = widget({ capability: TEMP, devices: temps() }, { show });
    expect(value()).toBe(shown);
    expect(line()).toBe(line_);
  });

  it('Lowest – highest is the value itself, so the line is left out and the name centred', () => {
    const { value, line, q } = widget({ capability: TEMP, devices: temps() }, { show: 'range' });
    expect(value()).toBe(`${num(19.6, 1)}–${num(23.1, 1)}°C`);
    expect(line()).toBeNull();
    expect(q('.cv-head')!.classList.contains('one')).toBe(true);
  });

  it('spaces the dash between negative numbers', () => {
    const devices = [{ id: 'a', name: 'Garage', value: -17.2 }, { id: 'b', name: 'Kitchen', value: -19.5 }];
    expect(widget({ capability: TEMP, devices }).line()).toBe(`−${num(19.5, 1)} – −${num(17.2, 1)}°C`);
    expect(widget({ capability: TEMP, devices }, { show: 'max' }).line()).toBe(`Garage · from −${num(19.5, 1)}°C`);
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

  describe('the OK range', () => {
    const BATTERY = { id: 'measure_battery', title: 'Battery', units: '%', decimals: 0, min: 0, max: 100 };
    const batteries = () => [
      { id: 'a', name: 'Door', value: 80 }, { id: 'b', name: 'Hall', value: 15 }, { id: 'c', name: 'Attic', value: 5 }, { id: 'd', name: 'Desk', value: 60 },
    ];

    it("colours the tile by the shown value's level, and the dots outside it", () => {
      const low = widget({ capability: BATTERY, devices: batteries() }, { show: 'min', okRange: '>20' });
      expect(low.q('.cv-tile')!.dataset.level).toBe('far'); // 5 is 15 under 20, past half the limit
      expect(low.all('.cv-dot[data-level]').map(d => [d.title, d.dataset.level])).toEqual([['Hall: 15%', 'out'], ['Attic: 5%', 'far']]);
      const avg = widget({ capability: BATTERY, devices: batteries() }, { okRange: '>20' });
      expect(avg.q('.cv-tile')!.dataset.level).toBeUndefined(); // 40 is fine
      const range = widget({ capability: BATTERY, devices: batteries() }, { show: 'range', okRange: '10–90' });
      expect(range.q('.cv-tile')!.dataset.level).toBe('out'); // the worse end, 5
    });

    it("empty is none, even for a value Value Matrix knows a usual range of (an outdoor sensor, a freezer)", () => {
      const cold = [...temps(), { id: 'g', name: 'Garage', value: 6 }];
      expect(widget({ capability: TEMP, devices: cold }, { show: 'min' }).q('[data-level]')).toBeNull();
      expect(widget({ capability: TEMP, devices: cold }, { show: 'min', okRange: '–' }).q('[data-level]')).toBeNull();
      expect(widget({ capability: TEMP, devices: cold }, { show: 'min', okRange: '18–24' }).q('.cv-tile')!.dataset.level).toBe('far');
    });

    it('reads a 0–1 percentage in percent', () => {
      const dim = { id: 'dim', title: 'Brightness', units: '%', decimals: 2, min: 0, max: 1 };
      const w = widget({ capability: dim, devices: [{ id: 'a', name: 'A', value: 0.15 }, { id: 'b', name: 'B', value: 0.5 }] }, { show: 'min', okRange: '>20' });
      expect(w.q('.cv-tile')!.dataset.level).toBe('out');
    });

    it('counts the devices outside it, naming them worst first', () => {
      const { value, line, q, root } = widget({ capability: BATTERY, devices: batteries() }, { show: 'out', okRange: '>20', range: false });
      expect([q('.cv-number')!.textContent, q('.cv-units')!.textContent]).toEqual(['2', 'of 4']);
      expect(value()).toBe('2of 4');
      expect(line()).toBe('Attic, Hall');
      expect(q('.cv-tile')!.dataset.level).toBe('far');
      expect(root.dataset.chart).toBe('dots');
      const pill = widget({ capability: BATTERY, devices: batteries() }, { show: 'out', okRange: '>20', tileStyle: 'pill' });
      expect(pill.line()).toBe(`2 of 4 · Attic, Hall · ${num(5)}–${num(80)}%`);
    });

    it('says all are within it, or that it needs one', () => {
      const fine = widget({ capability: BATTERY, devices: batteries() }, { show: 'out', okRange: '>1', range: false });
      expect(fine.q('.cv-number')!.textContent).toBe('0');
      expect(fine.line()).toBe('All within range');
      expect(fine.q('.cv-tile')!.dataset.level).toBeUndefined();
      const none = widget({ capability: POWER, devices: power() }, { show: 'out' });
      expect(none.value()).toBe('–');
      expect(none.line()).toBe('Set an OK range in the settings');
    });
  });

  it('leaves out a device in other units, saying so, and lists it apart', () => {
    const devices = [...power().slice(0, 2), { id: 'w', name: 'Old meter', value: 5000, otherUnits: 'kW' }];
    const { q, line, all, w } = widget({ capability: POWER, devices }, { show: 'sum' });
    expect(q('.cv-number')!.textContent).toBe(num(2220));
    expect(line()).toBe('1 of 3 left out');
    expect(all('.cv-share i').length).toBe(2);
    w.toggle();
    expect(all('.cv-row').map(r => r.textContent)).toEqual([`Heat pump${num(1240)} W`, `Oven${num(980)} W`, `Old meter${num(5000)} kW`]);
    expect(q('.cv-row.left .cv-row-value')!.title).toBe('other unit, left out');
  });

  describe('the list a tap opens', () => {
    const tap = (node: HTMLElement) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    it('is closed until a tap on the tile, and a tap on either closes it', () => {
      const { q, root } = widget({ capability: TEMP, devices: temps() });
      const tile = q('.cv-tile')!;
      expect(q('.cv-list')!.hidden).toBe(true);
      expect(tile.getAttribute('aria-expanded')).toBe('false');
      tap(tile);
      expect(q('.cv-list')!.hidden).toBe(false);
      expect(tile.getAttribute('aria-expanded')).toBe('true');
      expect(root.classList.contains('cv-open')).toBe(true);
      tap(q('.cv-list')!);
      expect(q('.cv-list')!.hidden).toBe(true);
    });

    it('calls onTap (the haptic tick), and does nothing before a value', () => {
      const onTap = vi.fn();
      const { q } = widget(null, { onTap });
      tap(q('.cv-tile')!);
      expect(onTap).not.toHaveBeenCalled();
      expect(q('.cv-list')!.hidden).toBe(true);
    });

    it('lists every device in the order of the value, the one it comes from bold, then the unread and unavailable', () => {
      const devices = [...temps(), { id: 'k', name: 'Kitchen', value: null }, { id: 'x', missing: true }];
      const min = widget({ capability: TEMP, devices }, { show: 'min' });
      min.w.toggle();
      expect(min.all('.cv-row').map(r => r.textContent)).toEqual([
        `Bedroom${num(19.6, 1)}°C`, `Living room${num(21.8, 1)}°C`, `Office${num(23.1, 1)}°C`, 'Kitchen–', '1 unavailable',
      ]);
      expect(min.all('.cv-row.hl').map(r => r.querySelector('.cv-row-name')!.textContent)).toEqual(['Bedroom']);
      const max = widget({ capability: TEMP, devices: temps() }, { show: 'max' });
      max.w.toggle();
      expect(max.all('.cv-row-name').map(r => r.textContent)).toEqual(['Office', 'Living room', 'Bedroom']);
    });

    it("marks the devices outside the OK range, worst first when counting them, and follows changes", () => {
      const { w, all } = widget({ capability: TEMP, devices: temps() }, { show: 'out', okRange: '20–23' });
      w.toggle();
      expect(all('.cv-row').map(r => [r.querySelector('.cv-row-name')!.textContent, r.querySelector('.cv-mark')!.getAttribute('data-level')]))
        .toEqual([['Bedroom', 'out'], ['Office', 'out'], ['Living room', 'good']]);
      w.pushChange({ deviceId: 'l', capabilityId: 'measure_temperature', value: 30 });
      expect(all('.cv-row').map(r => r.querySelector('.cv-mark')!.getAttribute('data-level'))).toEqual(['far', 'out', 'out']);
    });
  });

  describe('Rename tiles (1.3.1)', () => {
    const tap = (node: HTMLElement) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const fields = (all: (s: string) => HTMLElement[]) => all('.wk-rename') as HTMLInputElement[];

    it('uses a typed name everywhere the widget names a device, and the own name without one', () => {
      const min = widget({ capability: TEMP, devices: temps() }, { show: 'min' });
      min.w.setNames({ b: 'Guest room' });
      expect(min.line()).toBe(`Guest room · up to ${num(23.1, 1)}°C`);
      expect(min.all('.cv-end').map(e => e.textContent)).toEqual(['Guest room', 'Office']);
      expect(min.q('.cv-dot.hl')!.title).toBe(`Guest room: ${num(19.6, 1)}°C`);
      min.w.toggle();
      expect(min.all('.cv-row-name').map(e => e.textContent)).toEqual(['Guest room', 'Living room', 'Office']);
      min.w.setNames({});
      expect(min.all('.cv-row-name').map(e => e.textContent)).toEqual(['Bedroom', 'Living room', 'Office']);

      const out = widget({ capability: TEMP, devices: temps() }, { show: 'out', okRange: '20–23' });
      out.w.setNames({ o: 'Study' });
      expect(out.line()).toMatch(/^Bedroom, Study · /);
      const share = widget({ capability: POWER, devices: power().slice(0, 3) }, { show: 'sum' });
      share.w.setNames({ h: 'Heating' });
      expect(share.all('.cv-key-name').map(e => e.textContent)).toEqual(['Heating', 'Oven', 'Dishwasher']);
    });

    it('keeps the list open with a field per device in the order picked, saved on change; taps do nothing', () => {
      const onRename = vi.fn(async () => {});
      const devices = [...temps(), { id: 'k', name: 'Kitchen', value: null }, { id: 'x', missing: true }];
      const { w, q, all, root } = widget({ capability: TEMP, devices }, { renameTiles: true, onRename, show: 'max' });
      expect(root.classList.contains('renaming')).toBe(true);
      expect(q('.cv-list')!.hidden).toBe(false);
      // Every device that answered (also one without a reading), in the order picked, not by value.
      expect(fields(all).map(f => f.placeholder)).toEqual(['Living room', 'Bedroom', 'Office', 'Kitchen']);
      w.setNames({ l: 'Lounge' });
      expect(fields(all)[0].value).toBe('Lounge');
      expect(fields(all)[0].placeholder).toBe('Living room');
      const office = fields(all)[2];
      office.value = '  Study  ';
      office.dispatchEvent(new Event('change'));
      expect(onRename).toHaveBeenLastCalledWith('o', 'Study');
      expect(all('.cv-end').map(e => e.textContent)).toEqual(['Bedroom', 'Study']);
      // The same field stays: a change re-renders without rebuilding it.
      w.pushChange({ deviceId: 'o', capabilityId: 'measure_temperature', value: 24 });
      expect(fields(all)[2]).toBe(office);
      const before = root.innerHTML;
      for (const node of [q('.cv-tile')!, q('.cv-list')!, office]) tap(node);
      expect(q('.cv-list')!.hidden).toBe(false);
      expect(root.innerHTML).toBe(before);
    });

    it('puts the name back when it could not be saved, and says so', async () => {
      vi.useFakeTimers();
      const onRename = vi.fn(async () => { throw new Error('offline'); });
      const { all, q } = widget({ capability: TEMP, devices: temps() }, { renameTiles: true, onRename, show: 'min' });
      const field = fields(all)[1];
      field.value = 'Nope';
      field.dispatchEvent(new Event('change'));
      await vi.runAllTicks();
      await Promise.resolve();
      await Promise.resolve();
      expect(q('.cv-line')!.textContent).toMatch(/^Bedroom/);
      expect(q('.cv-message')!.textContent).toBe('Could not save the name.');
    });
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
    expect(picked.api.mock.calls[0][1]).toMatch(/^\/state\?deviceIds=a,b&capabilityId=measure_temperature&perf=/);
    const all = mount({ capability: { id: 'measure_temperature' } }, []);
    await settle();
    expect(all.api.mock.calls[0][1]).toMatch(/^\/state\?deviceIds=&capabilityId=measure_temperature&perf=/);
  });

  it('says to pick a value without one (or with None)', async () => {
    const { api, root } = mount({ capability: { id: 'none' } }, ['a']);
    await settle();
    expect(api).not.toHaveBeenCalled();
    expect(root.querySelector('.cv-message')!.textContent).toBe('Pick a value in the widget settings.');
    expect(root.querySelector<HTMLElement>('.cv-tile')!.style.display).toBe('none');
  });

  it('asks for the typed names with the state, and saves one with the instance', async () => {
    const answer = { state: { capability: TEMP, devices: temps() }, tileNames: { b: 'Guest room' } };
    const { api, root } = mount({ capability: { id: 'measure_temperature' }, show: 'min', renameTiles: true }, [], answer);
    await settle();
    expect(api.mock.calls[0][1]).toMatch(/&instance=default$/);
    expect(root.querySelector('.cv-line')!.textContent).toMatch(/^Guest room/);
    const field = root.querySelectorAll<HTMLInputElement>('.wk-rename')[0];
    field.value = 'Lounge';
    field.dispatchEvent(new Event('change'));
    await settle();
    expect(api).toHaveBeenLastCalledWith('POST', '/names', { instance: 'default', key: 'l', name: 'Lounge' });
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

describe('Green when fine (1.3.0)', () => {
  const BATTERY = { id: 'measure_battery', title: 'Battery', units: '%', decimals: 0, min: 0, max: 100 };
  const batteries = () => [
    { id: 'a', name: 'Door', value: 80 }, { id: 'b', name: 'Hall', value: 15 }, { id: 'c', name: 'Attic', value: 5 }, { id: 'd', name: 'Desk', value: 60 },
  ];
  it('colours the tile green inside the OK range only when asked; outside it stays orange or red', () => {
    const level = (opts: object) => widget({ capability: BATTERY, devices: batteries() }, opts).q('.cv-tile')!.dataset.level ?? null;
    expect(level({ okRange: '0–100' })).toBeNull();
    expect(level({ okRange: '0–100', greenWhenFine: true })).toBe('good');
    expect(level({ okRange: '>20', show: 'min', greenWhenFine: true })).not.toBe('good');
    // Without a range nothing is judged.
    expect(level({ greenWhenFine: true })).toBeNull();
  });
});
