// Renders the web dashboards showcase (docs/web/<view>.png) from dev/web-showcase.html with headless Edge: the web
// dashboards page with the made-up home's widgets, in a drawn browser window, at 2x on a transparent background.
// Usage: `npm run web-showcase [-- dashboard front editor settings preview light wide popup]` (default: all eight).
// The page fetches /app.json and /locales/en.json, which a file:// page can't, so the repo root is served over HTTP
// on 127.0.0.1 while it renders (headless.mjs's withServer()).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { downloadIcons, edge, withServer } from './headless.mjs';

const VIEWS = ['dashboard', 'front', 'editor', 'settings', 'preview', 'light', 'wide', 'popup'];
const SCALE = 2;
const only = process.argv.slice(2);
const bad = only.filter(v => !VIEWS.includes(v));
if (bad.length) throw new Error(`Unknown view: ${bad.join(', ')} (${VIEWS.join(', ')})`);

await downloadIcons();
mkdirSync('docs/web', { recursive: true });

await withServer(async (origin) => {
  for (const view of only.length ? only : VIEWS) {
    const url = `${origin}/dev/web-showcase.html?v=${view}`;
    // First pass: the page reports its size.
    const dom = edge(['--window-size=1600,1100', '--dump-dom', url]);
    const width = Number(/data-width="(\d+)"/.exec(dom)?.[1]);
    const height = Number(/data-height="(\d+)"/.exec(dom)?.[1]);
    if (!width || !height) throw new Error(`No size for ${view}`);
    const out = `docs/web/${view}.png`;
    edge([`--window-size=${width},${height}`, `--force-device-scale-factor=${SCALE}`, '--default-background-color=00000000', `--screenshot=${resolve(out)}`, url]);
    console.log('wrote', out, `(${width}×${height} @${SCALE}x)`);
  }
});
