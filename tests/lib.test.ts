import { describe, expect, it } from 'vitest';
import { COLS, findSlot, resolve, type Item } from '../src/lib/layout.ts';
import { dedupe, parseRss } from '../src/lib/rss.ts';
import { parseYieldXml } from '../src/lib/treasury.ts';
import { parseFredCsv } from '../src/lib/csv.ts';
import { businessDays, simulateBars } from '../src/lib/simulate.ts';

const it_ = (id: string, x: number, y: number, w: number, h: number): Item => ({ id, type: 't', x, y, w, h });
const overlap = (a: Item, b: Item) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout', () => {
  it('pushes colliding items down and never overlaps', () => {
    const r = resolve([it_('a', 0, 0, 6, 4), it_('b', 6, 0, 6, 4), it_('c', 0, 4, 6, 4)], 'c');
    // move c on top of a
    const moved = resolve(r.map((i) => (i.id === 'c' ? { ...i, y: 0 } : i)), 'c');
    for (const a of moved) for (const b of moved) if (a !== b) expect(overlap(a, b)).toBe(false);
    expect(moved.find((i) => i.id === 'c')!.y).toBe(0);
    expect(moved.find((i) => i.id === 'a')!.y).toBe(4);
  });
  it('clamps to the column grid and compacts upward', () => {
    const r = resolve([it_('a', 10, 0, 6, 2), it_('b', 0, 9, 3, 2)]);
    expect(r[0].x).toBe(COLS - 6); expect(r[1].y).toBe(0);
  });
  it('finds the first free slot', () => {
    expect(findSlot([it_('a', 0, 0, 12, 3)], 6, 2)).toEqual({ x: 0, y: 3 });
  });
});

describe('rss', () => {
  const xml = `<rss><channel><item><title><![CDATA[Fed &amp; Co]]></title><link>https://a.test/x?utm=1</link><pubDate>Tue, 13 Oct 2026 14:00:00 GMT</pubDate></item>
  <item><title>Fed &amp; Co</title><link>https://b.test/y</link><pubDate>Tue, 13 Oct 2026 15:00:00 GMT</pubDate></item>
  <item><title>Other</title><link>https://a.test/x</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate></item><item><title>No date</title><link>https://c.test</link></item></channel></rss>`;
  it('parses CDATA/entities, skips items without a date', () => {
    const items = parseRss(xml, 'T');
    expect(items).toHaveLength(3); expect(items[0].title).toBe('Fed & Co');
  });
  it('dedupes by link and by normalised title, newest first', () => {
    const d = dedupe(parseRss(xml, 'T'));
    expect(d.map((i) => i.link)).toEqual(['https://b.test/y']);
  });
});

describe('treasury xml / fred csv', () => {
  it('extracts tenors and null for missing', () => {
    const xml = '<m:properties><d:NEW_DATE m:type="Edm.DateTime">2026-10-13T00:00:00</d:NEW_DATE><d:BC_1MONTH m:type="Edm.Double">4.10</d:BC_1MONTH><d:BC_10YEAR m:type="Edm.Double">4.25</d:BC_10YEAR></m:properties>';
    const [p] = parseYieldXml(xml);
    expect(p.date).toBe('2026-10-13'); expect(p.yields['10Y']).toBe(4.25); expect(p.yields['1M']).toBe(4.1); expect(p.yields['30Y']).toBeNull();
  });
  it('skips "." observations', () => {
    expect(parseFredCsv('observation_date,X\n2026-01-01,1.5\n2026-01-02,.\n2026-01-03,2')).toEqual([{ date: '2026-01-01', value: 1.5 }, { date: '2026-01-03', value: 2 }]);
  });
});

describe('simulate', () => {
  it('is deterministic, weekday-only and OHLC-consistent', () => {
    const a = simulateBars(7, 100, '2026-10-13', 50), b = simulateBars(7, 100, '2026-10-13', 50);
    expect(a).toEqual(b);
    businessDays('2026-10-13', 30).forEach((d) => expect([0, 6]).not.toContain(new Date(d + 'T00:00:00Z').getUTCDay()));
    a.forEach((x) => { expect(x.h).toBeGreaterThanOrEqual(Math.max(x.o, x.c) - 0.011); expect(x.l).toBeLessThanOrEqual(Math.min(x.o, x.c) + 0.011); });
  });
});
