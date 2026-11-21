/*
 * The Widget Builder's designs (`custom`, 1.4.0): a widget drawn from parts on a 4-column grid, saved once and placed on
 * any web dashboard. This file is the model only: the part kinds, their limits and the lenient reading of a design (an
 * older or hand-edited one mustn't break the widget). `lib/CustomWidgetService.ts` keeps them; the widget
 * (`widgets/custom/public/widget.js`) draws them.
 */
import { TILE_COLORS, type TileColor } from './tileColors.js';
import { isReservedKey } from './storedSetting.js';

/** The widget's own grid: 4 columns of 64 px rows. */
export const GRID_COLUMNS = 4;
export const MAX_GRID_ROWS = 24;
/** A container's fine grid: 12 columns of 8 px rows. */
export const FINE_COLUMNS = 12;
export const FINE_ROW_PX = 8;
export const MAX_DESIGNS = 50;
/** Every part of a design, the parts inside containers too. */
export const MAX_PARTS = 80;
export const MAX_RULES = 6;
export const MAX_CHOICES = 6;
const MAX_NAME = 40;
const MAX_TEXT = 200;
const MAX_UNITS = 12;
/** A calculated value's inputs, and a text's values in `{1}` … `{6}`. */
export const MAX_INPUTS = 12;
export const MAX_REFS = 6;
export const MAX_ACTIONS = 6;
export const MAX_PAGES = 6;
export const MAX_RINGS = 3;
export const MAX_SEGMENTS = 6;
/** A repeater's devices the app sends (its test then picks the ones shown), and the most it shows. */
export const MAX_REPEAT_CANDIDATES = 48;
export const MAX_REPEAT_ITEMS = 24;
const MAX_FORMULA = 120;

export const PART_KINDS = [
  'value', 'chart', 'gauge', 'level', 'status', 'flowvalue',
  'switch', 'button', 'slider', 'stepper', 'choice', 'variable',
  'container', 'text', 'icon',
  'shape', 'calc', 'time',
  'state', 'image', 'ring', 'repeat',
  'segments', 'trend',
] as const;
export type PartKind = typeof PART_KINDS[number];

/** The kinds that show a device value (`slot`, `<deviceId>:<capabilityId>`). */
export const SLOT_KINDS: readonly PartKind[] = ['value', 'chart', 'gauge', 'level', 'status', 'switch', 'slider', 'stepper', 'choice'];
/** The kinds that may show or change a Homey variable instead of a device value. */
export const VARIABLE_KINDS: readonly PartKind[] = ['stepper', 'choice', 'variable'];
/** The kinds that change something when used: a device (`slot`), a variable, a Flow or the tap trigger. */
export const CONTROL_KINDS: readonly PartKind[] = ['switch', 'button', 'slider', 'stepper', 'choice', 'variable'];

/** What a Flow may change on a part, each switched on by the user in the part's Flow tab. */
export const FLOW_PROPS = ['text', 'color', 'hidden', 'icon', 'value'] as const;
export type FlowProp = typeof FLOW_PROPS[number];
/** When a value a Flow set goes back to the design's own. */
export const FLOW_RESETS = ['never', 'hour', 'midnight'] as const;
export type FlowReset = typeof FLOW_RESETS[number];

/** The kinds without a value of their own: each of their rules names the value it checks (`of`). */
export const VALUELESS_KINDS: readonly PartKind[] = ['shape', 'text', 'icon', 'button', 'container', 'image'];
/** The kinds a `{part}` source may name: a calculated value, a widget state, a repeater (how many it shows). */
export const SOURCE_KINDS: readonly PartKind[] = ['calc', 'state', 'repeat'];

/**
 * Where a value comes from: a device value, a Homey variable, or a calculated value of the same design (`part`, only a
 * `calc`; its own inputs are never parts, so nothing loops).
 */
export type Source = { slot: string } | { variable: string } | { part: string };
/** A text's value: a source, or the time, date or weekday now. */
export type Ref = Source | { time: 'clock' | 'date' | 'weekday' };
export const REF_TIMES = ['clock', 'date', 'weekday'] as const;

export const CALC_OPS = ['sum', 'avg', 'min', 'max', 'diff', 'count', 'formula'] as const;
export type CalcOp = typeof CALC_OPS[number];
export const TIME_MODES = ['clock', 'date', 'since', 'until'] as const;
export type TimeMode = typeof TIME_MODES[number];
export const SHAPES = ['rect', 'circle', 'line'] as const;

/**
 * What a button does, in order: set a device value or a variable (a typed value, read as its type; `toggle` flips a
 * yes/no), start a Flow, open a web dashboard, or set a widget state of the design.
 */
export type Action =
  | { do: 'set', slot: string, value: string }
  | { do: 'variable', variable: string, value: string }
  | { do: 'flow', flowId: string }
  | { do: 'dashboard', dashboard: string }
  | { do: 'state', part: string, value: string };
export const ACTION_KINDS = ['set', 'variable', 'flow', 'dashboard', 'state'] as const;
/** The actions the app runs (`POST /action`); the others the widget does itself. */
export const SERVER_ACTIONS: readonly string[] = ['set', 'variable', 'flow'];

/** A ring of a Ring: its value and range, and its colour. */
export type RingSpec = { src: Source, min?: number, max?: number, color: TileColor | null };

/** A segmented bar's segment: its value, colour and label (else the value's name). */
export type Segment = { src: Source, color: TileColor | null, label: string };

/** An image: a picture on the web (http or https), or a device's own (a camera's snapshot, album art). */
export type ImageSource = { kind: 'url', url: string } | { kind: 'device', device: string };

export const RULE_OPS = ['above', 'below', 'is', 'isNot'] as const;
export type RuleOp = typeof RULE_OPS[number];
/**
 * A rule: while the part's value (or `of`'s, another value) holds `op value`, it takes the colour, or is hidden. The
 * first that holds wins.
 */
export type Rule = { op: RuleOp, value: string, look: TileColor | 'hide' | 'same', of?: Source, icon?: string };

/**
 * The parts of a built-in component that can be hidden, by kind (so a Level bar can be a bare bar, a Mini chart a bare
 * line, a Gauge a bare arc, a Switch a bare toggle).
 */
export const ELEMENTS: Partial<Record<string, readonly ('icon' | 'name' | 'value' | 'graph')[]>> = {
  value: ['icon', 'name', 'value', 'graph'], chart: ['name', 'value'], gauge: ['name', 'value'], level: ['name', 'value'],
  status: ['name', 'value'], switch: ['icon', 'name'], slider: ['icon', 'name', 'value'], stepper: ['name'], choice: ['name'],
  variable: ['name'], flowvalue: ['icon', 'name'], calc: ['icon', 'name', 'value'], time: ['icon', 'name'], trend: ['icon', 'name', 'value'],
  ring: ['name', 'value'], segments: ['name', 'value'], button: ['icon', 'name'], state: ['icon', 'name'],
};
export type Element = 'icon' | 'name' | 'value' | 'graph';
/** The kinds a tap can give actions to besides a button: everything that isn't a control of its own. */
export const TAP_KINDS: readonly PartKind[] = [
  'value', 'chart', 'gauge', 'level', 'status', 'flowvalue', 'container', 'text', 'icon', 'shape', 'calc', 'time', 'image', 'ring', 'segments', 'trend',
];
/** A calculated value's `count` test: the rule ops without a look. */
export type Test = { op: RuleOp, value: string };

/** Top level: cells of the 4-column grid. In a container: fine-grid cells, or per cent of its inner box (free-form). */
export const PART_STYLES = ['tile', 'pill', 'none'] as const;
export type PartStyle = typeof PART_STYLES[number];

export type Place = { x: number, y: number, w: number, h: number };

export type Choice = { label: string, value: string };

export type Part = {
  id: string,
  kind: PartKind,
  /** Shown on the part, and its name in Flow cards (`Design · Part`). */
  name: string,
  at: Place,
  color: TileColor | null,
  icon: string | null,
  /**
   * Its background: the native `tile` (10 px corners), a rounded `pill`, or `none` (right on the widget's or a
   * container's background). Text and icons default to none.
   */
  style: PartStyle,
  rules: Rule[],
  /** What Flows may change (only these show in the cards' lists), and when a Flow's value goes back. */
  flow: Partial<Record<FlowProp, true>>,
  reset: FlowReset,
  slot?: string,
  variable?: string,
  /** A button's Flow (`flow:<id>` or `advanced:<id>`); without one the button fires *A part was tapped*. */
  flowId?: string,
  text?: string,
  size?: 'display' | 'heading' | 'body' | 'small',
  weight?: 'regular' | 'medium' | 'bold',
  /** The built-in parts it leaves out (`ELEMENTS`). */
  hide?: Element[],
  align?: 'left' | 'center' | 'right',
  units?: string,
  min?: number,
  max?: number,
  step?: number,
  choices?: Choice[],
  /** A Mini chart's time span (the kit's `timeSpan()` ids). */
  span?: string,
  /** A value part's line under it: the history (`chart`) or nothing. */
  show?: 'value' | 'chart',
  /** A container's (and a shape's `background`, its fill): */
  mode?: 'grid' | 'free' | 'pages',
  background?: Background,
  parts?: Part[],
  /** A shape's: its form, corner radius (px, a rectangle), opacity (%), a line's thickness (px) and direction. */
  shape?: typeof SHAPES[number],
  radius?: number,
  opacity?: number,
  thickness?: number,
  dir?: 'horizontal' | 'vertical',
  /** A calculated value's: its inputs (devices or variables), what it does with them, and how it shows. */
  inputs?: Source[],
  op?: CalcOp,
  test?: Test,
  /** `formula`: the inputs as `a` … `l`. */
  formula?: string,
  decimals?: number,
  /** `min`/`max`: the winning input's name beside the part's. */
  winner?: boolean,
  /** Not drawn on a dashboard: only text and rules use it. */
  sourceOnly?: boolean,
  /** A text's values, shown where `{1}` … `{6}` is (null: one that's gone, shown as `–`). */
  refs?: (Ref | null)[],
  /** A pages container's pages, how it's paged (tabs, dots, or by a widget state), and that state. */
  pages?: { name: string }[],
  nav?: 'tabs' | 'dots' | 'state',
  pageBy?: Source,
  /** A part in a pages container: which page (from 0). */
  page?: number,
  /** A widget state's: a yes/no or a choice, and what it starts as (`true`/`false`, or a choice's value). */
  stateType?: 'toggle' | 'choice',
  initial?: string,
  /** A button's actions (in place of its one Flow), and how it's pressed: a tap, a tap to confirm, or a long press. */
  actions?: Action[],
  press?: 'tap' | 'confirm' | 'long',
  /** An image's: where from, how it fits, and how often a device's is read again (minutes, 0 never). */
  image?: ImageSource,
  fit?: 'cover' | 'contain',
  refresh?: number,
  /**
   * A segmented bar's segments, drawn as a bar or a donut, each its share of their sum (`scale: sum`) or of `max`;
   * `legend` lists them under it.
   */
  segments?: Segment[],
  barStyle?: 'bar' | 'donut',
  scale?: 'sum' | 'max',
  legend?: boolean,
  /** A trend's: the change of `slot` over `span` (its history); below `flat` it's steady; `percent` as a share. */
  flat?: number,
  percent?: boolean,
  /** A ring's rings, and what its middle shows. */
  rings?: RingSpec[],
  center?: 'value' | 'icon' | 'none',
  /**
   * A repeater's: every device with `capability` (in `zone` and the rooms in it), those whose value holds `test` shown,
   * as rows or tiles in `columns`; with `control` a tap switches a yes/no that can be set; `text` where none holds.
   */
  capability?: string,
  zone?: string,
  itemStyle?: 'row' | 'tile',
  columns?: number,
  control?: boolean,
  /** A time's: a clock, a date, how long since `slot` changed, or until `until` (`HH:mm`). */
  timeMode?: TimeMode,
  seconds?: boolean,
  dateStyle?: 'short' | 'long' | 'weekday',
  until?: string,
};

export type Background =
  | { kind: 'none' }
  | { kind: 'color', from: string }
  | { kind: 'gradient', from: string, to: string, angle: number };

export type Design = { id: string, name: string, updatedAt: number, parts: Part[] };

const HEX = /^#[0-9a-f]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,24}$/;
const SPANS = new Set(['1h', '6h', '24h', '7d', '30d', 'today', 'yesterday', 'thisWeek']);

const num = (v: unknown, lo: number, hi: number, fallback: number, step = 1) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const r = Math.round(n / step) * step;
  return Math.min(hi, Math.max(lo, Number(r.toFixed(2))));
};
const optNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const color = (v: unknown): TileColor | null => {
  if (typeof v !== 'string') return null;
  const c = v.toLowerCase();
  return (TILE_COLORS as readonly string[]).includes(c) || HEX.test(c) ? c as TileColor : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? v as T : fallback);
/** A slot as the value settings write it, or undefined. */
const slotOf = (v: unknown) => (typeof v === 'string' && /^[^:\s]+:[^\s]+$/.test(v) && v.length <= 200 ? v : undefined);
const idOf = (v: unknown, max = 200) => (typeof v === 'string' && v && v.length <= max && !/\s/.test(v) ? v : undefined);

/** A short random id for a design or a part. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

/**
 * Where a part goes, kept on its grid: top level in the 4 × 64 px cells, in a container on its fine grid (12 columns,
 * any row) or, free-form, in per cent of the container (one decimal).
 */
function placeOf(v: any, where: 'top' | 'grid' | 'free'): Place {
  if (where === 'free') {
    const x = num(v?.x, 0, 99, 0, 0.1);
    const y = num(v?.y, 0, 99, 0, 0.1);
    return { x, y, w: num(v?.w, 1, 100 - x, Math.min(25, 100 - x), 0.1), h: num(v?.h, 1, 100 - y, Math.min(25, 100 - y), 0.1) };
  }
  const cols = where === 'top' ? GRID_COLUMNS : FINE_COLUMNS;
  const rows = where === 'top' ? MAX_GRID_ROWS : MAX_GRID_ROWS * 9;
  const x = num(v?.x, 0, cols - 1, 0);
  const y = num(v?.y, 0, rows - 1, 0);
  return { x, y, w: num(v?.w, 1, cols - x, 1), h: num(v?.h, 1, where === 'top' ? 8 : rows, where === 'top' ? 1 : 8) };
}

/** A source as kept, or undefined. `parts`: whether a calculated value may be one (checked against the design later). */
export function sourceOf(v: unknown, parts = true): Source | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const slot = slotOf(r.slot);
  if (slot) return { slot };
  const variable = idOf(r.variable, 100);
  if (variable) return { variable };
  const part = typeof r.part === 'string' && ID.test(r.part) && !isReservedKey(r.part) ? r.part : undefined;
  return parts && part ? { part } : undefined;
}

function refOf(v: unknown): Ref | null {
  if (v && typeof v === 'object' && REF_TIMES.includes((v as any).time)) return { time: (v as any).time };
  return sourceOf(v) ?? null;
}

/** `valueless`: a kind without a value of its own keeps only the rules that name theirs. */
function rulesOf(v: unknown, valueless = false): Rule[] {
  if (!Array.isArray(v)) return [];
  const out: Rule[] = [];
  for (const r of v.slice(0, MAX_RULES)) {
    if (!r || typeof r !== 'object') continue;
    const look = r.look === 'hide' || r.look === 'same' ? r.look : color(r.look);
    if (!look || !RULE_OPS.includes(r.op)) continue;
    const of = sourceOf(r.of);
    if (valueless && !of) continue;
    const icon = iconOf(r.icon);
    // A rule that keeps the colour is only there for its icon.
    if (look === 'same' && !icon) continue;
    out.push({ op: r.op, value: str(String(r.value ?? ''), 60), look, ...(of ? { of } : {}), ...(icon ? { icon } : {}) });
  }
  return out;
}

const iconOf = (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : undefined);

function flowOf(v: unknown): Partial<Record<FlowProp, true>> {
  const out: Partial<Record<FlowProp, true>> = {};
  if (v && typeof v === 'object') for (const p of FLOW_PROPS) if ((v as any)[p] === true) out[p] = true;
  return out;
}

function backgroundOf(v: any): Background {
  const from = color(v?.from);
  if (v?.kind === 'color' && from && HEX.test(from)) return { kind: 'color', from };
  const to = color(v?.to);
  if (v?.kind === 'gradient' && from && to && HEX.test(from) && HEX.test(to)) {
    return { kind: 'gradient', from, to, angle: num(v.angle, 0, 359, 135) };
  }
  return { kind: 'none' };
}

/**
 * A design as kept: every part well-formed, ids unique, at most `MAX_PARTS` parts, containers one level deep (a
 * container inside a container is left out). What can't be read is left out rather than refused, as an older design
 * may hold what a newer app doesn't know.
 */
export function readDesign(v: unknown, fallbackId = newId()): Design | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  const id = typeof d.id === 'string' && ID.test(d.id) && !isReservedKey(d.id) ? d.id : fallbackId;
  const seen = new Set<string>();
  let count = 0;
  const partsOf = (list: unknown, where: 'top' | 'grid' | 'free'): Part[] => {
    if (!Array.isArray(list)) return [];
    const out: Part[] = [];
    for (const raw of list) {
      if (count >= MAX_PARTS) break;
      const p = readPart(raw, where);
      if (!p || (p.kind === 'container' && where !== 'top')) continue;
      if (where === 'top') delete p.page;
      while (seen.has(p.id)) p.id = newId();
      seen.add(p.id);
      count++;
      if (p.kind === 'container') {
        p.parts = partsOf((raw as any).parts, p.mode === 'free' ? 'free' : 'grid');
        // In a pages container each part is on a page (the first where it isn't one of them); elsewhere on none.
        for (const k of p.parts) {
          if (p.mode === 'pages') k.page = k.page !== undefined && k.page < (p.pages?.length ?? 1) ? k.page : 0;
          else delete k.page;
        }
      }
      out.push(p);
    }
    return out;
  };
  const design: Design = {
    id,
    name: str(d.name, MAX_NAME) || 'Widget',
    updatedAt: Number.isFinite(d.updatedAt) ? Number(d.updatedAt) : 0,
    parts: partsOf(d.parts, 'top'),
  };
  checkPartSources(design);
  return design;
}

/**
 * A `{part}` source must be a calculated value of the design, and not the part itself: a rule naming another is left
 * out, a text's value is emptied (so `{2}` stays `{2}`'s).
 */
function checkPartSources(design: Design) {
  const all = allParts(design);
  const kindOf = new Map(all.map(p => [p.id, p.kind]));
  const sources = new Set(all.filter(p => SOURCE_KINDS.includes(p.kind)).map(p => p.id));
  const ok = (src: Source | undefined, self: string) => !src || !('part' in src) || (src.part !== self && sources.has(src.part));
  for (const p of all) {
    p.rules = p.rules.filter(r => ok(r.of, p.id));
    if (p.refs) p.refs = p.refs.map(r => (r && !ok(r as Source, p.id) ? null : r));
    if (p.rings) p.rings = p.rings.filter(r => ok(r.src, p.id));
    if (p.segments) p.segments = p.segments.filter(x => ok(x.src, p.id));
    // A page is picked by a widget state only.
    if (p.pageBy && !('part' in p.pageBy && kindOf.get(p.pageBy.part) === 'state')) delete p.pageBy;
    if (p.nav === 'state' && !p.pageBy) p.nav = 'tabs';
    if (p.actions) p.actions = p.actions.filter(a => a.do !== 'state' || kindOf.get(a.part) === 'state');
  }
}

function actionOf(v: unknown): Action | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  const value = str(String(a.value ?? ''), 60);
  switch (a.do) {
    case 'set': { const slot = slotOf(a.slot); return slot ? { do: 'set', slot, value } : null; }
    case 'variable': { const variable = idOf(a.variable, 100); return variable ? { do: 'variable', variable, value } : null; }
    case 'flow': { const flowId = idOf(a.flowId); return flowId && /^(flow|advanced):/.test(flowId) ? { do: 'flow', flowId } : null; }
    case 'dashboard': { const dashboard = idOf(a.dashboard, 100); return dashboard ? { do: 'dashboard', dashboard } : null; }
    case 'state': return typeof a.part === 'string' && ID.test(a.part) && !isReservedKey(a.part) ? { do: 'state', part: a.part, value } : null;
    default: return null;
  }
}

function imageOf(v: unknown): ImageSource | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (r.kind === 'url' && typeof r.url === 'string' && /^https?:\/\/\S+$/i.test(r.url.trim()) && r.url.length <= 500) return { kind: 'url', url: r.url.trim() };
  const device = idOf(r.device, 100);
  return r.kind === 'device' && device ? { kind: 'device', device } : undefined;
}

function choicesOf(v: unknown): Choice[] {
  const choices: Choice[] = [];
  for (const c of Array.isArray(v) ? v.slice(0, MAX_CHOICES) : []) {
    const value = str(String(c?.value ?? ''), 60);
    if (!value || choices.some(x => x.value === value)) continue;
    choices.push({ label: str(c?.label, 24) || value, value });
  }
  return choices;
}

/** One part, or null when its kind isn't known. Only the fields its kind uses are kept. */
export function readPart(v: unknown, where: 'top' | 'grid' | 'free' = 'top'): Part | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, any>;
  if (!PART_KINDS.includes(r.kind)) return null;
  const kind = r.kind as PartKind;
  const p: Part = {
    id: typeof r.id === 'string' && ID.test(r.id) && !isReservedKey(r.id) ? r.id : newId(),
    kind,
    name: str(r.name, MAX_NAME),
    at: placeOf(r.at, where),
    color: color(r.color),
    icon: typeof r.icon === 'string' && /^[a-z0-9-]{1,40}$/.test(r.icon) ? r.icon : null,
    // Saved before 1.4.0's release as `tile: false` (on a container's background).
    style: kind === 'shape' ? 'none' : oneOf(r.style, PART_STYLES, r.tile === false || kind === 'text' || kind === 'icon' ? 'none' : 'tile'),
    // An icon that follows a device value has one of its own.
    rules: rulesOf(r.rules, VALUELESS_KINDS.includes(kind) && !(kind === 'icon' && slotOf(r.slot))),
    flow: flowOf(r.flow),
    reset: oneOf(r.reset, FLOW_RESETS, 'never'),
  };
  if (Number.isInteger(r.page) && r.page >= 0 && r.page < MAX_PAGES) p.page = r.page;
  if (SLOT_KINDS.includes(kind) || kind === 'icon') {
    const slot = slotOf(r.slot);
    if (slot) p.slot = slot;
  }
  const elements = ELEMENTS[kind];
  if (elements && Array.isArray(r.hide)) {
    const hide = elements.filter(e => r.hide.includes(e));
    if (hide.length) p.hide = hide;
  }
  // Any component that isn't a control may run actions when tapped, as a button does.
  if (TAP_KINDS.includes(kind)) {
    const actions = (Array.isArray(r.actions) ? r.actions.slice(0, MAX_ACTIONS) : []).map(actionOf).filter((a): a is Action => !!a);
    if (actions.length) {
      p.actions = actions;
      p.press = oneOf(r.press, ['tap', 'confirm', 'long'] as const, 'tap');
    }
  }
  if (VARIABLE_KINDS.includes(kind) && !p.slot) {
    const variable = idOf(r.variable, 100);
    if (variable) p.variable = variable;
  }
  switch (kind) {
    case 'value':
      p.show = r.show === 'chart' ? 'chart' : 'value';
      if (p.show === 'chart') p.span = SPANS.has(r.span) ? r.span : '24h';
      break;
    case 'chart':
      p.span = SPANS.has(r.span) ? r.span : '24h';
      break;
    case 'gauge': case 'level': case 'slider': case 'stepper': {
      const min = optNum(r.min);
      const max = optNum(r.max);
      if (min !== undefined) p.min = min;
      if (max !== undefined) p.max = max;
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) [p.min, p.max] = [p.max, p.min];
      if (kind === 'stepper') p.step = num(r.step, 0.01, 1000, 0.5, 0.01);
      break;
    }
    case 'button': {
      const flowId = idOf(r.flowId);
      if (flowId && /^(flow|advanced):/.test(flowId)) p.flowId = flowId;
      const actions = (Array.isArray(r.actions) ? r.actions.slice(0, MAX_ACTIONS) : []).map(actionOf).filter((a): a is Action => !!a);
      if (actions.length) p.actions = actions;
      p.press = oneOf(r.press, ['tap', 'confirm', 'long'] as const, 'tap');
      break;
    }
    case 'choice':
      p.choices = choicesOf(r.choices);
      break;
    case 'state':
      p.stateType = r.stateType === 'choice' ? 'choice' : 'toggle';
      if (p.stateType === 'choice') {
        p.choices = choicesOf(r.choices);
        p.initial = p.choices.some(c => c.value === r.initial) ? r.initial : p.choices[0]?.value ?? '';
      } else {
        p.initial = r.initial === 'true' || r.initial === true ? 'true' : 'false';
      }
      break;
    case 'image':
      if (imageOf(r.image)) p.image = imageOf(r.image);
      p.fit = r.fit === 'contain' ? 'contain' : 'cover';
      p.refresh = [0, 1, 5, 15, 60].includes(Number(r.refresh)) ? Number(r.refresh) : 5;
      break;
    case 'ring': {
      const rings: RingSpec[] = [];
      for (const x of Array.isArray(r.rings) ? r.rings.slice(0, MAX_RINGS) : []) {
        const src = sourceOf(x?.src);
        if (!src) continue;
        const ring: RingSpec = { src, color: color(x?.color) };
        const [min, max] = [optNum(x?.min), optNum(x?.max)];
        if (min !== undefined) ring.min = min;
        if (max !== undefined) ring.max = max;
        if (ring.min !== undefined && ring.max !== undefined && ring.min > ring.max) [ring.min, ring.max] = [ring.max, ring.min];
        rings.push(ring);
      }
      p.rings = rings;
      p.center = oneOf(r.center, ['value', 'icon', 'none'] as const, 'value');
      break;
    }
    case 'segments': {
      const segments: Segment[] = [];
      for (const x of Array.isArray(r.segments) ? r.segments.slice(0, MAX_SEGMENTS) : []) {
        const src = sourceOf(x?.src);
        if (src) segments.push({ src, color: color(x?.color), label: str(x?.label, 24) });
      }
      p.segments = segments;
      p.barStyle = r.barStyle === 'donut' ? 'donut' : 'bar';
      p.scale = r.scale === 'max' ? 'max' : 'sum';
      if (p.scale === 'max') { const max = optNum(r.max); p.max = max !== undefined && max > 0 ? max : 100; }
      p.legend = r.legend !== false;
      p.units = str(r.units, MAX_UNITS);
      break;
    }
    case 'trend': {
      const slot = slotOf(r.slot);
      if (slot) p.slot = slot;
      p.span = SPANS.has(r.span) ? r.span : '1h';
      const flat = optNum(r.flat);
      p.flat = flat !== undefined && flat >= 0 ? flat : 0;
      if (r.percent === true) p.percent = true;
      break;
    }
    case 'repeat': {
      const cap = typeof r.capability === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(r.capability) ? r.capability : '';
      if (cap) p.capability = cap;
      const zone = idOf(r.zone, 100);
      if (zone) p.zone = zone;
      if (r.test && typeof r.test === 'object' && RULE_OPS.includes(r.test.op)) p.test = { op: r.test.op, value: str(String(r.test.value ?? ''), 60) };
      p.itemStyle = r.itemStyle === 'tile' ? 'tile' : 'row';
      p.columns = num(r.columns, 1, 4, 1);
      if (r.control === true) p.control = true;
      p.text = str(r.text, MAX_TEXT);
      break;
    }
    case 'text':
      p.text = typeof r.text === 'string' ? r.text.slice(0, MAX_TEXT) : '';
      p.size = oneOf(r.size, ['display', 'heading', 'body', 'small'] as const, 'body');
      if (['regular', 'medium', 'bold'].includes(r.weight)) p.weight = r.weight;
      p.align = oneOf(r.align, ['left', 'center', 'right'] as const, 'left');
      if (Array.isArray(r.refs) && r.refs.length) p.refs = r.refs.slice(0, MAX_REFS).map(refOf);
      break;
    case 'shape':
      p.shape = oneOf(r.shape, SHAPES, 'rect');
      p.background = backgroundOf(r.background);
      p.opacity = num(r.opacity, 10, 100, 100);
      if (p.shape === 'rect') p.radius = num(r.radius, 0, 32, 10);
      if (p.shape === 'line') {
        p.thickness = num(r.thickness, 1, 8, 2);
        p.dir = r.dir === 'vertical' ? 'vertical' : 'horizontal';
      }
      break;
    case 'calc': {
      p.inputs = (Array.isArray(r.inputs) ? r.inputs : []).map(x => sourceOf(x, false)).filter((x): x is Source => !!x).slice(0, MAX_INPUTS);
      p.op = oneOf(r.op, CALC_OPS, 'sum');
      if (p.op === 'count') p.test = { op: oneOf(r.test?.op, RULE_OPS, 'is'), value: str(String(r.test?.value ?? 'on'), 60) };
      if (p.op === 'formula') p.formula = str(r.formula, MAX_FORMULA);
      if (p.op === 'min' || p.op === 'max') p.winner = r.winner === true;
      const decimals = optNum(r.decimals);
      if (decimals !== undefined) p.decimals = num(decimals, 0, 3, 1);
      p.units = str(r.units, MAX_UNITS);
      if (r.sourceOnly === true) p.sourceOnly = true;
      break;
    }
    case 'time':
      p.timeMode = oneOf(r.timeMode, TIME_MODES, 'clock');
      if (p.timeMode === 'clock') p.seconds = r.seconds === true;
      if (p.timeMode === 'date') p.dateStyle = oneOf(r.dateStyle, ['short', 'long', 'weekday'] as const, 'long');
      if (p.timeMode === 'since') { const slot = slotOf(r.slot); if (slot) p.slot = slot; }
      if (p.timeMode === 'until') p.until = typeof r.until === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.until) ? r.until : '22:00';
      break;
    case 'flowvalue':
      p.text = str(r.text, MAX_TEXT);
      p.units = str(r.units, MAX_UNITS);
      break;
    case 'container':
      p.mode = r.mode === 'free' ? 'free' : r.mode === 'pages' ? 'pages' : 'grid';
      p.background = backgroundOf(r.background);
      p.parts = [];
      if (p.mode === 'pages') {
        const pages = (Array.isArray(r.pages) ? r.pages.slice(0, MAX_PAGES) : []).map((x: any) => ({ name: str(x?.name, 24) }));
        p.pages = pages.length ? pages : [{ name: '' }];
        p.nav = oneOf(r.nav, ['tabs', 'dots', 'state'] as const, 'tabs');
        const by = sourceOf(r.pageBy);
        if (by && 'part' in by) p.pageBy = by;
      }
      break;
    default:
      break;
  }
  return p;
}

/** Every part of a design, those in containers too, in drawing order. */
export function allParts(design: Design): Part[] {
  return design.parts.flatMap(p => (p.kind === 'container' ? [p, ...(p.parts ?? [])] : [p]));
}

export function findPart(design: Design, partId: string): Part | undefined {
  return allParts(design).find(p => p.id === partId);
}

/** Every source a design reads: the parts' own, their rules' `of`, texts' values and calculated values' inputs. */
function designSources(design: Design): Source[] {
  const out: Source[] = [];
  for (const p of allParts(design)) {
    if (p.slot) out.push({ slot: p.slot });
    if (p.variable) out.push({ variable: p.variable });
    for (const r of p.rules) if (r.of) out.push(r.of);
    for (const r of p.refs ?? []) if (r && !('time' in r)) out.push(r);
    out.push(...(p.inputs ?? []));
    for (const r of p.rings ?? []) out.push(r.src);
    for (const x of p.segments ?? []) out.push(x.src);
    for (const a of p.actions ?? []) if (a.do === 'set') out.push({ slot: a.slot }); else if (a.do === 'variable') out.push({ variable: a.variable });
  }
  return out;
}

/** The device values a design shows, each once. */
export function designSlots(design: Design): string[] {
  return [...new Set(designSources(design).map(s => ('slot' in s ? s.slot : '')).filter(Boolean))];
}

export function designVariables(design: Design): string[] {
  return [...new Set(designSources(design).map(s => ('variable' in s ? s.variable : '')).filter(Boolean))];
}

export function designFlows(design: Design): string[] {
  const ids = allParts(design).flatMap(p => [p.flowId, ...(p.actions ?? []).map(a => (a.do === 'flow' ? a.flowId : undefined))]);
  return [...new Set(ids.filter((s): s is string => !!s))];
}

/** The Mini charts' and value charts' histories, as `{slot, span}` once each. */
export function designCharts(design: Design): { slot: string, span: string }[] {
  const seen = new Map<string, { slot: string, span: string }>();
  for (const p of allParts(design)) {
    if (!p.slot || !p.span || (p.kind !== 'chart' && p.kind !== 'trend' && p.show !== 'chart')) continue;
    seen.set(`${p.span}\n${p.slot}`, { slot: p.slot, span: p.span });
  }
  return [...seen.values()];
}

/** A part's name in Flow cards and lists: `Design · Part`, the part's kind where it has no name. */
export function partLabel(design: Design, part: Part): string {
  return `${design.name} · ${part.name || part.text?.slice(0, 30) || part.kind}`;
}

/**
 * Whether a rule holds for a value (the widget's copy, `ruleHolds()`, is checked equal in the tests): `above`/`below`
 * compare numbers (a boolean as 1/0), `is`/`isNot` compare as text, case and spaces aside, with `on`/`yes`/`true`
 * and `off`/`no`/`false` meaning a boolean's.
 */
export function ruleHolds(rule: Rule, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (rule.op === 'above' || rule.op === 'below') {
    const v = typeof value === 'boolean' ? Number(value) : Number(value);
    const r = Number(String(rule.value).replace(',', '.'));
    if (!Number.isFinite(v) || !Number.isFinite(r)) return false;
    return rule.op === 'above' ? v > r : v < r;
  }
  const norm = (x: unknown) => {
    const s = String(x).trim().toLowerCase();
    if (['on', 'yes', 'true', 'open'].includes(s)) return 'true';
    if (['off', 'no', 'false', 'closed'].includes(s)) return 'false';
    return s;
  };
  const same = typeof value === 'number'
    ? Number(String(rule.value).replace(',', '.')) === value
    : norm(value) === norm(rule.value);
  return rule.op === 'is' ? same : !same;
}
