// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';

let win: any;
beforeAll(() => { win = loadWidget('battery'); });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const devices = () => [
  { id: 'a', name: 'Attic smoke', level: 81, low: false },
  { id: 'b', name: 'Back door', level: 8, low: null },
  { id: 'r', name: 'Remote', level: null, low: true },
  { id: 'p', name: 'Plug', none: true },
  { id: 'gone', missing: true },
  { id: 'k', name: 'Kitchen leak', level: 14, low: null },
  { id: 'ok', name: 'Button', level: null, low: false },
];

function widget(list: any[], opts: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const w = win.createBatteryWidget(root, opts);
  w.setState(list);
  const cells = () => [...root.querySelectorAll<HTMLElement>('.bt-cell')];
  const nums = () => cells().map(c => c.querySelector('.bt-num')!.textContent);
  const labels = () => cells().map(c => c.querySelector('.bt-label')!.textContent);
  const tones = () => cells().map(c => c.dataset.tone ?? null);
  return { w, root, cells, nums, labels, tones };
}

describe('batteryLevel', () => {
  it('is red below 10 %, yellow below 20 % by default, and by the limits given', () => {
    expect([5, 9.9, 10, 19, 20, 100].map(level => win.batteryLevel({ level }))).toEqual(['alert', 'alert', 'warn', 'warn', 'fine', 'fine']);
    expect([14, 15, 29, 30].map(level => win.batteryLevel({ level }, { red: 15, yellow: 30 }))).toEqual(['alert', 'warn', 'warn', 'fine']);
  });

  it('takes the low alarm without a level, the level over it, and nothing without either', () => {
    expect(win.batteryLevel({ level: null, low: true })).toBe('alert');
    expect(win.batteryLevel({ level: null, low: false })).toBe('fine');
    expect(win.batteryLevel({ level: 90, low: true })).toBe('fine');
    expect(win.batteryLevel({ level: null, low: null })).toBeNull();
  });
});

describe('createBatteryWidget', () => {
  it('lists the batteries lowest first: a low alarm on top, OK after the levels, a missing device last; no battery left out', () => {
    const { labels, nums } = widget(devices());
    expect(labels()).toEqual(['Remote', 'Back door', 'Kitchen leak', 'Attic smoke', 'Button', 'Unavailable']);
    expect(nums()).toEqual(['Low', '8%', '14%', '81%', 'OK', '–']);
  });

  it('writes the % small after the number, and a battery filled to the level', () => {
    const { cells } = widget([{ id: 'a', name: 'A', level: 64, low: null }]);
    expect(cells()[0].querySelector('.bt-pct')!.textContent).toBe('%');
    expect(cells()[0].querySelector('.bt-glyph-fill')!.getAttribute('width')).toBe(String(15 * 0.64));
    expect(cells()[0].getAttribute('aria-label')).toBe('A: 64 %');
  });

  it('fills each cell to its level only with Fill to the level', () => {
    const plain = widget(devices());
    expect(plain.root.classList.contains('bt-fill')).toBe(false);
    document.body.innerHTML = '';
    const { root, cells } = widget(devices(), { fillLevel: true });
    expect(root.classList.contains('bt-fill')).toBe(true);
    // Remote (Low), Back door 8 %, Kitchen leak 14 %, Attic smoke 81 %, Button (OK), the missing one.
    expect(cells().map(c => c.style.getPropertyValue('--bt-lvl'))).toEqual(['0.1', '0.08', '0.14', '0.81', '1', '']);
  });

  it('tones by the limits, green when fine unless turned off', () => {
    expect(widget(devices()).tones()).toEqual(['alert', 'alert', 'warn', 'fine', 'fine', null]);
    document.body.innerHTML = '';
    expect(widget(devices(), { greenWhenFine: false, redBelow: '15', yellowBelow: 90 }).tones()).toEqual(['alert', 'alert', 'alert', 'warn', null, null]);
  });

  it('counts the low and fine ones in the heading, and the ones that cannot be read', () => {
    const { root } = widget(devices());
    expect(root.querySelector('.bt-title')!.textContent).toBe('Batteries');
    expect(root.querySelector('.bt-summary')!.textContent).toBe('3 low · 2 fine · 1 unavailable');
  });

  it('marks an unavailable device and never counts it as fine', () => {
    const { root, cells } = widget([{ id: 'a', name: 'A', level: 90, low: null, offline: true }, { id: 'b', name: 'B', level: 50, low: null }]);
    expect(cells()[1].classList.contains('wk-offline')).toBe(true);
    expect(root.querySelector('.bt-summary')!.textContent).toBe('0 low · 1 fine · 1 unavailable');
  });

  it('takes a realtime change and sorts again', () => {
    const { w, labels, nums } = widget(devices());
    w.pushChange({ deviceId: 'a', capabilityId: 'measure_battery', value: 3 });
    expect(labels().slice(0, 2)).toEqual(['Remote', 'Attic smoke']);
    expect(nums()[1]).toBe('3%');
    w.pushChange({ deviceId: 'ok', capabilityId: 'alarm_battery', value: true });
    expect(labels().slice(0, 3)).toEqual(['Remote', 'Button', 'Attic smoke']);
  });

  it('says so when no device has a battery', () => {
    const { root } = widget([{ id: 'p', name: 'Plug', none: true }]);
    expect(root.querySelector('.bt-message')!.textContent).toBe('None of these devices has a battery.');
    expect(root.querySelector('.bt-tile')).toBeNull();
  });

  it('shows typed names, and a field per device to rename', () => {
    const named = widget(devices(), { tileNames: { b: 'Garage' } });
    named.w.setNames({ b: 'Garage' });
    expect(named.labels()).toContain('Garage');
    document.body.innerHTML = '';
    const { root } = widget(devices(), { renameTiles: true, onRename: async () => ({ ok: true }) });
    expect([...root.querySelectorAll('[data-rename]')].map(n => n.getAttribute('data-rename'))).toEqual(['r', 'b', 'k', 'a', 'ok']);
  });

  it('takes 2 or 4 per row, else 3', () => {
    expect(widget([], { columns: '4' }).root.dataset.columns).toBe('4');
    expect(widget([], { columns: 'x' }).root.dataset.columns).toBe('3');
  });
});
