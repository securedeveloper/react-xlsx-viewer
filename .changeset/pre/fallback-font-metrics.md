---
"react-xlsx-viewer": patch
---

Numbers no longer show `####` just because Calibri or Carlito isn't installed (#16). Whether a number fits its column is decided with the file font's digit and separator widths (Calibri, Arial, Times New Roman, Courier New), so a number that fits in the file's font is drawn slightly smaller in a wider fallback font instead of `####`. `DEFAULT_FONT_MAP` also lists Arimo, Tinos and Cousine, the metric-compatible fonts common on ChromeOS and Linux.
