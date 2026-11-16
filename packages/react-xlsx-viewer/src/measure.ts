// Text measurement for '####' (numbers that don't fit, docs/api.md §7.3).
// Uses OffscreenCanvas when the platform has it; elsewhere (jsdom, old
// browsers) nothing is measured and numbers are clipped instead.
const cache = new Map<string, number>();
let ctx: OffscreenCanvasRenderingContext2D | null | undefined;

function context(): OffscreenCanvasRenderingContext2D | null {
  if (ctx === undefined) {
    ctx = typeof OffscreenCanvas === 'undefined' ? null : (new OffscreenCanvas(1, 1).getContext('2d') as OffscreenCanvasRenderingContext2D | null);
  }
  return ctx;
}

/** Width in CSS px of `text` in the CSS `font` shorthand, or null when it can't be measured. */
export function textWidth(text: string, font: string): number | null {
  const c = context();
  if (!c) return null;
  const key = `${font}\u0000${text}`;
  let w = cache.get(key);
  if (w === undefined) {
    c.font = font;
    w = c.measureText(text).width;
    if (cache.size > 5000) cache.clear();
    cache.set(key, w);
  }
  return w;
}
