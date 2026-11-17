// File fonts to CSS font stacks (docs/ux.md §8.3). Installed fonts only: the
// viewer never downloads a font. Metric-compatible open fonts come second, so
// column fits stay close where they are installed.

export const DEFAULT_FONT_MAP: Readonly<Record<string, string>> = Object.freeze({
  calibri: 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif',
  'calibri light': '"Calibri Light", Carlito, "Segoe UI", system-ui, sans-serif',
  cambria: 'Cambria, Caladea, Georgia, serif',
  arial: 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif',
  'times new roman': '"Times New Roman", "Liberation Serif", Tinos, Times, serif',
  'courier new': '"Courier New", "Liberation Mono", Cousine, monospace',
  aptos: 'Aptos, system-ui, sans-serif',
});

/** Advance widths of the characters numbers are mostly made of, in font units of 2048 per em. */
export interface NumberMetrics {
  /** Every digit 0–9 has this width (tabular figures). */
  digit: number;
  ',': number;
  '.': number;
  '-': number;
  ' ': number;
}

/**
 * Number metrics of common file fonts, regular and bold (italic matches regular), read from the
 * fonts' hmtx tables: Calibri from Carlito (metric-compatible), Arial, Times New Roman and Courier
 * New from the fonts themselves (Arimo, Tinos and Cousine have the same digit widths). They let the
 * viewer decide `####` with the file font's metrics when a fallback font is drawn (issue #16).
 */
const NUMBER_METRICS: Readonly<Record<string, { regular: NumberMetrics; bold: NumberMetrics }>> = {
  calibri: { regular: { digit: 1038, ',': 511, '.': 517, '-': 627, ' ': 463 }, bold: { digit: 1038, ',': 528, '.': 547, '-': 627, ' ': 463 } },
  arial: { regular: { digit: 1139, ',': 569, '.': 569, '-': 682, ' ': 569 }, bold: { digit: 1139, ',': 569, '.': 569, '-': 682, ' ': 569 } },
  'times new roman': { regular: { digit: 1024, ',': 512, '.': 512, '-': 682, ' ': 512 }, bold: { digit: 1024, ',': 512, '.': 512, '-': 682, ' ': 512 } },
  'courier new': { regular: { digit: 1229, ',': 1229, '.': 1229, '-': 1229, ' ': 1229 }, bold: { digit: 1229, ',': 1229, '.': 1229, '-': 1229, ' ': 1229 } },
};

/** The number metrics of a file font, when they are known. */
export function numberMetrics(family: string, bold: boolean): NumberMetrics | undefined {
  const m = NUMBER_METRICS[family.toLowerCase()];
  return m && (bold ? m.bold : m.regular);
}

const quote = (name: string): string => `"${name.replace(/["\\]/g, '')}"`;

/** The CSS font-family for a file font name, from `custom` first, then the default map, then the name itself. */
export function fontStack(family: string, custom?: Readonly<Record<string, string>>): string {
  const key = family.toLowerCase();
  const fromCustom = custom && Object.keys(custom).find((k) => k.toLowerCase() === key);
  if (fromCustom) return custom[fromCustom]!;
  return DEFAULT_FONT_MAP[key] ?? `${quote(family)}, system-ui, sans-serif`;
}
