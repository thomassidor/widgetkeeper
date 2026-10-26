import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type Homey from 'homey';

/**
 * Where the secrets live: the app's own `/userdata` folder. App settings won't do: Homey's API hands them to any
 * session with `homey.app.control` (`getAppSettings`, `setAppSetting`), the *Apps → Control* box of a personal API key,
 * so such a key could have read the stored key or cleared the web password. No API serves `/userdata`.
 */
export const SECRETS_FILE = '/userdata/secrets.json';

/** The app settings that held secrets before they moved here: moved over once, then unset. */
export const MOVED_SETTINGS = ['variablesApiKey', 'webPassword', 'webSessions'] as const;

/** Kept in the file once the settings have been moved: from then on a setting of those names is only unset, never taken. */
export const MOVED_MARK = 'settingsMoved';

/** How often a file that couldn't be read is tried again (on the next use). */
const RETRY_MS = 5e3;

/**
 * How the secrets are read and written: the file on the Homey, memory in the tests. `read()` throws when the file is
 * there but can't be read; `keep()` puts a damaged one's text aside.
 */
export type SecretStorage = { read(): string | null, write(text: string): void, keep?(text: string): void };

export function fileStorage(file: string): SecretStorage {
  return {
    read() {
      try {
        return readFileSync(file, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw err;
      }
    },
    write(text) {
      // A new file, then a rename: a crash mid-write never leaves half a file.
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
      renameSync(tmp, file);
    },
    keep(text) {
      // Beside it, for a person to look into (the next damaged one replaces it).
      writeFileSync(`${file}.damaged`, text, { encoding: 'utf8', mode: 0o600 });
    },
  };
}

const why = (err: unknown) => String((err as any)?.message ?? err);

const shared = new WeakMap<object, Secrets>();

/**
 * The app's secrets (the personal API key, the web dashboards' password hash and sessions, the Keypad's codes), one
 * JSON object kept in memory and written whole on every change. Read and written synchronously, like `homey.settings`.
 * A file that can't be read is never written over: while a read fails (the file is there, but busy or broken on
 * disk), every secret reads as missing, each use after `RETRY_MS` reads it again, and a change throws; a damaged one
 * (not a JSON object) is put aside (`keep()`) and the secrets start afresh.
 */
export default class Secrets {

  /** The app's one instance; the first call picks the storage (the tests pass memory). */
  static for(homey: Homey.App['homey'], log: (...args: any[]) => void = () => {}, storage?: SecretStorage): Secrets {
    let secrets = shared.get(homey);
    if (!secrets) {
      secrets = new Secrets(homey, log, storage ?? fileStorage(SECRETS_FILE));
      shared.set(homey, secrets);
    }
    return secrets;
  }

  private values: Record<string, unknown> = {};
  /** Why the file couldn't be read, while it can't; null once it's read. */
  private unreadable: string | null = null;
  private triedAt = 0;

  constructor(
    private homey: Homey.App['homey'],
    private log: (...args: any[]) => void,
    private storage: SecretStorage,
  ) {
    if (this.load()) this.moveSettings();
  }

  get(key: string): unknown {
    this.retry();
    return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
  }

  set(key: string, value: unknown) {
    this.writable();
    this.values[key] = JSON.parse(JSON.stringify(value));
    this.save();
  }

  unset(key: string) {
    this.writable();
    if (!Object.prototype.hasOwnProperty.call(this.values, key)) return;
    delete this.values[key];
    this.save();
  }

  private save() {
    this.storage.write(JSON.stringify(this.values));
  }

  /**
   * Reads the file: true once it's read (none yet is empty; a damaged one is put aside), false while it can't be. A
   * file is only ever written with `MOVED_MARK`, so a damaged one had it: the settings are then only unset.
   */
  private load(): boolean {
    this.triedAt = Date.now();
    let text: string | null;
    try {
      text = this.storage.read();
    } catch (err) {
      if (this.unreadable === null) this.log('The secrets file could not be read; it is not written until it can be:', why(err));
      this.unreadable = why(err);
      return false;
    }
    if (this.unreadable !== null) this.log('The secrets file can be read again');
    this.unreadable = null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not a JSON object');
    } catch (err) {
      this.log('The secrets file could not be read:', why(err));
      try {
        this.storage.keep?.(text ?? '');
        this.log('The damaged secrets file was put aside');
      } catch (keepErr) {
        this.log('The damaged secrets file could not be put aside:', why(keepErr));
      }
      this.values = { [MOVED_MARK]: true };
      return true;
    }
    this.values = parsed as Record<string, unknown>;
    return true;
  }

  /** While the file couldn't be read: reads it again, at most every `RETRY_MS`, then moves the settings as at a start. */
  private retry() {
    if (this.unreadable === null || Date.now() - this.triedAt < RETRY_MS) return;
    if (this.load()) this.moveSettings();
  }

  /** Throws while the file can't be read: the secrets in memory would replace the ones it holds. */
  private writable() {
    this.retry();
    if (this.unreadable !== null) throw new Error(`The secrets file can't be read just now, so it isn't written (${this.unreadable})`);
  }

  /**
   * Moves what older versions kept in the app settings, once (`MOVED_MARK`): after that a setting of those names was
   * written by someone else (an *Apps → Control* key may write the settings), so it's only unset, even where the file
   * has none (a removed key or password). A setting is unset only once the file holds it, so a failed write loses
   * nothing. One the file already has is just unset. Only once the file has been read (`load()`): while it can't be,
   * the settings are left as they are.
   */
  private moveSettings() {
    const found = MOVED_SETTINGS.filter(key => this.homey.settings.get(key) !== null && this.homey.settings.get(key) !== undefined);
    if (this.values[MOVED_MARK] === true) {
      for (const key of found) this.homey.settings.unset(key);
      if (found.length) this.log(`Ignored and unset ${found.join(', ')} in the app settings (written after the move)`);
      return;
    }
    for (const key of found) {
      if (Object.prototype.hasOwnProperty.call(this.values, key)) continue;
      this.values[key] = this.homey.settings.get(key);
    }
    this.values[MOVED_MARK] = true;
    try {
      this.save();
    } catch (err) {
      this.log('The secrets could not be moved out of the app settings:', why(err));
      return;
    }
    for (const key of found) this.homey.settings.unset(key);
    if (found.length) this.log(`Moved ${found.join(', ')} out of the app settings`);
  }
}
