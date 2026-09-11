# E1 — Contract and bundle feasibility

**Status:** design-review gate. No Channels dependency or public MinuEditor API changes are included in E1.

## Evidence

Baseline: `origin/main` at `f128c89`; built with `pnpm run build` on 2026-09-11.

| Artifact | Raw | gzip |
| --- | ---: | ---: |
| `dist/index.js` | 321,438 B | 93,547 B |
| `dist/index.cjs` | 246,295 B | 83,418 B |
| `dist/shiki.js` | 292,191 B | 79,590 B |
| `dist/theme.css` | 21,445 B | 4,861 B |
| All emitted JS/CJS files | 28,095,660 B | n/a |

The root entry currently imports document widgets, comments, tables, images, wikilinks, rich paste, Mermaid support, and toolbars unconditionally. Although the Mermaid engine and Shiki language payloads are lazy/separate at runtime, the message consumer still receives the complete editing-surface implementation in `index.js`. This does **not** meet the Channels requirement that document-only feature code be absent from the initial consumer graph.

Current behavior also confirms the contract gaps:

- `onSubmit` only binds `Mod-Enter`.
- completion is internally specialized for wikilinks/slash commands; there is no generic host provider.
- `minHeight`/`maxHeight` are pixel values, not line/viewport semantics.
- several runtime settings use CodeMirror `Compartment` reconfiguration, but no single profile contract owns all feature and keyboard reconfiguration.

## E1 decisions recommended for E2

### Packaging

Keep the existing root entry backward-compatible and add explicit, documented subpaths. The published export map is:

| Specifier | Contract |
| --- | --- |
| `@dpklabs/minueditor` (`.`) | Existing document-compatible facade. It exports `MarkdownEditor`, renderer, toolbar, legacy props, and the aggregate `theme.css`; its default behavior remains the current document surface. |
| `@dpklabs/minueditor/core` | Minimal `CoreMarkdownEditor`, shared command registry, profile types, generic completion, submit policy, sizing, and only Markdown text/history/inline-mark/list/link/selection behavior. This is the Channels import. |
| `@dpklabs/minueditor/document` | `documentFeatureKit`, `documentEditorProfile`, document toolbar/renderer, and tables, images, slash commands, wikilinks, comments, annotations, rich paste, resource widgets, and document navigation. |
| `@dpklabs/minueditor/shiki` | Existing opt-in highlighter helper. |
| `@dpklabs/minueditor/core/theme.css` | Core editor CSS only. |
| `@dpklabs/minueditor/document/theme.css` | Document-widget CSS only; imported after core CSS. |
| `@dpklabs/minueditor/theme.css` | Backward-compatible aggregate importing core then document CSS. |

Feature kits compose explicitly:

```tsx
<CoreMarkdownEditor
  value={value}
  onChange={setValue}
  profile={messageEditorProfile}
/>

<CoreMarkdownEditor
  value={value}
  onChange={setValue}
  profile={documentEditorProfile}
  features={[documentFeatureKit]}
/>
```

The root `MarkdownEditor` is a compatibility facade over the second form; it must not make `.` minimal or silently change legacy document defaults. Package `sideEffects` lists exactly the three emitted CSS paths above; JS feature-kit modules remain side-effect-free. Tree shaking is an optimization, not the bundle-boundary guarantee.

### Generic completion API

Keep the API MinuEditor-neutral; do not expose CodeMirror completion types:

```ts
export interface MarkdownCompletionContext {
  value: string;
  from: number;
  to: number;
  query: string;
  trigger: string;
  signal: AbortSignal;
}

export interface MarkdownCompletion {
  id: string;
  label: string;
  insertText: string;
  detail?: string;
}

export interface MarkdownCompletionProvider {
  id: string;
  trigger: string;
  query(context: MarkdownCompletionContext):
    | readonly MarkdownCompletion[]
    | Promise<readonly MarkdownCompletion[]>;
}
```

The provider owns labels and canonical inserted Markdown. The editor owns source-range replacement, listbox interaction, keyboard/pointer acceptance, request cancellation, stale-result fencing, and accessible focus behavior. Completion acceptance must run before submit handling.

### Submit policy

Add an explicit policy rather than a host DOM key handler:

```ts
export interface MarkdownSubmitSnapshot {
  value: string;
  state: MarkdownEditorState;
  selection: MarkdownEditorState["selection"];
}

export interface MarkdownSubmitPolicy {
  enter?: "newline" | "submit";
  shiftEnter?: "newline" | "submit";
  modEnter?: "newline" | "submit" | "none";
  canSubmit?: (snapshot: MarkdownSubmitSnapshot) => boolean;
  onSubmit?: (snapshot: MarkdownSubmitSnapshot) => void;
  /** Behavior when a submit key is configured but canSubmit returns false. */
  rejectedSubmit?: "newline" | "markdown";
}
```

Defaults preserve current document behavior. A message profile uses `enter: "submit"`, `shiftEnter: "newline"`, `modEnter: "newline"`, and `rejectedSubmit: "newline"`. `canSubmit` and `onSubmit` receive the same authoritative snapshot captured from the current `EditorView` during the key command; hosts never need to read React state or an editor ref. IME composition, read-only state, and active completion acceptance take precedence.

When the selected submit key reaches submit handling but `canSubmit` is false, `rejectedSubmit: "newline"` dispatches one literal `"\\n"` replacement transaction at the selection; it does not invoke Markdown list/table/code Enter handlers and never calls `onSubmit` or clears text. `rejectedSubmit: "markdown"` instead delegates to normal context-sensitive Markdown Enter behavior and is available only for document-oriented profiles. E2 tests the message-profile literal-newline path for empty, oversized, and pending drafts inside ordinary text, lists, and fenced code.

### Toolbar

Expose a stable command registry/handle and let the host compose its own toolbar. The package supplies accessible primitives and command enablement state, not a fixed message toolbar. Channels selects its compact actions; MinuNotes retains its document controls.

### Sizing

Keep pixel `minHeight`/`maxHeight` compatible, and add an opt-in profile sizing form for `minLines`, `maxLines`, and `maxViewportRatio`. It must measure wrapped visual lines, reflow on width changes, preserve selection, and apply without remounting.

### Dynamic reconfiguration

Profile, completion providers, submit policy, sizing, read-only state, and feature registrations must update through stable CodeMirror compartments. They must not recreate `EditorView`, lose selection, duplicate key handlers, or retain/call stale async completion requests.

## Proposed budgets

E2 reports both package-owned and actual-consumer cost. React remains excluded because Channels already ships it; CodeMirror and Lezer are included in the Channels budget because Channels does not currently ship them.

| Budget | Limit | Measurement |
| --- | ---: | --- |
| MinuEditor-owned core output | <= 55 kB gzip JS and <= 6 kB gzip CSS | packed `@dpklabs/minueditor/core` ESM output, excluding peer dependency modules |
| Incremental Channels message-profile cost | <= 180 kB gzip JS and <= 12 kB gzip CSS | difference between the reference Channels production build with no MinuEditor import and the same build importing only `@dpklabs/minueditor/core` plus `core/theme.css`; includes newly introduced CodeMirror and Lezer modules |
| Document feature code in message initial graph | 0 B | consumer metafile/chunk graph; Mermaid, Shiki, language descriptions, and `document` modules must be absent |

**Reference consumer build:** the Channels `packages/web` Vite production build at a fixed lockfile, with a deterministic message-profile fixture route containing the core editor, no document feature kit, no language descriptions, no Shiki, and no Mermaid. The report sums gzip sizes for emitted JS/CSS chunks reachable from that route, excluding source maps and already-present React chunks, then reports the baseline-to-fixture delta.

**Reference interaction workload:** Chromium headless on macOS arm64 (Apple M2 Pro, performance power mode), 10 warm runs after one warm-up. The fixture starts with a 10 kB Markdown value; it performs 250 sequential ordinary-character edits, opens a five-item completion list and accepts one item, then executes Enter submit.

For each action, collect two samples:

1. **Synchronous editor/input processing:** from the start of the key command to return from the editor's transaction/update listener. Budget: p95 <= 16 ms for ordinary edits, completion acceptance, and submit dispatch.
2. **Input-to-next-paint:** from the start of the key command through the next `requestAnimationFrame`. Budget: p95 <= 32 ms for ordinary edits, completion acceptance, and submit dispatch.

The second measure includes refresh-phase delay and is not used to judge synchronous editor cost. The test records browser version, hardware, and raw samples so another reference machine can rerun it.

The current root artifact is 93.5 kB gzip before a consumer bundle and therefore leaves too little margin. E2 must split the current root before Channels adoption; E1 does **not** approve the current package as a message-composer dependency.

## E2 acceptance tests

- message-entry consumer bundle proves no document, Mermaid, Shiki, or language chunks in its initial graph and reports both required bundle budgets;
- root facade, `core`, `document`, and all three CSS entrypoints are verified by a packed-consumer smoke test; document consumers retain current behavior and supported root exports;
- Enter/Shift+Enter/Mod+Enter, authoritative submit snapshots, IME, completion acceptance, read-only, rejected-submit literal-newline behavior for empty/oversized/pending drafts in text/lists/fenced code, undo/redo, and focus tests pass;
- async completion cancellation and stale-result tests pass;
- profile/provider/sizing changes preserve selection and do not remount the view;
- packed-consumer smoke test and measured bundle report are included in release evidence.

## Gate decision

Proceed to public-API design review. Do not start E2 implementation or add MinuEditor to Channels until the contracts and budgets above are approved.
