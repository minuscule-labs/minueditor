# MinuEditor UX Manual Regression Checklist

Run the development playground with `pnpm dev`. Use `?fixture=cursor-stability` for the focused list/code journey.

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
