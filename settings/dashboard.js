/*
 * The web dashboards page (`settings/dashboard.html`): our widgets in any browser on the home network, laid out
 * on the page itself. Served by the Homey at `/app/<appId>/settings/dashboard.html`, with no login; everything it
 * reads or changes goes through the app's API with the personal API key the user pastes (kept in this browser).
 * When the app settings set a password, the browser also signs in with it, and every request carries the session
 * token that gives (`?session=`).
 *
 * Each widget runs in an iframe of its own, unchanged `index.html` (`../widgets/<id>/index.html`, into which the
 * Homey puts its widget SDK, as on a Homey dashboard). The SDK talks to its parent frame with Homey's crossframe
 * messages (`CF2_MESSAGE` + UTF-16 hex JSON, `{type: 'tx', event, data, callbackId}`, answered by
 * `{type: 'cb', args: [err, result], callbackId}`), so this page answers them as Homey's dashboard does:
 * `getInitialData` (the widget's settings, devices, strings, dark mode), `api` (through the app's `/web/call`, to
 * the widget's own API), `registerRealtimeListener` (our app's realtime events, from Homey's realtime socket),
 * `ready`/`setHeight` (the frame's height), `popup` and `shortPressHapticFeedback`.
 *
 * Other apps' widgets (`homey:app:<appId>:<widgetId>`) run the same way from `/app/<appId>/widgets/<id>/`, but talk to
 * Homey directly with this page's key: Homey's list of them, their own API, autocompletes, strings and realtime.
 * Their frames are sandboxed (an opaque origin: they can't read this page's `localStorage`, where the key is) unless
 * the user trusts one.
 */
(function () {
  'use strict';

  /**
   * The page's parts, each in `settings/dashboard-<name>.js` (loaded after this file), in the order
   * mountWebDashboards() runs them. A part registers itself with `WidgetkeeperWeb.part(name, fn)`; `fn(wd)` is
   * the code that was once in mountWebDashboards() itself, sharing the page's state and functions through `wd`.
   */
  const PARTS = ['realtime', 'frames', 'views', 'front', 'editing', 'settings', 'pickers', 'popups'];
  window.WidgetkeeperWeb = {
    /** @type {Map<string, (wd: any) => void>} */
    parts: new Map(),
    part(name, fn) { this.parts.set(name, fn); },
  };

  /** English, also the fallback while the app's strings haven't loaded (they're `web.*` in locales/<lang>.json). */
  const DEFAULT_STRINGS = {
    title: 'Web Dashboards',
    keyText: 'Enter this screen\'s sign-in code. Make one in the Widgetkeeper app settings under Web dashboards → Screens and browsers.',
    keyModeText: 'Paste a personal API key from the Homey web app (Settings → API Keys) with the Devices permission. It stays in this browser.',
    keyPlain: 'This address isn\'t encrypted: anything watching your home network could read the key. The Remote access address is encrypted.',
    keyPlaceholder: 'API key',
    keyUse: 'Use an API key instead',
    codeUse: 'Use a sign-in code instead',
    signInCode: 'Sign-in code',
    keyRejected: 'Homey didn\'t accept this key.',
    screenCodeWrong: 'That sign-in code doesn\'t work. It may have been removed or replaced in the Widgetkeeper app settings.',
    screenCodeLocked: 'Too many wrong codes. Try again in __seconds__ s.',
    forgetKey: 'Sign out',
    signedIn: 'Signed in',
    loadFailed: 'Could not reach Widgetkeeper on your Homey.',
    retry: 'Try again',
    off: 'Web dashboards are turned off. Turn them on in the Widgetkeeper app settings in the Homey app.',
    offAway: 'Remote access is turned off. Turn it on in the Widgetkeeper app settings in the Homey app, or open this page on your home network.',
    newDashboard: 'New dashboard',
    untitled: 'Dashboard',
    widgetCount: '__count__ widgets',
    dashboards: 'Dashboards',
    missing: 'This dashboard no longer exists.',
    edit: 'Edit',
    done: 'Done',
    fullScreen: 'Full screen',
    noLive: 'No live updates',
    name: 'Name',
    columns: 'Columns',
    theme: 'Theme',
    themeAuto: 'Automatic',
    themeDark: 'Dark',
    themeLight: 'Light',
    columnWidth: 'Column width',
    columnNarrow: 'Narrow',
    columnNormal: 'Normal',
    columnWide: 'Wide',
    columnFit: 'Fit to window',
    code: 'Code',
    codeTitle: 'A Keypad code for editing this dashboard and going back to the dashboards',
    codeNone: 'No code',
    codeAny: 'Any code',
    enterCode: 'Enter the code',
    codeOk: 'OK',
    codeDelete: 'Delete',
    wrongCode: 'Wrong code',
    triesLeft: 'Wrong code. Tries left: __n__',
    codeLocked: 'Too many tries. Try again in __s__ s.',
    darkLight: 'Dark or light',
    darkLightText: "Automatic follows each dashboard's theme.",
    background: 'Background',
    bgDefault: 'Default',
    bgBlack: 'Black/White',
    bgSlate: 'Slate',
    bgOcean: 'Ocean',
    bgForest: 'Forest',
    bgPlum: 'Plum',
    bgBerry: 'Berry',
    bgSand: 'Sand',
    arrangeHint: 'Drag the dashboards to change their order or section.',
    addSection: 'Add section',
    newSection: 'New section',
    sectionName: 'Section name',
    deleteSection: 'Delete section',
    sectionEmpty: 'Drag dashboards here',
    showWidgets: 'Show on the front page',
    duplicate: 'Duplicate',
    copyName: '__name__ (copy)',
    tooManyDashboards: 'At most __max__ dashboards.',
    pageSettings: 'Settings',
    thisBrowser: 'This browser',
    forgetKeyText: 'Signs this browser out: it asks for a sign-in code again.',
    keepAwake: 'Keep screen on',
    keepAwakeLock: 'The screen stays on while this page is open.',
    keepAwakeVideo: 'Uses a silent video to keep the screen on. If it still sleeps, turn off sleep in the device\'s settings.',
    dim: 'Dim',
    dimOff: 'Off',
    dimText: 'Darkens the whole page, as if the screen were turned down.',
    backupTitle: 'Backup',
    backupText: 'The dashboards you choose in one file: their layouts, widgets, settings and the names typed on tiles. A restore brings back the ones you tick and leaves the others.',
    backupDownload: 'Download backup',
    backupRestore: 'Restore backup',
    backupSummary: '__dashboards__ dashboards, __widgets__ widgets, saved __date__.',
    backupConfirm: 'Tap again to restore',
    backupRestored: 'Restored: __dashboards__ dashboards, __widgets__ widgets.',
    backupInvalid: 'This file is not a Widgetkeeper web dashboards backup.',
    backupDownloadCount: 'Download __count__',
    backupRestoreCount: 'Restore __count__',
    backupReplaces: 'Replaces yours',
    backupNew: 'New',
    backupTooMany: 'At most 64 dashboards: untick __count__ new ones',
    deleteDashboard: 'Delete dashboard',
    tapAgain: 'Tap again to confirm',
    addWidget: 'Add widget',
    chooseWidget: 'Choose a widget',
    settings: 'Settings',
    moveUp: 'Move up',
    moveDown: 'Move down',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    drag: 'Drag to move',
    remove: 'Remove',
    widgetTitle: 'Title',
    widgetTitleHint: 'Shown above the widget. Leave it empty for none.',
    preview: 'Preview',
    width: 'Width',
    widthHint: 'How many columns it spans.',
    resize: 'Drag to change the width',
    devices: 'Devices',
    device: 'Device',
    search: 'Search',
    noDevices: 'No matching devices.',
    choose: 'Choose…',
    clear: 'Clear',
    nothingFound: 'Nothing found.',
    save: 'Save',
    cancel: 'Cancel',
    saveFailed: 'Could not save the dashboard.',
    passwordText: 'Enter the web dashboards password from the Widgetkeeper app settings.',
    passwordPlaceholder: 'Password',
    signIn: 'Sign in',
    passwordWrong: 'Wrong password.',
    passwordLocked: 'Too many tries. Try again in __seconds__ s.',
    sessionEnded: 'You were signed out. The password may have changed.',
    yourDashboards: 'Your dashboards',
    widgetsTitle: 'Widgets',
    widgetsText: 'Everything you can put on a dashboard.',
    previous: 'Previous',
    next: 'Next',
    chooseDevices: 'Choose devices',
    chooseDevice: 'Choose a device',
    changeDevices: 'Change devices',
    changeDevice: 'Change device',
    noneChosen: 'None chosen yet.',
    missingDevice: 'Device not found',
    allRooms: 'All rooms',
    chosen: 'Chosen',
    noRoom: 'No room',
    selectAll: 'Select all',
    clearAll: 'Clear all',
    chosenCount: '__count__ chosen',
    dragToOrder: 'Drag to change the order.',
    chooseValue: 'Choose a value',
    changeValue: 'Change the value',
    allDevices: 'All devices',
    noValues: 'No matching values.',
    valueOn: 'On',
    valueOff: 'Off',
    missingValue: 'Value not found',
    otherApps: 'Other apps',
    otherAppsKey: 'Other apps\' widgets need an API key with full access (Homey) in this browser.',
    otherAppsFailed: 'Could not read other apps\' widgets.',
    notInstalled: '__name__ isn\'t installed.',
    trustTitle: 'Trust this widget',
    trustHint: 'Runs it outside the sandbox, for a widget that doesn\'t work in it. A trusted widget can read this browser\'s API key.',
    scaleTitle: 'Size as on Homey',
    scaleHint: 'Lays it out at a phone\'s width and scales it to fill the column, so it wraps and sizes as on Homey\'s dashboard.',
    popupElsewhere: 'Answered on another screen: __button__',
    popupClose: 'Close',
    popupPictureFailed: 'The picture could not be loaded',
    popupAnswerFailed: 'The answer didn\'t reach Homey',
    about: {
      electricity: 'Live power, the day\'s prices and your usage in charts.',
      thermostat: 'Three preset buttons for a thermostat or an aircon.',
      quickactions: 'Small tiles that switch a device with one tap.',
      sensoralarms: 'Tiles that turn red when a sensor raises an alarm.',
      sensordots: 'Motion, doors and cameras as a grid of dots.',
      roomhealth: "Each room's temperature, humidity and air at a glance, yellow to red when one is off.",
      valuematrix: 'Devices or rooms against chosen values, green, orange or red by their range.',
      weather: 'The next 36 hours, hour by hour.',
      pollen: "Today's pollen and the UV peak, for Europe.",
      heatmap: 'A week of any value as a weekday × hour heatmap.',
      cameras: 'Camera snapshots, with live video on a tap.',
      values: 'Any device value as a compact tile.',
      lights: 'Light tiles with brightness and colour at hand.',
      lightrooms: "Every room's lights on a card: switch a room, or open it for its lights and Moods.",
      sparklines: 'Values with a small chart of their recent history.',
      charts: 'How did it go? One value over any span, or against the period before or a second value.',
      totals: 'How much a value went up per hour, day or month: kWh, rain, hours of TV.',
      scatter: "One value against another, a dot per hour: does the heat pump work harder when it's colder?",
      typicalday: "Today's line over the usual day and its spread: is today unusual?",
      dailyrange: "Each day's lowest to highest as a bar: how much did it swing?",
      compare: "One value across devices, now and its range today, sorted: which room is warmest?",
      timeline: 'When was it on, open or moving? A row per value over the day.',
      stacked: 'Several values stacked on one time axis, the rest of a total as Other: who uses the power?',
      lines: 'Up to six values over time on one chart, a line each: every room\'s temperature side by side.',
      variables: 'Variables as rows you can switch or change.',
      varpresets: 'Buttons that set a variable to preset values.',
      keypad: 'Buttons behind an optional code that start Flows or set a state.',
      flows:'Start flows with a tap, in your colours and icons.',
      price: 'The electricity price now and in the coming hours.',
      timers: 'Kitchen timers that keep running on your Homey.',
      locks: 'Every lock and door at a glance.',
      curtains: 'Open, close or set curtains and blinds.',
      media: 'A speaker\'s music, volume and sources in one card.',
      clock: 'The time and date, with the weather now if you like.',
      textline: 'A note on a tile or a Post-it, typed in or written by your Flows.',
      spacer: 'Empty space to line up widgets in columns.',
      dayssince: "Days since a chore was done, turning red when it's due.",
      stack: 'Widgets from another dashboard, taking turns.',
      shortcuts: 'Jump to your other web dashboards, in your colours and icons.',
      webpage: 'Any web page, scaled to fill the widget.',
      popups: 'Shows the popups that Flows send to its screen name here too.',
    },
  };

  const KEY_STORAGE = 'widgetkeeper.web.key';
  /** The session token from signing in with the web dashboards password (when one is set), on top of the key. */
  const SESSION_STORAGE = 'widgetkeeper.web.session';
  /** This browser's own dark or light (Settings, This browser), over the dashboard's theme; none follows the dashboard. */
  const THEME_STORAGE = 'widgetkeeper.web.theme';
  /** Keep screen on (`'1'`), this browser's choice in Settings; absent lets the screen sleep. */
  const AWAKE_STORAGE = 'widgetkeeper.web.awake';
  /** Dim, this browser's choice in Settings: a percentage (5 … `MAX_DIM`); absent is off. */
  const DIM_STORAGE = 'widgetkeeper.web.dim';
  /** A dashboard with a code this browser stays on (its id): going back to the dashboards takes its code first. */
  const STAY_STORAGE = 'widgetkeeper.web.stay';
  /** The most the page dims: never black, so the bar's pen and Settings stay findable. */
  const MAX_DIM = 80;
  const CONFIRM_MS = 3000;
  /** A press on a widget's bar that moves this far is a drag. */
  const DRAG_SLOP = 6;
  /** Near the window's top or bottom edge, a drag scrolls the page. */
  const EDGE_PX = 64;
  /** Wide widgets' columns (settings/dashboard-layout.js, loaded first). */
  const LAYOUT = window.WidgetkeeperLayout;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  /** An element with a class and text. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, text, onClick, label) {
    const b = el('button', className, text);
    b.type = 'button';
    if (label) { b.title = label; b.setAttribute('aria-label', label); }
    b.addEventListener('click', onClick);
    return b;
  }

  /**
   * A button that needs a second tap within 3 s (no browser dialog, which would block a wall tablet). `text` may be an
   * icon (an element): it stays, and only the button's class and label say it's armed.
   */
  function confirmButton(className, text, onConfirm, confirmText, label) {
    let armed = 0;
    const iconOnly = typeof text !== 'string';
    const say = (words) => {
      if (!iconOnly) { b.textContent = words; return; }
      b.title = words;
      b.setAttribute('aria-label', words);
    };
    const b = button(className, iconOnly ? '' : text, () => {
      if (Date.now() - armed < CONFIRM_MS) { onConfirm(); return; }
      armed = Date.now();
      b.classList.add('armed');
      say(confirmText);
      setTimeout(() => {
        if (!b.isConnected) return;
        b.classList.remove('armed');
        say(iconOnly ? label : text);
      }, CONFIRM_MS);
    }, label);
    if (iconOnly) b.append(text);
    return b;
  }

  /** The bar's icons: 24 px paths, stroked in the text colour. */
  const ICONS = {
    pen: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4',
    lock: 'M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11zM8 11V7a4 4 0 0 1 8 0v4',
    backspace: 'M9 6h10.5A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-6-6 6-6zM12 9.5l5 5M17 9.5l-5 5',
    fullScreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    fullScreenExit: 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5',
    plus: 'M12 5v14M5 12h14',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    close: 'M6 6l12 12M18 6L6 18',
    down: 'M6 9l6 6 6-6',
    up: 'M6 15l6-6 6 6',
    columns: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9.5 4v16M14.5 4v16',
    width: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    minus: 'M5 12h14',
    // The Theme pill's: Automatic (a half-filled circle: `fill`), Dark, Light.
    contrast: { d: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', fill: 'M12 4a8 8 0 0 1 0 16z' },
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
    sliders: 'M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
    copy: 'M10 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  };

  /**
   * A dashboard's backdrops (`background`; the ids are `WEB_BACKGROUNDS` in lib/WebDashboardService.ts): calm tints,
   * each [light, dark], so the dashboard's theme still decides and transparent widgets' text stays readable. Default
   * is the page's own `--wd-bg` (dashboard.css).
   */
  const BACKGROUNDS = {
    default: ['#F4F4FA', '#111217'],
    black: ['#FFFFFF', '#000000'],
    slate: ['#E6EBF2', '#141A24'],
    ocean: ['#E1ECF9', '#0B1A2E'],
    forest: ['#E4F0E6', '#0F1C14'],
    plum: ['#EEE6F5', '#1C1226'],
    berry: ['#F6E6EA', '#24121A'],
    sand: ['#F3EEE4', '#1F1A13'],
  };

  /** A widget's width on Homey's dashboard on a phone, which other apps' widgets are designed at (wk-089). */
  const HOMEY_WIDTH = 358;

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const def = ICONS[name];
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', typeof def === 'string' ? def : def.d);
    svg.append(path);
    if (typeof def !== 'string' && def.fill) {
      const solid = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      solid.setAttribute('d', def.fill);
      solid.setAttribute('fill', 'currentColor');
      solid.setAttribute('stroke', 'none');
      svg.append(solid);
    }
    return svg;
  }

  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

  /** The app id from this page's path (`/app/<appId>/settings/dashboard.html`). */
  const APP_ID = (location.pathname.match(/\/app\/([^/]+)\//) || [])[1] || 'com.thomassidor.widgetkeeper';
  /** Opened away from home, through Homey's cloud relay: the app only answers then with Remote access on. */
  const AWAY = /\.connect\.athom\.com$/i.test(location.hostname);

  /**
   * Another app's widget type (`homey:app:<appId>:<widgetId>`, its id on Homey's dashboards), split; null for ours. As
   * the server's `FOREIGN`: no app id starting with a dot, as `.` or `..` would make `widgetFolder()` leave `/app/`.
   */
  function appWidget(type) {
    const m = /^homey:app:([A-Za-z0-9][A-Za-z0-9._-]{0,99}):([A-Za-z0-9_-]{1,60})$/.exec(String(type));
    return m && m[1] !== APP_ID ? { appId: m[1], widgetId: m[2] } : null;
  }

  /** A text from another app's manifest: a string, or one per language. */
  function appText(text, language) {
    if (typeof text === 'string') return text;
    if (text && typeof text === 'object') return text[language] || text.en || '';
    return '';
  }

  /** `settings[device][id]=…`: settings as bracketed query keys, as Homey's autocomplete route reads them. */
  function bracketQuery(params, value, prefix) {
    for (const k of Object.keys(value || {})) {
      const v = value[k];
      const name = prefix ? `${prefix}[${k}]` : k;
      if (v == null) continue;
      if (typeof v === 'object') bracketQuery(params, v, name);
      else params.append(name, String(v));
    }
    return params;
  }

  /**
   * A 2-second black 16 × 16 H.264 video, played muted on a loop where the browser has no Wake Lock (it only has one
   * over HTTPS; the home address is http://). Made with ffmpeg 9: `-f lavfi -i color=black:s=16x16:r=1 -t 2 -c:v libx264
   * -profile:v baseline -pix_fmt yuv420p -an -movflags +faststart -map_metadata -1 -fflags +bitexact -flags:v +bitexact`.
   */
  const KEEP_AWAKE_VIDEO = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMGbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHNbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAThzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABDExhdmMgbGlieDI2NAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMACDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAApAAAAAAAAAABhzdHRzAAAAAAAAAAEAAAACAABAAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAAChgAAAAoAAAAUc3RjbwAAAAAAAAABAAADNgAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAAAphtZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMyAwNDgwY2IwIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAA5liIQFv///D0UAAU9/gAAAAAZBmjgK+oA=';

  /**
   * Keep screen on (this browser's choice in Settings): the Screen Wake Lock where the browser has it (HTTPS: away from
   * home through Homey's cloud), else a silent video playing on a loop, the NoSleep.js idea, which iOS and some others
   * keep the screen on for. The lock goes while the page is hidden, or when the system takes it, so it's asked for
   * again; a refused lock (a battery saver, a policy) falls back to the video. A video the browser won't start without
   * a tap (iOS in Low Power Mode) starts on the next tap or key, in the page or in a widget's frame (`watch()`).
   */
  const keepAwake = (() => {
    const nav = /** @type {any} */ (navigator);
    /** 'lock' or 'video', how it's kept on here. */
    let how = nav.wakeLock && typeof nav.wakeLock.request === 'function' ? 'lock' : 'video';
    let on = false;
    let lock = null;
    let asking = false;
    let video = null;
    /** A refused `play()` waits for a tap. */
    let waiting = false;

    async function holdLock() {
      if (!on || lock || asking || document.visibilityState !== 'visible') return;
      asking = true;
      try {
        const sentinel = await nav.wakeLock.request('screen');
        // Released by the system while the page shows (hidden is `visibilitychange`'s): asked for again.
        sentinel.addEventListener('release', () => { if (lock === sentinel) { lock = null; holdLock(); } });
        lock = sentinel;
        if (!on) release();
      } catch (e) {
        how = 'video';
        if (on) playVideo();
      }
      asking = false;
    }

    function release() {
      if (lock) { const held = lock; lock = null; held.release().catch(() => {}); }
      if (video) { video.pause(); video.remove(); video = null; }
    }

    function retry() {
      if (!waiting) return;
      waiting = false;
      if (on) playVideo();
    }

    /**
     * Retries a refused video on a tap or key in `win`: the page, or a widget's frame (same origin), where most taps
     * land and never reach the page. The events a browser counts as a user's.
     */
    function watch(win) {
      for (const type of ['pointerup', 'touchend', 'keydown']) win.addEventListener(type, retry, true);
    }
    watch(window);

    function playVideo() {
      if (!video) {
        video = document.createElement('video');
        video.className = 'wd-awake';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('aria-hidden', 'true');
        video.src = KEEP_AWAKE_VIDEO;
        document.body.append(video);
      }
      const played = video.play();
      if (played && played.catch) played.catch(() => { waiting = true; });
    }

    document.addEventListener('visibilitychange', () => {
      if (!on || document.visibilityState !== 'visible') return;
      if (how === 'lock') holdLock(); else if (video && video.paused) playVideo();
    });

    return {
      /** How it's kept on here: 'lock' or 'video' (after a refused lock too). */
      get how() { return how; },
      get on() { return on; },
      /** Turns it on or off; the promise settles once a lock is held or refused. */
      async set(value) {
        on = !!value;
        if (!on) { release(); return; }
        if (how === 'lock') await holdLock(); else playVideo();
      },
      watch,
      retry,
    };
  })();

  /** This browser's Dim (0 is off), in steps of 5. */
  function dimLevel() {
    const v = Math.round(Number(storageGet(DIM_STORAGE)) / 5) * 5;
    return Number.isFinite(v) ? Math.min(MAX_DIM, Math.max(0, v)) : 0;
  }

  /**
   * Dims the page as if the screen were turned down: a black layer over everything, the widgets' frames included, that
   * lets taps through. Outside the page's root, so a redraw keeps it; the dialogs are in the top layer, above it.
   */
  let dimLayer = null;
  function applyDim(level) {
    if (!dimLayer) {
      if (!level) return;
      dimLayer = document.createElement('div');
      dimLayer.className = 'wd-dim';
      dimLayer.setAttribute('aria-hidden', 'true');
      document.body.append(dimLayer);
    }
    dimLayer.hidden = !level;
    dimLayer.style.opacity = String(level / 100);
  }

  /**
   * `opts.mountWidget(widget, wrap)`, when given, draws a widget into `wrap` in place of its iframe (the dev renders,
   * `dev/web-showcase.html`, mount the widgets with made-up data; `dashboard.html` never passes it).
   */
  window.mountWebDashboards = function (root, opts = {}) {
    /** What the page's parts share: the state that changes (`wd.current` …) and the functions they call. */
    /** @type {any} */
    const wd = {};
    wd.key = storageGet(KEY_STORAGE);
    wd.session = storageGet(SESSION_STORAGE);
    wd.setup = null; // `/web/setup`: {appId, homeyId, language, strings, widgets, dashboards, front, maxDashboards, maxSections, popups}
    // The most dashboards and front page sections the app keeps (`/web/setup`'s, from lib/WebDashboardService.ts).
    wd.maxDashboards = 64;
    wd.maxSections = 20;
    wd.types = new Map(); // widget id → its type (name, settings, devices …)
    wd.foreign = new Map(); // another app's widget (`homey:app:<appId>:<id>`) → its type, from Homey's list
    wd.foreignState = null; // that list: 'ok', 'noScope' (this key may not read it) or 'failed'
    const appLocales = new Map(); // app id → Promise of its strings
    const typeOf = (type) => wd.types.get(type) || wd.foreign.get(type);
    wd.dashboards = [];
    wd.frontPage = { widgets: true, sections: [] }; // the front page's choices (`/web/setup`'s `front`), made in its edit mode
    wd.current = null; // {dashboard, editing, grid, widgets: Map<widget id, {el, sig}>, covers: Map<`<id>@<column>`, el>}
    const unlocked = new Set(); // dashboards whose code was typed for their editor, until it's left
    wd.live = false;
    wd.socketStarted = false;
    const frames = new Set(); // {widget, iframe, subs: Map<callbackId, event>}
    const listeners = new Map(); // realtime event → Set<fn>
    const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function t(name, tokens) {
      const strings = wd.setup && wd.setup.strings && wd.setup.strings.web;
      let s = (strings && typeof strings[name] === 'string' && strings[name]) || DEFAULT_STRINGS[name] || name;
      for (const k in tokens || {}) s = s.split(`__${k}__`).join(String(tokens[k]));
      return s;
    }

    // ---- The app's API, with the key ------------------------------------------------------------------------

    async function request(method, path, body) {
      const params = [];
      if (wd.session) params.push(`session=${encodeURIComponent(wd.session)}`);
      if (AWAY) params.push('away=1');
      const url = params.length ? `${path}${path.includes('?') ? '&' : '?'}${params.join('&')}` : path;
      return fetchJson(method, `/api/app/${APP_ID}${url}`, body, true);
    }

    /**
     * Homey's own API (`/api<path>`) with the key: other apps' widget lists, routes, autocompletes and strings. A 403
     * there is a permission this key lacks (`scope`), not a rejected key.
     */
    function homeyRequest(method, path, body) {
      return fetchJson(method, `/api${path}`, body, false);
    }

    async function fetchJson(method, url, body, ours) {
      const headers = { Authorization: `Bearer ${wd.key}` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (res.status === 401 || (ours && res.status === 403)) {
        throw Object.assign(new Error((data && data.error) || `HTTP ${res.status}`), { unauthorized: true });
      }
      if (res.status === 403) throw Object.assign(new Error((data && data.error) || `HTTP ${res.status}`), { scope: true });
      if (!res.ok) {
        const err = new Error((data && (data.error || data.message)) || (typeof data === 'string' && data) || `HTTP ${res.status}`);
        // Signed out of the password (it changed, or was set meanwhile): ask for it again.
        if (/password required/.test(err.message)) { passwordLost(); throw Object.assign(err, { handled: true }); }
        throw err;
      }
      return data;
    }

    /** The password's session no longer counts: the socket stops, and the page asks for the password. */
    function passwordLost() {
      if (wd.setup && wd.setup.passwordRequired) return; // already asking (several frames' requests fail at once)
      const had = !!wd.session;
      wd.session = null;
      storageSet(SESSION_STORAGE, null);
      wd.stopSocket();
      wd.setLive(false);
      wd.setup = wd.setup && Object.assign({}, wd.setup, { passwordRequired: true });
      wd.renderPassword(had ? t('sessionEnded') : '');
    }

    async function loadSetup() {
      wd.setup = await request('GET', '/web/setup');
      wd.types = new Map((wd.setup.widgets || []).map(w => [w.type, w]));
      wd.dashboards = wd.setup.dashboards || [];
      wd.frontPage = { widgets: true, sections: [], ...wd.setup.front };
      if (wd.setup.maxDashboards > 0) wd.maxDashboards = wd.setup.maxDashboards;
      if (wd.setup.maxSections > 0) wd.maxSections = wd.setup.maxSections;
      if (wd.setup.language) document.documentElement.lang = wd.setup.language;
      if (wd.setup.disabled || wd.setup.passwordRequired) return; // turned off, or the password first: `route()` says so
      wd.setPopups(wd.setup.popups && wd.setup.popups.popups, wd.setup.popups && wd.setup.popups.now);
      if (!wd.socketStarted) {
        wd.socketStarted = true;
        wd.connectSocket();
      }
    }

    /**
     * Other apps' widgets, from Homey's list of every app's (`getAppWidgets()`, which needs `homey.dashboard.readonly`:
     * only a key with full access). Without it the dashboards still show them; only adding and editing them can't.
     */
    async function loadAll() {
      // Asked at once, read once the setup (with Homey's language) is in.
      const list = homeyRequest('GET', '/manager/dashboards/appwidget').then(all => ({ all, err: null }), err => ({ all: null, err }));
      await loadSetup();
      const { all, err } = await list;
      wd.foreign = new Map();
      if (err) {
        if (err.unauthorized) throw err;
        wd.foreignState = err.scope ? 'noScope' : 'failed';
        return;
      }
      const language = (wd.setup && wd.setup.language) || 'en';
      for (const w of Object.values(all || {})) {
        const at = w && appWidget(w.id);
        if (at) wd.foreign.set(w.id, foreignType(w, at, language));
      }
      wd.foreignState = 'ok';
    }

    /** Another app's widget as the editor offers it, like ours from `/web/setup` (`widgetTypes()`). */
    function foreignType(w, at, language) {
      const settings = (Array.isArray(w.settings) ? w.settings : []).filter(s => s && typeof s.id === 'string' && s.id).map((s) => {
        const title = appText(s.title, language) || s.id;
        const units = appText(s.units, language);
        return {
          id: s.id,
          type: s.type,
          title,
          // A number's unit goes after its field, from the label's `(…)` (`splitUnit()`).
          label: s.type === 'number' && units ? `${title} (${units})` : title,
          hint: appText(s.hint, language) || null,
          value: s.value === undefined ? null : s.value,
          min: typeof s.min === 'number' ? s.min : undefined,
          max: typeof s.max === 'number' ? s.max : undefined,
          values: Array.isArray(s.values) ? s.values.map(v => ({ id: String(v.id), title: appText(v.title, language) || String(v.id) })) : undefined,
        };
      });
      const filter = (w.devices && w.devices.filter) || {};
      const anyOf = (v) => (Array.isArray(v) ? v.join('|') : v == null ? '' : String(v));
      return {
        type: w.id,
        app: at,
        name: appText(w.name, language) || at.widgetId,
        ownerName: appText(w.ownerName, language) || at.appId,
        // A number, or a percentage of the width (`'100%'` is square: WidgetBoard's clocks, Network Visualizer).
        height: typeof w.height === 'number' || (typeof w.height === 'string' && /^\d+(\.\d+)?%$/.test(w.height)) ? w.height : null,
        transparent: w.transparent === true,
        devices: w.devices ? { singular: w.devices.singular === true, app: w.devices.type === 'app', class: anyOf(filter.class), capabilities: anyOf(filter.capabilities) } : null,
        settings,
        // Other apps' titles don't follow ours (CLAUDE.md, *Widget settings*): one card of them.
        sections: settings.length ? [{ kind: 'plain', ids: settings.map(s => s.id) }] : [],
        deprecated: w.deprecated === true,
      };
    }

    /** Another app's strings in Homey's language, as Homey gives its widget frames (`Homey.__`); `{}` when they can't be read. */
    function stringsOf(appId) {
      let p = appLocales.get(appId);
      if (!p) {
        p = homeyRequest('GET', `/manager/apps/app/${encodeURIComponent(appId)}/locale`).then(s => (s && typeof s === 'object' ? s : {}), () => {
          appLocales.delete(appId); // tried again by the next frame
          return {};
        });
        appLocales.set(appId, p);
      }
      return p;
    }


    wd.saving = Promise.resolve();
    const deleted = new Set(); // dashboards being deleted, or deleted: never saved again
    /**
     * Saves the dashboard as it is now (one save at a time, in order). When nothing changed meanwhile, the editor
     * takes the app's copy, so a value it corrected (a clamped number, a new widget id) shows and is sent on.
     */
    function persist() {
      const snapshot = wd.stored(wd.current.dashboard);
      wd.saving = wd.saving.then(async () => {
        if (deleted.has(snapshot.id)) return;
        try {
          const saved = await request('PUT', '/web/dashboards', snapshot);
          if (deleted.has(saved.id)) return;
          const i = wd.dashboards.findIndex(d => d.id === saved.id);
          if (i >= 0) wd.dashboards[i] = saved; else wd.dashboards.push(saved);
          if (wd.current && wd.current.dashboard.id === saved.id
            && JSON.stringify(wd.stored(wd.current.dashboard)) === JSON.stringify(snapshot)
            && JSON.stringify(saved) !== JSON.stringify(snapshot)) {
            wd.current.dashboard = wd.editable(saved);
            wd.syncGrid();
          }
        } catch (err) {
          failed(err, t('saveFailed'));
        }
      });
      return wd.saving;
    }

    /**
     * A screen's code (Web dashboards, Screens, in the app settings), from the address or typed on the key screen: the
     * app swaps it for the screen's key, and its password session while the password it was added with is set. The
     * route is public, as the screen has no key yet. Answers null once the key is in, else why not. A code that doesn't
     * work (removed) forgets what this browser stored, as that came from it.
     */
    async function useCode(code) {
      let res;
      try {
        const r = await fetch(`/api/app/${APP_ID}/web/screen-code${AWAY ? '?away=1' : ''}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
        });
        res = await r.json().catch(() => null);
        if (!r.ok) return /turned off/.test(String(res && (res.error || res.message))) ? t(AWAY ? 'offAway' : 'off') : t('loadFailed');
      } catch (err) {
        return t('loadFailed');
      }
      if (res && res.ok && typeof res.key === 'string') {
        wd.key = res.key;
        storageSet(KEY_STORAGE, wd.key);
        if (res.session) { wd.session = res.session; storageSet(SESSION_STORAGE, wd.session); }
        return null;
      }
      if (res && res.reason === 'locked') return t('screenCodeLocked', { seconds: res.retryAfter || 30 });
      forgetKey();
      wd.session = null;
      storageSet(SESSION_STORAGE, null);
      return t('screenCodeWrong');
    }

    /** Whether typed text is a screen's code (8 letters and digits, a dash between the fours), not an API key. */
    const isScreenCode = (text) => /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(text.replace(/\s/g, ''));

    /**
     * A screen's code in the address, `#code=ABCD-EFGH` (or after a route: `#/d/<id>?code=…`), taken out of it, so it
     * isn't left in the address bar or a bookmark. The cast or bookmarked address keeps it, so every load uses it.
     */
    function takeCode() {
      const m = location.hash.match(/^#(\/[^?]*)?\??code=([A-Za-z0-9-]{1,20})$/);
      if (!m) return null;
      history.replaceState(null, '', `${location.pathname}${location.search}${m[1] ? `#${m[1]}` : ''}`);
      return m[2];
    }

    /** A key Homey no longer accepts: not kept, and the socket that used it stops. */
    function forgetKey() {
      wd.key = null;
      storageSet(KEY_STORAGE, null);
      wd.stopSocket();
      wd.setLive(false);
    }

    function failed(err, message) {
      console.error(err);
      if (err && err.handled) return; // the password screen is up
      if (err && err.unauthorized) { if (wd.key) { forgetKey(); wd.renderKey(t('keyRejected')); } return; } // once for several frames
      if (err && /turned off/.test(String(err.message))) { start(); return; } // turned off meanwhile
      toast(message || t('loadFailed'));
    }

    function toast(text) {
      const node = el('div', 'wd-toast', text);
      document.body.append(node);
      setTimeout(() => node.remove(), 4000);
    }

    // ---- The parts (settings/dashboard-<part>.js), each run once with `wd` ------------------------------------------
    Object.assign(wd, { APP_ID, applyDim, appWidget, AWAKE_STORAGE, BACKGROUNDS, bracketQuery, button, clone,
      confirmButton, darkQuery, DEFAULT_STRINGS, deleted, DIM_STORAGE, dimLevel, DRAG_SLOP, EDGE_PX, el, failed,
      frames, HOMEY_WIDTH, homeyRequest, icon, isScreenCode, keepAwake, KEY_STORAGE, LAYOUT, listeners, loadAll, loadSetup, MAX_DIM,
      newId, opts, persist, request, root, route, SESSION_STORAGE, start, STAY_STORAGE, storageGet, storageSet,
      stringsOf, t, THEME_STORAGE, toast, typeOf, unlocked, useCode });
    for (const name of PARTS) {
      const part = window.WidgetkeeperWeb.parts.get(name);
      if (!part) throw new Error(`settings/dashboard-${name}.js isn't loaded`);
      part(wd);
    }

    // ---- Routing: #/ the list, #/d/<id> a dashboard, #/d/<id>/edit editing it ---------------------------------

    function route() {
      queueMicrotask(wd.syncPopups); // once this view is drawn: its popups show, another view's close
      if (!wd.key) { wd.renderKey(); return; }
      if (!wd.setup) { start(); return; }
      if (wd.setup.disabled) { wd.renderOff(); return; }
      if (wd.setup.passwordRequired) { wd.renderPassword(); return; }
      const m = location.hash.match(/^#\/d\/([A-Za-z0-9_-]+)(\/edit)?$/);
      // A browser on a dashboard with a code stays there: the dashboards, and its editor, take the code first.
      const stay = wd.dashboards.find(d => d.id === storageGet(STAY_STORAGE) && wd.lockOf(d));
      if (!stay && storageGet(STAY_STORAGE)) storageSet(STAY_STORAGE, null);
      if (!m && stay) {
        // Asked only for the dashboards themselves: a page opened without an address just shows its dashboard.
        const to = ['#/', '#/edit'].includes(location.hash) ? location.hash : null;
        history.replaceState(null, '', `#/d/${stay.id}`);
        wd.renderDashboard(stay, false);
        if (to) wd.askCode(stay, () => { storageSet(STAY_STORAGE, null); location.hash = to; });
        return;
      }
      if (location.hash === '#/edit') { wd.renderList(true); return; }
      if (!m) { wd.renderList(); return; }
      const dashboard = wd.dashboards.find(d => d.id === m[1]);
      if (!dashboard) { wd.renderMissing(); return; }
      if (m[2] && wd.lockOf(dashboard) && !unlocked.has(dashboard.id)) {
        history.replaceState(null, '', `#/d/${dashboard.id}`);
        storageSet(STAY_STORAGE, dashboard.id);
        wd.renderDashboard(dashboard, false);
        wd.askCode(dashboard, () => { unlocked.add(dashboard.id); location.hash = `#/d/${dashboard.id}/edit`; });
        return;
      }
      if (!m[2]) {
        unlocked.delete(dashboard.id); // leaving its editor: the next time takes the code again
        if (wd.lockOf(dashboard)) storageSet(STAY_STORAGE, dashboard.id);
      }
      wd.renderDashboard(dashboard, !!m[2]);
    }

    async function start() {
      const code = takeCode();
      if (code) {
        const problem = await useCode(code);
        if (problem) { wd.renderKey(problem); return; }
      }
      if (!wd.key) { wd.renderKey(); return; }
      try {
        await loadAll();
        route();
      } catch (err) {
        if (err.unauthorized) {
          forgetKey();
          wd.renderKey(t('keyRejected'));
        } else {
          wd.renderFailed();
        }
      }
    }

    window.addEventListener('hashchange', async () => {
      // A screen's code opened in a page already open: used as at a load.
      if (/code=/.test(location.hash)) { start(); return; }
      // Leaving the editor: wait for the last save, so the view shows what was saved.
      await wd.saving;
      route();
    });
    keepAwake.set(storageGet(AWAKE_STORAGE) === '1');
    applyDim(dimLevel());
    start();
  };
})();
