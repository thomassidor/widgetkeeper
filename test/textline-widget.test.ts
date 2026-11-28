// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boardKey } from '../lib/TextLineService.js';
import { loadWidget } from './helpers/loadWidget.js';

let win: any;
beforeAll(() => { win = loadWidget('textline'); });
afterEach(() => { document.body.innerHTML = ''; });

const board = (text: string, color: string | null = null) => ({ key: 'note', name: 'Note', text, color, updatedAt: 1 });

function widget(opts: object = {}, state: any = { language: 'en', board: board('Dinner at 6'), variable: null }) {
  const root = document.createElement('div');
  document.body.append(root);
  // A Flow's note unless a test says otherwise (the widget's own default is the typed message).
  const w = win.createTextLineWidget(root, { reducedMotion: true, source: 'flow', ...opts });
  if (state) w.setState(state);
  const text = () => root.querySelector('.tl-text')!.textContent;
  const box = () => root.querySelector<HTMLElement>('.tl-tile, .tl-note')!;
  return { w, root, text, box };
}

describe('text', () => {
  it('shows the typed message, or asks for one', () => {
    const typed = widget({ source: 'typed', message: '  Back at 5  ' }, null);
    expect(typed.text()).toBe('Back at 5');
    expect(typed.root.classList.contains('muted')).toBe(false);
    const none = widget({ source: undefined, message: ' ' }, null);
    expect(none.text()).toBe('Type your note in the widget settings.');
    expect(none.root.classList.contains('muted')).toBe(true);
  });

  it("keeps a typed message's line breaks for the note", () => {
    expect(widget({ source: 'typed', style: 'postit', message: 'Milk\nEggs' }, null).text()).toBe('Milk\nEggs');
  });

  it("shows the note's text, and the typed message or a muted No message without one", () => {
    expect(widget().text()).toBe('Dinner at 6');
    const empty = widget({}, { board: board('') });
    expect(empty.text()).toBe('No message');
    expect(empty.root.classList.contains('muted')).toBe(true);
    const fixed = widget({ message: 'Back at 5' }, { board: board('  ') });
    expect(fixed.text()).toBe('Back at 5');
    expect(fixed.root.classList.contains('muted')).toBe(false);
  });

  it("follows a realtime entry", () => {
    const { w, text } = widget();
    w.setState({ board: board('Pizza in the oven') });
    expect(text()).toBe('Pizza in the oven');
  });

  it("shows a variable's value, a missing variable, or asks for one", () => {
    expect(widget({ source: 'variable' }, { variable: { id: 'v1', name: 'Note', type: 'string', value: 'Hi' } }).text()).toBe('Hi');
    expect(widget({ source: 'variable' }, { variable: { id: 'v1', missing: true } }).text()).toBe('Variable not found');
    expect(widget({ source: 'variable', variableChosen: false }, { variable: null }).text()).toBe('Pick a text variable in the widget settings.');
  });

  it('shows an error only when nothing has loaded', () => {
    const { w, text } = widget({}, null);
    w.setError('offline');
    expect(text()).toBe('offline');
    w.setState({ board: board('Hello') });
    w.setError('offline');
    expect(text()).toBe('Hello');
  });

  it('uses the strings Homey gives', () => {
    const t = (key: string) => (key === 'textline.noMessage' ? 'Ingen besked' : key);
    expect(widget({ t }, { board: null }).text()).toBe('Ingen besked');
  });
});

describe('tile', () => {
  it("sets alignment, size, the icon and the setting's colour, a Flow's winning", () => {
    const { root, box, w } = widget({ align: 'center', size: 'large', icon: 'bell', color: 'blue' });
    expect(root.dataset).toMatchObject({ style: 'tile', align: 'center', size: 'large' });
    expect(root.querySelector('.tl-icon path')!.getAttribute('d')).toBe(win.WidgetkeeperKit.icons.bell.d);
    expect(box().dataset.color).toBe('blue');
    w.setState({ board: board('Dryer done', 'red') });
    expect(box().dataset.color).toBe('red');
    w.setState({ board: board('Dryer done') });
    expect(box().dataset.color).toBe('blue');
  });

  it('falls back for unknown settings and has no colour by default', () => {
    const { root, box } = widget({ align: 'up', size: 'huge', icon: 'nope', color: 'magenta' });
    expect(root.dataset).toMatchObject({ align: 'left', size: 'default' });
    expect(root.querySelector('.tl-icon')).toBeNull();
    expect(box().dataset.color).toBeUndefined();
  });

  it("doesn't scroll text that fits", () => {
    const { root } = widget({ overflow: 'scroll', reducedMotion: false });
    expect(root.querySelector('.tl-wrap')!.classList.contains('scrolling')).toBe(false);
  });

  it('shows every line on more lines, the line breaks kept, only on the tile', () => {
    const { root, text } = widget({ source: 'typed', message: 'Back at 5\nFeed the cat', overflow: 'wrap', reducedMotion: false }, null);
    expect(root.dataset.overflow).toBe('wrap');
    expect(text()).toBe('Back at 5\nFeed the cat');
    expect(root.querySelector('.tl-wrap')!.classList.contains('scrolling')).toBe(false);
    expect(widget({ style: 'postit', overflow: 'wrap' }).root.dataset.overflow).toBeUndefined();
    expect(widget({ overflow: 'scroll' }).root.dataset.overflow).toBeUndefined();
  });

});

describe('Post-it', () => {
  it('is yellow paper by default, tilted the same way for the same widget', () => {
    const { root, box } = widget({ style: 'postit', seed: 'w1', icon: 'bell' });
    expect(root.dataset.style).toBe('postit');
    expect(box().dataset.color).toBe('yellow');
    expect(root.querySelector('.tl-paper .tl-text')).not.toBeNull();
    expect(root.querySelector('.tl-icon')).toBeNull(); // the tile's only
    expect(box().style.getPropertyValue('--tl-tilt')).toBe(`${win.textLineTilt('w1')}deg`);
  });

  it('tilts a little, one way or the other', () => {
    const tilts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(s => win.textLineTilt(s));
    for (const d of tilts) expect(Math.abs(d)).toBeGreaterThanOrEqual(2);
    for (const d of tilts) expect(Math.abs(d)).toBeLessThanOrEqual(3.5);
    expect(tilts.some(d => d > 0) && tilts.some(d => d < 0)).toBe(true);
  });

  it("takes a Flow's colour as its paper", () => {
    expect(widget({ style: 'postit' }, { board: board('Buy milk', 'green') }).box().dataset.color).toBe('green');
  });

  it("takes a Flow's custom colour, inline, keeping the tilt", () => {
    const box = widget({ style: 'postit', source: 'flow' }, { board: board('Buy milk', '#ff6347') }).box();
    expect(box.dataset.color).toBe('custom');
    expect(box.style.getPropertyValue('--wk-custom')).toBe('#ff6347');
    expect(box.style.getPropertyValue('--tl-tilt')).not.toBe('');
  });
});

it("finds a board by the service's key", () => {
  for (const name of ['Kitchen', ' kitchen ', '', 'Note', 'ÆBLE', '__proto__', 'Constructor']) expect(win.textLineBoardKey(name)).toBe(boardKey(name));
});

describe('Markdown', () => {
  const md = (message: string, opts: object = {}) => widget({ source: 'typed', markdown: true, message, ...opts }, null);
  const html = (w: { root: HTMLElement }) => w.root.querySelector('.tl-text')!.innerHTML;

  it('is off unless the setting is ticked: the marks stay as typed', () => {
    const plain = widget({ source: 'typed', message: '**Good** morning' }, null);
    expect(plain.text()).toBe('**Good** morning');
    expect(plain.root.querySelector('strong')).toBeNull();
  });

  it('renders bold, italic, struck and code, nested', () => {
    const w = md('**Good** *morning*, ~~Anna~~ __you__ _all_ `x*y*z` and ***both***');
    expect(w.text()).toBe('Good morning, Anna you all x*y*z and both');
    expect(html(w)).toContain('<strong>Good</strong>');
    expect(html(w)).toContain('<em>morning</em>');
    expect(html(w)).toContain('<del>Anna</del>');
    expect(html(w)).toContain('<strong>you</strong>');
    expect(html(w)).toContain('<em>all</em>');
    expect(html(w)).toContain('<code class="tl-code">x*y*z</code>');
    expect(html(w)).toContain('<strong><em>both</em></strong>');
    expect(html(md('*a **b** c*'))).toContain('<em>a <strong>b</strong> c</em>');
  });

  it('leaves what only looks like a mark: snake_case, spaced stars, lone marks, escapes', () => {
    for (const s of ['file_name_here', '2 * 3 * 4', 'a * b', '**open', 'x__y__z']) {
      const w = md(s);
      expect([s, w.text(), w.root.querySelector('strong, em')]).toEqual([s, s, null]);
    }
    expect(md('\\*not italic\\*').text()).toBe('*not italic*');
  });

  it('never makes HTML of the text', () => {
    const w = md('<img src=x onerror=alert(1)> **<b>hi</b>**');
    expect(w.root.querySelector('img, b')).toBeNull();
    expect(w.text()).toBe('<img src=x onerror=alert(1)> <b>hi</b>');
  });

  it('on more lines: headings, lists and quotes a line each, empty lines kept', () => {
    const w = md('# Good morning\n## Sunday\n- Milk\n  - oat\n2. *Eggs*\n\n> Back at 5', { overflow: 'wrap' });
    const lines = [...w.root.querySelectorAll('.tl-text > .tl-line')].map(l => [l.tagName, l.className, l.textContent]);
    expect(lines).toEqual([
      ['DIV', 'tl-line tl-h tl-h1', 'Good morning'],
      ['DIV', 'tl-line tl-h tl-h2', 'Sunday'],
      ['DIV', 'tl-line tl-li', '•Milk'],
      ['DIV', 'tl-line tl-li', '•oat'],
      ['DIV', 'tl-line tl-li', '2.Eggs'],
      ['DIV', 'tl-line tl-p', '​'],
      ['DIV', 'tl-line tl-q', 'Back at 5'],
    ]);
    expect(w.root.querySelectorAll<HTMLElement>('.tl-li')[1].style.getPropertyValue('--tl-depth')).toBe('1');
    expect(w.root.querySelector('.tl-li em')!.textContent).toBe('Eggs');
  });

  it('on one line and on the Post-it: in the text, the line breaks between them', () => {
    const tile = md('# Hi\n- Milk\n**Eggs**');
    expect(tile.text()).toBe('Hi\n• Milk\nEggs');
    expect(tile.root.querySelector('.tl-h')!.tagName).toBe('SPAN');
    const note = md('## Hi\n- Milk', { style: 'postit' });
    expect(note.text()).toBe('Hi\n• Milk');
    expect(note.root.querySelector('.tl-h2')).not.toBeNull();
  });

  it("formats a Flow's text and the fallback message, never the widget's own messages", () => {
    expect(widget({ markdown: true }, { board: board('**Dinner** at 6') }).root.querySelector('strong')!.textContent).toBe('Dinner');
    const empty = widget({ markdown: true }, { board: board('') });
    expect(empty.text()).toBe('No message');
    expect(empty.root.querySelector('.tl-line')).toBeNull();
    const { w, text, root } = widget({ markdown: true });
    w.setState({ board: board('*Pizza*') });
    expect(text()).toBe('Pizza');
    expect(root.querySelector('em')).not.toBeNull();
  });

  it('parses lines for the dev pages', () => {
    expect(win.textLineMarkdown('### a #\n10) b').map((l: any) => [l.kind, l.level ?? l.mark])).toEqual([['h', 3], ['li', '10)']]);
  });
});
