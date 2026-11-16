---
"react-xlsx-viewer": patch
---

Small sheets fill the viewer (#17). The empty rows and columns after the used range now number at least 50 rows and 30 columns, and enough to fill the viewport at the current zoom. They grow when the viewer grows or zooms out, keeping the selection, scroll position and auto-fitted rows.
