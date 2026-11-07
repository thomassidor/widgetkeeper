import { describe, expect, it } from 'vitest';
import { advisories, auditResult } from '../scripts/audit-check.mjs';
import { latestRun, releaseProblems } from '../scripts/release-check.mjs';

const VERSIONS = { 'package.json': '1.3.0', 'app.json': '1.3.0', '.homeycompose/app.json': '1.3.0' };
const GREEN = { status: 'completed', conclusion: 'success' };
const READY = { dirty: [], pushed: true, versions: VERSIONS, ci: GREEN };

describe('release check', () => {
  it('passes a clean, pushed commit with green CI', () => {
    expect(releaseProblems(READY)).toEqual([]);
  });

  it.each([
    ['uncommitted changes', { dirty: [' M lib/a.ts'] }, /Uncommitted changes \(1\).*lib\/a\.ts/],
    ['an unpushed commit', { pushed: false }, /not pushed/],
    ['differing versions', { versions: { ...VERSIONS, 'app.json': '1.2.1' } }, /app\.json 1\.2\.1/],
    ['no CI run', { ci: undefined }, /no `test` run/],
    ['CI still running', { ci: { status: 'in_progress', conclusion: null } }, /still running/],
    ['failed CI', { ci: { status: 'completed', conclusion: 'failure', html_url: 'u' } }, /failure.*u/],
  ])('refuses %s', (_what, facts, message) => {
    const problems = releaseProblems({ ...READY, ...facts });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });

  it('counts only the newest run of the CI job', () => {
    const runs = [
      { name: 'test', conclusion: 'failure', started_at: '2026-11-07T10:00:00Z' },
      { name: 'test', conclusion: 'success', started_at: '2026-11-07T11:00:00Z' },
      { name: 'analyze', conclusion: 'failure', started_at: '2026-11-07T12:00:00Z' },
    ];
    expect(latestRun(runs)?.conclusion).toBe('success');
    expect(latestRun([{ name: 'analyze' }])).toBeUndefined();
  });
});

describe('audit check', () => {
  const report = {
    vulnerabilities: {
      parseuri: { via: [{ source: 1, title: 'ReDoS', severity: 'moderate', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] },
      'socket.io-client': { via: ['parseuri'] },
      other: { via: [{ source: 2, title: 'Bad', severity: 'high', url: 'https://github.com/advisories/GHSA-dddd-eeee-ffff' }] },
    },
  };

  it('finds advisories at their source, not the packages that only depend on them', () => {
    expect(advisories(report).map(a => a.package)).toEqual(['parseuri', 'other']);
  });

  it('fails on what is not accepted, and names acceptances no longer needed', () => {
    const { fresh, stale } = auditResult(report, { 'GHSA-aaaa-bbbb-cccc': {}, 'GHSA-gone-gone-gone': {} });
    expect(fresh.map(a => a.id)).toEqual(['GHSA-dddd-eeee-ffff']);
    expect(stale).toEqual(['GHSA-gone-gone-gone']);
  });

  it('has nothing to report without vulnerabilities', () => {
    expect(auditResult({}, {})).toEqual({ fresh: [], stale: [] });
  });
});
