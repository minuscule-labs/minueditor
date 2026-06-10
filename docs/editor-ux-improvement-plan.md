# Editor UX Improvement Plan

## Goal
Make MinuEditor feel more predictable and polished, closer to Obsidian/Notion, with special focus on arrow-key navigation, cursor placement, inline markdown behavior, list ergonomics, and widget interactions.

Tables remain first-class widgets. This plan should also align implementation around the existing internal command/widget control plane so the same APIs can become public later.

## UX principles

1. **One selection model**
   - CodeMirror remains the source of truth for markdown, selection, undo/redo, and focus.
   - Widgets may own local focus temporarily, but must sync through editor commands/context.

2. **Native text behavior should win by default**
   - Do not hijack common OS/editor shortcuts unless the editor is clearly in a widget-specific mode.
   - Avoid intercepting `Mod-Arrow` because it conflicts with beginning/end line/document navigation on macOS.

3. **Widgets are explicit navigation zones**
   - Every widget has stable before/inside/after cursor locations.
   - Arrow keys, click targets, Escape, Enter, and Tab should all have documented transitions.

4. **Markdown syntax hiding should not change document semantics**
   - Copy/cut/select should use source markdown.
   - Visual selection should match copied content when possible.
   - Cursor motion across hidden tokens should be predictable.

5. **Internal API first, public API later**
   - New behavior should use internal command/context abstractions rather than direct ad-hoc `view.dispatch` spread across widgets.
   - Keep shapes compatible with `docs/widget-control-plane-plan.md`.

---

## Phase 1 — Keyboard event ownership cleanup

### Problems
- Enter handling currently exists in both React `onKeyDownCapture` and CodeMirror keymaps.
- Shortcut handling is split between `src/extensions/keymap.ts` and `MarkdownEditor.tsx` DOM handlers.
- Duplicated paths make ordering bugs more likely.

### Work
- Remove React `onKeyDownCapture` Enter handling.
- Move all editor keyboard behavior into CodeMirror keymaps/dom handlers.
- Make shortcut ownership explicit:
  - formatting shortcuts: editor keymap
  - clipboard: editor clipboard handlers/filter
  - link click: link extension
  - paste behavior: paste extension
- Update comments in `src/extensions/keymap.ts` to reflect actual behavior.

### Tests
- Enter continues lists.
- Enter exits empty nested list at true line start.
- Enter works after hidden inline suffix.
- `onSubmit` `Mod-Enter` still works.

---

## Phase 2 — Shared internal command/context API

### Problems
- Editor handle, table widget, code block widget, image picker, slash commands, and toolbar all dispatch independently.
- This makes read-only behavior, undo/redo, focus, and selection handling inconsistent.
- Code block options currently use module-level globals.

### Work
- Create an internal command factory, e.g. `src/internal/commands.ts`:
  - `createEditorCommands(ctx)`
  - shared by `MarkdownEditorHandle`, toolbar, slash commands, widgets.
- Create an internal editor context, e.g. `src/internal/context.ts`:
  - `view`
  - `readOnly`
  - `getMarkdown()`
  - `getSelection()`
  - `setSelection()`
  - `focus()`
  - `commands`
- Route built-in widgets through this context where practical.
- Replace code block module-level options with a CodeMirror facet or state field.

### Public API alignment
This should be compatible with the future public API described in `docs/widget-control-plane-plan.md`:

```ts
interface MinuWidgetContext {
  view: EditorView
  readOnly: boolean
  getMarkdown(): string
  getSelection(): { from: number; to: number; empty: boolean }
  setSelection(from: number, to?: number): boolean
  focus(): boolean
  commands: MinuEditorCommands
}
```

### Tests
- Commands respect read-only mode.
- Toolbar and handle use same behavior.
- Widget commands participate in undo/redo.
- Multiple editor instances can use different code highlighters/languages without leaking config.

---

## Phase 3 — Inline markdown range model

### Problems
Inline markdown recognition is duplicated in:
- `src/MarkdownEditor.tsx`
- `src/extensions/visual-markdown.ts`
- `src/toolbar/commands.ts`

This causes drift for cursor, copy, selection, marker reveal, and formatting behavior.

### Work
- Add shared inline markdown range utilities, likely `src/internal/inline-markdown.ts`.
- Represent spans as:

```ts
type InlineMarkdownSpan = {
  kind: 'bold' | 'italic' | 'strike' | 'code' | 'link'
  from: number
  to: number
  contentFrom: number
  contentTo: number
  openFrom: number
  openTo: number
  closeFrom: number
  closeTo: number
}
```

- Use this utility for:
  - visual markdown hiding/reveal
  - copy/cut expansion
  - mouse-up selection normalization
  - Enter after hidden suffix
  - toggle commands where applicable
- Prefer Lezer syntax tree where reliable; keep regex fallback isolated in one file.

### Tests
- Copy from start/middle/end of inline code.
- Multi-line copy starting/ending inside inline markdown.
- Arrow/click placement around hidden open/close markers.
- Bold/italic/link/strike parity with inline code.

---

## Phase 4 — Navigation model for normal markdown blocks

### Problems
- Cursor can land at surprising source positions due to hidden markers, decorations, and replaced widgets.
- List wrapping/layout improvements are visual, but cursor semantics still need hardening.

### Work
- Define expected cursor behavior for:
  - headings with hidden `#`
  - blockquotes with hidden `>`
  - unordered, ordered, task list markers
  - inline hidden markdown tokens
- Add small navigation helpers:
  - skip hidden block marker on horizontal arrow when appropriate
  - reveal syntax only when user intentionally enters marker region
  - normalize cursor after list enter/outdent/indent
- Review CSS impact on cursor geometry, especially list marker absolute positioning and hidden leading spaces.

### Tests
- ArrowLeft/ArrowRight around list markers and heading markers.
- Home/End behavior on list lines.
- Click at visual line beginning places cursor at expected editable text start.
- Empty nested list exit remains true line beginning.

---

## Phase 5 — Widget navigation framework

### Problems
Tables/code blocks/images replace source ranges with widgets. Each widget implements its own boundary, focus, and keyboard behavior.

### Work
- Define a common widget navigation contract:

```ts
type WidgetNavigationTarget = 'before' | 'inside-start' | 'inside-end' | 'after'
```

- Shared helpers for:
  - activate widget
  - deactivate widget
  - move before/after widget
  - click-to-place cursor
  - Escape behavior
- Add/access atomic range behavior where appropriate so arrow keys do not get trapped inside replaced ranges.
- Keep visible boundary affordances but make them consistent across table/code/image widgets.

### Tests
- ArrowDown from previous line enters widget only when cursor is at a natural boundary.
- ArrowUp from next line enters widget only when expected.
- Escape leaves widget to stable source position.
- Clicking before/after boundary places cursor correctly.

---

## Phase 6 — Table widget polish

Tables should remain widgets.

### Problems
- Table widget uses real inputs and rewrites markdown on input, which is good for UX but requires stronger focus/selection coordination.
- Arrow behavior currently overrides expected text-input behavior too broadly.
- Structural shortcuts conflict with OS shortcuts.

### Work
- Keep table as a widget but route table operations through internal commands/context.
- Revisit table keyboard behavior:
  - ArrowLeft/Right should move within input until true boundary.
  - ArrowUp/Down should preserve column and approximate caret offset.
  - Tab/Shift-Tab moves cells.
  - Enter maybe creates a new row or commits cell depending desired Notion-like behavior.
  - Escape returns to parent editor after table.
- Replace `Mod-Arrow` structural edits with non-conflicting shortcuts or expose primarily via toolbar/context menu.
- Add explicit table command set:
  - `table.insertRowAbove`
  - `table.insertRowBelow`
  - `table.insertColumnLeft`
  - `table.insertColumnRight`
  - `table.deleteRow`
  - `table.deleteColumn`

### Tests
- Cell-to-cell arrow movement.
- Shift-arrow table selection.
- Undo/redo after cell edits and row/column changes.
- Focus remains stable after row/column insert/delete.

---

## Phase 7 — Code block widget polish

### Problems
- Code blocks use nested CodeMirror editors, which can feel disconnected from the parent editor.
- Language input, opening fence, nested editor, closing fence, and parent editor each have separate focus behavior.

### Work
- Route code block actions through internal commands/context.
- Improve transitions:
  - ArrowUp from first code line -> language/fence or previous parent line.
  - ArrowDown from last code line -> close fence/next parent line.
  - Escape exits predictably.
  - Enter at end of close fence exits block.
- Make nested editor undo/redo model explicit:
  - either parent owns history fully, or nested editor owns local history but syncs coherently.
- Replace module-level options with per-editor facet/state.

### Tests
- Arrow into/out of code block from surrounding lines.
- Language input navigation.
- Undo/redo after nested code edits.
- Multiple editors with different code language configs.

---

## Phase 8 — Image widget polish

### Problems
- Images become replacement widgets on inactive lines, but cursor navigation around them is less formal than tables/code blocks.

### Work
- Add same widget boundary/nav contract as table/code block.
- Ensure click on image selects/activates source line or opens preview behavior intentionally.
- Add optional commands:
  - `image.editAlt`
  - `image.replaceSource`
  - `image.open`
  - `image.remove`

### Tests
- Arrow/click before and after image.
- Source reveal on active image line.
- Paste/drop upload undo behavior.

---

## Phase 9 — Renderer parity

### Problems
- Editor list layout and rendered HTML list layout can diverge.
- Renderer tables/code/images have their own CSS/DOM behavior.

### Work
- Align renderer list/task-list spacing with editor list gutter model.
- Ensure task checkbox partial state remains visually aligned.
- Keep renderer CSS separate but compatible with editor theme variables.

### Tests
- Rendered nested bullets, ordered lists, and task lists match editor spacing.
- Long wrapping list items align after marker gutter.

---

## Phase 10 — UX regression suite and manual checklist

### Automated tests
Add tests for:
- list enter/exit/indent/outdent
- cursor placement after commands
- inline copy/cut/selection expansion
- arrow navigation around widgets
- table cell focus and commands
- code block focus and commands
- renderer/editor visual parity smoke tests

### Manual checklist
Create `docs/editor-ux-manual-test.md` with scenarios:
- Obsidian-style inline marker reveal/copy
- nested list wrapping and empty-list exit
- table creation/edit/navigation/delete
- code block creation/edit/navigation/copy
- image paste/drop/source edit
- spellcheck/autocorrect behavior
- multi-editor page with different props

---

## Suggested implementation order

1. Phase 1: event/keymap cleanup.
2. Phase 3: shared inline markdown range model.
3. Phase 5: widget navigation contract.
4. Phase 6: table widget polish.
5. Phase 7: code block widget polish.
6. Phase 2: internal command/context extraction can happen in parallel, but should be in place before major widget rewrites.
7. Phase 4, 8, 9, 10 as hardening and parity work.

## Release strategy

Use small patch releases for validated behavior changes:
- `v0.9.x`: incremental bug fixes and keyboard cleanup.
- `v0.10.0`: internal command/context refactor if non-breaking.
- `v0.11.0` or later: public widget/control-plane API.

Keep changes behind internal APIs first. Do not expose public widget extension shapes until table/code/image behavior is stable across real usage in notes.
