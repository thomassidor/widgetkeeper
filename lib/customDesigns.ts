/*
 * The Widget Builder's designs (`custom`, 1.4.0): a widget drawn from parts on a 12-column grid, saved once and placed on
 * any web dashboard. This file is the model only: the part kinds, their limits and the lenient reading of a design (an
 * older or hand-edited one mustn't break the widget). `lib/CustomWidgetService.ts` keeps them; the widget
 * (`widgets/custom/public/widget.js`) draws them.
 */
import { TILE_COLORS, type TileColor } from './tileColors.js';
import { isReservedKey } from './storedSetting.js';

/**
 * The widget's own grid: 12 columns of 16 px rows, 8 px apart (1.4.1, the user's ask: finer than the 4 columns of
 * 64 px rows before). Three of its cells, either way, are one of the old ones exactly, which the builder still draws as
 * guides; a design kept before (no `grid: 12`) is read onto it once (`readDesign()`).
 */
export const GRID_COLUMNS = 12;
export const MAX_GRID_ROWS = 72;
/** How many cells of the grid an old one (4 columns of 64 px rows, `OLD_COLUMNS`) is, across and down. */
export const GRID_STEP = 3;
const OLD_COLUMNS = 4;
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

/**
 * Primitives only (2026-11-22, the user's ask): the tiles that bundled an icon, a value, a label and a graph (Value,
 * Mini chart, Gauge, Level bar, Status, Flow value, Time, Trend) became Text (with the values in it), Icon, Shape and
 * the bare Sparkline, Arc and Bar; Slider lost its icon and label. The builder's Ready-made group puts the old tiles
 * together from these.
 */
export const PART_KINDS = [
  'switch', 'button', 'slider', 'stepper', 'choice', 'variable',
  'container', 'text', 'icon', 'shape', 'image',
  'sparkline', 'arc', 'bar', 'ring', 'segments', 'repeat',
  'calc', 'state', 'chart', 'each', 'use',
] as const;
export type PartKind = typeof PART_KINDS[number];

/**
 * The kinds that show a device value (`slot`, `<deviceId>:<capabilityId>`). A slot of `@:<capabilityId>` is *the
 * widget's device*: a design that works with any device, filled in with the device picked where it's placed
 * (`bindDevice()`), or for a Repeater with each of its devices.
 */
export const SLOT_KINDS: readonly PartKind[] = ['switch', 'slider', 'stepper', 'choice', 'sparkline', 'icon'];
/** The kinds that may show or change a Homey variable instead of a device value. */
export const VARIABLE_KINDS: readonly PartKind[] = ['slider', 'stepper', 'choice', 'variable'];
/** The kinds that change something when used: a device (`slot`), a variable, a Flow or the tap trigger. */
export const CONTROL_KINDS: readonly PartKind[] = ['switch', 'button', 'slider', 'stepper', 'choice', 'variable'];

/**
 * Flow inputs (2026-11-25): named values Flows set, app-wide, each of one type. A component's setting may follow one
 * (`bind`), any source picker may read one (`{input}`), and an action may set one (`do: 'input'`). A per-device input
 * keeps a value per device (a design for any device, a Repeater's copies), the shared one where a device has none.
 */
export const INPUT_TYPES = ['text', 'number', 'yesno', 'color', 'icon'] as const;
export type InputType = typeof INPUT_TYPES[number];
/** When a value a Flow set goes back to nothing (the setting's own again). */
export const INPUT_RESETS = ['never', 'hour', 'midnight'] as const;
export type InputReset = typeof INPUT_RESETS[number];
export const MAX_FLOW_INPUTS = 100;
export type Input = { id: string, name: string, type: InputType, perDevice?: true, reset: InputReset };

/**
 * The settings a ⚡ may bind to an input, and the input types each takes: a component's name or text (a number shows
 * with its units), its colour, text colour, fill (a container's or shape's), icon, whether it's shown, and a pages
 * container's page (a number from 1, or a page's name).
 */
export const BIND_PROPS = ['text', 'color', 'textColor', 'fill', 'icon', 'shown', 'page'] as const;
export type BindProp = typeof BIND_PROPS[number];
export const BIND_TYPES: Record<BindProp, readonly InputType[]> = {
  text: ['text', 'number'], color: ['color'], textColor: ['color'], fill: ['color'], icon: ['icon'], shown: ['yesno'], page: ['number', 'text'],
};
/** The kinds with an accent colour (the builder's Style tab: its icon, toggle, bar, line, dot). */
export const ACCENT_KINDS: readonly PartKind[] = [
  'switch', 'button', 'state', 'slider', 'stepper', 'choice', 'variable', 'icon', 'sparkline', 'arc', 'bar', 'ring', 'segments', 'repeat', 'chart', 'image',
];
/** The kinds whose name or text a Flow input may set. */
export const LABEL_KINDS: readonly PartKind[] = ['text', 'switch', 'button', 'state', 'stepper', 'choice', 'variable', 'ring', 'segments', 'chart'];

/** The kinds without a value of their own: each of their rules names the value it checks (`of`). */
export const VALUELESS_KINDS: readonly PartKind[] = ['shape', 'text', 'icon', 'button', 'container', 'image'];
/** The kinds a `{part}` source may name: a calculated value, a widget state, a repeater (how many it shows). */
export const SOURCE_KINDS: readonly PartKind[] = ['calc', 'state', 'repeat'];

/**
 * Where a value comes from: a device value, a Homey variable, or a calculated value of the same design (`part`, only a
 * `calc`; its own inputs are never parts, so nothing loops).
 */
export type Source = { slot: string } | { variable: string } | { part: string } | { input: string };
/**
 * A text's value: a source (`show: 'name'` its name: a device's, a variable's; `show: 'room'` a device's room; `decimals` and `plain`, without its
 * units, how its number shows), the time (with seconds), date or
 * weekday now, how long since a device value changed (`since`, its slot) or a Flow input was last set (`since: {input}`,
 * a Repeater's copy reading its device's), or until a time of day (`until`, `HH:mm`).
 */
export type Ref = (Source & { show?: 'name' | 'room', decimals?: number, plain?: true }) | { time: 'clock' | 'seconds' | 'date' | 'weekday' } | { since: string | { input: string } } | { until: string };
export const REF_TIMES = ['clock', 'seconds', 'date', 'weekday'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A calculated value's: … and, of its first input, `change` (now less the first point of its history over `span`, or
 * as a `percent`: Trend's) and `since` (minutes since it last changed).
 */
export const CALC_OPS = ['sum', 'avg', 'median', 'min', 'max', 'diff', 'count', 'formula', 'change', 'since'] as const;
export type CalcOp = typeof CALC_OPS[number];
export const SHAPES = ['rect', 'circle', 'line'] as const;

/**
 * What a button does, in order: set a device value or a variable (a typed value, read as its type; `toggle` flips a
 * yes/no), start a Flow, open a web dashboard or a web address (http or https; `same`: on a web dashboard in its window,
 * else a new tab), or set a widget state of the design.
 */
export type Action =
  | { do: 'set', slot: string, value: string }
  | { do: 'variable', variable: string, value: string }
  | { do: 'flow', flowId: string }
  | { do: 'dashboard', dashboard: string }
  | { do: 'url', url: string, same?: true }
  | { do: 'state', part: string, value: string }
  | { do: 'input', input: string, value: string };
export const ACTION_KINDS = ['set', 'variable', 'flow', 'dashboard', 'url', 'state', 'input'] as const;
/** The actions the app runs (`POST /action`); the others the widget does itself. */
export const SERVER_ACTIONS: readonly string[] = ['set', 'variable', 'flow', 'input'];

/** A ring of a Ring: its value and range, and its colour. */
export type RingSpec = { src: Source, min?: number, max?: number, color: TileColor | null };

/** A segmented bar's segment: its value, colour and label (else the value's name). */
export type Segment = { src: Source, color: TileColor | null, label: string };

/** An image: a picture on the web (http or https), or a device's own (a camera's snapshot, album art). */
export type ImageSource = { kind: 'url', url: string } | { kind: 'device', device: string };

export const RULE_OPS = ['above', 'below', 'between', 'is', 'isNot'] as const;
export type RuleOp = typeof RULE_OPS[number];
/**
 * A rule: while the part's value (or `of`'s, another value) holds `op value` (`between`: from `value` to `to`, both
 * included), it takes the colour, or is hidden. The first that holds wins.
 */
export type Rule = { op: RuleOp, value: string, to?: string, look: TileColor | 'hide' | 'same', of?: Source, icon?: string };

/**
 * The parts of a built-in component that can be hidden, by kind (so a Level bar can be a bare bar, a Mini chart a bare
 * line, a Gauge a bare arc, a Switch a bare toggle).
 */
export const ELEMENTS: Partial<Record<string, readonly ('icon' | 'name' | 'value' | 'graph')[]>> = {
  switch: ['icon', 'name'], stepper: ['name'], choice: ['name'], variable: ['name'],
  ring: ['name', 'value'], segments: ['name', 'value'], button: ['icon', 'name'], state: ['icon', 'name'],
};
export type Element = 'icon' | 'name' | 'value' | 'graph';
/** The kinds a tap can give actions to besides a button: everything that isn't a control of its own. */
export const TAP_KINDS: readonly PartKind[] = [
  'container', 'text', 'icon', 'shape', 'calc', 'image', 'ring', 'segments', 'sparkline', 'arc', 'bar',
];
/** A calculated value's `count` test: the rule ops without a look. */
export type Test = { op: RuleOp, value: string, to?: string };
/**
 * The kinds that draw an icon (their own, a rule's or a Flow's): the others keep none, so the builder doesn't offer
 * one that never shows.
 */
export const ICON_KINDS: readonly PartKind[] = ['switch', 'button', 'state', 'ring', 'icon'];
/** The kinds that may show their device's own icon (`deviceIcon`): a switch's or an icon's value's, a List's items'. */
/** The kinds that may take their colour from a value along a scale (`colorBy`): a shape's fill, a text's, an icon's, a bar's or arc's. */
export const SCALE_KINDS: readonly PartKind[] = ['shape', 'text', 'icon', 'bar', 'arc'];
export type ColorScale = { src?: Source, min?: number, max?: number, stops: TileColor[] };
export const DEVICE_ICON_KINDS: readonly PartKind[] = ['switch', 'icon', 'repeat'];
/** The kinds with a press setting (a tap, a second tap to confirm, a hold): a button, a switch, any tapped component. */
export const PRESS_KINDS: readonly PartKind[] = ['button', 'switch'];
/** A repeater's order: by name, or by value, lowest or highest first. */
export const REPEAT_SORTS = ['name', 'up', 'down'] as const;

/** The kinds without a background unless they're given one. */
export const BARE_KINDS: readonly PartKind[] = ['text', 'icon', 'sparkline', 'arc', 'bar', 'calc', 'each', 'use'];
/** The kinds that draw text, so they have a text colour (`textColor`). */
export const TEXT_KINDS: readonly PartKind[] = [
  'text', 'switch', 'button', 'state', 'stepper', 'choice', 'variable', 'ring', 'segments', 'repeat', 'chart', 'container',
];
/** A Chart's series (each a device value's history over its span, in its colour). */
export const MAX_SERIES = 3;
/** A Repeater's devices (each a ready-made component filled in with one). */
export const MAX_EACH = 24;
/**
 * How many of a web dashboard's columns a design is shown over at first (the builder's preview, Add widget): it's made
 * for one column, its grid always 4 columns, which stretch over more as a normal widget's do.
 */
export const MAX_SPAN = 3;

/**
 * A part's background: Quick Actions' tile, the pill of Quick Actions, Device Values and Sensor Alarms, none, or (a Text
 * only) Notes' Post-it note.
 */
export const PART_STYLES = ['tile', 'pill', 'none', 'postit'] as const;
/** A Text's sizes: Notes' Small 14, Default 17 medium and Large 24 bold, and Big 32 bold. */
export const TEXT_SIZES = ['display', 'large', 'default', 'small'] as const;
/** A Text's sizes before they were Notes': Normal (14) is Small now, Heading (20) Default. */
const OLD_SIZES: Record<string, typeof TEXT_SIZES[number]> = { body: 'small', heading: 'default' };
export type PartStyle = typeof PART_STYLES[number];

export type Place = { x: number, y: number, w: number, h: number };

export type Choice = { label: string, value: string };

export type Part = {
  id: string,
  kind: PartKind,
  /** Shown on the part, and its name in the trigger cards (`Design · Part`). */
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
  /** The settings that follow a Flow input while it has a value (`BIND_PROPS`), by the input's id. */
  bind?: Partial<Record<BindProp, string>>,
  slot?: string,
  variable?: string,
  /** A button's Flow (`flow:<id>` or `advanced:<id>`); without one the button fires *A part was tapped*. */
  flowId?: string,
  text?: string,
  size?: typeof TEXT_SIZES[number],
  weight?: 'regular' | 'medium' | 'bold',
  /** A Text's long text, as Notes' *Long text*: cut short, scrolled to its end and back, or on more lines (missing). */
  overflow?: 'ellipsis' | 'scroll',
  /** A Text in Homey's lighter text colour (Device Values' second value). */
  muted?: true,
  /** The built-in parts it leaves out (`ELEMENTS`). */
  hide?: Element[],
  align?: 'left' | 'center' | 'right',
  units?: string,
  min?: number,
  max?: number,
  step?: number,
  choices?: Choice[],
  /**
   * A Sparkline's, a Chart's and a calculated value's `change` time span: the kit's `timeSpan()` ids, as the charts'
   * time span settings write them (`24h`, `3d!` the last three calendar days, `1w!-` last week), or the old names.
   */
  span?: string,
  /** A Sparkline's and a Chart's lines smoothed (Sparklines' and Charts' *Smooth chart lines*). */
  smooth?: true,
  /** An Arc's or a Bar's value (between `min` and `max`, else the capability's range, else 0–100). */
  src?: Source,
  /** A container's (and a shape's `background`, its fill): */
  mode?: 'grid' | 'free' | 'pages',
  background?: Background,
  parts?: Part[],
  /** An Icon as large as its box (else at most 34 px). */
  grow?: boolean,
  /**
   * The device's own icon, as the Homey app shows it, for its value's device (a switch's or icon's `slot`) or each of a
   * List's items, instead of the capability's glyph (`DEVICE_ICON_KINDS`); a picked icon, a rule's or a Flow's wins.
   */
  deviceIcon?: true,
  /** Locked in the builder (its Layers' lock, 1.4.1): the canvas doesn't pick or move it. The widget ignores it. */
  locked?: true,
  /**
   * A shape's: its form, corner radius (px, a rectangle), opacity (%), a line's thickness (px) and direction (a line's,
   * and a Bar's).
   */
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
  /** A calculated value's `change` as a share of where it started. */
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
  /** A repeater's order (`REPEAT_SORTS`) and the most it shows (else as many as fit, up to `MAX_REPEAT_ITEMS`). */
  sort?: typeof REPEAT_SORTS[number],
  /** A List's: each item coloured by the first that holds on its value (no `of`, no hide). */
  itemRules?: Rule[],
  limit?: number,
  /** The colour of its text (a palette name or `#rrggbb`), on any kind that draws text (`TEXT_KINDS`). */
  textColor?: TileColor,
  /**
   * A Chart's series (each with its title, else the device's name), drawn as areas, lines or bars (Chart · Basic's
   * styles), with its scale and times along its edges (`axis`), the scale from zero (`scale: 'zero'`, else fitted),
   * below zero in yellow (`negative`), the legend's chips above or below it or none, and the values now at its top.
   */
  series?: { slot: string, color: TileColor | null, title?: string }[],
  chartStyle?: 'area' | 'line' | 'bars',
  axis?: boolean,
  chartScale?: 'fit' | 'zero',
  negative?: true,
  chartLegend?: 'above' | 'below' | 'hidden',
  header?: true,
  /**
   * An Arc's and a Bar's colour by level (Chart · Gauge's): `rising` (higher is worse) or `falling`, yellow from
   * `yellowAt`, red from `redAt`; and the lowest to highest over `rangeSpan` (a device value's history).
   */
  zones?: 'rising' | 'falling',
  yellowAt?: number,
  redAt?: number,
  rangeSpan?: string,
  /** A Switch that's on as Quick Actions' *Lighter tile* (else tinted in its colour). */
  active?: 'lighter',
  /** A Variable shown only (Variables' *Read only*): a yes/no as a dot and Yes or No. */
  readOnly?: true,
  /**
   * A container filled from the left by a value's level (Device Values' *Fill percentages by level*): red below
   * `redBelow` per cent of its range, yellow below `yellowBelow`, else green.
   */
  fillBy?: Source,
  /**
   * A colour scale (`SCALE_KINDS`): its own colour blended along a value's range, from the first stop at `min` to the
   * last at `max` (2 or 3 stops, palette names or `#rrggbb`); the value is `src`, else its own (an icon's, bar's or
   * arc's). A rule's or a Flow's colour still wins.
   */
  colorBy?: ColorScale,
  redBelow?: number,
  yellowBelow?: number,
  /**
   * A Repeater's: the ready-made component it repeats (a design saved as one, `ready`), once per device: the devices
   * picked (`devices`), or every device with `capability` (in `zone`), each filling in the component's `@` values.
   */
  ready?: string,
  /** A linked ready-made's own device for its `@` values (`use`); without one, the widget's. */
  device?: string,
  devices?: string[],
};

/**
 * A container's fill (a shape's too, which ignores `dim`): its strength, `widget` (missing: the normal tiles' colour, a
 * tint in Muted and solid in Vivid), `half` or `full` (the bright colour, solid).
 */
export type Background =
  | { kind: 'none' }
  | { kind: 'color', from: string, dim?: BackgroundDim }
  | { kind: 'gradient', from: string, to: string, angle: number, dim?: BackgroundDim };
export const BACKGROUND_DIMS = ['widget', 'half', 'full'] as const;
export type BackgroundDim = typeof BACKGROUND_DIMS[number];

/**
 * A design. `span`: the web dashboard columns it's shown over at first (1–3; its grid stays 4 columns, stretched). `ready`: saved as a
 * ready-made component (the builder's library, a Repeater's item), not a widget of its own: its first part is the
 * component. `sample`: the device the builder shows the widget's device (`@`) with.
 */
export type Design = { id: string, name: string, updatedAt: number, grid: typeof GRID_COLUMNS, parts: Part[], span?: number, ready?: true, sample?: string };

const HEX = /^#[0-9a-f]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,24}$/;
/** The names a span had before it took the charts' time span (the kit's `SPAN_NAMES` reads them too). */
const SPAN_NAMES = new Set(['1h', '6h', '24h', '7d', '30d', 'today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear']);
/** A time span as the kit's `timeSpan()` reads it: a count of minutes … years, `!` whole periods, `-` the one before. */
const SPAN = /^([1-9]\d{0,5})(mo|m|h|d|w|y)(!?)(-?)$/;
/** A span as kept, else `fallback`. */
export function spanOf(v: unknown, fallback = '24h'): string {
  if (typeof v !== 'string') return fallback;
  if (SPAN_NAMES.has(v)) return v;
  const m = SPAN.exec(v);
  if (!m || (m[3] && (m[2] === 'm' || m[2] === 'h')) || (m[4] && !m[3])) return fallback;
  return v;
}

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
 * Where a part goes, kept on its grid: top level in the 12 columns of 16 px rows, in a container on its fine grid (12 columns,
 * any row) or, free-form, in per cent of the container (one decimal).
 */
function placeOf(v: any, where: 'top' | 'grid' | 'free'): Place {
  if (where === 'free') {
    const x = num(v?.x, 0, 99, 0, 0.1);
    const y = num(v?.y, 0, 99, 0, 0.1);
    return { x, y, w: num(v?.w, 1, 100 - x, Math.min(25, 100 - x), 0.1), h: num(v?.h, 1, 100 - y, Math.min(25, 100 - y), 0.1) };
  }
  const cols = where === 'top' ? GRID_COLUMNS : FINE_COLUMNS;
  const rows = where === 'top' ? MAX_GRID_ROWS : 216;
  const x = num(v?.x, 0, cols - 1, 0);
  const y = num(v?.y, 0, rows - 1, 0);
  return { x, y, w: num(v?.w, 1, cols - x, 1), h: num(v?.h, 1, where === 'top' ? 8 * GRID_STEP : rows, where === 'top' ? GRID_STEP : 8) };
}

/** A source as kept, or undefined. `parts`: whether a calculated value may be one (checked against the design later). */
export function sourceOf(v: unknown, parts = true): Source | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const slot = slotOf(r.slot);
  if (slot) return { slot };
  const variable = idOf(r.variable, 100);
  if (variable) return { variable };
  if (typeof r.input === 'string' && ID.test(r.input) && !isReservedKey(r.input)) return { input: r.input };
  const part = typeof r.part === 'string' && ID.test(r.part) && !isReservedKey(r.part) ? r.part : undefined;
  return parts && part ? { part } : undefined;
}

function refOf(v: unknown): Ref | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, any>;
  if (REF_TIMES.includes(r.time)) return { time: r.time };
  if (slotOf(r.since)) return { since: slotOf(r.since)! };
  const sinceInput = r.since && typeof r.since === 'object' ? r.since.input : undefined;
  if (typeof sinceInput === 'string' && ID.test(sinceInput) && !isReservedKey(sinceInput)) return { since: { input: sinceInput } };
  if (typeof r.until === 'string' && HHMM.test(r.until)) return { until: r.until };
  const src = sourceOf(v);
  if (!src) return null;
  if (r.show === 'name') return { ...src, show: 'name' };
  // A device's room: only a device value has one.
  if (r.show === 'room' && 'slot' in src) return { ...src, show: 'room' };
  const out: Ref = { ...src };
  const decimals = optNum(r.decimals);
  if (decimals !== undefined) out.decimals = num(decimals, 0, 3, 1);
  if (r.plain === true) out.plain = true;
  return out;
}

/** `between`'s upper end, or undefined for the other ops. */
const toOf = (op: RuleOp, v: unknown) => (op === 'between' ? { to: str(String(v ?? ''), 60) } : {});

/**
 * `valueless`: a kind without a value of its own keeps only the rules that name theirs; `icons`: whether it draws a
 * rule's icon.
 */
function rulesOf(v: unknown, valueless = false, icons = true): Rule[] {
  if (!Array.isArray(v)) return [];
  const out: Rule[] = [];
  for (const r of v.slice(0, MAX_RULES)) {
    if (!r || typeof r !== 'object') continue;
    const look = r.look === 'hide' || r.look === 'same' ? r.look : color(r.look);
    if (!look || !RULE_OPS.includes(r.op)) continue;
    const of = sourceOf(r.of);
    if (valueless && !of) continue;
    const icon = icons ? iconOf(r.icon) : undefined;
    // A rule that keeps the colour is only there for its icon.
    if (look === 'same' && !icon) continue;
    out.push({ op: r.op, value: str(String(r.value ?? ''), 60), ...toOf(r.op, r.to), look, ...(of ? { of } : {}), ...(icon ? { icon } : {}) });
  }
  return out;
}

/** A colour scale: 2–3 stops, a source (which `needsSource` kinds must have: they have no value of their own), its ends. */
function scaleOf(v: unknown, needsSource: boolean): ColorScale | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, any>;
  const stops = (Array.isArray(r.stops) ? r.stops : []).map(color).filter((c: TileColor | null): c is TileColor => !!c).slice(0, 3);
  if (stops.length < 2) return undefined;
  const src = sourceOf(r.src);
  if (needsSource && !src) return undefined;
  const out: ColorScale = { stops, ...(src ? { src } : {}) };
  const min = optNum(r.min);
  const max = optNum(r.max);
  if (min !== undefined) out.min = min;
  if (max !== undefined) out.max = max;
  return out;
}

const iconOf = (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : undefined);

/** The settings a kind may bind to a Flow input. */
export function bindPropsOf(kind: PartKind, mode?: Part['mode']): BindProp[] {
  if (kind === 'calc' || kind === 'use' || kind === 'each') return kind === 'calc' ? [] : ['shown'];
  const out: BindProp[] = [];
  if (LABEL_KINDS.includes(kind)) out.push('text');
  if (ACCENT_KINDS.includes(kind)) out.push('color');
  if (TEXT_KINDS.includes(kind)) out.push('textColor');
  if (kind === 'container' || kind === 'shape') out.push('fill');
  if (ICON_KINDS.includes(kind)) out.push('icon');
  out.push('shown');
  if (kind === 'container' && mode === 'pages') out.push('page');
  return out;
}

/** A part's bindings as kept: only the settings its kind has, each an input's id. */
function bindOf(v: unknown, props: BindProp[]): Partial<Record<BindProp, string>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Partial<Record<BindProp, string>> = {};
  for (const k of props) {
    const id = (v as any)[k];
    if (typeof id === 'string' && ID.test(id) && !isReservedKey(id)) out[k] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The Flow inputs as kept (`customInputs`): well-formed, ids and names (without case) unique, at most 100. */
export function readInputs(v: unknown): Input[] {
  const out: Input[] = [];
  const names = new Set<string>();
  for (const r of Array.isArray(v) ? v : []) {
    if (out.length >= MAX_FLOW_INPUTS) break;
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.id === 'string' && ID.test(r.id) && !isReservedKey(r.id) ? r.id : '';
    const name = str(r.name, MAX_NAME);
    if (!id || !name || out.some(x => x.id === id) || names.has(name.toLowerCase())) continue;
    if (!INPUT_TYPES.includes(r.type)) continue;
    names.add(name.toLowerCase());
    out.push({ id, name, type: r.type, ...(r.perDevice === true ? { perDevice: true as const } : {}), reset: oneOf(r.reset, INPUT_RESETS, 'never') });
  }
  return out;
}

/** An input's value as a Flow or an action gives it, read as its type; undefined when it isn't one. */
export function inputValue(type: InputType, v: unknown): string | number | boolean | undefined {
  switch (type) {
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim().replace(',', '.')) : NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case 'yesno': {
      if (typeof v === 'boolean') return v;
      const s = String(v ?? '').trim().toLowerCase();
      return ['on', 'yes', 'true', 'open', '1'].includes(s) ? true : ['off', 'no', 'false', 'closed', '0'].includes(s) ? false : undefined;
    }
    case 'color': return color(v) ?? undefined;
    case 'icon': return typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) && v !== 'none' ? v : undefined;
    default: return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : undefined;
  }
}

/** A background: none, a colour or a gradient, each colour a palette name (Muted or Vivid's) or `#rrggbb`. */
function backgroundOf(v: any): Background {
  const from = color(v?.from);
  // `widget`, the default, isn't kept.
  const dim = v?.dim === 'half' || v?.dim === 'full' ? { dim: v.dim as BackgroundDim } : {};
  if (v?.kind === 'color' && from) return { kind: 'color', from, ...dim };
  const to = color(v?.to);
  if (v?.kind === 'gradient' && from && to) {
    return { kind: 'gradient', from, to, angle: num(v.angle, 0, 359, 135), ...dim };
  }
  return { kind: 'none' };
}

/**
 * Whether a design was laid out before 2026-11-24's one-column designs: on 4 grid columns per dashboard column, with a
 * top-level part reaching past the fourth.
 */
function wideLayout(parts: unknown): boolean {
  return Array.isArray(parts) && parts.some((p: any) => Number(p?.at?.x) + Number(p?.at?.w) > OLD_COLUMNS);
}

/** A top-level part of a design kept on the old grid (4 columns of 64 px rows), on the fine one: each cell 3 × 3. */
function onFineGrid(raw: unknown): unknown {
  const r = raw as any;
  if (!r || typeof r !== 'object' || !r.at || typeof r.at !== 'object') return raw;
  // Kept on the old grid first, as it was read then.
  const x = num(r.at.x, 0, OLD_COLUMNS - 1, 0);
  const y = num(r.at.y, 0, MAX_GRID_ROWS / GRID_STEP - 1, 0);
  const old = { x, y, w: num(r.at.w, 1, OLD_COLUMNS - x, 1), h: num(r.at.h, 1, 8, 1) };
  return { ...r, at: { x: old.x * GRID_STEP, y: old.y * GRID_STEP, w: old.w * GRID_STEP, h: old.h * GRID_STEP } };
}

/** A top-level part of such a design, its columns scaled onto the one column's 4 (rows stay). */
function narrowed(raw: unknown, span: number): unknown {
  const r = raw as any;
  if (!r || typeof r !== 'object' || !r.at || typeof r.at !== 'object') return raw;
  const x = Math.round(Number(r.at.x) / span) || 0;
  const w = Math.max(1, Math.round((Number(r.at.x) + Number(r.at.w)) / span) - x);
  return { ...r, at: { ...r.at, x, w } };
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
  const span = num(d.span, 1, MAX_SPAN, 1);
  // Kept before the 12-column grid: narrowed (a design from before one-column designs), then each cell 3 × 3.
  const old = d.grid !== GRID_COLUMNS;
  const narrow = old && span > 1 && wideLayout(d.parts) ? span : 1;
  const seen = new Set<string>();
  let count = 0;
  const partsOf = (list: unknown, where: 'top' | 'grid' | 'free'): Part[] => {
    if (!Array.isArray(list)) return [];
    const out: Part[] = [];
    for (const raw of list) {
      if (count >= MAX_PARTS) break;
      const p = readPart(where === 'top' && old ? onFineGrid(narrow > 1 ? narrowed(raw, narrow) : raw) : raw, where);
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
    grid: GRID_COLUMNS,
    parts: partsOf(d.parts, 'top'),
  };
  if (span > 1) design.span = span;
  if (d.ready === true) design.ready = true;
  const sample = idOf(d.sample, 100);
  if (sample && sample !== '@') design.sample = sample;
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
    if (p.refs) p.refs = p.refs.map(r => (r && 'part' in r && !ok(r, p.id) ? null : r));
    if (p.rings) p.rings = p.rings.filter(r => ok(r.src, p.id));
    if (p.segments) p.segments = p.segments.filter(x => ok(x.src, p.id));
    if (p.src && !ok(p.src, p.id)) delete p.src;
    if (p.fillBy && !ok(p.fillBy, p.id)) { delete p.fillBy; delete p.redBelow; delete p.yellowBelow; }
    if (p.colorBy?.src && !ok(p.colorBy.src, p.id)) {
      if (p.kind === 'shape' || p.kind === 'text') delete p.colorBy;
      else delete p.colorBy.src;
    }
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
    case 'url': { const url = webAddress(a.url); return url ? { do: 'url', url, ...(a.same === true ? { same: true as const } : {}) } : null; }
    case 'state': return typeof a.part === 'string' && ID.test(a.part) && !isReservedKey(a.part) ? { do: 'state', part: a.part, value } : null;
    case 'input': return typeof a.input === 'string' && ID.test(a.input) && !isReservedKey(a.input) ? { do: 'input', input: a.input, value } : null;
    default: return null;
  }
}

/** An http or https address of at most 500 characters, trimmed, else null (an Image's, an action's). */
function webAddress(v: unknown): string | null {
  return typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()) && v.length <= 500 ? v.trim() : null;
}

function imageOf(v: unknown): ImageSource | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const url = r.kind === 'url' ? webAddress(r.url) : null;
  if (url) return { kind: 'url', url };
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

/** A part's own `min`/`max` (either may be missing: the capability's then), the lower first. */
function readRange(p: Part, r: Record<string, any>) {
  const [min, max] = [optNum(r.min), optNum(r.max)];
  if (min !== undefined) p.min = min;
  if (max !== undefined) p.max = max;
  if (p.min !== undefined && p.max !== undefined && p.min > p.max) [p.min, p.max] = [p.max, p.min];
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
    // A calculated value is never drawn: no colour, icon, rules or Flow inputs of its own.
    color: kind === 'calc' ? null : color(r.color),
    icon: ICON_KINDS.includes(kind) && typeof r.icon === 'string' && /^[a-z0-9-]{1,40}$/.test(r.icon) ? r.icon : null,
    // Saved before 1.4.0's release as `tile: false` (on a container's background).
    // Text, icons and the bare data primitives sit right on their background unless given one.
    style: kind === 'shape' ? 'none' : oneOf(r.style === 'postit' && kind !== 'text' ? undefined : r.style, PART_STYLES, r.tile === false || BARE_KINDS.includes(kind) ? 'none' : 'tile'),
    // An icon that follows a device value has one of its own.
    rules: kind === 'calc' ? [] : rulesOf(r.rules, VALUELESS_KINDS.includes(kind) && !(kind === 'icon' && slotOf(r.slot)), ICON_KINDS.includes(kind)),
  };
  if (DEVICE_ICON_KINDS.includes(kind) && r.deviceIcon === true) p.deviceIcon = true;
  if (r.locked === true) p.locked = true;
  if (SCALE_KINDS.includes(kind)) {
    const colorBy = scaleOf(r.colorBy, kind === 'shape' || kind === 'text');
    if (colorBy) p.colorBy = colorBy;
  }
  const bind = bindOf(r.bind, bindPropsOf(kind, kind === 'container' ? (r.mode === 'free' ? 'free' : r.mode === 'pages' ? 'pages' : 'grid') : undefined));
  if (bind) p.bind = bind;
  if (Number.isInteger(r.page) && r.page >= 0 && r.page < MAX_PAGES) p.page = r.page;
  if (TEXT_KINDS.includes(kind)) {
    // A Text's own colour was its text's before it had a text colour.
    const ink = color(r.textColor) ?? (kind === 'text' ? color(r.color) : null);
    if (ink) p.textColor = ink;
    // A Text's own colour is a Post-it's paper only.
    if (kind === 'text' && p.style !== 'postit') p.color = null;
  }
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
  if (kind === 'switch') {
    const press = oneOf(r.press, ['tap', 'confirm', 'long'] as const, 'tap');
    if (press !== 'tap') p.press = press;
    if (r.active === 'lighter') p.active = 'lighter';
  }
  if (VARIABLE_KINDS.includes(kind) && !p.slot) {
    const variable = idOf(r.variable, 100);
    if (variable) p.variable = variable;
  }
  switch (kind) {
    case 'sparkline': {
      p.span = spanOf(r.span);
      if (r.smooth === true) p.smooth = true;
      readRange(p, r);
      break;
    }
    case 'icon':
      if (r.grow === true) p.grow = true;
      break;
    case 'variable': {
      readRange(p, r);
      if (r.readOnly === true) p.readOnly = true;
      // − and + on a number (Variables' *Step for − and + on numbers*).
      if (optNum(r.step) !== undefined && Number(r.step) > 0) p.step = num(r.step, 0.01, 1000, 1, 0.01);
      const decimals = optNum(r.decimals);
      if (decimals !== undefined) p.decimals = num(decimals, 0, 3, 2);
      const units = str(r.units, MAX_UNITS);
      if (units) p.units = units;
      break;
    }
    case 'arc': case 'bar': {
      const src = sourceOf(r.src);
      if (src) p.src = src;
      readRange(p, r);
      // Chart · Gauge's 12 px arc; the 6 px track of Light Controls' and Room Health's bars.
      p.thickness = num(r.thickness, 2, 24, kind === 'arc' ? 12 : 6);
      if (kind === 'bar' && r.dir === 'vertical') p.dir = 'vertical';
      if (r.zones === 'rising' || r.zones === 'falling') {
        p.zones = r.zones;
        p.yellowAt = optNum(r.yellowAt) ?? (r.zones === 'rising' ? 60 : 40);
        p.redAt = optNum(r.redAt) ?? (r.zones === 'rising' ? 80 : 20);
      }
      if (r.rangeSpan !== undefined && r.rangeSpan !== null && r.rangeSpan !== '') p.rangeSpan = spanOf(r.rangeSpan, '1d!');
      break;
    }
    case 'slider': case 'stepper': {
      readRange(p, r);
      if (kind === 'stepper') p.step = num(r.step, 0.01, 1000, 0.5, 0.01);
      // A slider's own step; without one, the capability's (else 1, or 0.01 over a range of 1).
      else if (optNum(r.step) !== undefined && Number(r.step) > 0) p.step = num(r.step, 0.01, 1000, 1, 0.01);
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
      // A device's picture was read again every 5 minutes before it was a choice; a web address's never.
      p.refresh = r.refresh != null && [0, 1, 5, 15, 60].includes(Number(r.refresh)) ? Number(r.refresh) : p.image?.kind === 'url' ? 0 : 5;
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
    case 'repeat': {
      const cap = typeof r.capability === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(r.capability) ? r.capability : '';
      if (cap) p.capability = cap;
      const zone = idOf(r.zone, 100);
      if (zone) p.zone = zone;
      if (r.test && typeof r.test === 'object' && RULE_OPS.includes(r.test.op)) p.test = { op: r.test.op, value: str(String(r.test.value ?? ''), 60), ...toOf(r.test.op, r.test.to) };
      p.itemStyle = r.itemStyle === 'tile' ? 'tile' : 'row';
      p.columns = num(r.columns, 1, 4, 1);
      if (r.control === true) p.control = true;
      p.sort = oneOf(r.sort, REPEAT_SORTS, 'name');
      if (optNum(r.limit) !== undefined) p.limit = num(r.limit, 1, MAX_REPEAT_ITEMS, MAX_REPEAT_ITEMS);
      // Each item's colour by its own value (a battery's level): colours only, on the item's value.
      const itemRules = rulesOf(r.itemRules, false, false).filter(x => x.look !== 'hide' && x.look !== 'same').map(({ of, ...x }) => x);
      if (itemRules.length) p.itemRules = itemRules;
      p.text = str(r.text, MAX_TEXT);
      break;
    }
    case 'text':
      p.text = typeof r.text === 'string' ? r.text.slice(0, MAX_TEXT) : '';
      p.size = oneOf(OLD_SIZES[r.size] ?? r.size, TEXT_SIZES, 'small');
      if (['regular', 'medium', 'bold'].includes(r.weight)) p.weight = r.weight;
      if (r.overflow === 'ellipsis' || r.overflow === 'scroll') p.overflow = r.overflow;
      if (r.muted === true) p.muted = true;
      p.align = oneOf(r.align, ['left', 'center', 'right'] as const, 'left');
      if (Array.isArray(r.refs) && r.refs.length) p.refs = r.refs.slice(0, MAX_REFS).map(refOf);
      break;
    case 'shape':
      p.shape = oneOf(r.shape, SHAPES, 'rect');
      p.background = backgroundOf(r.background);
      // A shape's fill is as picked, with its own opacity.
      if ('dim' in p.background) delete p.background.dim;
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
      if (p.op === 'count') {
        const op = oneOf(r.test?.op, RULE_OPS, 'is');
        p.test = { op, value: str(String(r.test?.value ?? 'on'), 60), ...toOf(op, r.test?.to) };
      }
      if (p.op === 'formula') p.formula = str(r.formula, MAX_FORMULA);
      if (p.op === 'change') {
        p.span = spanOf(r.span, '1h');
        if (r.percent === true) p.percent = true;
      }
      const decimals = optNum(r.decimals);
      if (decimals !== undefined) p.decimals = num(decimals, 0, 3, 1);
      p.units = str(r.units, MAX_UNITS);
      break;
    }
    case 'chart': {
      const series: { slot: string, color: TileColor | null }[] = [];
      // A Mini chart (before 1.4.0's release, the same id) kept its value as `slot`.
      for (const x of Array.isArray(r.series) ? r.series : slotOf(r.slot) ? [{ slot: r.slot }] : []) {
        const slot = slotOf(x?.slot);
        const title = str(x?.title, 24);
        if (slot && !series.some(s => s.slot === slot) && series.length < MAX_SERIES) series.push({ slot, color: color(x?.color), ...(title ? { title } : {}) });
      }
      p.series = series;
      p.span = spanOf(r.span);
      p.chartStyle = oneOf(r.chartStyle, ['area', 'line', 'bars'] as const, 'area');
      p.axis = r.axis !== false;
      if (r.smooth === true) p.smooth = true;
      if (r.chartScale === 'zero') p.chartScale = 'zero';
      if (r.negative === true) p.negative = true;
      p.chartLegend = oneOf(r.chartLegend, ['above', 'below', 'hidden'] as const, 'above');
      if (r.header === true) p.header = true;
      readRange(p, r);
      break;
    }
    case 'use': {
      // A linked ready-made: its source's component as it is now, in this box (`renewIds()` turns it into a copy).
      const ready = typeof r.ready === 'string' && ID.test(r.ready) && !isReservedKey(r.ready) ? r.ready : '';
      if (ready) p.ready = ready;
      // Its own device for the ready-made's values of the widget's device (`@`); without one, the widget's.
      const device = idOf(r.device, 100);
      if (device && device !== '@') p.device = device;
      break;
    }
    case 'each': {
      const ready = typeof r.ready === 'string' && ID.test(r.ready) && !isReservedKey(r.ready) ? r.ready : '';
      if (ready) p.ready = ready;
      const cap = typeof r.capability === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(r.capability) ? r.capability : '';
      if (cap) p.capability = cap;
      else {
        const devices = (Array.isArray(r.devices) ? r.devices : []).map((x: unknown) => idOf(x, 100)).filter((x: string | undefined): x is string => !!x && x !== '@');
        p.devices = [...new Set(devices)].slice(0, MAX_EACH) as string[];
      }
      const zone = idOf(r.zone, 100);
      if (cap && zone) p.zone = zone;
      // By its capability's value, lowest or highest first (by name, the default, isn't kept).
      if (cap && (r.sort === 'up' || r.sort === 'down')) p.sort = r.sort;
      p.columns = num(r.columns, 1, 4, 1);
      if (optNum(r.limit) !== undefined) p.limit = num(r.limit, 1, MAX_EACH, MAX_EACH);
      break;
    }
    case 'container':
      p.mode = r.mode === 'free' ? 'free' : r.mode === 'pages' ? 'pages' : 'grid';
      p.background = backgroundOf(r.background);
      // Before containers had a style: drawn on the tile's colour without a background of their own, else on it.
      if (!PART_STYLES.includes(r.style) || r.style === 'postit') p.style = p.background.kind === 'none' ? 'tile' : 'none';
      {
        const by = sourceOf(r.fillBy);
        if (by) {
          p.fillBy = by;
          p.redBelow = num(r.redBelow, 0, 100, 10);
          p.yellowBelow = num(r.yellowBelow, 0, 100, 20);
        }
      }
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
    if (p.src) out.push(p.src);
    if (p.fillBy) out.push(p.fillBy);
    if (p.colorBy?.src) out.push(p.colorBy.src);
    if (p.variable) out.push({ variable: p.variable });
    for (const r of p.rules) if (r.of) out.push(r.of);
    for (const r of p.refs ?? []) {
      if (!r || 'time' in r || 'until' in r) continue;
      out.push('since' in r ? (typeof r.since === 'string' ? { slot: r.since } : { input: r.since.input }) : r);
    }
    out.push(...(p.inputs ?? []));
    for (const r of p.rings ?? []) out.push(r.src);
    for (const x of p.segments ?? []) out.push(x.src);
    for (const x of p.series ?? []) out.push({ slot: x.slot });
    for (const a of p.actions ?? []) if (a.do === 'set') out.push({ slot: a.slot }); else if (a.do === 'variable') out.push({ variable: a.variable }); else if (a.do === 'input') out.push({ input: a.input });
    for (const id of Object.values(p.bind ?? {})) out.push({ input: id });
  }
  return out;
}

/** The device values a design shows, each once. */
export function designSlots(design: Design): string[] {
  return [...new Set(designSources(design).map(s => ('slot' in s ? s.slot : '')).filter(Boolean))];
}

/** Whether a design's texts show a device's room (`show: 'room'`), so `/state` reads the rooms. */
export function designRooms(design: Design): boolean {
  return allParts(design).some(p => (p.refs ?? []).some(r => !!r && 'show' in r && r.show === 'room'));
}

/**
 * The devices whose own icon a design shows (`deviceIcon` on a switch or icon with a device value), each once; a List's
 * items' are its candidates', known only once they're read. The widget's device (`@`) not yet filled in is left out.
 */
export function designDeviceIcons(design: Design): string[] {
  const ids = allParts(design).filter(p => p.deviceIcon && p.kind !== 'repeat' && p.slot).map(p => p.slot!.slice(0, p.slot!.indexOf(':')));
  return [...new Set(ids.filter(id => id && id !== '@'))];
}

export function designVariables(design: Design): string[] {
  return [...new Set(designSources(design).map(s => ('variable' in s ? s.variable : '')).filter(Boolean))];
}

/** The Flow inputs a design reads or sets: its bindings, sources and actions. */
export function designInputs(design: Design): string[] {
  return [...new Set(designSources(design).map(s => ('input' in s ? s.input : '')).filter(Boolean))];
}

export function designFlows(design: Design): string[] {
  const ids = allParts(design).flatMap(p => [p.flowId, ...(p.actions ?? []).map(a => (a.do === 'flow' ? a.flowId : undefined))]);
  return [...new Set(ids.filter((s): s is string => !!s))];
}

/** The histories a design draws or reads: sparklines', calculated changes', as `{slot, span}` once each. */
export function designCharts(design: Design): { slot: string, span: string }[] {
  const seen = new Map<string, { slot: string, span: string }>();
  for (const p of allParts(design)) {
    // A sparkline's, and a calculated value's change (of its first input, a device value).
    const first = p.inputs?.[0];
    const slot = p.kind === 'sparkline' ? p.slot : p.kind === 'calc' && p.op === 'change' && first && 'slot' in first ? first.slot : undefined;
    for (const x of p.kind === 'chart' && p.span ? p.series ?? [] : []) seen.set(`${p.span}\n${x.slot}`, { slot: x.slot, span: p.span! });
    // An arc's or bar's range over its span (Chart · Gauge's *Show the range*).
    if (p.rangeSpan && p.src && 'slot' in p.src) seen.set(`${p.rangeSpan}\n${p.src.slot}`, { slot: p.src.slot, span: p.rangeSpan });
    if (!slot || !p.span) continue;
    seen.set(`${p.span}\n${slot}`, { slot, span: p.span });
  }
  return [...seen.values()];
}

/** The widget's device in a slot: `@:<capabilityId>`. */
export const DEVICE_SLOT = /^@:/;

/** Whether a design (or a part) reads the widget's device anywhere (`@`): it then works with any device. */
export function usesDevice(v: Design | Part): boolean {
  return JSON.stringify(v).includes('"@:') || /"device":"@"/.test(JSON.stringify(v));
}

/**
 * A design or part with the widget's device filled in: every `@:<capabilityId>` slot (the parts', their rules', texts',
 * actions', a chart's) becomes `<deviceId>:<capabilityId>`, and an image of the device (`@`) that device's. A copy;
 * without a device, the same object.
 */
export function bindDevice<T>(v: T, deviceId: string | undefined | null): T {
  if (!deviceId || /[\s:]/.test(deviceId)) return v;
  const walk = (x: unknown, key = ''): unknown => {
    if (typeof x === 'string') return DEVICE_SLOT.test(x) ? `${deviceId}${x.slice(1)}` : key === 'device' && x === '@' ? deviceId : x;
    if (Array.isArray(x)) return x.map(y => walk(y));
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, k)]));
    return x;
  };
  return walk(v) as T;
}

/**
 * A copy of a component with new ids throughout, its `{part}` references to its own parts following them (a
 * calculated value's inputs, a text's values, rules, a pages container's state).
 */
export function renewIds(part: Part): Part {
  const ids = new Map<string, string>();
  const collect = (p: Part): void => { ids.set(p.id, newId()); for (const k of p.parts ?? []) collect(k); };
  collect(part);
  const walk = (x: unknown, key = ''): unknown => {
    if (typeof x === 'string') return (key === 'id' || key === 'part') && ids.has(x) ? ids.get(x) : x;
    if (Array.isArray(x)) return x.map(y => walk(y));
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, k)]));
    return x;
  };
  return walk(structuredClone(part)) as Part;
}

/**
 * Turns a design's linked instances of a ready-made (`use` parts naming `readyId`) into copies of `source`, each in its
 * instance's box. A container can't go inside another, so such an instance is left out. Whether anything changed.
 */
export function detachUses(design: Design, readyId: string, source: Part): boolean {
  let changed = false;
  const swap = (list: Part[], inside: boolean): Part[] => list.flatMap((p) => {
    if (p.kind === 'container' && p.parts) p.parts = swap(p.parts, true);
    if (p.kind !== 'use' || p.ready !== readyId) return [p];
    changed = true;
    if (inside && source.kind === 'container') return [];
    const copy = renewIds(source);
    copy.at = { ...p.at };
    if (p.page !== undefined) copy.page = p.page;
    else delete copy.page;
    return [copy];
  });
  design.parts = swap(design.parts, false);
  return changed;
}

/** A part's name in the trigger cards' lists: `Design · Part`, the part's kind where it has no name. */
export function partLabel(design: Design, part: Part): string {
  return `${design.name} · ${part.name || part.text?.slice(0, 30) || part.kind}`;
}

/**
 * Whether a rule holds for a value (the widget's copy, `ruleHolds()`, is checked equal in the tests): `above`/`below`
 * compare numbers (a boolean as 1/0), `between` too (from `value` to `to`, both included), `is`/`isNot` compare as text, case and spaces aside, with `on`/`yes`/`true`
 * and `off`/`no`/`false` meaning a boolean's.
 */
export function ruleHolds(rule: Rule | Test, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = (x: unknown) => Number(String(x ?? '').replace(',', '.'));
  if (rule.op === 'between') {
    // From one end to the other, both included, whichever is typed first; an empty end is open.
    const v = Number(value);
    const [a, b] = [String(rule.value ?? '').trim() ? n(rule.value) : -Infinity, String(rule.to ?? '').trim() ? n(rule.to) : Infinity];
    if (!Number.isFinite(v) || Number.isNaN(a) || Number.isNaN(b)) return false;
    return v >= Math.min(a, b) && v <= Math.max(a, b);
  }
  if (rule.op === 'above' || rule.op === 'below') {
    const v = typeof value === 'boolean' ? Number(value) : Number(value);
    const r = n(rule.value);
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
