import { readdirSync, readFileSync } from 'node:fs';

/**
 * The web dashboards page's whole script: settings/dashboard.js and its parts (settings/dashboard-<part>.js), in
 * the order the page loads them, joined. The page is one closure split over files, so tests read helpers out of it.
 */
export function webPageSource(): string {
  const core = readFileSync('settings/dashboard.js', 'utf8');
  const order = (core.match(/const PARTS = \[([^\]]*)\]/)?.[1] ?? '').match(/'[a-z]+'/g)?.map(s => s.slice(1, -1)) ?? [];
  const files = ['dashboard-layout.js', 'dashboard.js', ...order.map(n => `dashboard-${n}.js`)];
  const all = readdirSync('settings').filter(f => /^dashboard.*\.js$/.test(f));
  for (const f of all) if (!files.includes(f)) files.push(f); // a part not in PARTS still gets read (a test then fails on it)
  return files.map(f => readFileSync(`settings/${f}`, 'utf8')).join('\n').replace(/\r\n/g, '\n');
}
