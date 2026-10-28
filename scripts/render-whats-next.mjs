// Renders a release's teaser, what's next in <version> (docs/whats-next-<version>.png), from dev/whats-next-<version>.html
// with headless Edge, at 2x: 1.1.0's (its wide widgets panel shows docs/web/wide.png, `npm run web-showcase -- wide`) or
// 1.2.0's (its live preview panel shows docs/web/preview.png, `npm run web-showcase -- preview`). 1.1.0's page fetches
// the popup's picture, which a file:// page can't, so the repo root is served while a teaser renders (headless.mjs's
// withServer()).
// Usage: `npm run whats-next [-- 1.1.0]` (default: the latest, 1.2.0).
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { downloadIcons, edge, withServer } from './headless.mjs';

const SCALE = 2;
/** Each teaser and the web showcase view its page shows. */
const TEASERS = { '1.1.0': 'wide', '1.2.0': 'preview' };
const version = process.argv[2] || '1.2.0';
if (!TEASERS[version]) throw new Error(`No teaser for ${version} (${Object.keys(TEASERS).join(', ')})`);
const web = `docs/web/${TEASERS[version]}.png`;

if (!existsSync(web)) throw new Error(`Render ${web} first: npm run web-showcase -- ${TEASERS[version]}`);
await downloadIcons();
mkdirSync('docs', { recursive: true });
await withServer(async (origin) => {
  const url = `${origin}/dev/whats-next-${version}.html`;
  // First pass: the page reports its size and its columns' heights.
  const dom = edge(['--window-size=1760,3000', '--dump-dom', url]);
  const width = Number(/data-width="(\d+)"/.exec(dom)?.[1]);
  const height = Number(/data-height="(\d+)"/.exec(dom)?.[1]);
  if (!width || !height) throw new Error('No size for the poster');
  const out = `docs/whats-next-${version}.png`;
  edge([`--window-size=${width},${height}`, `--force-device-scale-factor=${SCALE}`, `--screenshot=${resolve(out)}`, url]);
  console.log('wrote', out, `(${width}×${height} @${SCALE}x; columns ${/data-columns="([^"]*)"/.exec(dom)?.[1]} px)`);
});
