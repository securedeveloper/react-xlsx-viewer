---
"react-xlsx-viewer": patch
---

Text rendering fixes:
- Long text spills into empty neighbours again. It was squeezed back into its cell as a flex item, in left-to-right and right-to-left sheets alike.
- In a right-to-left sheet, general-aligned text starts at the cell's right edge and spills left.
- Superscript and subscript cells and rich-text runs are raised or lowered, and smaller.
- `fill` alignment repeats the text across the cell.
- Text with right-to-left reading order aligns right and doesn't spill rightwards.
