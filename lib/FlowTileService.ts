import type Homey from 'homey';
import { byName, filterItems, matches, nameOrder, type AutocompleteItem } from './autocomplete.js';
import { DebouncedSetting, isReservedKey, nameKey } from './storedSetting.js';
import { parseTileColor, type TileColor } from './tileColors.js';

export const FLOW_TILES_SETTING = 'flowTiles';
export const FLOWTILES_STATE_EVENT = 'flowtiles:state';
export const FLOWTILES_SET_TEXT_CARD = 'flowtiles_set_text';
export const FLOWTILES_SET_NUMBER_CARD = 'flowtiles_set_number';
export const FLOWTILES_SET_SECOND_CARD = 'flowtiles_set_second';
export const FLOWTILES_SET_LOOK_CARD = 'flowtiles_set_look';
export const FLOWTILES_SET_FILL_CARD = 'flowtiles_set_fill';
export const FLOWTILES_REMOVE_FILL_CARD = 'flowtiles_remove_fill';
export const FLOWTILES_REMOVE_CARD = 'flowtiles_remove';
export const FLOWTILES_CLEAR_CARD = 'flowtiles_clear';
export const FLOWTILES_TAPPED_CARD = 'flowtiles_tapped';
/** Every action card with a board and a tile argument (all of them but *Clear the board*). */
export const FLOWTILES_TILE_CARDS = [
  FLOWTILES_SET_TEXT_CARD, FLOWTILES_SET_NUMBER_CARD, FLOWTILES_SET_SECOND_CARD, FLOWTILES_SET_LOOK_CARD,
  FLOWTILES_SET_FILL_CARD, FLOWTILES_REMOVE_FILL_CARD, FLOWTILES_REMOVE_CARD,
] as const;

/** The board a widget shows, and a Flow card writes on, unless it names another. */
export const DEFAULT_BOARD = 'Tiles';
/** *Any board* / *Any tile* in the trigger's arguments. */
export const ANY_ID = 'flowtiles:any';

const MAX_NAME = 60;
const MAX_TEXT = 60;
const MAX_UNITS = 12;
const MAX_BOARDS = 20;
const MAX_TILES = 24;
/** A change is written this long after it (a Flow on a meter may set a tile every 10 s). */
const SAVE_MS = 2000;
/** Changes to a board within this long go to the widgets as one realtime event (a Flow setting five tiles at once). */
const SEND_MS = 250;

export type FlowTileDecimals = 'auto' | '0' | '1' | '2';

export type FlowTile = {
  /** As the Flow card last spelled it. */
  name: string,
  /** A text, or a number the widget formats in the screen's locale (`decimals`: `auto` up to 2). */
  kind: 'text' | 'number',
  text: string,
  number: number | null,
  units: string | null,
  decimals: FlowTileDecimals,
  /** The second line (empty: none). */
  second: string,
  /** One of Flow Buttons' icons (the kit's `icons`), or null. */
  icon: string | null,
  color: TileColor | null,
  /** How far the tile is filled from the left, 0–100, or null for no fill. */
  fill: number | null,
  /** Its place in the order added. */
  order: number,
  updatedAt: number,
};

export type FlowBoard = { name: string, tiles: Record<string, FlowTile>, updatedAt: number };

/** A tile as `/state` and the realtime event carry it. */
export type FlowTileEntry = Omit<FlowTile, 'order'> & { key: string, tappable: boolean };
export type FlowBoardEntry = { key: string, name: string, tiles: FlowTileEntry[] };

/** A board or tile argument: an autocomplete item (`id` its name), or *Any* in the trigger. */
export type FlowTileArg = { id?: string, name?: string, any?: boolean } | undefined;

/** The trigger's arguments of one Flow, as `getArgumentValues()` gives them. */
export type TapListener = { board?: FlowTileArg, tile?: FlowTileArg };

/**
 * A board's or tile's key: its name trimmed and lower-cased, so `Car` and ` car` are one. An empty board name is the
 * default board; a reserved name (`__proto__` …) has none, `''`. The widget's copy (`flowTileKey`) is checked equal.
 */
export function flowTileKey(name: unknown, fallback = ''): string {
  return nameKey(name, fallback);
}

const boardKey = (name: unknown) => flowTileKey(name, DEFAULT_BOARD);
const cleanName = (name: unknown, fallback: string) => (typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME) : fallback);
const cleanText = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

/**
 * The Flow Tiles widget's tiles, which Flow cards write on named boards (a Flow can't address a widget instance), shown by
 * every Flow Tiles widget with that board. Kept in an app setting, written a moment after a change.
 */
export default class FlowTileService {

  private boards: Record<string, FlowBoard>;
  private saved: DebouncedSetting;
  /** The boards changed since the last realtime event, sent together. */
  private unsent = new Set<string>();
  private sendTimer: NodeJS.Timeout | null = null;
  /** The tiles some Flow listens to (`<board>\n<tile>`, either `*` for any). */
  private listened = new Set<string>();

  constructor(
    private homey: Homey.App['homey'],
    log: (...args: any[]) => void = () => {},
    private debug: (...args: any[]) => void = () => {}, // routine detail: only with the `debugLog` setting on
    /** Fires *A Flow Tile was tapped* with the tile's tokens and the state its run listener matches. */
    private onTap: (tokens: object, state: object) => Promise<unknown> = async () => {},
  ) {
    const v = homey.settings.get(FLOW_TILES_SETTING);
    this.boards = v && typeof v === 'object' ? FlowTileService.readBoards(v) : {};
    this.saved = new DebouncedSetting({
      homey, delay: SAVE_MS, setting: FLOW_TILES_SETTING, value: () => this.boards, log, what: 'the Flow Tiles',
    });
  }

  /** The saved boards, keeping what's well-formed: an older or hand-edited setting mustn't break `/state`. */
  private static readBoards(v: Record<string, any>): Record<string, FlowBoard> {
    const boards: Record<string, FlowBoard> = {};
    for (const [key, b] of Object.entries(v)) {
      if (isReservedKey(key) || !b || typeof b !== 'object' || !b.tiles || typeof b.tiles !== 'object') continue;
      const tiles: Record<string, FlowTile> = {};
      for (const [k, t] of Object.entries<any>(b.tiles)) {
        if (isReservedKey(k) || !t || typeof t !== 'object' || typeof t.name !== 'string') continue;
        tiles[k] = t as FlowTile;
      }
      boards[key] = { name: typeof b.name === 'string' ? b.name : key, tiles, updatedAt: Number(b.updatedAt) || 0 };
    }
    return boards;
  }

  /** Writes what's pending. */
  stop() {
    this.saved.flush();
    if (this.sendTimer) this.homey.clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }

  // ---------------------------------------------------------------- reading

  /** A board as the widgets get it: its tiles in the order added (an unknown board has none). */
  get(board: unknown): FlowBoardEntry {
    const key = boardKey(board);
    const b = key ? this.boards[key] : undefined;
    const name = b?.name ?? cleanName(board, DEFAULT_BOARD);
    const tiles = b
      ? Object.entries(b.tiles)
        .sort((x, y) => x[1].order - y[1].order)
        .map(([k, t]) => {
          const { order, ...rest } = t;
          void order;
          return { key: k, ...rest, tappable: this.isTappable(key, k) };
        })
      : [];
    return { key, name, tiles };
  }

  /** The tile's value as text, for the trigger's `value` token: a number as it came, with its units. */
  static valueText(t: FlowTile): string {
    if (t.kind !== 'number' || t.number == null) return t.text;
    const digits = t.decimals === 'auto' ? 2 : Number(t.decimals);
    const n = String(Number(t.number.toFixed(digits)));
    if (!t.units) return n;
    return /^(°|%|′|″)/.test(t.units) ? `${n}${t.units}` : `${n} ${t.units}`;
  }

  // ---------------------------------------------------------------- the Flow cards

  /** The tile, made if it isn't there (the oldest of a full board goes); null for a name that can't be a key. */
  private tile(board: unknown, tile: unknown, create: boolean): { bkey: string, b: FlowBoard, tkey: string, t: FlowTile, made: boolean } | null {
    const bkey = boardKey(board);
    const tkey = flowTileKey(tile);
    if (!bkey) throw new Error(`Not a board name: ${String(board)}`);
    if (!tkey) throw new Error(`Not a tile name: ${String(tile)}`);
    let b = this.boards[bkey];
    if (!b) {
      if (!create) return null;
      b = this.boards[bkey] = { name: cleanName(board, DEFAULT_BOARD), tiles: {}, updatedAt: Date.now() };
      // The boards changed longest ago go first when there are too many.
      const keys = Object.keys(this.boards).sort((x, y) => this.boards[x].updatedAt - this.boards[y].updatedAt);
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BOARDS))) {
        delete this.boards[k];
        this.unsent.add(k);
      }
    }
    let t = b.tiles[tkey];
    const made = !t;
    if (!t) {
      if (!create) return null;
      const last = Math.max(0, ...Object.values(b.tiles).map(x => x.order));
      t = b.tiles[tkey] = {
        name: cleanName(tile, tkey), kind: 'text', text: '', number: null, units: null, decimals: 'auto',
        second: '', icon: null, color: null, fill: null, order: last + 1, updatedAt: Date.now(),
      };
      const keys = Object.keys(b.tiles).sort((x, y) => b.tiles[x].updatedAt - b.tiles[y].updatedAt);
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) delete b.tiles[k];
    }
    return { bkey, b, tkey, t, made };
  }

  /** Applies `change` to the tile (made if needed) and, if anything changed, saves and sends the board. */
  private change(board: unknown, tile: unknown, change: Partial<FlowTile>, what: string) {
    const { bkey, b, t, made } = this.tile(board, tile, true)!;
    const before = JSON.stringify(t);
    // The name as this Flow spells it (`car` → `Car`).
    Object.assign(t, change, { name: cleanName(tile, t.name) });
    if (JSON.stringify(t) === before && !made) return; // as it was: nothing to save or send
    t.updatedAt = b.updatedAt = Date.now();
    this.changed(bkey);
    this.debug(`Flow Tiles ${b.name} · ${t.name}: ${what}`);
  }

  private changed(bkey: string) {
    this.saved.schedule();
    this.unsent.add(bkey);
    if (this.sendTimer) return;
    this.sendTimer = this.homey.setTimeout(() => {
      this.sendTimer = null;
      this.sendNow();
    }, SEND_MS);
  }

  private sendNow() {
    const keys = [...this.unsent];
    this.unsent.clear();
    for (const key of keys) {
      const entry = this.get(key);
      // A board that went (cleared, or the oldest of too many) is sent empty, under its own name.
      if (!this.boards[key]) entry.name = key;
      this.homey.api.realtime(FLOWTILES_STATE_EVENT, entry);
    }
  }

  setText(board: unknown, tile: unknown, text: unknown) {
    this.change(board, tile, { kind: 'text', text: cleanText(text), number: null }, 'text');
  }

  setNumber(board: unknown, tile: unknown, number: unknown, units?: unknown, decimals?: unknown) {
    const n = typeof number === 'number' ? number : Number(number);
    if (!isFinite(n)) throw new Error(`Not a number: ${String(number)}`);
    const u = typeof units === 'string' && units.trim() && units !== 'none' ? units.trim().slice(0, MAX_UNITS) : null;
    const d: FlowTileDecimals = decimals === '0' || decimals === '1' || decimals === '2' ? decimals : 'auto';
    this.change(board, tile, { kind: 'number', number: n, text: '', units: u, decimals: d }, 'number');
  }

  setSecond(board: unknown, tile: unknown, text: unknown) {
    this.change(board, tile, { second: cleanText(text) }, 'second line');
  }

  /** The icon (`none`: no icon) and the colour (`default`: the widget's own). */
  setLook(board: unknown, tile: unknown, icon: unknown, color: string) {
    const c = parseTileColor(color);
    const i = typeof icon === 'string' && icon && icon !== 'none' ? icon.slice(0, 40) : null;
    this.change(board, tile, { icon: i, color: c }, `look ${i ?? 'no icon'}, ${c ?? 'default'}`);
  }

  /** The fill, clamped to 0–100. */
  setFill(board: unknown, tile: unknown, percent: unknown) {
    const p = typeof percent === 'number' ? percent : Number(percent);
    if (!isFinite(p)) throw new Error(`Not a percentage: ${String(percent)}`);
    this.change(board, tile, { fill: Math.max(0, Math.min(100, p)) }, `fill ${p}`);
  }

  /** The fill goes; a tile that isn't there isn't made for it. */
  removeFill(board: unknown, tile: unknown) {
    if (!this.tile(board, tile, false)) return;
    this.change(board, tile, { fill: null }, 'fill removed');
  }

  remove(board: unknown, tile: unknown) {
    const found = this.tile(board, tile, false);
    if (!found) return;
    delete found.b.tiles[found.tkey];
    found.b.updatedAt = Date.now();
    this.changed(found.bkey);
    this.debug(`Flow Tiles ${found.b.name} · ${found.t.name}: removed`);
  }

  /** Every tile of the board goes, and the board with them. */
  clear(board: unknown) {
    const bkey = boardKey(board);
    if (!bkey) throw new Error(`Not a board name: ${String(board)}`);
    if (!this.boards[bkey]) return;
    delete this.boards[bkey];
    this.changed(bkey);
    this.debug(`Flow Tiles ${bkey}: cleared`);
  }

  // ---------------------------------------------------------------- taps

  /** The trigger's arguments in every Flow (`getArgumentValues()`): which tiles are tappable. A change goes to the widgets. */
  setListeners(list: TapListener[]) {
    const next = new Set<string>();
    for (const l of Array.isArray(list) ? list : []) {
      const b = l?.board?.any ? '*' : boardKey(l?.board?.id ?? l?.board?.name);
      const t = l?.tile?.any ? '*' : flowTileKey(l?.tile?.id ?? l?.tile?.name);
      if (b && t) next.add(`${b}\n${t}`);
    }
    const same = next.size === this.listened.size && [...next].every(k => this.listened.has(k));
    if (same) return;
    this.listened = next;
    // Only the widgets need to know; nothing to save.
    for (const key of Object.keys(this.boards)) this.unsent.add(key);
    if (!this.sendTimer) this.sendTimer = this.homey.setTimeout(() => { this.sendTimer = null; this.sendNow(); }, SEND_MS);
  }

  isTappable(bkey: string, tkey: string): boolean {
    return [`${bkey}\n${tkey}`, `${bkey}\n*`, `*\n${tkey}`, '*\n*'].some(k => this.listened.has(k));
  }

  /** A widget's tap: the trigger fires with the tile's tokens. A tile that's gone throws, so the widget says so. */
  async tap(board: unknown, tile: unknown) {
    const found = this.tile(board, tile, false);
    if (!found) throw new Error('Not found: that tile');
    const { bkey, b, tkey, t } = found;
    await this.onTap({ board: b.name, tile: t.name, value: FlowTileService.valueText(t) }, { board: bkey, tile: tkey });
    this.debug(`Flow Tiles ${b.name} · ${t.name}: tapped`);
    return { ok: true };
  }

  /** The trigger's run listener: the Flow's board and tile (or *Any*) against the tapped one. */
  matches(args: TapListener, state: { board?: string, tile?: string }): boolean {
    const b = args?.board?.any || boardKey(args?.board?.id ?? args?.board?.name) === state?.board;
    const t = args?.tile?.any || flowTileKey(args?.tile?.id ?? args?.tile?.name) === state?.tile;
    return !!(b && t && state?.board && state?.tile);
  }

  // ---------------------------------------------------------------- autocompletes

  /**
   * The boards by name (the widget's setting, the cards' argument): `Tiles` (the default), the boards with tiles, then
   * what's typed as a new board (`create`); *Any board* first in the trigger (`any`).
   */
  listBoards(query: string, { create = false, any = false } = {}): (AutocompleteItem & { any?: boolean })[] {
    const q = (query || '').trim().slice(0, MAX_NAME);
    const names = new Map<string, string>([[boardKey(DEFAULT_BOARD), DEFAULT_BOARD]]);
    for (const [key, b] of Object.entries(this.boards)) names.set(key, b.name);
    const order = nameOrder(this.homey);
    const items: (AutocompleteItem & { any?: boolean })[] = filterItems(q, [...names.entries()]
      .sort((a, b) => order(a[1], b[1]))
      .map(([key, name]) => {
        const n = Object.keys(this.boards[key]?.tiles ?? {}).length;
        return { name, id: name, description: this.homey.__('flowtiles.tileCount', { count: n }) || `Tiles: ${n}` };
      }));
    if (create && q && boardKey(q) && !names.has(boardKey(q))) {
      items.push({ name: q, id: q, description: this.homey.__('flowtiles.newBoard') || 'New board' });
    }
    const anyName = this.homey.__('flowtiles.anyBoard') || 'Any board';
    if (any && matches(q, anyName)) items.unshift({ name: anyName, id: ANY_ID, any: true });
    return items;
  }

  /** The tiles of the card's board (`args.board`; every board's under *Any board*), then what's typed as a new tile. */
  listTiles(query: string, board: FlowTileArg, { create = false, any = false } = {}): (AutocompleteItem & { any?: boolean })[] {
    const q = (query || '').trim().slice(0, MAX_NAME);
    const boards = board?.any ? Object.values(this.boards) : [this.boards[boardKey(board?.id ?? board?.name)]].filter(Boolean);
    const names = new Map<string, { name: string, board: string }>();
    for (const b of boards) for (const [key, t] of Object.entries(b.tiles)) if (!names.has(key)) names.set(key, { name: t.name, board: b.name });
    const items: (AutocompleteItem & { any?: boolean })[] = [...names.values()]
      .filter(t => matches(q, t.name))
      .sort(byName(this.homey))
      .map(t => ({ name: t.name, id: t.name, description: t.board }));
    if (create && q && flowTileKey(q) && !names.has(flowTileKey(q))) {
      items.push({ name: q, id: q, description: this.homey.__('flowtiles.newTile') || 'New tile' });
    }
    const anyName = this.homey.__('flowtiles.anyTile') || 'Any tile';
    if (any && matches(q, anyName)) items.unshift({ name: anyName, id: ANY_ID, any: true });
    return items;
  }

  /** The argument's name: *Any* isn't one (it's only for the trigger). */
  static argName(arg: FlowTileArg): string | undefined {
    if (arg?.any) throw new Error('Pick a board and a tile');
    return arg?.id ?? arg?.name;
  }

  /** For the diagnostics report: counts only, never names or texts. */
  describe() {
    const boards = Object.values(this.boards);
    const tiles = boards.flatMap(b => Object.values(b.tiles));
    return {
      boards: boards.length,
      tiles: tiles.length,
      numbers: tiles.filter(t => t.kind === 'number').length,
      coloured: tiles.filter(t => t.color).length,
      filled: tiles.filter(t => t.fill != null).length,
      tapListeners: this.listened.size,
    };
  }

}
