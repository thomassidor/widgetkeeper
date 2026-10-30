#!/usr/bin/env node
/*
 * The chart widgets' settings (Chart · History, Chart · Totals and the other `Chart · …` widgets) from one catalog,
 * scripts/chart-settings.json, so a setting they share is written once, in all 13 languages, and reads the same in each.
 * `settings` holds each setting as Homey's manifest has it, `{n}` in its id and texts for a numbered group's (`chart{n}`,
 * `Chart {n}: device value`); `widgets` lists each widget's, in order: `"<setting>"` or `"<setting>:<n>"`, or an object
 * `{use, value, hint, top}` that changes the default, takes another hint from `hints` (null: none) or, with `top`, uses
 * a group's row (`  – Title`, CLAUDE.md *Widget settings*) on its own, without the indent.
 * `npm run chart-settings` writes each widget's list into its widget.compose.json; test/chart-settings.test.ts checks
 * they agree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
/** A group's row: two em spaces (U+2003) and a dash. */
const ROW = /^  – /;

export function readCatalog() {
  return JSON.parse(readFileSync(new URL('scripts/chart-settings.json', ROOT), 'utf8'));
}

const fill = (v, n) => (typeof v === 'string' ? v.replaceAll('{n}', n) : v);

/** A widget's settings, as its widget.compose.json has them. */
export function chartSettings(widget, catalog = readCatalog()) {
  const list = catalog.widgets[widget];
  if (!list) throw new Error(`No chart settings for ${widget}`);
  return list.map((entry) => {
    const { use, ...change } = typeof entry === 'string' ? { use: entry } : entry;
    const [key, n = ''] = use.split(':');
    const template = catalog.settings[key];
    if (!template) throw new Error(`${widget}: no setting ${key}`);
    const setting = JSON.parse(JSON.stringify(template));
    setting.id = fill(setting.id, n);
    for (const part of ['title', 'hint']) {
      for (const lang of Object.keys(setting[part] || {})) {
        setting[part][lang] = fill(setting[part][lang], n);
        if (part === 'title' && change.top) setting[part][lang] = setting[part][lang].replace(ROW, '');
      }
    }
    if ('value' in change) setting.value = change.value;
    if ('hint' in change) {
      if (change.hint == null) delete setting.hint;
      else if (!catalog.hints[change.hint]) throw new Error(`${widget}: no hint ${change.hint}`);
      else {
        // In its place after the title, as Homey's manifests have it.
        const hint = JSON.parse(JSON.stringify(catalog.hints[change.hint]));
        return Object.fromEntries(Object.entries(setting)
          .flatMap(([k, v]) => (k === 'hint' ? [] : k === 'title' ? [[k, v], ['hint', hint]] : [[k, v]])));
      }
    }
    return setting;
  });
}

/** Each chart widget's widget.compose.json with its settings from the catalog: `{path, text}`. */
export function composeFiles(catalog = readCatalog()) {
  return Object.keys(catalog.widgets).map((widget) => {
    const path = `widgets/${widget}/widget.compose.json`;
    const compose = JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
    compose.settings = chartSettings(widget, catalog);
    return { path, text: `${JSON.stringify(compose, null, 2)}\n` };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { path, text } of composeFiles()) {
    const before = readFileSync(new URL(path, ROOT), 'utf8');
    if (before === text) continue;
    writeFileSync(new URL(path, ROOT), text);
    console.log(`wrote ${path}`);
  }
}
