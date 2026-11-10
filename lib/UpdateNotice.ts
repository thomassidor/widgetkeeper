import { existsSync, readFileSync } from 'node:fs';
import type Homey from 'homey';
import { SECRETS_FILE } from './secrets.js';

/** The app setting holding the version that last started, so the next start knows it was updated. */
export const LAST_VERSION_SETTING = 'lastVersion';

/** The settings page's Updates switch: `false` posts nothing (missing is on). */
export const TIMELINE_UPDATES_SETTING = 'timelineUpdates';

/**
 * The current feature release's Timeline line, one short sentence per language (the changelog entry is far too long
 * for the Timeline, and the CLI leaves `.homeychangelog.json` out of the build anyway). A test checks its version.
 */
const RELEASE_NOTES = new URL('./release-notes.json', import.meta.url);

type Changelog = Record<string, Record<string, string>>;

const parts = (version: string) => version.split('.').map(n => parseInt(n, 10) || 0);

/**
 * Whether going from `from` to `to` is a feature release worth a Timeline post: a newer major or minor version
 * (1.1.2 → 1.2.0, or → 1.2.1 when 1.2.0 was skipped), never a patch (1.2.0 → 1.2.1) or a downgrade.
 */
export function isFeatureUpdate(from: string, to: string): boolean {
  const [fa, fb] = parts(from);
  const [ta, tb] = parts(to);
  return ta > fa || (ta === fa && tb > fb);
}

/** The release's line in `lang` (English otherwise): the x.y.0 one, which says what came, else the version's own. */
export function noticeText(changelog: Changelog, version: string, lang: string): string | null {
  const [a, b] = parts(version);
  const entry = changelog[`${a}.${b}.0`] ?? changelog[version];
  const text = entry?.[lang] ?? entry?.en;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

function readChangelog(): Changelog {
  const { version, notes } = JSON.parse(readFileSync(RELEASE_NOTES, 'utf8'));
  return { [version]: notes };
}

/**
 * Whether the app ran on this Homey before (some app setting, or the secrets file 1.1.0 on writes), read before any
 * service has started, so a fresh install isn't greeted with a changelog.
 */
export function ranBefore(homey: Homey.App['homey'], secretsFile = SECRETS_FILE): boolean {
  if (homey.settings.getKeys().length > 0) return true;
  try {
    return existsSync(secretsFile);
  } catch {
    return false;
  }
}

/**
 * After an update to a new major or minor version, posts what's new to Homey's Timeline, once; patch releases and
 * fresh installs post nothing, nor anything with the settings page's Updates switch off. A start without `lastVersion` that ran before was updated from a version older than
 * this notice (1.2.0). The version is kept only once the post went out (or wasn't due), so a failed one is tried on
 * the next start. Never throws.
 */
export async function postUpdateNotice(homey: Homey.App['homey'], log: (...args: any[]) => void, opts: {
  ranBefore: boolean,
  changelog?: () => Changelog,
}): Promise<void> {
  try {
    const version = String(homey.manifest?.version ?? '');
    if (!version) return;
    const last = homey.settings.get(LAST_VERSION_SETTING);
    if (last === version) return;
    const due = (typeof last === 'string' ? isFeatureUpdate(last, version) : opts.ranBefore)
      && homey.settings.get(TIMELINE_UPDATES_SETTING) !== false;
    if (due) {
      let text: string | null = null;
      try {
        text = noticeText((opts.changelog ?? readChangelog)(), version, homey.i18n.getLanguage());
      } catch (err) {
        log('The changelog could not be read for the Timeline:', err);
      }
      const excerpt = `**Widgetkeeper ${version}**${text ? `: ${text}` : ''}`;
      await homey.notifications.createNotification({ excerpt });
      log(`Posted the ${version} update to the Timeline`);
    }
    homey.settings.set(LAST_VERSION_SETTING, version);
  } catch (err) {
    log('The update could not be posted to the Timeline:', err);
  }
}
