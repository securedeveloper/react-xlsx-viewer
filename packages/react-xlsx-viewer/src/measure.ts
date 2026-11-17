// Text measurement for '####' (numbers that don't fit, docs/api.md §7.3).
// Uses OffscreenCanvas when the platform has it; elsewhere (jsdom, old
// browsers) nothing is measured and numbers are clipped instead.
import type { NumberMetrics } from './fonts';

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

/**
 * The width `text` would have in the file's font (issue #16), from its number metrics, when the font
 * actually drawn (`font`, a CSS shorthand at `sizePx`) differs from them, as when Calibri and Carlito
 * aren't installed. Digits and separators take the file font's widths; other characters (letters of
 * a date, currency signs) are measured in the drawn font and scaled by the digit-width ratio.
 * Null when the metrics aren't known, nothing can be measured, or the drawn digits match the file
 * font's within 1 % (the file font or a metric-compatible one is installed): then measure as drawn.
 */
export function fileFontWidth(text: string, metrics: NumberMetrics | undefined, sizePx: number, font: string): number | null {
  if (!metrics) return null;
  const drawn = textWidth('0', font);
  if (!drawn) return null;
  const em = sizePx / 2048;
  const ratio = (metrics.digit * em) / drawn;
  if (Math.abs(ratio - 1) <= 0.01) return null;
  let w = 0;
  for (const ch of text) {
    const units = ch >= '0' && ch <= '9' ? metrics.digit : ch === ',' || ch === '.' || ch === '-' || ch === ' ' ? metrics[ch] : undefined;
    w += units !== undefined ? units * em : (textWidth(ch, font) ?? drawn) * ratio;
  }
  return w;
}
