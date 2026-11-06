import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The widget pages' Looks (docs/widgets/<id>.md): the images scripts/render-variants.mjs makes from dev/variants.js.
const PAGES = readdirSync('docs/widgets').filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
const WITHOUT = ['spacer']; // it draws nothing
const images = (id: string) => [...readFileSync(`docs/widgets/${id}.md`, 'utf8').matchAll(/<img src="\.\.\/variants\/([^"]+)"[^>]*alt="([^"]+)"/g)];

describe('widget pages\' looks', () => {
  it.each(PAGES.filter(id => !WITHOUT.includes(id)))('%s shows a light version and at least another', (id) => {
    const names = images(id).map(m => m[1]);
    expect(names).toContain(`${id}-light.webp`);
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it.each(PAGES)('%s links only images that exist, with alt text', (id) => {
    for (const [, file, alt] of images(id)) {
      expect(existsSync(`docs/variants/${file}`), file).toBe(true);
      expect(alt.length).toBeGreaterThan(0);
    }
  });

  it('every image is on its page', () => {
    const shown = new Set(PAGES.flatMap(id => images(id).map(m => m[1])));
    expect(readdirSync('docs/variants').filter(f => !shown.has(f))).toEqual([]);
  });

  it.each(PAGES.filter(id => {
    const manifest = `widgets/${id}/widget.compose.json`;
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).settings?.some((s: { id: string }) => s.id === 'colorStyle');
  }))('%s shows Vivid, as it has the Colour style setting', (id) => {
    expect(images(id).map(m => m[1])).toContain(`${id}-vivid.webp`);
  });
});
