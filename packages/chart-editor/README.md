# @kalketa/chart-editor

Editing a chart on screen: what the mouse does on it, the small windows of its parts, its menu. It gets the chart as drawn (a print block) and hands back changed plot lines. It knows nothing of the sheet, layers or files.

- The drawing is `@kalketa/chart`, what a plot line computes is `@kalketa/core` (`eval/plot.ts`). A change there still needs the wider tests.
- Every edit ends up in the plot line, so a printout shows it and the file keeps it.

| Command | What it does | How long |
|---|---|---|
| `npm run chart` | opens a page with sample charts (`workbench/`) | |
| `npm run test:chart` | tests of `chart` and `chart-editor` | seconds |
| `npm run smoke:chart` | the page tried with the real mouse and keyboard | under a minute |

The whole check (`npm run typecheck`, `npm test`, `npm run smoke`) is for before a push or an exe.

The page borrows the program's menu, dialog and question window from `packages/editor`; the module itself does not depend on the editor.
