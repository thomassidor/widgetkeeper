// `npm run release-check` (and first in `npm run publish-app`): is this commit fit to upload as a build? It only reads.
// `npx homey app publish` itself checks none of this; it stays the way past a check that can't answer, such as GitHub being down.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPO = 'thomassidor/widgetkeeper';
const CI_JOB = 'test'; // .github/workflows/ci.yml

/** Why these facts rule out a release; empty when they don't. `ci`: the CI job's check run on the commit, if any. */
export function releaseProblems({ dirty, pushed, versions, ci }) {
  const problems = [];
  if (dirty.length) problems.push(`Uncommitted changes (${dirty.length}), which the build would include: ${dirty.slice(0, 5).join(', ')}`);
  if (!pushed) problems.push('This commit is not pushed, so CI has not tested it.');
  if (new Set(Object.values(versions)).size > 1) {
    problems.push(`The versions differ: ${Object.entries(versions).map(([file, v]) => `${file} ${v}`).join(', ')}`);
  }
  if (!ci) problems.push(`CI has no \`${CI_JOB}\` run on this commit.`);
  else if (ci.status !== 'completed') problems.push(`CI's \`${CI_JOB}\` is still running on this commit.`);
  else if (ci.conclusion !== 'success') problems.push(`CI's \`${CI_JOB}\` ended in ${ci.conclusion} on this commit: ${ci.html_url}`);
  return problems;
}

/** The newest run of the job on a commit: an older failure that was re-run doesn't count. */
export function latestRun(checkRuns, name = CI_JOB) {
  return checkRuns
    .filter(run => run.name === name)
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const version = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).version;

async function main() {
  const sha = git('rev-parse', 'HEAD');
  // Public repo, so no login: the PC and the build box alike. Sent without any user details.
  const answer = await fetch(`https://api.github.com/repos/${REPO}/commits/${sha}/check-runs?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'widgetkeeper-release-check' },
  });
  if (!answer.ok) throw new Error(`GitHub answered ${answer.status} when asked for CI's result`);
  const problems = releaseProblems({
    dirty: git('status', '--porcelain').split('\n').filter(Boolean),
    pushed: git('branch', '-r', '--contains', sha) !== '',
    versions: Object.fromEntries(['package.json', 'app.json', '.homeycompose/app.json'].map(file => [file, version(file)])),
    ci: latestRun((await answer.json()).check_runs),
  });
  if (!problems.length) {
    console.log(`Ready to publish ${version('app.json')} from ${sha.slice(0, 7)}: clean, pushed, CI green.`);
    return;
  }
  console.error(`Not ready to publish ${sha.slice(0, 7)}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
