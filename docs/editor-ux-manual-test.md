# MinuEditor UX Manual Regression Checklist

Run the development playground with `pnpm dev`. Use `?fixture=cursor-stability` for the focused list/code journey.

## Formatted-text clipboard

Open `http://127.0.0.1:3333/?fixture=formatted-selection` for the focused clipboard lab.

- [ ] Drag upward from the second line into the opening bold marker; copy and paste into the lab textarea. Confirm the preview is bold and the Markdown has both complete `**` pairs.
- [ ] Repeat with keyboard Shift+ArrowUp and with the **Select upward snippet** preset.
- [ ] Try **Select clipped closing marker**, **Select underscore bold**, and **Select nested formatting**; confirm copied Markdown preserves all markers.
- [ ] Cut the underscore example; confirm only that full formatted span is removed, adjacent text survives, and undo restores it.
- [ ] Copy literal text from inside the fenced-code example; confirm it is not expanded as bold text. Inline-code selections retain their code delimiters, including longer backtick fences.
- [ ] Confirm partial formatted-content selections retain the existing whole-span snapping behavior; this change does not introduce partial-content serialization.
- [ ] Try the original failing snippet in the consumer app before approving this package.

## Callout editing

Open `http://localhost:3333/?fixture=callout-editing` for the focused callout lab.

- [ ] Click **Focus visible text end**, press Enter to continue, then Enter on the empty quoted line to exit. Type prose and confirm the rendered callout does not include it.
- [ ] Reset the formatted callout, focus the visible text end, and repeat. Confirm the closing `**` remains on the original line.
- [ ] After continuing onto an empty quoted line, use Shift+Enter to retain blank lines; type a second paragraph and confirm it stays inside the same callout.
- [ ] Reset the list callout and check continuation. Its native sequence makes the empty second item loose before unwrapping it; only the subsequent empty quote exits the callout.
- [ ] Reset the nested quote and confirm nested-quote behavior is unchanged.
- [ ] Switch to source mode and confirm the existing three-Enter quote-exit path remains unchanged.
- [ ] Check undo, Cmd/Ctrl+Enter submit, and both Enter variants in read-only mode.

## Task-list clipboard

Open `http://localhost:3333/?fixture=task-clipboard` for the source/rendered checklist and paste destination.

- [ ] Use **Select all source items**, Cmd/Ctrl+C, **Focus paste destination**, and Cmd/Ctrl+V. Confirm all four states/rows, including nested `[/]`, survive in destination Markdown and widgets.
- [ ] Reset; use **Select clipped partial marker**, then copy/paste. Confirm the full `- [/] Partial task` is copied, not `/] Partial task`. Repeat with a real upward drag or keyboard selection from the original failing scenario.
- [ ] Cut that clipped selection; confirm the complete prefix is removed, adjacent rows survive, and undo restores the task.
- [ ] Use **Select partial-task label**; confirm only `Partial task` is copied, without an added checkbox.
- [ ] Switch source mode and repeat the clipped preset; confirm intentionally selected raw `/] Partial task` stays exact.
- [ ] Use **Select rendered checklist**, then real Cmd/Ctrl+C and paste into the destination. Confirm unchecked, partial, checked, and nested task states survive. **Simulate rendered HTML paste** provides a repeatable HTML-conversion check but does not replace this native clipboard check.
- [ ] Toggle a source checkbox and repeat rendered HTML paste; confirm the new state is used.
- [ ] Paste a tab-indented Markdown checklist or a rendered nested checklist from another app; confirm it does not become a table.
- [ ] Try Cmd/Ctrl+Shift+V and **Rich paste: off**; confirm HTML state recovery is bypassed and clipboard plain text is inserted.
- [ ] Copy a whole task, click **Prepare task before Enter**, press Enter, then paste. Confirm only one prefix remains and the pasted `[/]`/checked state wins. Undo should restore the new empty item, not remove the preceding Enter.
- [ ] Repeat with **Use bullet source** / **Prepare bullet before Enter**, and **Use numbered source** / **Prepare numbered item before Enter**. Confirm the pasted marker/number is retained, nested children remain nested, and surrounding items are not renumbered. Reset tasks afterwards to restore the checkbox examples.
- [ ] Repeat using **Simulate rendered HTML paste** into the new empty items. Confirm nested numbered children have enough indentation to remain children.
- [ ] Paste just a label or paste into nonempty list text; confirm the existing prefix/text is not stripped. Source mode and Cmd/Ctrl+Shift+V should keep their raw insertion behavior.
- [ ] Try the original failing copy/paste in MinuNotes and the external app involved. If the clipboard contains only labels or CSS styling, state cannot be recovered; external apps may not support `[/]`.

## Inline table Markdown

Open `http://localhost:3333/?fixture=table-inline` for live and static table comparison.

- [ ] Confirm headers and body cells show code, bold, italic, nested formatting, and strikethrough rather than their markers.
- [ ] Confirm the longer-backtick example, escaped pipe (`left|right`), escaped literal stars, and double spaces in `a  b` retain their content.
- [ ] Click formatted text to activate the table; confirm inputs still show raw Markdown. Edit the first header to `__Changed__`, press Escape, and confirm a bold preview. Undo must restore the original source.
- [ ] Switch to source mode; confirm literal Markdown and no table widget. Switch back and check formatting is restored.
- [ ] Toggle read-only; confirm previews remain formatted and clicking a cell does not activate inputs.
- [ ] Use **Replace header externally** and confirm the preview updates to code without modifying the other cells.
- [ ] Confirm link labels do not navigate from the live preview; cell-range TSV copy/cut and whole-table Markdown copy retain raw delimiters while editing.
- [ ] Wrapping is deliberately unchanged here; validate this package before the wrapping package.

## Lists and code blocks

- [ ] Type a top-level bullet, press Enter, and confirm the next marker matches.
- [ ] Press Tab and Shift-Tab in a nested item; confirm the caret stays attached to the same text.
- [ ] Press Enter on an empty nested item; confirm it outdents one level.
- [ ] Press Enter on an empty top-level item; confirm it exits to prose without an extra marker.
- [ ] Type three backticks and a language; confirm no focus transfer occurs before Enter.
- [ ] Press Enter to commit the fence; immediately type the first code character and confirm it is not reordered or lost.
- [ ] Click a non-first code line; confirm the nested caret opens on the intended line.
- [ ] Press Escape in code; confirm focus moves to editable prose after the block.
- [ ] Repeat the journey at document EOF and at a narrow wrapped width.

## Interaction ownership

- [ ] Accept an autocomplete suggestion with Enter inside a list.
- [ ] Confirm Mod-Enter and Shift-Enter retain host-defined behavior.
- [ ] Confirm list-like text in indented and fenced code is not treated as a list.
- [ ] Confirm read-only and source modes do not unexpectedly mutate or activate widgets.
- [ ] Exercise undo/redo across indent, outdent, list exit, fence creation, code edits, and Escape.

## Browser and input coverage

- [ ] Run `pnpm test:browser` in Chromium, Firefox, and WebKit.
- [ ] Manually check Safari/macOS Home/End and horizontal/vertical arrow behavior.
- [ ] Check IME composition and mobile input where supported.
- [ ] Confirm focus remains visible and keyboard-only navigation can enter and leave rich blocks.
- [ ] Confirm no unexpected viewport jump in a long note or after controlled updates above the caret.

## Consumer smoke test

- [ ] Install the packed package in MinuNotes.
- [ ] Repeat list → code → prose with autosave enabled.
- [ ] Reload and confirm canonical Markdown source is unchanged.
- [ ] Verify read-only notes, controlled external updates, multiple editors, and existing code blocks.
