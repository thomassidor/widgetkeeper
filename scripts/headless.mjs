// Shared by the render scripts: headless Edge, the repo served over HTTP, and the Homey library icons the mock devices use.
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The browser: Edge's default install path, or `EDGE` from the environment. */
export const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
/** The flags every render runs Edge with. */
export const HEADLESS = ['--headless=new', '--disable-gpu', '--hide-scrollbars'];

/** A fresh, empty browser profile (a temp directory; remove it when done). A fresh profile avoids stale cached files. */
export function freshProfile() {
  return mkdtempSync(join(tmpdir(), 'wk-render-'));
}

/**
 * Runs headless Edge with the given arguments (in a fresh profile) and returns its stdout. `virtualTime` is the
 * `--virtual-time-budget` in ms (the page's timers run that far before a screenshot or DOM dump), or null for none.
 */
export function edge(args, { virtualTime = 4000 } = {}) {
  const profile = freshProfile();
  try {
    const budget = virtualTime == null ? [] : [`--virtual-time-budget=${virtualTime}`];
    return execFileSync(EDGE, [...HEADLESS, ...budget, `--user-data-dir=${profile}`, ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

/**
 * Runs `fn(origin)` while the repo root is served on 127.0.0.1 (`origin` is `http://127.0.0.1:<port>`), for pages that
 * fetch files (the locales, a camera's picture) or show a page in the Web Page widget, which a file:// page can't. The
 * server is a child process (this file with `--serve`), since edge() blocks this one.
 */
export async function withServer(fn) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((done, fail) => {
    child.stdout.on('data', (b) => { const m = /PORT (\d+)/.exec(String(b)); if (m) done(Number(m[1])); });
    child.on('exit', () => fail(new Error('The server stopped')));
  });
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--serve') {
  // The child: serve the repo root on a free port and print it.
  const root = resolve('.');
  const server = createServer((req, res) => {
    const path = resolve(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let file = path;
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => console.log(`PORT ${server.address().port}`));
}

// Homey's icon library, as the Homey app shows device icons. Not committed: fetched into temp/ (gitignored).
const ICONS = ['climate', 'christmas-lights', 'lock', 'light-standing', 'speaker', 'light-hanging', 'smoke-detector', 'air-purifier',
  'washing-machine', 'door', 'motion-sensor', 'light-spot', 'light-table', 'light-outdoor', 'coffee-machine', 'tv', 'inverter',
  'car-charger', 'dryer', 'socket', 'fridge', 'kettle', 'oven', 'garage-door', 'doorbell', 'router', 'thermostat'];

/**
 * Downloads the icons into temp/screenshot-icons.js (`window.ICONS`), which the dev pages load. When my.homey.app
 * can't be reached (offline, or a network that blocks it) it warns and keeps the icons fetched before, or writes
 * none, so the render goes on without them.
 */
export async function downloadIcons() {
  const file = 'temp/screenshot-icons.js';
  const icons = {};
  for (const name of ICONS) {
    let res;
    try {
      res = await fetch(`https://my.homey.app/img/devices/${name}.svg`);
    } catch (err) {
      const kept = existsSync(file);
      console.warn(`Homey's icon library (my.homey.app) can't be reached (${err.cause?.code || err.message}): `
        + (kept ? `keeping the icons in ${file}.` : 'rendering without device icons.'));
      if (kept) return;
      break;
    }
    if (!res.ok) { console.warn(`icon ${name}: HTTP ${res.status}`); continue; }
    icons[name] = `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString('base64')}`;
  }
  mkdirSync('temp', { recursive: true });
  writeFileSync(file, `window.ICONS = ${JSON.stringify(icons)};\n`);
}
