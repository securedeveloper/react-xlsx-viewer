---
"react-xlsx-viewer": patch
---

Shrink to fit is applied (#15): text in a cell with `shrinkToFit` is drawn smaller so it fits the column width, numbers shrink instead of showing `####`, and the text no longer spills into neighbours. Where text can't be measured (no `OffscreenCanvas`), it still clips.
