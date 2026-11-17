---
"react-xlsx-viewer": patch
---

Accessibility fixes found by an axe audit: the corner header ("Select all cells") now has its name as visually hidden text instead of `aria-label`, so screen readers in browse mode find it too; and the loading, error and empty states sit on the chrome background, so their text keeps its contrast in the dark theme.
