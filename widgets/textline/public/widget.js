/*
 * Notes: a short text, typed in the widget's settings, written by a Flow card (a named note) or read from a Logic
 * text variable. As a tile (one line, cut off with … or scrolling, or every line, the tile growing with them) or as a
 * Post-it note stuck on the dashboard, in handwriting, wrapping up to three lines; plain or formatted with Markdown.
 * Plain browser JS (served as-is).
 */
(function () {
  const { el, COLORS, applyColors, isCustomColor, paintColor } = window.WidgetkeeperKit; // ../spacer/kit.js, loaded first
  'use strict';

  const DEFAULT_STRINGS = {
    noMessage: 'No message',
    typeNote: 'Type your note in the widget settings.',
    variableMissing: 'Variable not found',
    selectVariable: 'Pick a text variable in the widget settings.',
    error: 'Could not load the text.',
    boardInUse: 'Has a text',
    boardNew: 'New note',
  };

  /** The note a widget shows unless its `board` setting names another (DEFAULT_BOARD in lib/TextLineService.ts). */
  const DEFAULT_BOARD = 'Note';
  const SIZES = ['small', 'default', 'large'];
  const ALIGNS = ['left', 'center', 'right'];
  /** The Post-it's handwriting in px per size, and the smaller steps it may take to fit three lines. */
  const NOTE_FONT = { small: 24, default: 30, large: 38 };
  const NOTE_STEPS = [1, 0.86, 0.74, 0.64];
  const NOTE_LINES = 3;
  /** The scrolling text moves this many px a second, after a pause at each end. */
  const SCROLL_SPEED = 40;

  /** The tile's optional icon: Flow Buttons' (the kit's; the `icon` setting lists them, listIcons()). */
  const ICONS = window.WidgetkeeperKit.icons;

  /** A board's key: its name trimmed and lower-cased, none for a reserved name (boardKey() in lib/TextLineService.ts). */
  function boardKey(name) {
    const n = typeof name === 'string' ? name.trim() : '';
    const key = (n || DEFAULT_BOARD).toLowerCase().slice(0, 60);
    return key === '__proto__' || key === 'constructor' || key === 'prototype' ? '' : key;
  }

  /** A small number from a string, the same every time: the note's tilt per widget. */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /** The note's tilt in degrees: 2–3.5 one way or the other, picked by `seed` (the user asked for more than 0.6–1.8). */
  function noteTilt(seed) {
    const h = hash(String(seed || 'default'));
    const deg = 2 + (h % 16) / 10;
    return Math.round(((h >>> 8) & 1 ? deg : -deg) * 10) / 10;
  }

  /**
   * What the widget shows: `{text, muted}`. The typed message; or the note's text (a Flow's) or the variable's value,
   * with the typed message (else a muted "No message") while that's empty.
   */
  function textLineContent({ source, board, variable, variableChosen, message }, t) {
    const typed = typeof message === 'string' && message.trim() ? message.trim() : '';
    if (source === 'typed') return typed ? { text: typed, muted: false } : { text: t('typeNote'), muted: true };
    const empty = () => (typed ? { text: typed, muted: false } : { text: t('noMessage'), muted: true });
    if (source === 'variable') {
      if (!variableChosen) return { text: t('selectVariable'), muted: true };
      if (!variable) return { text: '', muted: true };
      if (variable.missing) return { text: t('variableMissing'), muted: true };
      const v = variable.value == null ? '' : String(variable.value);
      return v.trim() ? { text: v, muted: false } : empty();
    }
    const text = board && typeof board.text === 'string' ? board.text : '';
    return text.trim() ? { text, muted: false } : empty();
  }

  /*
   * Markdown (the `markdown` setting; a user asked, 2026-11-28): the inline styles (**bold**, *italic*, ~~struck~~,
   * `code`) and, a line each, # headings (to ###), - or 1. lists and > quotes. Built as nodes, never as HTML, so a
   * text can't put markup on the page. `_` only marks at a word's edge, so snake_case stays as it is.
   */
  const WORD = /[\p{L}\p{N}]/u;
  const SPACE = /\s/;
  const ESCAPABLE = '\\`*_~#>-+.!()[]';

  /** Where `delim` that opened at `from` closes, or -1. A single * or _ steps over doubled ones (a bold inside). */
  function closing(src, from, delim) {
    for (let j = from; j <= src.length - delim.length; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '`') { const end = src.indexOf('`', j + 1); if (end > 0) { j = end; continue; } }
      if (!src.startsWith(delim, j)) continue;
      if (delim.length === 1 && src[j + 1] === delim) { j++; continue; }
      if (j === from || SPACE.test(src[j - 1])) continue;
      if (delim[0] === '_' && WORD.test(src[j + delim.length] || '')) continue;
      // A longer run (***both***) closes at its end, so the inner single mark gets the run's first.
      while (src[j + delim.length] === delim[0]) j++;
      return j;
    }
    return -1;
  }

  /** A line's inline marks: `[{text} | {tag, kids} | {code}]`. */
  function parseInline(src) {
    const out = [];
    let text = '';
    const push = (node) => { if (text) out.push({ text }); text = ''; out.push(node); };
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '\\' && ESCAPABLE.includes(src[i + 1] || ' ')) { text += src[++i]; continue; }
      if (c === '`') {
        const end = src.indexOf('`', i + 1);
        if (end > i + 1) { push({ code: src.slice(i + 1, end) }); i = end; continue; }
      }
      const delim = ['**', '__', '~~'].find(d => src.startsWith(d, i)) || (c === '*' || c === '_' ? c : '');
      if (delim && !SPACE.test(src[i + delim.length] || ' ') && !(c === '_' && WORD.test(src[i - 1] || ''))) {
        const end = closing(src, i + delim.length, delim);
        if (end > i + delim.length) {
          const tag = delim === '~~' ? 'del' : delim.length === 2 ? 'strong' : 'em';
          push({ tag, kids: parseInline(src.slice(i + delim.length, end)) });
          i = end + delim.length - 1;
          continue;
        }
      }
      text += c;
    }
    if (text) out.push({ text });
    return out;
  }

  /** A text's lines: `{kind: 'p'|'h'|'li'|'quote', level?, mark?, depth?, inline}`. */
  function parseMarkdown(src) {
    return String(src).split(/\r?\n/).map((line) => {
      let m = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
      if (m) return { kind: 'h', level: Math.min(m[1].length, 3), inline: parseInline(m[2]) };
      m = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
      if (m) {
        const depth = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
        return { kind: 'li', mark: /\d/.test(m[2]) ? m[2] : '•', depth, inline: parseInline(m[3]) };
      }
      m = /^ {0,3}>\s?(.*)$/.exec(line);
      if (m) return { kind: 'quote', inline: parseInline(m[1]) };
      return { kind: 'p', inline: parseInline(line.trim() ? line : '') };
    });
  }

  /** The inline marks as nodes in `parent`. */
  function addInline(parent, nodes) {
    for (const n of nodes) {
      if (n.text != null) parent.appendChild(document.createTextNode(n.text));
      else if (n.code != null) el('code', { class: 'tl-code', text: n.code }, parent);
      else addInline(el(n.tag, {}, parent), n.kids);
    }
  }

  /**
   * The text's Markdown in `textEl`. `blocks` (Show on more lines): a line each, headings bigger, lists indented. Else
   * in the text's own flow, the lines kept by its white-space (the Post-it's three) or joined (the one-line tile).
   */
  function renderMarkdown(textEl, src, blocks) {
    textEl.textContent = '';
    parseMarkdown(src).forEach((line, i) => {
      const cls = line.kind === 'h' ? `tl-h tl-h${line.level}` : line.kind === 'li' ? 'tl-li' : line.kind === 'quote' ? 'tl-q' : 'tl-p';
      if (!blocks && i) textEl.appendChild(document.createTextNode('\n'));
      const node = el(blocks ? 'div' : 'span', { class: `tl-line ${cls}` }, textEl);
      if (line.kind === 'li') {
        if (blocks) node.style.setProperty('--tl-depth', String(line.depth));
        el('span', { class: 'tl-mark', text: blocks ? line.mark : `${' '.repeat(line.depth)}${line.mark} ` }, node);
        addInline(blocks ? el('span', { class: 'tl-item' }, node) : node, line.inline);
      } else if (blocks && !line.inline.length) node.textContent = '​'; // an empty line keeps its height
      else addInline(node, line.inline);
    });
  }

  /**
   * @param {HTMLElement} root
   * @param {{ colorStyle?: string, style?: string, source?: string, align?: string, size?: string, overflow?: string, icon?: string | null,
   *   color?: string, message?: string, markdown?: boolean, variableChosen?: boolean, seed?: string, reducedMotion?: boolean,
   *   t?: (key: string, tokens?: Record<string, unknown>) => string | null, onHeight?: (h: number) => void }} opts
   */
  function createTextLineWidget(root, opts = {}) {
    const t = window.WidgetkeeperKit.translator('textline', DEFAULT_STRINGS, opts);
    const postit = opts.style === 'postit';
    const source = ['flow', 'variable'].includes(opts.source) ? opts.source : 'typed';
    const size = SIZES.includes(opts.size) ? opts.size : 'default';
    const align = ALIGNS.includes(opts.align) ? opts.align : 'left';
    const scroll = !postit && opts.overflow === 'scroll';
    // Every line, with the typed line breaks: the tile grows (a user asked, for a text that stays up).
    const allLines = !postit && opts.overflow === 'wrap';
    const ownColor = COLORS.includes(opts.color) ? opts.color : null;
    const icon = !postit && opts.icon && Object.prototype.hasOwnProperty.call(ICONS, opts.icon) ? ICONS[opts.icon] : null;
    const markdown = opts.markdown === true;
    const reducedMotion = opts.reducedMotion != null ? opts.reducedMotion
      : !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    let board = null;
    let variable = null;
    let error = null;
    let loaded = false;
    let shown = null; // the text and how it was drawn, so an unchanged one isn't rebuilt

    root.classList.add('tl');
    applyColors(root, { style: opts.colorStyle });
    root.dataset.style = postit ? 'postit' : 'tile';
    root.dataset.size = size;
    root.dataset.align = align;
    if (allLines) root.dataset.overflow = 'wrap';
    if (markdown) root.dataset.markdown = '';

    const box = el('div', { class: postit ? 'tl-note' : 'tl-tile' }, root);
    if (postit) box.style.setProperty('--tl-tilt', `${noteTilt(opts.seed)}deg`);
    if (icon) {
      box.appendChild(window.WidgetkeeperKit.svgIcon(icon, 'tl-icon'));
    }
    // The note's paper sits inside it, so the curl's shadow (the note's ::after) goes under the paper.
    const wrap = el('div', { class: 'tl-wrap' }, postit ? el('div', { class: 'tl-paper' }, box) : box);
    const textEl = el('span', { class: 'tl-text', dir: 'auto' }, wrap);

    /** `/state`'s answer (`{language, board, variable}`), or a realtime entry under `board` or `variable`. */
    function setState(state) {
      if (!state) return;
      if ('board' in state) board = state.board;
      if ('variable' in state) variable = state.variable;
      error = null;
      loaded = true;
      render();
    }

    /** A failed first load shows the error; a failed refresh keeps the text. */
    function setError(message) {
      if (loaded) return;
      error = message || t('error');
      render();
    }

    function render() {
      const content = error ? { text: error, muted: true }
        : textLineContent({ source, board, variable, variableChosen: opts.variableChosen !== false, message: opts.message }, t);
      // Our own messages (muted) stay plain; only the note's text is Markdown.
      const formatted = markdown && !content.muted;
      const key = `${formatted ? 'md' : 'text'}:${content.text}`;
      if (shown !== key) {
        shown = key;
        if (formatted) renderMarkdown(textEl, content.text, allLines);
        else textEl.textContent = content.text;
      }
      root.classList.toggle('muted', content.muted);
      const flowColor = source === 'flow' && board && (COLORS.includes(board.color) || isCustomColor(board.color)) ? board.color : null;
      paintColor(box, flowColor || ownColor || (postit ? 'yellow' : null)); // a Flow's custom colour is `custom`
      layout();
    }

    /** Fits the note's handwriting into three lines, or sets the tile's scroll. Then reports a changed height. */
    function layout() {
      if (postit) fitNote();
      else if (scroll) setScroll();
      reportHeight();
    }

    function fitNote() {
      const base = NOTE_FONT[size];
      // Measured with the clamp lifted: under -webkit-line-clamp the height is already cut to three lines.
      const s = textEl.style;
      s.setProperty('display', 'block');
      s.setProperty('-webkit-line-clamp', 'none');
      s.setProperty('overflow', 'visible');
      for (const step of NOTE_STEPS) {
        const px = Math.round(base * step);
        s.fontSize = `${px}px`;
        const lineHeight = px * 1.1;
        // The layout height: getBoundingClientRect() is of the tilted note's box, a few px taller than the text.
        const h = textEl.offsetHeight;
        if (!h || h <= lineHeight * NOTE_LINES + 1) break;
      }
      for (const p of ['display', '-webkit-line-clamp', 'overflow']) s.removeProperty(p);
    }

    function setScroll() {
      wrap.classList.remove('scrolling');
      textEl.style.removeProperty('--tl-shift');
      if (reducedMotion) return;
      const over = textEl.scrollWidth - wrap.clientWidth;
      if (!(over > 2)) return;
      textEl.style.setProperty('--tl-shift', `${-over}px`);
      // The pauses at the ends (15 % each) come on top of the move.
      textEl.style.setProperty('--tl-scroll-s', `${Math.max(4, (over / SCROLL_SPEED) / 0.7).toFixed(1)}s`);
      wrap.classList.add('scrolling');
    }

    const reportHeight = window.WidgetkeeperKit.heightReporter(root, opts);

    if (typeof ResizeObserver === 'function') {
      let width = 0;
      new ResizeObserver(() => {
        const w = Math.round(root.getBoundingClientRect().width);
        if (w === width) return;
        width = w;
        layout();
      }).observe(root);
    }
    // The handwriting's metrics only count once the font is in; so do the wrapped tile's lines, and so its height.
    if ((postit || allLines) && document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());

    render();
    return { setState, setError, render };
  }

  window.createTextLineWidget = createTextLineWidget;
  window.textLineBoardKey = boardKey;
  window.textLineTilt = noteTilt;
  window.textLineMarkdown = parseMarkdown;
})();
