// Renders the widget pages' Looks (docs/variants/<id>-<key>.webp) from dev/variants.html with headless Edge, and writes
// each page's section (docs/widgets/<id>.md) from the same list (dev/variants.js), so the images and their alt text agree.
// Usage: `npm run variants [-- lights lights:vivid …]` (a widget's id, or one image of it).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { downloadIcons, edge, withServer } from './headless.mjs';
import { progress } from './progress.mjs';

const WIDTH = 390;
const SCALE = 2;
const WINDOW = 1500; // tall enough for every variant; a taller one throws rather than be cut off
const SHOWN_AT = 300; // px on the page: three to a row on a computer, one on a phone

/** The bottom of the page's panel: the last row with anything on it (the page is transparent below). */
async function panelHeight(png) {
  const { data, info } = await sharp(png).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  for (let y = info.height - 1; y >= 0; y--) {
    if (data[y * info.width + Math.floor(info.width / 2)] > 0) return y + 1;
  }
  throw new Error('An empty render');
}

/** A page's Looks, in place of the last one, above its bottom link. */
export function withLooks(page, id, name, variants) {
  const images = variants.map(v => `<img src="../variants/${id}-${v.key}.webp" alt="${name}: ${v.label}" width="${SHOWN_AT}" align="top">`).join('\n');
  const section = `## Looks\n\n<p>\n${images}\n</p>\n\n`;
  const without = page.replace(/## Looks\n[\s\S]*?(?=---\n\[← All widgets\])/, '');
  const at = without.lastIndexOf('---\n[← All widgets]');
  if (at < 0) throw new Error(`No bottom link on ${id}'s page`);
  return without.slice(0, at) + section + without.slice(at);
}

const only = process.argv.slice(2);
await downloadIcons();
mkdirSync('docs/variants', { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'wk-variants-'));
try {
  await withServer(async (origin) => {
    const dom = edge(['--window-size=800,800', '--dump-dom', `${origin}/dev/variants.html`]);
    const all = JSON.parse(decodeURIComponent(/data-variants="([^"]+)"/.exec(dom)?.[1] || '[]'));
    if (!all.length) throw new Error('No variants on the page');
    const picked = all.filter(v => !only.length || only.includes(v.id) || only.includes(`${v.id}:${v.key}`));
    const wrote = progress(picked.length);
    for (const v of picked) {
      const png = join(temp, 'shot.png');
      edge([`--window-size=${WIDTH},${WINDOW}`, `--force-device-scale-factor=${SCALE}`, '--default-background-color=00000000',
        `--screenshot=${png}`, `${origin}/dev/variants.html?w=${v.id}&v=${v.key}${v.light ? '&mode=light' : ''}`]);
      const height = await panelHeight(png);
      if (height >= WINDOW * SCALE) throw new Error(`${v.id}:${v.key} runs past the window`);
      const out = `docs/variants/${v.id}-${v.key}.webp`;
      await sharp(png).extract({ left: 0, top: 0, width: WIDTH * SCALE, height }).webp({ quality: 88, effort: 6 }).toFile(resolve(out));
      wrote(out, `(${WIDTH}×${height / SCALE} @${SCALE}x)`);
    }
    for (const id of new Set(picked.map(v => v.id))) {
      const file = `docs/widgets/${id}.md`;
      const page = readFileSync(file, 'utf8');
      const name = /^# (.+)$/m.exec(page)?.[1] || id;
      writeFileSync(file, withLooks(page, id, name, all.filter(v => v.id === id)));
    }
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
