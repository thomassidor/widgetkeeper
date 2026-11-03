import { describe, expect, it } from 'vitest';
import { duration, progress } from '../scripts/progress.mjs';

describe('render progress', () => {
  it('counts each file and estimates the time left from the average', () => {
    const lines: string[] = [];
    let t = 0;
    const wrote = progress(4, { log: (...parts: unknown[]) => lines.push(parts.join(' ')), now: () => t });
    t = 30000; wrote('a.png', '(1×1)');
    t = 60000; wrote('b.png');
    t = 90000; wrote('c.png');
    t = 125000; wrote('d.png');
    expect(lines).toEqual([
      '[1/4] wrote a.png (1×1) · ~2 min left',
      '[2/4] wrote b.png · ~1 min left',
      '[3/4] wrote c.png · ~30 s left',
      '[4/4] wrote d.png · done in 2 min 5 s',
    ]);
  });

  it('writes durations in seconds, minutes and hours', () => {
    expect(duration(400)).toBe('0 s');
    expect(duration(45000)).toBe('45 s');
    expect(duration(120000)).toBe('2 min');
    expect(duration(200000)).toBe('3 min 20 s');
    expect(duration(3900000)).toBe('1 h 5 min');
    expect(duration(7200000)).toBe('2 h');
  });
});
