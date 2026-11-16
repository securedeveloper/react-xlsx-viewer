// File fonts to CSS font stacks (docs/ux.md §8.3). Installed fonts only: the
// viewer never downloads a font. Metric-compatible open fonts come second, so
// column fits stay close where they are installed.

export const DEFAULT_FONT_MAP: Readonly<Record<string, string>> = Object.freeze({
  calibri: 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif',
  'calibri light': '"Calibri Light", Carlito, "Segoe UI", system-ui, sans-serif',
  cambria: 'Cambria, Caladea, Georgia, serif',
  arial: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  'times new roman': '"Times New Roman", "Liberation Serif", Times, serif',
  'courier new': '"Courier New", "Liberation Mono", monospace',
  aptos: 'Aptos, system-ui, sans-serif',
});

const quote = (name: string): string => `"${name.replace(/["\\]/g, '')}"`;

/** The CSS font-family for a file font name, from `custom` first, then the default map, then the name itself. */
export function fontStack(family: string, custom?: Readonly<Record<string, string>>): string {
  const key = family.toLowerCase();
  const fromCustom = custom && Object.keys(custom).find((k) => k.toLowerCase() === key);
  if (fromCustom) return custom[fromCustom]!;
  return DEFAULT_FONT_MAP[key] ?? `${quote(family)}, system-ui, sans-serif`;
}
