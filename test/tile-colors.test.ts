import { describe, expect, it } from 'vitest';
import { parseCustomColor, parseTileColor } from '../lib/tileColors.js';

describe('parseCustomColor (the custom colour cards)', () => {
  it('reads hex and rgb() as #rrggbb, lower case', () => {
    expect(parseCustomColor('#FF0000')).toBe('#ff0000');
    expect(parseCustomColor('#f00')).toBe('#ff0000');
    expect(parseCustomColor(' ff6347 ')).toBe('#ff6347');
    expect(parseCustomColor('rgb(255,99,71)')).toBe('#ff6347');
    expect(parseCustomColor('RGB( 0, 128, 255 )')).toBe('#0080ff');
    expect(parseCustomColor('rgb(0 128 255)')).toBe('#0080ff');
  });

  it('reads an empty text as default, so an empty tag resets the colour', () => {
    expect(parseCustomColor('')).toBe('default');
    expect(parseCustomColor('  ')).toBe('default');
    expect(parseCustomColor(undefined)).toBe('default');
  });

  it('refuses names, alpha, hsl and values out of range', () => {
    for (const s of ['tomato', 'red', '#12345', '#1234567', '#ff000080', 'rgb(256, 0, 0)', 'rgb(1, 2)', 'rgba(1, 2, 3, 0.5)', 'hsl(0, 100%, 50%)', 'rgb(1.5, 2, 3)']) {
      expect(() => parseCustomColor(s), s).toThrow(/Unknown colour/);
    }
  });

  it('gives what parseTileColor() takes', () => {
    expect(parseTileColor(parseCustomColor('rgb(18, 52, 86)'))).toBe('#123456');
    expect(parseTileColor(parseCustomColor(''))).toBeNull();
  });
});

describe('parseTileColor (the colour cards)', () => {
  it('takes white and black as their custom colour, so every widget draws them as one (wk-135)', () => {
    expect(parseTileColor('white')).toBe('#ffffff');
    expect(parseTileColor('black')).toBe('#000000');
    expect(parseTileColor('grey')).toBe('grey');
    expect(parseTileColor('default')).toBeNull();
    expect(() => parseTileColor('toString')).toThrow(/Unknown colour/);
  });
});
