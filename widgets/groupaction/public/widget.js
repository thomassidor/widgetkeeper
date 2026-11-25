/*
 * Group Quick Action: one full-width tile that runs the same quick action on several devices (the living room's
 * lights, every door's lock). The name over how many are on ("2 of 5 on") with a dot per device, and a switch whose
 * knob sits in the middle while they disagree. A tap turns them all off (locks: locks them all) when any is on, else all
 * on: Light Controls' room rule. The devices and their trigger are Device Quick Actions'. Plain browser JS (served as-is).
 */
(function () {
  const { el, applyColors, onTap, touchGuard, messageLine, markOffline, pressGuard } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const OPTIMISTIC_MS = 10e3; // how long a tapped device shows its new state while waiting for it
  const PRESS_MS = 600; // how long a momentary (button) action lights the tile
  const MAX_DOTS = 12; // more devices than this: the count alone
  const SECURE = ['locked', 'garagedoor_closed']; // orange in the state line while open
  /** The quick actions whose resting value is `true` (locked, closed); every other rests at `false` (off, paused). */
  const REST_TRUE = ['locked', 'garagedoor_closed'];
  const ID = 'group'; // the press guard's one tile

  const DEFAULT_STRINGS = {
    selectDevices: 'Select devices in the widget settings.',
    error: 'Could not load the devices.',
    noAction: 'None of these devices has a quick action.',
    failed: 'Could not change __names__.',
    unavailable: 'Unavailable',
    tapAgain: 'Tap again',
    hold: 'Hold',
    andMore: '__name__ and __n__ more',
    devices: '__n__ devices',
    unavailableCount: '__n__ unavailable',
    leftOut: 'Left out (another quick action): __names__',
    allOn: 'All on',
    allOff: 'All off',
    someOn: '__n__ of __total__ on',
    allLocked: 'All locked',
    allUnlocked: 'All unlocked',
    someUnlocked: '__n__ of __total__ unlocked',
    allClosed: 'All closed',
    allOpen: 'All open',
    someOpen: '__n__ of __total__ open',
    allPaused: 'All paused',
    allPlaying: 'All playing',
    somePlaying: '__n__ of __total__ playing',
  };

  // The state line's words per quick action: [all resting, all active, some active].
  const WORDS = {
    locked: ['allLocked', 'allUnlocked', 'someUnlocked'],
    garagedoor_closed: ['allClosed', 'allOpen', 'someOpen'],
    speaker_playing: ['allPaused', 'allPlaying', 'somePlaying'],
  };
  const ON_WORDS = ['allOff', 'allOn', 'someOn'];

  const svg = (viewBox, body) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}`;
  /** A momentary button's action icon (Quick Actions' glyph), in place of the switch. */
  const BUTTON_GLYPH = svg('3.4 3.4 17.2 17.2', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="#000"/>');

  const base = capabilityId => String(capabilityId).split('.')[0];

  /**
   * @param {HTMLElement} root
   * @param {{ t?: (key: string, tokens?: object) => string, name?: string, color?: string, colorStyle?: string,
   *   press?: 'single' | 'double' | 'long',
   *   onTrigger?: (deviceId: string, value: boolean) => Promise<any>, onHaptic?: () => void,
   *   onHeight?: (h: number) => void }} opts
   */
  function createGroupActionWidget(root, opts = {}) {
    const t = window.WidgetkeeperKit.translator('groupaction', DEFAULT_STRINGS, opts);
    const typedName = typeof opts.name === 'string' ? opts.name.trim() : '';

    let devices = []; // [{ id, name, icon, quickAction, zone, offline? } | { id, missing }]
    const optimistic = new Map(); // deviceId → { value, until }
    let pressedUntil = 0; // a momentary action's flash
    const guard = pressGuard({ render: () => render(), onHaptic: opts.onHaptic });
    // What failed: a lasting message replaces the tile, a transient one goes by itself.
    const message = messageLine(() => render(), { clear: () => { devices = []; } });

    root.classList.add('ga');
    applyColors(root, { style: opts.colorStyle, color: opts.color, fallback: 'blue' });
    root.style.setProperty('--ga-hold', `${guard.holdMs}ms`); // the long press's fill

    const tile = el('button', { type: 'button', class: 'ga-tile' }, root);
    const icon = el('span', { class: 'ga-icon' }, tile);
    const text = el('div', { class: 'ga-text' }, tile);
    const nameEl = el('span', { class: 'ga-name', dir: 'auto' }, text);
    const line = el('div', { class: 'ga-line' }, text);
    const stateEl = el('span', { class: 'ga-state', dir: 'auto' }, line);
    const dotsEl = el('span', { class: 'ga-dots', 'aria-hidden': 'true' }, line);
    const sw = el('span', { class: 'ga-switch', 'aria-hidden': 'true' }, tile);
    const action = el('span', { class: 'ga-action' }, tile);
    const noteEl = el('div', { class: 'ga-note', dir: 'auto' }, root);
    const messageEl = el('div', { class: 'ga-message', dir: 'auto' }, root);
    const touches = touchGuard();

    function setState(list) {
      devices = Array.isArray(list) ? list : [];
      message.reset();
      render();
    }

    function pushChange({ deviceId, capabilityId, value }) {
      const d = devices.find(x => x.id === deviceId);
      if (!d || !d.quickAction || d.quickAction.capabilityId !== capabilityId) return;
      d.quickAction.value = value;
      const o = optimistic.get(deviceId);
      if (o && o.value === value) optimistic.delete(deviceId);
      // Changed elsewhere while asking for the second tap: that tap would no longer do what was asked.
      if (guard.asking(ID) && guard.askedFrom(ID) !== group().key) guard.drop(ID);
      render();
    }

    function setMessage(text, transient) {
      message.set(text, transient);
    }

    function shownValue(d) {
      const o = optimistic.get(d.id);
      if (o && Date.now() < o.until) return o.value;
      optimistic.delete(d.id);
      return d.quickAction.value;
    }

    /**
     * The group as it stands: the kind of quick action (the first device's that can be set), the devices with it
     * (`members`; the others are left out), how many of those that can be read are active (on, unlocked, open, playing),
     * and how many are unavailable (offline or gone).
     */
    function group() {
      const first = devices.find(d => !('missing' in d) && d.quickAction && d.quickAction.actionable);
      const kind = first ? base(first.quickAction.capabilityId) : null;
      const members = kind ? devices.filter(d => !('missing' in d) && d.quickAction && d.quickAction.actionable && base(d.quickAction.capabilityId) === kind) : [];
      const leftOut = kind ? devices.filter(d => !('missing' in d) && !members.includes(d)) : [];
      const rest = REST_TRUE.includes(kind);
      const momentary = !!first && first.quickAction.momentary;
      const readable = members.filter(d => !d.offline);
      const values = readable.map(shownValue);
      const active = values.filter(v => v !== rest).length;
      const on = values.filter(v => v === true).length; // the switch and the tint follow `true`, as Quick Actions' tile
      const unavailable = devices.filter(d => 'missing' in d).length + (members.length - readable.length);
      return { kind, members, leftOut, rest, momentary, readable, active, on, unavailable,
        key: values.map(v => (v ? 1 : 0)).join('') }; // what a first tap saw (`press: double`)
    }

    /** The tile's name: the one typed, else the room every device is in, else the first device's and how many more. */
    function title(g) {
      if (typedName) return typedName;
      const found = devices.filter(d => !('missing' in d));
      const zones = new Set(found.map(d => (d.zone ? d.zone.id : null)));
      if (found.length > 1 && zones.size === 1 && found[0].zone) return found[0].zone.name;
      const lead = g.members[0] || found[0];
      if (!lead) return '';
      const more = found.length - 1;
      return more > 0 ? t('andMore', { name: lead.name, n: more }) : lead.name;
    }

    /** Whether the tile acts on a long press only (`press: long`). */
    const holds = () => opts.press === 'long' && group().members.length > 0;

    function tap() {
      if (holds()) {
        guard.hint(ID);
        return;
      }
      if (press() && opts.onHaptic) opts.onHaptic();
    }

    /**
     * Any device active (on, unlocked): all to rest (off, locked). None: all active. Each device that isn't there
     * already gets its own trigger, at once; an unavailable one still gets it. A momentary button presses every one.
     * Returns whether it sent anything.
     */
    function press() {
      const g = group();
      if (!g.members.length || !opts.onTrigger) return false;
      if (opts.press === 'double' && guard.ask(ID, g.key)) return false;
      let sends;
      if (g.momentary) {
        sends = g.members.map(d => [d, true]);
        pressedUntil = Date.now() + PRESS_MS;
        setTimeout(render, PRESS_MS + 20);
      } else {
        const target = g.active > 0 ? g.rest : !g.rest;
        sends = g.members.filter(d => shownValue(d) !== target).map(d => [d, target]);
        for (const [d, value] of sends) optimistic.set(d.id, { value, until: Date.now() + OPTIMISTIC_MS });
        setTimeout(render, OPTIMISTIC_MS + 50);
      }
      render();
      Promise.all(sends.map(([d, value]) => Promise.resolve()
        .then(() => opts.onTrigger(d.id, value))
        .then(() => null, (err) => {
          console.error(err);
          optimistic.delete(d.id);
          return d.name;
        })))
        .then((failed) => {
          const names = failed.filter(n => n !== null);
          if (!names.length) return;
          window.WidgetkeeperKit.shake(tile);
          setMessage(t('failed', { names: names.join(', ') }), true);
          render();
        });
      return sends.length > 0;
    }

    onTap(tile, tap, {
      keys: false, // a <button> clicks on Enter and Space itself
      guard: touches,
      hold: guard.hold(ID, holds, () => { press(); }),
    });

    const setMask = (node, url) => window.WidgetkeeperKit.setMask(node, url, '--ga-mask');
    const reportHeight = window.WidgetkeeperKit.heightReporter(root, opts);

    function render() {
      const g = group();
      const has = devices.length > 0;
      tile.style.display = has ? '' : 'none';
      const confirm = guard.asking(ID);
      const hint = guard.hinting(ID);
      const flashing = g.momentary && Date.now() < pressedUntil;

      nameEl.textContent = hint ? t('hold') : confirm ? t('tapAgain') : (title(g) || t('unavailable'));
      const lead = g.members[0] || devices.find(d => !('missing' in d) && d.icon);
      setMask(icon, lead && lead.icon ? lead.icon : null);
      icon.classList.toggle('fallback', !lead || !lead.icon);

      // The state line: how many are active, and how many can't be read.
      let state = '';
      if (!g.kind) state = devices.some(d => !('missing' in d)) ? t('noAction') : t('unavailable');
      else if (g.momentary) state = t('devices', { n: g.members.length });
      else if (g.readable.length) {
        const words = WORDS[g.kind] || ON_WORDS;
        state = g.active === 0 ? t(words[0]) : g.active === g.readable.length ? t(words[1])
          : t(words[2], { n: g.active, total: g.readable.length });
      }
      if (g.kind && g.unavailable) state = [state, t('unavailableCount', { n: g.unavailable })].filter(Boolean).join(' · ');
      stateEl.textContent = state;
      // Orange when something can't be read, or a lock or garage door is open.
      stateEl.classList.toggle('warn', !!g.kind && (g.unavailable > 0 || (SECURE.includes(g.kind) && g.active > 0)));

      // A dot per device of the group (and per one that's gone), lit while `true`, ringed while unavailable.
      dotsEl.textContent = '';
      const dotted = g.kind && !g.momentary ? devices.filter(d => 'missing' in d || g.members.includes(d)) : [];
      dotsEl.style.display = dotted.length > 1 && dotted.length <= MAX_DOTS ? '' : 'none';
      if (dotted.length > 1 && dotted.length <= MAX_DOTS) {
        for (const d of dotted) {
          const off = 'missing' in d || d.offline;
          el('i', { class: off ? 'x' : shownValue(d) === true ? 'l' : '' }, dotsEl);
        }
      }

      // The switch: off, on, or the knob in the middle while they disagree. A momentary button shows its glyph instead.
      const level = !g.readable.length || g.on === 0 ? 'off' : g.on === g.readable.length ? 'on' : 'mid';
      sw.dataset.level = level;
      sw.style.display = g.kind && !g.momentary ? '' : 'none';
      setMask(action, g.momentary ? (g.members[0].quickAction.icon || BUTTON_GLYPH) : null);
      action.style.display = g.momentary ? '' : 'none';

      tile.classList.toggle('active', !confirm && (g.momentary ? flashing : level === 'on'));
      tile.classList.toggle('some', !confirm && !g.momentary && level === 'mid');
      tile.classList.toggle('confirm', confirm);
      tile.dataset.capability = g.kind || '';
      tile.disabled = !g.members.length;
      markOffline(tile, has && !g.readable.length && g.members.length > 0, t('unavailable'));
      tile.setAttribute('aria-label', [nameEl.textContent, state].filter(Boolean).join(', '));

      const note = g.leftOut.length ? t('leftOut', { names: g.leftOut.map(d => d.name).join(', ') }) : '';
      noteEl.textContent = note;
      noteEl.style.display = note ? '' : 'none';
      messageEl.textContent = message.text || '';
      messageEl.style.display = message.text ? '' : 'none';
      messageEl.classList.toggle('error', !!message.text && has);
      reportHeight();
    }

    render();
    return { setState, pushChange, setMessage, render, t };
  }

  window.createGroupActionWidget = createGroupActionWidget;
})();
