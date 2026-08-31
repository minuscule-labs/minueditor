# Minimal rich-block lifecycle

This lifecycle is derived from two implemented portable Markdown features—callouts and Mermaid—rather than from a speculative general plugin system.

## Canonical-source rule

Markdown remains the only document representation. A rich block matches a source range and derives a preview; it never stores rendered HTML or block metadata in the document. Unsupported, disabled, loading, failed, and source modes all retain recoverable Markdown.

## Proven lifecycle

Mermaid establishes the first asynchronous lifecycle:

1. **Match:** identify a closed, exact `mermaid` fenced block and its content range.
2. **Fallback:** leave unmatched, malformed, unclosed, or disabled syntax as an ordinary code block.
3. **Inactive preview:** replace an inactive source range with a block widget.
4. **Loading:** expose a non-disruptive status while lazily loading and rendering.
5. **Ready:** apply only the current render result.
6. **Cancellation:** abort lifecycle work and ignore stale results when a widget is removed or source changes.
7. **Error:** show a bounded message and plain-text source fallback.
8. **Edit:** move the editor selection into the exact source range and remove the preview.
9. **Static parity:** enhance the corresponding static code block through the same renderer and lifecycle.
10. **Cleanup:** cancel pending work when the editor widget or static renderer unmounts.

Callouts prove the synchronous subset: portable matching, inactive preview, exact-source reveal, static parity, semantic theming, accessibility labels, slash insertion, and ordinary-Markdown fallback.

## Mermaid policy

- Mermaid is opt-in through the `mermaid` prop.
- The package is dynamically imported only when enabled and a diagram renders.
- `securityLevel` is fixed to `strict`; hosts cannot weaken it through MinuEditor configuration.
- MinuEditor performs no diagram-side network fetching.
- Editable mode exposes an **Edit source** control.
- Rendered diagrams expose explicit inline pan, zoom, and reset controls plus an expanded modal for direct pointer, wheel, pinch, touch, and keyboard interactions; hosts may disable them with `interactive: false`.
- Read-only and static modes render without source-edit controls.
- Invalid diagrams retain a visible source fallback.
- A host may provide a compatible lazy engine loader for deterministic loading or tests.

## Current internal boundary

`startAsyncBlockRender` supplies only cancellation, stale-result suppression, success application, and failure delivery. It intentionally does not define a public block registry, arbitrary HTML contract, toolbar API, network policy, or persistence model.

A later block should reuse this lifecycle only when its real requirements overlap. If math, CSV previews, or host-resolved media need materially different matching or trust behavior, extend the boundary from evidence rather than forcing them into Mermaid's shape.

## Review checklist for future blocks

- Is the syntax portable and editable without the renderer?
- Are matching and source ranges deterministic?
- Is loading optional and lazy?
- Can pending and stale work be cancelled or ignored?
- Are errors bounded and source-preserving?
- Do live, source, read-only, and static modes agree semantically?
- Is accessibility meaningful without disruptive alerts?
- Are trust, HTML, and network capabilities explicit?
- Can the host disable the feature without changing source?
