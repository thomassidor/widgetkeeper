import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey } from './helpers/fakeHomey.js';
import FlowTileService, { ANY_ID, FLOW_TILES_SETTING, FLOWTILES_STATE_EVENT, flowTileKey } from '../lib/FlowTileService.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
  const homey = fakeHomey(fakeApi());
  const onTap = vi.fn(async () => {});
  const log = vi.fn();
  const service = new FlowTileService(homey as any, log, () => {}, onTap);
  /** The realtime events sent so far (after the 250 ms that gathers a board's changes). */
  const sent = async () => {
    await vi.advanceTimersByTimeAsync(300);
    return homey.api.realtime.mock.calls.filter((c: any[]) => c[0] === FLOWTILES_STATE_EVENT).map((c: any[]) => c[1]);
  };
  return { homey, service, onTap, log, sent };
}

describe('flowTileKey', () => {
  it('trims and lower-cases, with the fallback for no name, and refuses reserved names', () => {
    expect(flowTileKey(' Car ')).toBe('car');
    expect(flowTileKey('', 'Tiles')).toBe('tiles');
    expect(flowTileKey(undefined)).toBe('');
    expect(flowTileKey('__proto__')).toBe('');
    expect(flowTileKey(' Constructor ')).toBe('');
    expect(flowTileKey('x'.repeat(80))).toHaveLength(60);
  });
});

describe('the Flow cards', () => {
  it('makes a tile on its first value, on the default board without a name, and serves it', () => {
    const { service } = setup();
    service.setText('', 'Bins', '  Paper   on Thursday ');
    expect(service.get(undefined)).toEqual({
      key: 'tiles', name: 'Tiles', tiles: [{
        key: 'bins', name: 'Bins', kind: 'text', text: 'Paper on Thursday', number: null, units: null, decimals: 'auto',
        second: '', icon: null, color: null, fill: null, updatedAt: Date.now(), tappable: false,
      }],
    });
  });

  it('keeps each part apart: a value leaves the look, fill and second line as they are', () => {
    const { service } = setup();
    service.setLook('Car', 'Range', 'car', 'green');
    service.setFill('Car', 'Range', 82);
    service.setSecond('Car', 'Range', '82 %');
    service.setNumber('Car', 'Range', 214, ' km ', '0');
    const [tile] = service.get('car').tiles;
    expect(tile).toMatchObject({ kind: 'number', number: 214, units: 'km', decimals: '0', icon: 'car', color: 'green', fill: 82, second: '82 %' });
    // A text again: the number goes, the rest stays.
    service.setText('Car', 'Range', 'Charging');
    expect(service.get('Car').tiles[0]).toMatchObject({ kind: 'text', text: 'Charging', number: null, color: 'green', fill: 82 });
    // default and none reset the look; an empty second line removes it.
    service.setLook('Car', 'Range', 'none', 'default');
    service.setSecond('Car', 'Range', '');
    expect(service.get('Car').tiles[0]).toMatchObject({ icon: null, color: null, second: '' });
  });

  it('reads units and decimals as the number card sends them', () => {
    const { service } = setup();
    service.setNumber('B', 'A', '21.456');
    service.setNumber('B', 'C', 3, '', 'bogus');
    expect(service.get('B').tiles.map(t => [t.number, t.units, t.decimals])).toEqual([[21.456, null, 'auto'], [3, null, 'auto']]);
    expect(() => service.setNumber('B', 'A', 'abc')).toThrow(/Not a number/);
  });

  it('clamps the fill to 0–100, and removing it makes no tile', () => {
    const { service } = setup();
    service.setFill('B', 'A', 140);
    expect(service.get('B').tiles[0].fill).toBe(100);
    service.setFill('B', 'A', -3);
    expect(service.get('B').tiles[0].fill).toBe(0);
    service.removeFill('B', 'A');
    expect(service.get('B').tiles[0].fill).toBeNull();
    service.removeFill('B', 'Nothing');
    expect(service.get('B').tiles).toHaveLength(1);
    expect(() => service.setFill('B', 'A', Number.NaN)).toThrow(/Not a percentage/);
  });

  it('refuses an unknown colour and names that can\'t be keys', () => {
    const { service } = setup();
    expect(() => service.setLook('B', 'A', 'car', 'magenta')).toThrow(/Unknown colour/);
    expect(() => service.setText('__proto__', 'A', 'x')).toThrow(/Not a board name/);
    expect(() => service.setText('B', 'constructor', 'x')).toThrow(/Not a tile name/);
    expect(() => service.setText('B', '', 'x')).toThrow(/Not a tile name/);
  });

  it('keeps the order added, takes the latest spelling of a name, and removes tiles and boards', () => {
    const { service } = setup();
    service.setText('B', 'One', '1');
    service.setText('B', 'Two', '2');
    service.setText('B', 'one', '1!');
    expect(service.get('B').tiles.map(t => [t.name, t.text])).toEqual([['one', '1!'], ['Two', '2']]);
    service.remove('B', 'ONE');
    expect(service.get('B').tiles.map(t => t.name)).toEqual(['Two']);
    service.setText('B', 'Three', '3');
    expect(service.get('B').tiles.map(t => t.name)).toEqual(['Two', 'Three']);
    service.clear('b');
    expect(service.get('B')).toEqual({ key: 'b', name: 'B', tiles: [] });
  });

  it('cuts long texts, and keeps at most 24 tiles a board and 20 boards, the oldest going', () => {
    const { service } = setup();
    service.setText('B', 'Long', 'x'.repeat(100));
    expect(service.get('B').tiles[0].text).toHaveLength(60);
    for (let i = 0; i < 30; i++) { vi.advanceTimersByTime(1000); service.setText('B', `T${i}`, String(i)); }
    const names = service.get('B').tiles.map(t => t.name);
    expect(names).toHaveLength(24);
    expect(names).not.toContain('Long');
    expect(names[names.length - 1]).toBe('T29');
    for (let i = 0; i < 25; i++) { vi.advanceTimersByTime(1000); service.setText(`Board ${i}`, 'A', 'a'); }
    expect(service.describe().boards).toBe(20);
    expect(service.get('B').tiles).toEqual([]);
  });
});

describe('saving and sending', () => {
  it('saves 2 s after a burst of changes, once, and on stop', () => {
    const { homey, service } = setup();
    service.setText('B', 'A', '1');
    service.setText('B', 'A', '2');
    expect(homey.settings.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(homey.settings.set).toHaveBeenCalledTimes(1);
    service.setText('B', 'A', '3');
    service.stop();
    expect(homey.settings.set).toHaveBeenCalledTimes(2);
    expect(new FlowTileService(homey as any).get('B').tiles[0].text).toBe('3');
  });

  it('sends a board once for a burst of changes, and nothing when nothing changed', async () => {
    const { homey, service, sent } = setup();
    service.setText('B', 'A', '1');
    service.setNumber('B', 'C', 2);
    service.setText('Other', 'A', 'x');
    const first = await sent();
    expect(first.map((e: any) => [e.key, e.tiles.length])).toEqual([['b', 2], ['other', 1]]);
    vi.advanceTimersByTime(2000); // saved
    homey.api.realtime.mockClear();
    homey.settings.set.mockClear();
    service.setText('B', 'A', '1');
    service.setNumber('B', 'C', 2);
    expect(await sent()).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(homey.settings.set).not.toHaveBeenCalled();
  });

  it('sends a cleared board empty, so its widgets empty too', async () => {
    const { service, sent } = setup();
    service.setText('Car', 'A', '1');
    await sent();
    service.clear('Car');
    expect((await sent()).pop()).toEqual({ key: 'car', name: 'car', tiles: [] });
  });

  it('reads a saved setting it can use, leaving out what it can\'t', () => {
    const homey = fakeHomey(fakeApi());
    homey.settings.set(FLOW_TILES_SETTING, {
      car: { name: 'Car', updatedAt: 1, tiles: { a: { name: 'A', kind: 'text', text: 'x', order: 1 }, b: 'junk' } },
      junk: 5,
    });
    const service = new FlowTileService(homey as any);
    expect(service.get('Car').tiles.map(t => t.key)).toEqual(['a']);
    expect(service.describe().boards).toBe(1);
  });
});

describe('taps', () => {
  it("is tappable where a Flow listens: the tile, any tile of its board, any board's tile of that name, or any", () => {
    const { service } = setup();
    service.setText('Car', 'Range', '1');
    const tappable = () => service.get('Car').tiles[0].tappable;
    expect(tappable()).toBe(false);
    for (const listener of [
      { board: { id: 'Car' }, tile: { id: 'Range' } },
      { board: { id: 'car' }, tile: { id: ANY_ID, any: true } },
      { board: { id: ANY_ID, any: true }, tile: { name: 'range' } },
      { board: { id: ANY_ID, any: true }, tile: { id: ANY_ID, any: true } },
    ]) {
      service.setListeners([listener]);
      expect(tappable()).toBe(true);
    }
    service.setListeners([{ board: { id: 'House' }, tile: { id: 'Range' } }, {} as any]);
    expect(tappable()).toBe(false);
  });

  it('sends the boards again when the listeners change, so the widgets know what can be tapped', async () => {
    const { service, sent } = setup();
    service.setText('Car', 'Range', '1');
    await sent();
    service.setListeners([{ board: { id: 'Car' }, tile: { id: 'Range' } }]);
    expect((await sent()).pop().tiles[0].tappable).toBe(true);
  });

  it('fires the trigger with the name and value as shown, and the keys as its state', async () => {
    const { service, onTap } = setup();
    service.setNumber('Car', 'Battery', 82.456, '%');
    service.setNumber('Car', 'Range', 214, 'km', '0');
    service.setText('Car', 'Note', 'Charging');
    await expect(service.tap('car', 'BATTERY')).resolves.toEqual({ ok: true });
    await service.tap('Car', 'Range');
    await service.tap('Car', 'Note');
    expect(onTap.mock.calls).toEqual([
      [{ board: 'Car', tile: 'Battery', value: '82.46%' }, { board: 'car', tile: 'battery' }],
      [{ board: 'Car', tile: 'Range', value: '214 km' }, { board: 'car', tile: 'range' }],
      [{ board: 'Car', tile: 'Note', value: 'Charging' }, { board: 'car', tile: 'note' }],
    ]);
    await expect(service.tap('Car', 'Gone')).rejects.toThrow(/Not found/);
  });

  it("matches a Flow's board and tile (or Any) against the tapped tile", () => {
    const { service } = setup();
    const state = { board: 'car', tile: 'range' };
    expect(service.matches({ board: { id: 'Car' }, tile: { id: 'Range' } }, state)).toBe(true);
    expect(service.matches({ board: { id: ANY_ID, any: true }, tile: { id: 'Range' } }, state)).toBe(true);
    expect(service.matches({ board: { id: 'Car' }, tile: { id: ANY_ID, any: true } }, state)).toBe(true);
    expect(service.matches({ board: { id: 'House' }, tile: { id: 'Range' } }, state)).toBe(false);
    expect(service.matches({ board: { id: 'Car' }, tile: { id: 'Range' } }, {})).toBe(false);
  });
});

describe('autocompletes', () => {
  it('lists Tiles and the boards, then what is typed as a new board, with Any board first for the trigger', () => {
    const { service } = setup();
    service.setText('Car', 'A', '1');
    expect(service.listBoards('').map(i => [i.name, i.description])).toEqual([['Car', 'Tiles: 1'], ['Tiles', 'Tiles: 0']]);
    expect(service.listBoards('gar', { create: true }).map(i => [i.name, i.description])).toEqual([['gar', 'New board']]);
    expect(service.listBoards('car', { create: true }).map(i => i.name)).toEqual(['Car']);
    expect(service.listBoards('', { any: true })[0]).toEqual({ name: 'Any board', id: ANY_ID, any: true });
  });

  it("lists the board's tiles (every board's under Any), then what's typed as a new tile", () => {
    const { service } = setup();
    service.setText('Car', 'Range', '1');
    service.setText('House', 'Bins', 'Paper');
    service.setText('House', 'Range', 'x');
    expect(service.listTiles('', { id: 'Car' }).map(i => i.name)).toEqual(['Range']);
    expect(service.listTiles('', { id: ANY_ID, any: true }).map(i => i.name)).toEqual(['Bins', 'Range']);
    expect(service.listTiles('bat', { id: 'Car' }, { create: true }).map(i => [i.name, i.description])).toEqual([['bat', 'New tile']]);
    expect(service.listTiles('', { id: 'Nowhere' }, { any: true }).map(i => i.name)).toEqual(['Any tile']);
  });

  it('refuses Any as an action\'s board or tile', () => {
    expect(() => FlowTileService.argName({ id: ANY_ID, any: true })).toThrow(/Pick a board/);
    expect(FlowTileService.argName({ id: 'Car', name: 'Car' })).toBe('Car');
    expect(FlowTileService.argName({ name: 'New' })).toBe('New');
  });
});

describe('describe', () => {
  it('counts, never names or texts', () => {
    const { service } = setup();
    service.setNumber('Car', 'Range', 214);
    service.setLook('Car', 'Range', 'car', 'red');
    service.setFill('Car', 'Battery', 50);
    expect(service.describe()).toEqual({ boards: 1, tiles: 2, numbers: 1, coloured: 1, filled: 1, tapListeners: 0 });
  });
});
