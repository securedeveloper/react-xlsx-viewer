---
"react-xlsx-viewer": patch
---

Borders: 1px edges (thin, hair, dotted, dashed, dashDot) were clipped away by the cell, and thicker ones lost a pixel; edges are now drawn inside the cell box. Diagonal borders (up, down, both) are drawn.
