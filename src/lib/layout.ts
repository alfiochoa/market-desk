/** Pure grid-layout helpers (12 columns). Items never overlap after resolve(). */
export interface Item { id: string; type: string; x: number; y: number; w: number; h: number }
export const COLS = 12;

const hit = (a: Item, b: Item) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Place `moved` at its (clamped) position; push colliding items downward, then compact everything upward. */
export function resolve(items: Item[], movedId?: string): Item[] {
  const out = items.map((i) => ({ ...i, w: Math.min(Math.max(1, i.w), COLS), h: Math.max(1, i.h) }));
  for (const i of out) { i.x = Math.min(Math.max(0, i.x), COLS - i.w); i.y = Math.max(0, i.y); }
  const moved = out.find((i) => i.id === movedId);
  const rest = out.filter((i) => i !== moved).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: Item[] = moved ? [moved] : [];
  for (const it of rest) {
    while (placed.some((p) => hit(p, it))) it.y += 1;
    // compact upward (but never above the moved item's footprint)
    while (it.y > 0 && !placed.some((p) => hit(p, { ...it, y: it.y - 1 }))) it.y -= 1;
    placed.push(it);
  }
  return out;
}

/** First free slot (scanning rows) for a new w x h item. */
export function findSlot(items: Item[], w: number, h: number): { x: number; y: number } {
  for (let y = 0; ; y++) for (let x = 0; x <= COLS - w; x++) {
    const probe = { id: '', type: '', x, y, w, h };
    if (!items.some((i) => hit(i, probe))) return { x, y };
  }
}
