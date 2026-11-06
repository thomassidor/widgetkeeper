import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Homey lists an app's widgets in app.json's order. Homey compose fills app.json's `widgets` from the
// folders (by id, which looked random by name), but keeps the order of the keys already in
// .homeycompose/app.json, so that file lists every widget id, empty, in the README's order: by English name.
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const ids = readdirSync('widgets', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const name = (id: string): string => readJson(`widgets/${id}/widget.compose.json`).name.en;
const byName = [...ids].sort((a, b) => name(a).localeCompare(name(b), 'en'));

describe('widget order', () => {
  it('.homeycompose/app.json lists every widget by English name, with nothing in it', () => {
    const widgets = readJson('.homeycompose/app.json').widgets;
    expect(Object.keys(widgets)).toEqual(byName);
    for (const id of byName) expect(widgets[id]).toEqual({});
  });

  it('app.json follows it', () => {
    expect(Object.keys(readJson('app.json').widgets)).toEqual(byName);
  });

  it('the README lists the widgets in the same order', () => {
    const readme = readFileSync('README.md', 'utf8');
    const listed = [...readme.matchAll(/<a href="[^"]+"><b>([^<]+)<\/b><\/a>/g)].map(m => m[1].replace(/&amp;/g, '&'));
    expect(listed).toEqual(byName.map(name));
  });
});
