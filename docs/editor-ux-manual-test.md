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
