import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi, fakeHomey } from './helpers/fakeHomey.js';
import { isFeatureUpdate, LAST_VERSION_SETTING, noticeText, postUpdateNotice, ranBefore } from '../lib/UpdateNotice.js';

const CHANGELOG = {
  '1.2.0': { en: 'Nine new chart widgets.', da: 'Ni nye grafwidgets.' },
  '1.2.1': { en: 'A fix.' },
};

function homeyAt(version: string, last?: string) {
  const homey = fakeHomey(fakeApi());
  homey.manifest.version = version;
  if (last) homey.settings.set(LAST_VERSION_SETTING, last);
  return homey;
}

const post = (homey: any, ranBeforeIt = true) => postUpdateNotice(homey, () => {}, { ranBefore: ranBeforeIt, changelog: () => CHANGELOG });
const excerpts = (homey: any) => homey.notifications.createNotification.mock.calls.map((c: any[]) => c[0].excerpt);

describe('the update notice on the Timeline', () => {
  it('counts a new major or minor version, not a patch or a downgrade', () => {
    expect(isFeatureUpdate('1.1.2', '1.2.0')).toBe(true);
    expect(isFeatureUpdate('1.1.2', '1.2.1')).toBe(true);
    expect(isFeatureUpdate('1.9.0', '2.0.0')).toBe(true);
    expect(isFeatureUpdate('1.2.0', '1.2.1')).toBe(false);
    expect(isFeatureUpdate('1.2.0', '1.2.0')).toBe(false);
    expect(isFeatureUpdate('1.2.0', '1.1.2')).toBe(false);
    expect(isFeatureUpdate('2.0.0', '1.9.0')).toBe(false);
  });

  it("takes the x.y.0 release's text in the Homey's language, else English", () => {
    expect(noticeText(CHANGELOG, '1.2.0', 'da')).toBe('Ni nye grafwidgets.');
    expect(noticeText(CHANGELOG, '1.2.1', 'de')).toBe('Nine new chart widgets.');
    expect(noticeText(CHANGELOG, '3.0.0', 'en')).toBeNull();
  });

  it('posts once after a feature update, and keeps the version', async () => {
    const homey = homeyAt('1.2.0', '1.1.2');
    await post(homey);
    expect(excerpts(homey)).toEqual(['**Widgetkeeper 1.2.0**: Nine new chart widgets.']);
    expect(homey.settings.get(LAST_VERSION_SETTING)).toBe('1.2.0');
    await post(homey);
    expect(excerpts(homey)).toHaveLength(1);
  });

  it('posts nothing for a patch release, but keeps its version', async () => {
    const homey = homeyAt('1.2.1', '1.2.0');
    await post(homey);
    expect(excerpts(homey)).toEqual([]);
    expect(homey.settings.get(LAST_VERSION_SETTING)).toBe('1.2.1');
  });

  it('posts for an update from a version before the notice, but not on a fresh install', async () => {
    const updated = homeyAt('1.2.0');
    await post(updated, true);
    expect(excerpts(updated)).toHaveLength(1);
    const fresh = homeyAt('1.2.0');
    await post(fresh, false);
    expect(excerpts(fresh)).toEqual([]);
    expect(fresh.settings.get(LAST_VERSION_SETTING)).toBe('1.2.0');
  });

  it('tells a fresh install by its empty settings and missing secrets file', () => {
    const homey = homeyAt('1.2.0');
    expect(ranBefore(homey, '/nowhere/secrets.json')).toBe(false);
    homey.settings.set('deviceNames', { mode: 'full' });
    expect(ranBefore(homey, '/nowhere/secrets.json')).toBe(true);
  });

  it('tries again on the next start when the post fails, and never throws', async () => {
    const homey = homeyAt('1.2.0', '1.1.2');
    homey.notifications.createNotification = vi.fn(async () => { throw new Error('busy'); });
    await expect(post(homey)).resolves.toBeUndefined();
    expect(homey.settings.get(LAST_VERSION_SETTING)).toBe('1.1.2');
  });

  it('posts just the version when the changelog has no text for it', async () => {
    const homey = homeyAt('3.0.0', '2.4.1');
    await post(homey);
    expect(excerpts(homey)).toEqual(['**Widgetkeeper 3.0.0**']);
  });

  it("ships the current feature release's changelog entry (copy it into lib/release-notes.json on a new x.y.0)", () => {
    const [major, minor] = JSON.parse(readFileSync('.homeycompose/app.json', 'utf8')).version.split('.');
    const release = `${major}.${minor}.0`;
    const shipped = JSON.parse(readFileSync('lib/release-notes.json', 'utf8'));
    expect(shipped.version).toBe(release);
    expect(shipped.notes).toEqual(JSON.parse(readFileSync('.homeychangelog.json', 'utf8'))[release]);
  });

  it("reads the release notes it ships", async () => {
    const homey = homeyAt('1.2.0', '1.1.2');
    await postUpdateNotice(homey, () => {}, { ranBefore: true });
    expect(excerpts(homey)[0]).toMatch(/^\*\*Widgetkeeper 1\.2\.0\*\*: Nine new chart widgets/);
  });
});
