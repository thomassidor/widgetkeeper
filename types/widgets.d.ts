// Globals the widget scripts (widgets/*/public/widget.js and mount.js) put on `window` for their index.html.

/** A widget's mount.js: wires it to a Homey (the frame's own, or the Smart Stack's stand-in for one). */
/** The kit's `touchGuard()`: when a widget's nodes last got a touch. */
type TouchGuard = { touched: () => void, recent: () => boolean };

type MountWidget =((Homey: any, el: { root: HTMLElement, frame: HTMLElement }) => void | { setVisible?: (visible: boolean) => void })
  & { frameClass?: string };

interface Window {
  /** settings/dashboard.js, the web dashboards page; `io` is the vendored socket.io-client (settings/socket.io.js). */
  mountWebDashboards: (root: HTMLElement) => void;
  /** The web dashboards page's parts (settings/dashboard-<part>.js), which mountWebDashboards() runs with the page's shared `wd`. */
  WidgetkeeperWeb: { parts: Map<string, (wd: any) => void>, part: (name: string, fn: (wd: any) => void) => void };
  io: (url: string, opts?: object) => any;
  /** settings/popup.js, the prompt page a Popups widget opens: its fallback strings and its mount. */
  POPUP_PAGE_STRINGS: Record<string, string>;
  mountPopupPage: (root: HTMLElement, opts?: { fetch?: typeof fetch, hash?: string }) => void;
  /** Wide widgets' columns on the web dashboards (settings/dashboard-layout.js). */
  WidgetkeeperLayout: {
    spanOf: (w: any, c: number, count: number) => number,
    expand: (columns: any[][]) => any[][],
    collapse: (columns: any[][]) => any[][],
    place: (columns: any[][], heightOf: (entry: any) => number, gap: number) => { entry: any, top: number, margin: number, height: number, hidden: boolean }[][],
  };
  createElectricityWidget: (root: HTMLElement, opts?: object) => any;
  /** The chart module shared by the Electricity Overview, Charts and Chart · Totals (widgets/electricity/public/chart.js). */
  WidgetkeeperChart: any;
  createChartsWidget: (root: HTMLElement, opts?: object) => any;
  createTotalsWidget: (root: HTMLElement, opts?: object) => any;
  createScatterWidget: (root: HTMLElement, opts?: object) => any;
  createCompareWidget: (root: HTMLElement, opts?: object) => any;
  createTimelineWidget: ((root: HTMLElement, opts?: object) => any) & { kindOf: (capabilityId: string) => string };
  createStackedWidget: (root: HTMLElement, opts?: object) => any;
  createLinesWidget: (root: HTMLElement, opts?: object) => any;
  createDailyRangeWidget: (root: HTMLElement, opts?: object) => any;
  createTypicalDayWidget: (root: HTMLElement, opts?: object) => any;
  chartBuckets: (points: [number, number][], from: number, to: number, bucketMs: number | 'month', current?: number | null) => { t: number, end: number, v: number | null }[];
  createThermostatWidget: (root: HTMLElement, opts?: object) => any;
  createQuickActionsWidget: (root: HTMLElement, opts?: object) => any;
  createSensorAlarmsWidget: (root: HTMLElement, opts?: object) => any;
  createSensorDotsWidget: (root: HTMLElement, opts?: object) => any;
  createRoomHealthWidget: (root: HTMLElement, opts?: object) => any;
  roomHealthRange: (settings: Record<string, unknown>) => Record<string, { min: number | null, max: number }>;
  roomHealthScore: (measure: string, value: unknown, ranges: Record<string, { min: number | null, max: number }>) => { score: number, side: 'low' | 'high' | null } | null;
  createValueMatrixWidget: (root: HTMLElement, opts?: object) => any;
  valueMatrixRange: (text: unknown, column?: { capabilityId?: string, units?: string | null } | null) => { min: number | null, max: number | null } | null;
  valueMatrixLevel: (value: unknown, range: { min: number | null, max: number | null } | null) => 'good' | 'out' | 'far' | 'plain' | 'none';
  valueMatrixRows: (devices: object[], mode?: string) => { key: string, name?: string, missing?: true, devices: object[], values: Record<string, number | null> }[];
  createValueBoardWidget: (root: HTMLElement, opts?: object) => any;
  valueBoardLevel: (value: { capabilityId: string, type?: string, units?: string | null, value: unknown }) => 'alert' | 'warn' | 'fine' | null;
  valueBoardGroups: (devices: object[], groupBy?: string) => { key: string, name?: string, missing?: true, values: any[] }[];
  roomHealthRooms: (devices: object[]) => { key: string, name?: string, missing?: true, sensors: object[], values: Record<string, number | null> }[];
  createWeatherWidget: (root: HTMLElement, opts?: object) => any;
  createPollenWidget: (root: HTMLElement, opts?: object) => any;
  pollenTypes: (settings: Record<string, unknown>) => string[];
  createCamerasWidget: (root: HTMLElement, opts?: object) => any;
  createHeatmapWidget: (root: HTMLElement, opts?: object) => any;
  createValuesWidget: (root: HTMLElement, opts?: object) => any;
  createCombinedWidget: (root: HTMLElement, opts?: object) => any;
  createFlowTilesWidget: (root: HTMLElement, opts?: object) => any;
  flowTileKey: (name: unknown, fallback?: string) => string;
  valueTileParts: (parent: HTMLElement, pill: boolean) => any;
  combineValues: (read: { name: string, value: number }[]) => { sum: number, avg: number, min: number, max: number, lo: string, hi: string, n: number } | null;
  createLightsWidget: (root: HTMLElement, opts?: object) => any;
  createLightRoomsWidget: (root: HTMLElement, opts?: object) => any;
  createSparklinesWidget: (root: HTMLElement, opts?: object) => any;
  createVariablesWidget: (root: HTMLElement, opts?: object) => any;
  variableNameKeys: (slots: { id: string }[]) => string[];
  variableStepValue: (value: unknown, step: number, dir: number) => number;
  parseVariableNumber: (text: string) => number | null;
  /** The preset buttons shared by Thermostat Presets and Variable Presets (widgets/thermostat/public/presets.js). */
  WidgetkeeperPresets: { create: (root: HTMLElement, hooks: any) => any };
  /** The shared kit (widgets/spacer/public/kit.js), which every widget's index.html loads first. */
  WidgetkeeperKit: {
    icons: Record<string, { d: string, fill?: boolean }>,
    /** Light Controls' and Lights by Room's colours: chip glyphs, swatch palettes, a light's, swatch's or Mood's colour. */
    lights: {
      glyphs: Record<'temp' | 'hue' | 'close' | 'pie', string>,
      PALETTES: Record<string, { colors: number[][], whites: number[] }>,
      temperatureColor: (k: number) => string,
      hueColor: (hue: number, sat: number) => string,
      lightColor: (caps: Record<string, { value: unknown }>) => string,
      moodDot: (colors: ({ hue: number, saturation: number } | { temperature: number })[]) => string | null,
      swatchList: (palette: { colors: number[][], whites: number[] }, color: boolean, temp: boolean) => { hue?: number, sat?: number, k?: number }[],
      setBlend: (node: HTMLElement, colors: string[] | null, prefix: string, angle: string) => void,
      /** The lights' shown state (optimistic over reported) and what follows from it, for Light Controls and Lights by Room. */
      model: (opts: { render: () => void, roomLevel?: string }) => any,
      panel: (opts: { ms: number, render: () => void, blocked: () => boolean }) => { readonly id: any, arm: () => void, close: () => void, toggle: (id: any) => void, drop: () => void },
    },
    /** Values just sent, shown until the device confirms them (`ms`, 10 s by default). */
    STREAM_NEXT_MS: number,
    STREAM_LAST_MS: number,
    /** Homey's WebRTC offer for one camera stream, through the Cameras routes; null when `current()` says it was dropped. */
    openVideoStream: (pc: RTCPeerConnection, videoId: string, post: (path: string, body: any) => Promise<any>, current: () => boolean) => Promise<any>,
    /** The video frames decoded so far, from the connection's stats; null when the browser can't tell. */
    /** Plays a camera's streams in turn into a video until one gives a frame (a popup on a web dashboard). */
    playCameraStream: (video: HTMLVideoElement, videoIds: string[], post: (path: string, body: any) => Promise<any>, on: { onPlaying: (videoId: string) => void, onEnded: (played: boolean, why: string, info: { away: boolean }) => void, onStreamFailed?: (videoId: string, why: string, index: number) => void, onKeepAliveFailed?: (err: any) => void }) => { stop: () => void },
    optimistic: (render: () => void, ms?: number) => {
      shown: (d: any, capabilityId: string) => any,
      set: (deviceId: string, capabilityId: string, value: unknown) => void,
      hope: (devices: any[], values: Record<string, unknown>) => void,
      confirm: (deviceId: string, capabilityId: string, value: unknown) => void,
      drop: (deviceId: string, capabilityIds: string | string[]) => void,
    },
    shake: (node: Element | null | undefined) => void,
    translator: (ns: string, defaults: Record<string, string>, opts: { t?: (key: string, tokens?: object) => string }) => (key: string, tokens?: object) => string,
    heightReporter: (root: Element, hooks: { onHeight?: (h: number) => void }) => () => void,
    svgIcon: (icon: { d: string, fill?: boolean }, cls: string) => SVGSVGElement,
    /** The mount's vibration for a tap that acts; `together`: once for what's sent at once. */
    wireHaptic: (Homey: any, opts?: { together?: boolean }) => () => void,
    /** "Activate with": Double's second tap and Long's hint and hold, by each tile's id. */
    pressGuard: (opts: { render: () => void, onHaptic?: () => void }) => {
      holdMs: number,
      asking: (id: unknown) => boolean,
      askedFrom: (id: unknown) => unknown,
      drop: (id: unknown) => void,
      ask: (id: unknown, from?: unknown) => boolean,
      hinting: (id: unknown) => boolean,
      hint: (id: unknown) => void,
      hold: (id: unknown, when: () => boolean, act: () => unknown) => any,
    },
    wireBar: (bar: HTMLElement, opts: { id: string, drags: Map<string, number>, guard: TouchGuard, render: () => void, commit: (id: string, x: number) => void }) => void,
    roomTiles: (devices: any[], opts: { byZone?: boolean, usable: (d: any) => boolean, extra: (d: any) => object }) => any[],
    TIGHT_UNITS: RegExp,
    KEY_PROBLEMS: string[],
    scaled: (cap: any, value: number) => number,
    formatNumber: (cap: any, value: number, averaged?: boolean) => string,
    formatValue: (cap: any, value: unknown, t?: (key: string) => string) => string,
    valueGlyph: (capabilityId: string, value?: unknown) => string,
    knownValue: (column: { capabilityId?: string, units?: string | null } | null | undefined) => { range: { min: number | null, max: number | null }, label: string | { key: string } } | null,
    okRange: (text: unknown, column?: { capabilityId?: string, units?: string | null } | null) => { min: number | null, max: number | null } | null,
    okLevel: (value: unknown, range: { min: number | null, max: number | null } | null) => 'none' | 'plain' | 'good' | 'out' | 'far',
    undoTextZoom: () => void,
    el: (tag: string, attrs?: object | null, parent?: Element | null, ns?: string) => any,
    setMask: (node: HTMLElement, url: string | null | undefined, name: string) => void,
    tileNames: (opts: any, render: () => void, failed: (key: string) => void) => any,
    timeFormatter: (locale?: string, timeFormat?: unknown, hour?: 'numeric' | '2-digit' | '2-digit-24') => Intl.DateTimeFormat,
    formatSince: (ms: number, now: number, language?: string, locale?: string, timeFormat?: unknown) => string,
    /** The app's time format (the settings page's), kept per screen: `auto`, `24` or `12`. */
    getTimeFormat: () => 'auto' | '24' | '12',
    setTimeFormat: (value: unknown) => boolean,
    wireTimeFormat: (Homey: any, changed?: () => void) => void,
    uses12Hours: (locale?: string, timeFormat?: unknown) => boolean,
    smoothValues: (vs: number[]) => number[],
    clockTime: (ms: number, opts?: { locale?: string, timeFormat?: unknown, pad?: boolean, seconds?: boolean }) => string,
    hourLabel: (hour: number, opts?: { locale?: string, timeFormat?: unknown, pad?: boolean }) => string,
    baseTitle: (title: unknown) => string,
    lowestSlot: (slots: any[], from: number, hours: number) => number,
    parseSpan: (span: unknown) => { count: number, unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year', whole: boolean, skip: boolean } | null,
    timeSpan: (span: string, at: number, back?: number) => { from: number, to: number, end: number, unit?: 'day' | 'week' | 'month' | 'year' },
    isTimeSpan: (span: unknown) => boolean,
    sixHourLog: (entry: { step?: number } | null | undefined) => boolean,
    spanSetting: (settings: Record<string, any>, n?: string | number, defaults?: { count: number, unit: string }) => string,
    wireFrame: (Homey: any, frame: HTMLElement) => {
      height: () => number,
      setHeight: () => void,
      ready: (opts?: { fonts?: boolean, waitFor?: (() => Promise<unknown>[]) | null, maxMs?: number, before?: (() => void) | null }) => Promise<void>,
      perfParam: (sep?: string) => string,
    },
    wireRefresh: (load: () => unknown, every?: number | null) => { failed: () => void },
    markOffline: (node: HTMLElement, offline: unknown, label?: string) => void,
    getDeviceIds: (Homey: any) => Promise<string[]>,
    slotId: (item: unknown) => string | null,
    wireTileNames: (Homey: any, setNames: (names: any) => void) => { state: (path: string) => Promise<any>, rename: (key: string, name: string) => Promise<any> },
    touchGuard: () => TouchGuard,
    onTap: (node: Element, fn: (e: Event) => void, opts?: {
      keys?: boolean, stop?: boolean, guard?: TouchGuard,
      hold?: { ms: number, when: () => boolean, act: () => void, start?: () => void, done?: () => void },
    }) => void,
    messageLine: (render: () => void, opts?: { clear?: (() => void) | null, ms?: number }) => {
      readonly text: string | null,
      set: (text: string | null, transient?: boolean) => void,
      reset: (opts?: { lastingOnly?: boolean }) => void,
    },
    wireDeviceState: (Homey: any, link: { ready: (opts?: object) => Promise<void>, perfParam: (sep?: string) => string }, widget: any, opts?: {
      event?: string | null,
      tileNames?: { state: (path: string) => Promise<any> } | null,
      query?: () => string,
      need?: (ids: string[]) => string | null,
      watches?: (id: string) => boolean,
      setState?: ((state: any) => void) | null,
      onState?: ((state: any) => void) | null,
      /** Ids picked another way (the Cameras widget's Camera slots): any at all replace the `devices` setting's. */
      picks?: string[],
      /** Ids shown as well, after those (Cameras' Always live). */
      more?: string[],
      /** The widget shows times: it follows the app's time format. */
      times?: boolean,
      /** No devices is a pick too: `/state` is asked with none, and only `need()` holds it back. */
      devicesOptional?: boolean,
    }) => { ids: () => string[], loaded: () => boolean },
    onDeviceNames: (Homey: any, load: () => void) => void,
    COLORS: string[],
    colorStyle: (value: unknown) => 'soft' | 'deep',
    applyColors: (root: HTMLElement, opts?: { style?: unknown, color?: unknown, fallback?: string | null }) => 'soft' | 'deep',
    /** Timers' beep and the popups' sounds, through one AudioContext per page. */
    applySurface: () => void,
    sound: { names: string[], unlock: () => void, play: (name: unknown) => boolean },
  };
  createVarPresetsWidget: (root: HTMLElement, opts?: object) => any;
  varPresetsFromSettings: (settings: Record<string, any>) => { value: boolean | number | string, type: string, label: string }[];
  createKeypadWidget: (root: HTMLElement, opts?: object) => any;
  keypadSettings: (settings: Record<string, any>) => { sourceId: string | null, codeId: string | null, keypad: string, buttons: any[] };
  keypadBooleanWords: Record<string, string[]>;
  createFlowsWidget:(root: HTMLElement, opts?: object) => any;
  createShortcutsWidget:(root: HTMLElement, opts?: object) => any;
  createPriceWidget: (root: HTMLElement, opts?: object) => any;
  electricityPriceLevel: (price: number | null, prices: (number | null)[]) => 'low' | 'medium' | 'high' | null;
  createTimersWidget: (root: HTMLElement, opts?: object) => any;
  formatTimerRemaining: (ms: number) => string;
  timerPresetsFromSettings: (settings: Record<string, any>) => { minutes: number, label: string }[];
  createLocksWidget: (root: HTMLElement, opts?: object) => any;
  lockLevel: (device: object) => 'secure' | 'insecure' | 'unknown' | 'missing';
  createCurtainsWidget: (root: HTMLElement, opts?: object) => any;
  curtainAction: (c: object, rule?: string) => 'open' | 'close' | 'stop' | null;
  createMediaWidget: (root: HTMLElement, opts?: object) => any;
  createClockWidget: (root: HTMLElement, opts?: object) => any;
  createTextLineWidget: (root: HTMLElement, opts?: object) => any;
  textLineBoardKey: (name: unknown) => string;
  createPopupsWidget: (root: HTMLElement, opts?: object) => any;
  popupsScreenKey: (name: unknown) => string;
  textLineTilt: (seed: unknown) => number;
  createDaysSinceWidget: (root: HTMLElement, opts?: object) => any;
  daysSinceCountersFromSettings: (settings: Record<string, any>) => { key: string, name: string, icon: string | null, amber: number | null, red: number | null }[];
  daysSinceKey: (name: unknown) => string | null;
  daysSinceText: (days: number, units?: string, language?: string | null, locale?: string, today?: string) => string;
  daysSinceCalendarDays: (from: number, to: number) => number;
  daysSinceLevel: (counter: { amber: number | null, red: number | null }, resetAt: number | null, now: number) => 'amber' | 'red' | null;
  daysSinceProgress: (counter: { amber: number | null, red: number | null }, resetAt: number | null, now: number) => { fill: number, left: number | null, over: number | null } | null;
  createSpacerWidget: (root: HTMLElement, opts?: { height?: unknown }) => { height: number };
  spacerHeight: (value: unknown) => number;
  createWebPageWidget: (root: HTMLElement, opts?: object) => any;
  webPageAddress: (raw: unknown, loc?: { lat: number, lon: number } | null) => { url?: string, error?: string };
  webPageBox: (width: number, pageWidth: number, pageHeight: number) => { width: number, height: number, scale: number, boxHeight: number };
  mediaSource: (caps: object) => 'tv' | 'lineIn' | null;
  mediaButtonsFromSettings: (settings: object) => { id: string, name: string, icon: string | null }[];
  sparkPath: (points: [number, number][], from: number, to: number, w: number, h: number) => { line: string, area: string, dot: { x: number, y: number }, min: number, max: number } | null;
  heatmapPeriodDays: (period: string | undefined) => number;
  thermostatPresetsFromSettings: (settings: Record<string, any>) => { values: object[] }[];
  mountCamerasWidget: MountWidget;
  mountCurtainsWidget: MountWidget;
  mountElectricityWidget: MountWidget;
  mountFlowsWidget: MountWidget;
  mountShortcutsWidget: MountWidget;
  mountHeatmapWidget: MountWidget;
  mountLightsWidget: MountWidget;
  mountLightRoomsWidget: MountWidget;
  mountLocksWidget: MountWidget;
  mountMediaWidget: MountWidget;
  mountClockWidget: MountWidget;
  mountTextLineWidget: MountWidget;
  mountPopupsWidget: MountWidget;
  mountSpacerWidget: MountWidget;
  mountWebPageWidget: MountWidget;
  mountDaysSinceWidget: MountWidget;
  mountPriceWidget: MountWidget;
  mountQuickActionsWidget: MountWidget;
  mountSensorAlarmsWidget: MountWidget;
  mountSensorDotsWidget: MountWidget;
  mountRoomHealthWidget: MountWidget;
  mountValueMatrixWidget: MountWidget;
  mountValueBoardWidget: MountWidget;
  mountSparklinesWidget: MountWidget;
  mountChartsWidget: MountWidget;
  mountTotalsWidget: MountWidget;
  mountScatterWidget: MountWidget;
  mountCompareWidget: MountWidget;
  mountTimelineWidget: MountWidget;
  mountStackedWidget: MountWidget;
  mountLinesWidget: MountWidget;
  createGaugeWidget: ((root: HTMLElement, opts?: object) => any) & { zoneOf: (v: number, levels: object) => string | null };
  mountGaugeWidget: MountWidget;
  mountDailyRangeWidget: MountWidget;
  mountTypicalDayWidget: MountWidget;
  mountThermostatWidget: MountWidget;
  mountTimersWidget: MountWidget;
  mountValuesWidget: MountWidget;
  mountCombinedWidget: MountWidget;
  mountFlowTilesWidget: MountWidget;
  mountVariablesWidget: MountWidget;
  mountVarPresetsWidget: MountWidget;
  mountKeypadWidget: MountWidget;
  mountWeatherWidget: MountWidget;
  mountPollenWidget: MountWidget;
  mountStackWidget: MountWidget;
  createStackWidget: (root: HTMLElement, opts?: object) => any;
  createStackAttentionWatcher: (pages: any[], io: object) => { refresh: () => Promise<unknown>, attention: (id: string) => boolean };
  stackAttention: (page: { type: string, settings?: object }, state: object) => boolean;
  STACK_TYPES: Record<string, string>;
}
