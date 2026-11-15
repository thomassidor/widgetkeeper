// `npm run publish-app`: `homey app publish` once the release check passes, with the CLI's own HOMEY_HEADLESS=1
// (node_modules/homey/lib/App.js), so it asks nothing: no version bump (the version is set in the three manifests
// beforehand), no "uncommitted changes" or guidelines question, and a missing .homeychangelog.json entry fails
// instead of prompting. Its prompts hung a non-interactive session (1.3.0 and 1.3.1). Works the same on Windows.
import { spawnSync } from 'node:child_process';

const run = (args, env) =>
  spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

const check = run(['scripts/release-check.mjs']);
if (check !== 0) process.exit(check);
process.exit(run(['node_modules/homey/bin/homey.mjs', 'app', 'publish'], { HOMEY_HEADLESS: '1' }));
