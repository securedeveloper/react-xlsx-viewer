# Manual screen-reader check

The automated audit (axe in the browser tests, `test/browser/a11y.browser.test.tsx`) catches markup problems. It can't tell whether a screen reader actually says the right thing. This checklist does that, by hand, once per release candidate ([ux.md §9](ux.md#9-accessibility-checklist)).

Record each pass in the release PR: date, package version, screen reader and browser with versions, and pass/fail per step with a note for every fail.

## Before you start

1. Open the live playground: https://react-xlsx-viewer-playground.vercel.app/. It runs the published package, so check the version it shows matches the release you test.
2. Use these samples from the playground's sample list:
   - **Merges and views** (`14-merges-views.xlsx`): merges, frozen panes, right-to-left, hidden sheets, tab colours.
   - **Formulas** (`05-formulas.xlsx`): formulas with and without a cached result.
   - **Hyperlinks** (`15-hyperlinks-names.xlsx`): external, mailto and internal links.
   - **Columns and rows** (`13-columns-rows.xlsx`): hidden rows and columns.
   - **Kitchen sink** (`99-kitchen-sink.xlsx`): many sheets, for sheet switching.
3. For the error step, have a non-workbook file at hand, for example any `.png` or `.pdf`.
4. Reset the screen reader to its default verbosity. Turn the browser's own zoom to 100 %.

Wording differs between screen readers. A step passes when the listed **information** is spoken, in any order and phrasing. It fails when information is missing, wrong, or only available by leaving the grid.

## Steps (all screen readers)

1. **Enter the grid.** Load *Merges and views*. Press Tab from the page until focus lands in the grid (the formula bar's address and value fields come first).
   - Expected: the grid's name "Sheet: {sheet name}", that it is a grid or table (read-only), and the active cell: its text and position (column letter and row number, or "row n, column n").
   - Pass: all three are spoken; focus is visibly outlined.
2. **Move between cells.** Press the arrow keys in all four directions.
   - Expected: each move speaks the new cell's text, and the row or column header when it changes. Empty cells are spoken as blank (or "empty").
   - Pass: every move is announced; no move is silent; focus never jumps outside the grid.
3. **Merged cells.** Move onto a merged cell.
   - Expected: its text, plus that it spans several columns or rows (for example "spans 3 columns"). Moving past it skips the covered cells in one step.
   - Pass: the span is spoken, or at least the cell is announced once and the next arrow press moves past the whole merge.
4. **Hidden rows and columns.** Load *Columns and rows*. Move down across a hidden row, and right across a hidden column.
   - Expected: the row or column number jumps (for example row 5, then row 7). The header after the gap has a double-line marker; reading it with the reading cursor gives "Row 6 hidden" or "Column C hidden" as its description (a `title`, so some readers only speak it with their "describe" key).
   - Pass: the gap is noticeable from the spoken numbers or the header text.
5. **Frozen panes.** Back in *Merges and views*, on a sheet with frozen rows, press Page Down several times, then Ctrl+Home (Cmd+Home on macOS).
   - Expected: each Page Down announces the new active cell; Ctrl+Home returns to the first cell and announces it.
   - Pass: no silent moves, focus stays in the grid.
6. **Selection summary.** Select a range with Shift+arrow keys over some numbers, then wait one second.
   - Expected: the cells as they join the selection ("selected" where the reader says so), then after a short pause the status summary, for example "4 cells · Sum 1,234 · Average 308.5".
   - Pass: the summary is spoken once, after you stop moving, not on every key press.
7. **Formula description.** Load *Formulas*. Move to a cell with a formula and a result, then to one without a result.
   - Expected: first the displayed result, then "Formula: =…". For the cell without a result: "Formula: =…. not calculated" (or similar).
   - Pass: the formula is spoken without leaving the grid.
8. **Sheet switching.** Load *Kitchen sink*. In the grid, press Ctrl+Page Down, then Ctrl+Page Up.
   - Expected: the new sheet's grid name "Sheet: {name}" and the active cell.
   - Pass: the sheet name is spoken each time and focus stays in the grid.
9. **Sheet tabs.** Press Tab until focus reaches the sheet tabs. Use Left/Right arrows, then Enter.
   - Expected: "Sheets, tab list", then each tab's name, "tab", "selected" for the current one, and its position ("2 of 9"). Hidden sheets, when the playground shows them, say "(hidden)".
   - Pass: names and the selected state are spoken; Enter switches the sheet.
10. **Link chip.** Load *Hyperlinks*. Move to an external link cell.
    - Expected: the cell text, then "Link to {host}". The chip below the cell shows the full address and an "Open" link.
    - Press Tab to reach the chip's "Open" link. Expected: "Open, link". Press Escape: focus returns to the cell.
    - Move to an internal link cell. Expected: "Link to {sheet}, {cell}", and a "Go to …" button in the chip.
    - Move to a blocked link (a `javascript:` address, if the sample has one). Expected: the chip text "Link not opened: unsupported address" can be read.
    - Pass: the real target is available before anything opens; Alt+Enter on an external link cell opens it in a new tab.
11. **Keyboard shortcuts dialog.** In the grid, press Shift+?.
    - Expected: "Keyboard shortcuts, dialog", and focus on "Close". The table of keys can be read with the reading cursor. Escape closes it and focus returns to the grid.
    - Pass: focus moves into the dialog on open and back to the active cell on close.
12. **Zoom controls.** Tab to the status bar. Use "Zoom out", the "Zoom" list and "Zoom in".
    - Expected: each button by name, the list as "Zoom, 100 %" (or the current value), and the new value when it changes.
    - Pass: every control has a spoken name.
13. **Loading and errors.** Open your non-workbook file through the playground's "Open file".
    - Expected: an alert, spoken without moving focus: "This doesn't look like a workbook or a CSV file." The "Details" toggle reveals the code.
    - Pass: the message is spoken automatically.
14. **Not-shown notice.** Load a file with charts or images (the kitchen sink has none; use any workbook with a chart).
    - Expected: a region "Some content isn't shown" above the grid, with "Details" and "Dismiss".
    - Pass: the region can be found with the reader's landmark or region navigation, and Dismiss removes it.
15. **Leave the grid.** In the grid, press Tab, then Shift+Tab.
    - Expected: Tab leaves the grid to the next control; Shift+Tab comes back to the same active cell.
    - Pass: no keyboard trap.

## Per screen reader

Run all fifteen steps with each combination below. Notes list what is specific to it.

### NVDA + Firefox, NVDA + Chrome (Windows)

1. Use the latest NVDA release, and the latest Firefox and Chrome.
2. NVDA switches to focus mode when Tab lands in the grid (a short "typing" sound by default). If it doesn't, press NVDA+Space and note it as a fail of step 1.
3. Table navigation in browse mode (Ctrl+Alt+arrows) should read the same cells as the arrow keys in focus mode; check it once in step 2.
4. For step 14, use NVDA+F7 (elements list, Landmarks) or D to find the region.

### VoiceOver + Safari (macOS)

1. Use the current macOS and Safari. Turn VoiceOver on with Cmd+F5.
2. Use the plain arrow keys in the grid (Quick Nav off: press Left+Right arrow together to toggle it if arrows don't move cells).
3. Use Cmd instead of Ctrl for the shortcuts in steps 5 and 8 (Cmd+Home is Fn+Cmd+Left on a laptop keyboard; Ctrl+Page Down is Fn+Ctrl+Down).
4. For step 14, use VO+U (Rotor) and pick Landmarks.

### VoiceOver + Safari (iOS)

1. Use an iPhone on the current iOS. Turn VoiceOver on in Settings, Accessibility.
2. Without a keyboard, steps 2–8 use swipes: swipe right/left moves cell by cell; the Rotor (two-finger rotate) set to "Rows" or "Columns" moves by row or column if offered.
3. Double-tap selects a cell. Step 6 (range selection) and steps 5, 8 and 11 need a hardware keyboard; mark them "n/a without keyboard" if none is paired.
4. Pass criterion for touch: every cell, tab and button can be reached by swiping and has a spoken name.

### TalkBack + Chrome (Android)

1. Use a current Android phone with the latest Chrome. Turn TalkBack on in Settings, Accessibility.
2. Swipe right/left moves between elements; double-tap activates. Use the TalkBack menu's reading controls (Rows/Columns if offered, else Default).
3. As on iOS, steps 5, 6, 8 and 11 need a hardware keyboard; mark them "n/a without keyboard" if none is paired.
4. Pass criterion for touch: as for iOS.

### JAWS + Chrome (Windows, before 1.0)

1. Use a licensed JAWS (current release) with the latest Chrome. This pass isn't part of CI.
2. JAWS switches to forms mode in the grid automatically ("Forms mode on" sound). If it doesn't, press Enter on the active cell and note it in step 1.
3. Table reading keys (Ctrl+Alt+arrows in virtual mode) should agree with the arrow keys in forms mode; check it once in step 2.
4. For step 14, use Insert+Ctrl+R (regions list).

## Pass criteria for the release

1. Every step passes with NVDA + Firefox, NVDA + Chrome and VoiceOver + Safari on macOS.
2. On iOS and Android, every step that doesn't need a hardware keyboard passes.
3. Before 1.0, every step passes with JAWS + Chrome.
4. A fail that is a screen-reader bug rather than ours (the same markup works in the other readers, and matches the WAI-ARIA grid pattern) is recorded with a link to the reader's issue, and doesn't block the release on its own.
5. Every other fail gets an issue in this repository before the release goes ahead.

## Automated pre-pass (Chromium accessibility tree), 2026-11-17

`packages/react-xlsx-viewer/test/browser/a11y-tree.browser.test.tsx` runs every step above in Chromium, in the Browser job, with real keyboard input. It reads what Chromium hands to screen readers from its accessibility tree over the DevTools protocol: the focused node's role, name, description and states, its ancestors, and the live regions. It then pins the result. Chromium's protocol doesn't list `aria-rowindex`, `aria-colindex`, `aria-rowcount`, `aria-colcount`, `aria-rowspan` or `aria-colspan`, which reach the platform as table attributes, so the test checks those on the DOM.

**This doesn't replace the manual passes.** It shows that the browser exposes the right information. It can't show what NVDA, JAWS, VoiceOver or TalkBack do with it: their wording, their verbosity, or whether focus or forms mode switches as expected. All the manual passes above stay open.

| Step | Expected (above) | Exposed in Chromium | Result |
|---|---|---|---|
| 1. Enter the grid | Grid name, grid, read-only, the cell's text and position | gridcell "8", focused, selected, read-only; grid "Sheet: Frozen both (active)", read-only, multiselectable; row name starts with its header "5"; rowindex 6, colindex 4 of 91 × 41. Tab passes the formula bar's two fields first | **Mismatch, fixed:** cells were exposed as *not* read-only (Chromium doesn't pass the grid's `aria-readonly` down). Each cell now says `aria-readonly="true"` |
| 2. Move between cells | Each move announced; blank cells blank | Names change with each arrow; colindex and rowindex follow; a blank cell has an empty name | Pass |
| 3. Merged cells | Text and span; next arrow skips covered cells | "A1:C1 merged, centred", `aria-colspan` 3; Right goes to colindex 5 (D1); "A2:A4 merged vertically", `aria-rowspan` 3 | Pass |
| 4. Hidden rows and columns | The number jumps; header text for the gap | rowindex 5 → 7; header "6" described "Row 5 hidden", header "J" described "Columns H–I hidden" (`title`) | Pass |
| 5. Frozen panes | Each move announced; focus stays | Page Down: one screen down (rowindex 6 → 26 at 560 px), the new cell named; Ctrl+Home: "1" at B2, after the frozen row and column | Pass |
| 6. Selection summary | Cells selected; summary once, after a pause | Focused cell selected, 4 cells `aria-selected`; status empty while moving, then "4 cells · Sum 45 · Average 11.25" after 600 ms | Pass |
| 7. Formula description | Result, then "Formula: =…"; "not calculated" without a result | Name "20", description "Formula: =D2*2"; a formula without a result: empty name, description "Formula: =…. not calculated" | Pass |
| 8. Sheet switching | New grid name and active cell | Focus on a gridcell in grid "Sheet: Text"; status "Sheet: Text" | Pass |
| 9. Sheet tabs | Tab list, names, selected, "(hidden)" | tablist "Sheets" (horizontal); tab "Frozen both (active)" selected; "Hidden (hidden)" not selected until Enter. Position in the set is computed by the platform, not listed by the protocol | Pass |
| 10. Link chip | "Link to {host}"; "Open" link; Escape back; internal "Link to {sheet}, {cell}"; blocked text | External: description "Link to example.com", Tab to link "Open" with the URL, Escape back to the cell | Pass |
| | | Internal: description was "Link to A1" and the chip "Go to A1" | **Mismatch, fixed:** now "Link to Second sheet, A1" and "Go to Second sheet, A1" |
| | | Blocked (`javascript:`): description was "Link to javascript:alert(1)" | **Mismatch, fixed:** now "Link not opened: unsupported address", as in the chip |
| 11. Shortcuts dialog | Dialog named, focus on Close; Escape back | Modal dialog "Keyboard shortcuts", focus on button "Close"; Escape returns to the cell | Pass |
| 12. Zoom controls | Every control named; list says its value | Buttons "Zoom out", "Zoom in", "Keyboard shortcuts"; combobox "Zoom", value "100 %" | Pass |
| 13. Loading and errors | Alert spoken without moving focus | Alert "This doesn't look like a workbook or a CSV file. …"; focus stays where it was | Pass |
| 14. Not-shown notice | A findable region with Dismiss | region "Some content isn't shown" containing button "Dismiss" | Pass |
| 15. Leave the grid | Tab leaves; Shift+Tab returns to the same cell | Tab moves to the next control; Shift+Tab returns focus to the same gridcell | Pass |

The sample `13-columns-rows.xlsx` labels row 4 as "Row 4 is hidden", but the file hides row 5. That is a wording issue in javascript-excel's corpus, not in the viewer.
