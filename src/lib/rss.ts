/** Minimal RSS 2.0 item parser (regex based so it runs in Node and the browser without DOMParser). */
export interface NewsItem { title: string; link: string; published: string; source: string }

const unwrap = (s: string) => s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");
const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(unwrap(m[1])).replace(/\s+/g, ' ').trim() : '';
};

export function parseRss(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = tag(block, 'title');
    const link = tag(block, 'link') || tag(block, 'guid');
    const d = new Date(tag(block, 'pubDate') || tag(block, 'dc:date'));
    if (title && link && !Number.isNaN(d.getTime())) items.push({ title, link, published: d.toISOString(), source });
  }
  return items;
}

/** Dedupes by link and by normalised title; newest first. */
export function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of [...items].sort((a, b) => b.published.localeCompare(a.published))) {
    const keys = [it.link.replace(/[?#].*$/, '').replace(/\/$/, ''), it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()];
    const dup = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    if (!dup) out.push(it);
  }
  return out;
}
