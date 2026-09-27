# Task-list keyboard parity (editor only)

Status: implemented on `fix/task-list-keyboard-parity`; verification complete.

## Goal

Task items in live mode should inherit the recent bullet behavior without exposing partially edited checkbox syntax or moving the caret unexpectedly. Source mode remains plain Markdown editing.

## Checkpoints

- [x] Reproduce Home/ArrowLeft/Backspace/Delete around `- [ ]`, `- [/]`, and `- [x]` in Chromium and Firefox. Verify caret source offsets and Markdown after each step.
- [x] Make the hidden task marker an atomic keyboard boundary: Home lands at the visible content start, ArrowLeft skips to the line start, Backspace there unwraps the whole marker in one step, and Delete never corrupts part of a hidden checkbox. Preserve navigation between lines and read-only behavior.
- [x] Preserve existing task Enter continue/empty exit, Tab/Shift-Tab indent/outdent for valid nested lists, undo/redo, and bullet parity across nested items.
- [x] Make list toolbar toggles convert existing bullet/ordered/task items rather than prepend a second marker; include partial tasks (`[/]`) and preserve cursor/multiselection.
- [x] Verify source mode permits ordinary character-level edits and task checkbox clicks still cycle states.
- [x] Make modified selection and word deletion respect atomic task prefixes; normalize source-to-live cursor/selection offsets; render checkboxes only for parser-recognized task items, including after distant incremental parsing.
- [x] Exclude code nested inside list items, preserve the indentation and caret when Delete unwraps a nested task, and convert tasks with extra marker whitespace through the unordered-list toggle.
- [x] Apply list toolbar toggles uniformly to mixed selections, number converted ordered items independently by nesting depth, and keep live-mode Tab from turning a list without an available preceding sibling into indented code. Derive nested indentation from the parent marker width and preserve the Tab/Shift-Tab round trip, including wide ordered markers. Preserve raw Tab indentation in source mode.

Expected files: `src/extensions/keymap.ts`, `src/extensions/checkboxes.ts` or a focused boundary helper, `src/toolbar/commands.ts`, `src/toolbar/commands.test.ts`, `src/MarkdownEditor.test.tsx`, browser fixture in `dev/App.tsx`, and new `e2e/task-list-keyboard.spec.ts`. Modify only the subset needed. No MinuNotes app or API changes.

Verification: relevant Vitest tests, Chromium/Firefox Playwright keyboard flows, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `git diff --check`.

Behavioral choice: Backspace at the visible task-text start unwraps directly to plain text, rather than stepping through a bullet.

Note: a lone top-level item cannot be nested by live-mode Tab without becoming Markdown code; Tab now leaves it in place. Source mode still allows raw indentation.
