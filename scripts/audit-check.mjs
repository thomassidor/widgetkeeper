// `npm run audit`: `npm audit`, failing only on advisories not accepted in .github/audit-accepted.json, each with its reason.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Every advisory in an `npm audit --json` report, by its GHSA id. Entries that only point at another package are left out. */
export function advisories(report) {
  const found = new Map();
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object') continue;
      const id = /GHSA-[\w-]+/.exec(via.url ?? '')?.[0] ?? String(via.source);
      found.set(id, { id, package: name, severity: via.severity, title: via.title, url: via.url });
    }
  }
  return [...found.values()];
}

/** What needs looking at: `fresh` advisories nobody has accepted, and `stale` acceptances no longer needed. */
export function auditResult(report, accepted) {
  const found = advisories(report);
  return {
    fresh: found.filter(a => !Object.hasOwn(accepted, a.id)),
    stale: Object.keys(accepted).filter(id => !found.some(a => a.id === id)),
  };
}

function main() {
  // npm audit exits 1 whenever it finds anything, so its answer is read from the JSON. The shell is for npm.cmd on Windows.
  const run = spawnSync('npm audit --json', { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(run.stdout);
  if (report.error) throw new Error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  const accepted = JSON.parse(readFileSync(new URL('../.github/audit-accepted.json', import.meta.url), 'utf8'));
  const { fresh, stale } = auditResult(report, accepted);
  for (const id of stale) console.log(`No longer found, remove from .github/audit-accepted.json: ${id}`);
  if (!fresh.length) {
    console.log(`npm audit: nothing new (${Object.keys(accepted).length - stale.length} accepted in .github/audit-accepted.json).`);
    return;
  }
  for (const a of fresh) console.error(`${a.severity}: ${a.package}: ${a.title} ${a.url ?? ''}`);
  console.error(`\n${fresh.length} new advisories: update the package, or accept with a reason in .github/audit-accepted.json.`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
