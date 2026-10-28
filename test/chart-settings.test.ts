/* The chart widgets' settings come from one catalog (scripts/chart-settings.json, `npm run chart-settings`). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeFiles, readCatalog } from '../scripts/chart-settings.mjs';

describe('chart settings', () => {
  it.each(composeFiles().map(f => [f.path, f.text]))("%s has the catalog's settings (run npm run chart-settings)", (path, text) => {
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(text);
  });

  it('uses every setting and hint in the catalog', () => {
    const catalog = readCatalog();
    const used = new Set<string>(), hints = new Set<string>();
    for (const list of Object.values<any[]>(catalog.widgets)) {
      for (const entry of list) {
        const e = typeof entry === 'string' ? { use: entry } : entry;
        used.add(e.use.split(':')[0]);
        if (e.hint) hints.add(e.hint);
      }
    }
    expect(Object.keys(catalog.settings).filter(k => !used.has(k))).toEqual([]);
    expect(Object.keys(catalog.hints).filter(k => !hints.has(k))).toEqual([]);
  });
});
