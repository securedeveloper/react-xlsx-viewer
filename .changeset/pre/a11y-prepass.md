---
"react-xlsx-viewer": patch
---

Screen-reader fixes found by an automated pass over Chromium's accessibility tree:
- Grid cells are exposed as read-only. Chromium doesn't pass the grid's `aria-readonly` down to its cells, so each cell now says it too.
- An internal link names its sheet: "Link to Second sheet, A1" in the cell's description, and "Go to Second sheet, A1" in the link chip.
- A link that won't open (a `javascript:` address, for example) is described as "Link not opened: unsupported address", as in the chip, instead of "Link to javascript:…".
