// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWidget } from './helpers/loadWidget.js';
import { touch as fireTouch } from './helpers/touch.js';

let win: any;
beforeAll(() => { win = loadWidget('flows'); });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const flow = (id: string, name: string, extra: object = {}) => ({ id, name, enabled: true, triggerable: true, advanced: false, ...extra });

function widget(flows: any[], extra: object = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const onTrigger = vi.fn(async (_id: string) => {});
  const onHaptic = vi.fn();
  const w = win.createFlowsWidget(root, { onTrigger, onHaptic, ...extra });
  w.setState(flows);
  const rows = () => [...root.querySelectorAll<HTMLElement>('.fb-row')];
  const row = (i: number) => rows()[i];
  const message = () => root.querySelector<HTMLElement>('.fb-message')!;
  return { w, root, rows, row, onTrigger, onHaptic, message };
}

describe('render', () => {
  it('shows one row per button: its colour and icon, then the name', () => {
    const { rows, row } = widget([flow('flow:1', 'Good night'), flow('advanced:2', 'Movie time'), { id: 'flow:3', missing: true }], {
      buttons: [{ id: 'flow:1', color: 'purple', icon: 'moon' }, { id: 'advanced:2', color: 'nope', icon: 'nope' }, { id: 'flow:3' }],
    });
    expect(rows().map(r => r.querySelector('.fb-name')!.textContent)).toEqual(['Good night', 'Movie time', 'Flow not found']);
    expect(rows().map(r => r.dataset.color)).toEqual(['purple', 'blue', 'blue']);
    expect(row(0).querySelector('.fb-button svg path')!.getAttribute('d')).not.toBe(row(1).querySelector('.fb-button svg path')!.getAttribute('d'));
    expect(row(2).classList.contains('missing')).toBe(true);
  });

  it("dims a flow that is turned off or can't be started by hand", () => {
    const { row } = widget([flow('flow:1', 'Away', { enabled: false }), flow('flow:2', 'Motion', { triggerable: false }), flow('flow:3', 'Ok')]);
    expect(row(0).classList.contains('unavailable')).toBe(true);
    expect(row(1).classList.contains('unavailable')).toBe(true);
    expect(row(2).classList.contains('unavailable')).toBe(false);
  });

  it('sets the column count', () => {
    expect(widget([flow('flow:1', 'A')], { columns: '2' }).root.dataset.columns).toBe('2');
    expect(widget([flow('flow:1', 'A')]).root.dataset.columns).toBe('1');
  });

  it('shows a persistent message instead of the rows', () => {
    const { w, rows, message } = widget([flow('flow:1', 'A')]);
    w.setMessage('Pick flows in the widget settings.');
    expect(rows()).toHaveLength(0);
    expect(message().textContent).toBe('Pick flows in the widget settings.');
  });
});

describe('colour from a Flow', () => {
  it("wins over the button's own colour, on every button starting that flow", () => {
    const { rows } = widget([flow('flow:1', 'Charge bike', { color: 'green' }), flow('flow:2', 'B'), flow('flow:1', 'Again', { color: 'green' })], {
      buttons: [{ id: 'flow:1', color: 'purple' }, { id: 'flow:2', color: 'red' }, { id: 'flow:1', color: 'grey' }],
    });
    expect(rows().map(r => r.dataset.color)).toEqual(['green', 'red', 'green']);
    expect(rows().map(r => r.classList.contains('flow-color'))).toEqual([true, false, true]);
  });

  it("changes live, and null gives the buttons their own colour again", () => {
    const { w, rows } = widget([flow('flow:1', 'A'), flow('flow:2', 'B')], { buttons: [{ id: 'flow:1', color: 'purple' }, { id: 'flow:2' }] });
    w.pushColor({ id: 'flow:1', color: 'orange' });
    expect(rows().map(r => r.dataset.color)).toEqual(['orange', 'blue']);
    expect(rows()[0].classList.contains('flow-color')).toBe(true);
    w.pushColor({ id: 'flow:1', color: null });
    expect(rows().map(r => r.dataset.color)).toEqual(['purple', 'blue']);
    expect(rows()[0].classList.contains('flow-color')).toBe(false);
  });

  it('ignores an unknown colour and a missing flow', () => {
    const { w, rows } = widget([{ id: 'flow:1', missing: true }, flow('flow:2', 'B')], { buttons: [{ id: 'flow:1' }, { id: 'flow:2', color: 'red' }] });
    w.pushColor({ id: 'flow:1', color: 'green' });
    w.pushColor({ id: 'flow:2', color: 'magenta' });
    expect(rows().map(r => r.dataset.color)).toEqual(['blue', 'red']);
    expect(rows().some(r => r.classList.contains('flow-color'))).toBe(false);
  });

  it('takes the 1.2.0 colours from the card, grey too (the neutral button, the row tinted in Muted)', () => {
    const { w, rows } = widget([flow('flow:1', 'A')], { buttons: [{ id: 'flow:1', color: 'red' }] });
    w.pushColor({ id: 'flow:1', color: 'teal' });
    expect(rows()[0].dataset.color).toBe('teal');
    w.pushColor({ id: 'flow:1', color: 'grey' });
    expect(rows()[0].dataset.color).toBe('grey');
    expect(rows()[0].classList.contains('flow-color')).toBe(true);
  });
});

describe('start', () => {
  it('starts the flow on a tap, with a spinner, then a check mark', async () => {
    const { row, onTrigger, onHaptic } = widget([flow('flow:1', 'Good night')]);
    row(0).click();
    expect(onTrigger).toHaveBeenCalledWith('flow:1');
    expect(onHaptic).toHaveBeenCalled();
    expect(row(0).classList.contains('running')).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(row(0).classList.contains('running')).toBe(false);
    expect(row(0).classList.contains('done')).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(row(0).classList.contains('done')).toBe(false);
  });

  it('ignores taps while it is starting', async () => {
    const { row, onTrigger } = widget([flow('flow:1', 'Good night')]);
    row(0).click();
    row(0).click();
    expect(onTrigger).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
  });

  it('starts on a touch tap, but not on a drag', () => {
    const { row, onTrigger } = widget([flow('flow:1', 'Good night')]);
    const touch = (type: string, x: number, y: number) => fireTouch(row(0), type, x, y);
    touch('touchstart', 10, 10); touch('touchmove', 10, 40); touch('touchend', 10, 40);
    expect(onTrigger).not.toHaveBeenCalled();
    touch('touchstart', 10, 10); touch('touchend', 12, 11);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("says why it couldn't start: the API key, or a failure", async () => {
    const { row, onTrigger, message } = widget([flow('flow:1', 'Good night')]);
    onTrigger.mockRejectedValueOnce(Object.assign(new Error('noKey'), { reason: 'noKey' }));
    row(0).click();
    await vi.advanceTimersByTimeAsync(400);
    expect(message().textContent).toBe('To start flows, add an API key in the app settings.');
    expect(row(0).classList.contains('shake')).toBe(true);
    onTrigger.mockRejectedValueOnce(new Error('boom'));
    row(0).click();
    await vi.advanceTimersByTimeAsync(400);
    expect(message().textContent).toBe('Could not start Good night.');
    expect(row(0).classList.contains('done')).toBe(false);
  });

  it("doesn't send a flow that is turned off or can't be started by hand, and says so", () => {
    const { row, onTrigger, message } = widget([flow('flow:1', 'Away', { enabled: false }), flow('flow:2', 'Motion', { triggerable: false })]);
    row(0).click();
    expect(message().textContent).toBe('Away is turned off.');
    row(1).click();
    expect(message().textContent).toBe("Motion can't be started by hand.");
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does nothing for a missing flow', () => {
    const { row, onTrigger } = widget([{ id: 'flow:1', missing: true }]);
    row(0).click();
    expect(onTrigger).not.toHaveBeenCalled();
  });
});

describe('name override', () => {
  it("shows a button's own name, also in its messages, and keeps the flow's when empty", () => {
    const { rows, row, message } = widget([flow('flow:1', 'Good night', { enabled: false }), flow('flow:2', 'Movie time')], {
      buttons: [{ id: 'flow:1', name: '  Bedtime ' }, { id: 'flow:2', name: '' }],
    });
    expect(rows().map(r => r.querySelector('.fb-name')!.textContent)).toEqual(['Bedtime', 'Movie time']);
    row(0).click();
    expect(message().textContent).toContain('Bedtime');
  });

  it('says a missing flow is missing, whatever its name', () => {
    const { rows } = widget([{ id: 'flow:3', missing: true }], { buttons: [{ id: 'flow:3', name: 'Bedtime' }] });
    expect(rows()[0].querySelector('.fb-name')!.textContent).toBe('Flow not found');
  });
});

describe('Activate with (press, 1.3.0)', () => {
  const FLOWS = [{ id: 'flow:a', name: 'Alarm on', enabled: true, triggerable: true, advanced: false }];
  function make(press: string) {
    const root = document.createElement('div');
    document.body.append(root);
    const onTrigger = vi.fn(async () => {});
    const onHaptic = vi.fn();
    const w = win.createFlowsWidget(root, { press, buttons: [{ id: 'flow:a' }], onTrigger, onHaptic });
    w.setState(FLOWS);
    const row = root.querySelector<HTMLElement>('.fb-row')!;
    return { root, row, onTrigger, onHaptic, name: () => row.querySelector('.fb-name')!.textContent };
  }

  it('Double: the first tap asks again (red, Tap again), the second within 3 s starts the flow', async () => {
    const { row, onTrigger, name } = make('double');
    row.click();
    expect([onTrigger.mock.calls.length, row.classList.contains('confirm'), name()]).toEqual([0, true, 'Tap again']);
    row.click();
    expect(onTrigger).toHaveBeenCalledWith('flow:a');
    expect(row.classList.contains('confirm')).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    // Too late: it asks again.
    row.click();
    await vi.advanceTimersByTimeAsync(3100);
    expect([row.classList.contains('confirm'), name()]).toEqual([false, 'Alarm on']);
    row.click();
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('Long: a tap only says Hold; holding until full starts it and vibrates as the finger lifts', async () => {
    const { row, onTrigger, onHaptic, name } = make('long');
    row.click();
    expect([onTrigger.mock.calls.length, name()]).toEqual([0, 'Hold']);
    await vi.advanceTimersByTimeAsync(1600);
    expect(name()).toBe('Alarm on');
    const touch = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { changedTouches: [{ clientX: 5, clientY: 5 }], touches: [{ clientX: 5, clientY: 5 }] });
      row.dispatchEvent(e);
    };
    touch('touchstart');
    expect(row.classList.contains('holding')).toBe(true);
    await vi.advanceTimersByTimeAsync(650);
    expect(onTrigger).toHaveBeenCalledWith('flow:a');
    onHaptic.mockClear();
    touch('touchend');
    await vi.advanceTimersByTimeAsync(10);
    expect(onHaptic).toHaveBeenCalled();
  });

  it('Single, and a flow that is off whatever the setting: a tap acts at once', () => {
    expect((() => { const m = make('single'); m.row.click(); return m.onTrigger.mock.calls.length; })()).toBe(1);
    const root = document.createElement('div');
    document.body.append(root);
    const w = win.createFlowsWidget(root, { press: 'double', buttons: [{ id: 'flow:a' }] });
    w.setState([{ ...FLOWS[0], enabled: false }]);
    root.querySelector<HTMLElement>('.fb-row')!.click();
    expect(root.querySelector('.fb-message')!.textContent).toBe('Alarm on is turned off.');
  });
});
