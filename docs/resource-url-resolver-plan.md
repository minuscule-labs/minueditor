# Resource URL Resolver Implementation Plan

## Source specification

This plan implements the accepted technical specification in MinuNotes:

- **Title:** MinuEditor Resource URL Resolver — Technical Specification
- **Note ID:** `note_e77e21d089084c2ab6144d983977e437`
- **Role:** Authoritative product and security contract

If this repository plan and the MinuNotes specification differ, stop and reconcile the specification before changing behavior.

## Progress

- [x] Phase 0 — Baseline and contract fixtures (`docs/resource-url-resolver-baseline.md`)
- [x] Phase 1 — Destination policy and parsed-link foundation
- [x] Phase 2 — Public API and isolated static rendering
- [x] Phase 3 — Live image resolution and refresh
- [x] Phase 4 — Safe live-link navigation and copy behavior
- [x] Phase 5 — Hardening, parity, and documentation
- [ ] Phase 6 — Release and downstream integration

## Goal

Add one optional synchronous `resourceUrlResolver` to `MarkdownEditor` and `MarkdownRenderer`. Hosts can translate canonical Markdown image and link destinations into context-specific runtime URLs without modifying the Markdown document.

```ts
export type ResourceKind = 'image' | 'link'

export interface ResourceUrlContext {
  kind: ResourceKind
}

export type ResourceUrlResolver = (
  source: string,
  context: ResourceUrlContext,
) => string
```

The same work introduces explicit final-destination validation for standard Markdown links and images. This is intentional security hardening: the current static renderer does not sanitize these destinations.

## Invariants

1. Markdown document text remains unchanged by resolution.
2. Source mode, editing fields, selections, history, comments, save callbacks, and Markdown clipboard operations use canonical destinations.
3. Rendered `src`/`href`, link opening, Cmd/Ctrl-click, and browser-style **Copy link address** use resolved destinations.
4. Resolver failure falls back to the canonical parsed destination, followed by normal destination validation.
5. Resolver output is untrusted and cannot bypass the final-destination policy.
6. Omitted resolver means identity resolution, apart from the separately documented security hardening.
7. Resolver state cannot leak between editor or renderer instances.
8. The resolver is pure, inexpensive, synchronous, and free of observable side effects; it may run repeatedly during rendering, decoration passes, and React StrictMode.
9. Hosts keep resolver function identity stable while its mapping is unchanged; a new identity signals live resource widgets to refresh.
10. Raw HTML destinations are not resolved or made safe by this feature.
11. Live image support remains limited to image forms the editor already renders; this work does not add inline-image widgets.
12. Wikilinks remain exclusively governed by `WikiLinkResolution`; `resourceUrlResolver` does not apply to them.
13. MinuEditor remains unaware of MinuNotes routes, attachment IDs, origins, tokens, and authentication.

## Accepted URL policy

| Destination | Links | Images |
|---|---|---|
| `https:` / `http:` | Allow | Allow |
| Root-relative and document-relative | Allow | Allow |
| `#fragment` | Allow | Deny |
| `mailto:` / `tel:` | Allow | Deny |
| `blob:` | Allow | Allow |
| Any `data:` URL | Deny initially | Deny initially |
| Protocol-relative `//host/path` | Allow as external | Allow as external |
| `javascript:`, `vbscript:`, `file:` | Deny | Deny |
| Unknown explicit schemes | Deny | Deny |

Additional policy rules:

- Protocol-relative URLs must never be classified as app-owned root-relative paths.
- Reject control-character and whitespace-obfuscated schemes.
- Use shared validation internals with kind-specific link and image entry points.
- Implement the policy fresh from this matrix; do not reuse rich-paste `safeUrl`, whose scheme policy differs.
- Escape approved destinations at HTML attribute emission; URL validation and output encoding are separate defenses.
- Fail closed without placing a denied destination in the DOM or passing it to navigation APIs.
- Development diagnostics are optional and must not print sensitive resolved URLs.
- Any future raster `data:` support requires a separately reviewed exact MIME allowlist; SVG data images remain denied.

## Baseline implementation map

The following describes the pre-implementation state at commit `6813545`.

- `src/types.ts` — public editor props and shared public types.
- `src/index.tsx` — manual package type exports.
- `src/MarkdownEditor.tsx` — CodeMirror extension assembly and prop reconfiguration.
- `src/extensions/images.ts` — standalone live image widgets; currently assigns canonical `src` directly.
- `src/extensions/link-click.ts` — Cmd/Ctrl-click using an HTTP(S)-only regex.
- `src/extensions/link-widget.ts` — live external-link spans, editor panel, open, and copy behavior using an HTTP(S)-only regex.
- `src/extensions/rich-paste.ts` — paste-only `safeUrl`; it must not be reused as the new final-destination policy.
- `src/renderer/index.tsx` — static rendering through a module-level `Marked` instance.
- `src/renderer/renderer.test.tsx` — static renderer tests.
- `src/MarkdownEditor.test.tsx` — live editor, image, and link behavior tests.
- `src/parity.test.tsx` and `dev/fixtures/markdown-parity.ts` — live/static semantic parity coverage.

CodeMirror's Markdown tree exposes `Link` and `Image` nodes with a child `URL` node. The implementation should use these parsed ranges instead of broadening the current regular expressions.

## Phase 0 — Baseline and contract fixtures

### Deliverables

- Record current behavior for:
  - Static HTTP(S), relative, fragment, `mailto:`, `blob:`, `data:`, and executable-scheme destinations.
  - Live HTTP(S) links and standalone images.
  - Link and image titles, angle-bracket destinations, and destinations containing balanced parentheses.
  - Static reference-style links, angle-bracket autolinks, and GFM bare-URL autolinks.
  - Attribute-sensitive destination characters.
  - Raw HTML links and images.
- Add focused regression fixtures where needed before refactoring.
- Confirm the baseline command suite passes.

### Commands

```bash
pnpm run typecheck
pnpm test
```

### Exit criteria

- Existing behavior is captured well enough to distinguish intentional security changes from regressions.
- Any discrepancy with the source specification is documented before implementation continues.

## Phase 1 — Destination policy and parsed-link foundation

### Deliverables

1. Add an internal resource-destination module, for example `src/internal/resource-urls.ts`, containing:
   - Identity resolution.
   - Exception-safe resolver invocation.
   - Shared scheme/path classification implemented independently of rich-paste `safeUrl`.
   - Kind-specific final validation.
   - A result shape that makes denied destinations explicit rather than returning a misleading URL.
2. Add an internal parsed-resource abstraction based on CodeMirror's Markdown syntax tree:
   - Preserve canonical source ranges.
   - Extract the parsed `URL` node.
   - Support titles, angle-bracket destinations, escaped syntax, and balanced parentheses where the parser supports them.
   - Distinguish `Link` from `Image`.
3. Prove equivalent parsed-resource behavior with focused tests before the live consumers replace their existing regexes in Phases 3 and 4.
4. Keep raw HTML explicitly outside the shared standard-Markdown policy.

### Tests

- Every row of the accepted URL policy for both resource kinds.
- Mixed-case and whitespace/control-character scheme bypass attempts.
- Protocol-relative URLs are allowed but identified as external.
- Unknown explicit schemes fail closed.
- Parsed links and images retain canonical document ranges and parsed URL values.
- Link and image titles, angle-bracket syntax, and balanced parentheses parse correctly.
- Images are not returned as ordinary links.
- Safe raw HTML remains unchanged and is not passed through the resolver/policy path.

### Exit criteria

- One shared policy is defined and tested for standard Markdown destinations.
- A syntax-tree parsed-resource abstraction is ready for the live consumers without broadening their current regexes.
- Security hardening is isolated and covered before resolver-specific behavior is added.

## Phase 2 — Public API and isolated static rendering

### Deliverables

1. Add and export:
   - `ResourceKind`
   - `ResourceUrlContext`
   - `ResourceUrlResolver`
2. Add optional `resourceUrlResolver` props to `MarkdownEditorProps` and `MarkdownRendererProps`.
3. Re-export public types from `src/index.tsx`.
4. Refactor static rendering so each renderer instance has isolated resolver behavior:
   - Do not mutate a module-level `Marked` renderer with a component resolver.
   - Preserve code rendering, GFM, Mermaid, callouts, task lists, tables, and highlighting.
   - Resolve every standard Markdown link/image token produced by Marked, including reference-style links, angle-bracket autolinks, and GFM bare-URL autolinks.
   - Validate after resolver success or canonical fallback.
   - Preserve Marked-equivalent HTML attribute escaping for approved resolver output.
5. Preserve raw HTML without applying resource resolution in this iteration.
6. Keep wikilinks outside this resolver pipeline.

### Tests

- No resolver and identity resolver produce equivalent allowed destinations.
- Relative image and link destinations resolve correctly.
- External destinations can pass through unchanged.
- Resolver exceptions fall back and are then validated.
- Unsafe canonical and resolver-produced destinations fail closed.
- Attribute-sensitive resolver output remains safely encoded in emitted HTML.
- Reference-style links and autolinks follow the documented static scope.
- Raw HTML destinations are not transformed.
- Wikilinks remain outside the resolver pipeline.
- Two simultaneous renderers use different resolvers without leakage.
- Rerendering or unmounting one renderer does not affect another.
- Existing renderer features remain intact.

### Exit criteria

- Static rendering satisfies the complete resolver contract.
- Public types are available from the package root.
- Instance isolation is demonstrated by tests.

## Phase 3 — Live image resolution and refresh

### Preferred CodeMirror design

Use a dedicated resolver facet configured through its own `Compartment`:

- `MarkdownEditor` reconfigures only that compartment when resolver identity changes and advances a resolver-generation token.
- Image-decoration updates detect the facet change and rebuild resource-dependent decorations.
- `ImageWidget` keeps the canonical source separately from the resolved runtime source.
- `ImageWidget.eq` includes the resolver generation so CodeMirror cannot reuse stale DOM or a stale broken-image placeholder after a resolver change.

This avoids both mutable-ref-only updates and canonical-only widget equality, either of which would leave mounted image DOM stale. Hosts should preserve resolver identity when its behavior is unchanged.

### Deliverables

- Extract image destinations from the CodeMirror `Image` node's child `URL` node rather than the current raw regex capture; preserve optional titles separately.
- Resolve standalone live image widget `img.src` with `{ kind: 'image' }`.
- Preserve canonical source and document ranges while including resolver generation in widget equality.
- Apply final image validation before assigning `img.src`.
- Preserve loading and broken-image behavior for the runtime source.
- Keep upload, paste, drop, picker, and `insertImage` output canonical.
- Reconfigure resolver behavior without changing document text, selection, history, or comment anchors.

### Tests

- Widget DOM uses the resolved source while `getMarkdown()` remains canonical.
- Switching resolver props updates a mounted image, including one already replaced by a broken-image placeholder.
- Image titles, angle-bracket destinations, and balanced parentheses are parsed without contaminating the resolver input.
- Switching live/source mode preserves canonical text.
- Selection and undo history survive resolver changes.
- Resolver exception fallback is validated.
- Denied image destinations render controlled broken/absent output rather than receiving an unsafe `src`.
- Upload callbacks returning canonical paths continue to insert those paths unchanged.
- Inline-image rendering behavior is not expanded accidentally.

### Exit criteria

- Existing live image widgets respond to resolver changes safely.
- No resource-only update enters document history or changes source offsets.

## Phase 4 — Safe live-link navigation and copy behavior

### Deliverables

- Use parsed inline Markdown link ranges in click and widget behavior.
- Extend live behavior from HTTP(S)-only inline links to allowed root-relative, document-relative, fragment, `mailto:`, `tel:`, `blob:`, and protocol-relative destinations.
- Do not add live reference-definition lookup, reference-style-link widgets, or autolink widgets in this iteration; their existing live behavior remains unchanged.
- Keep wikilinks on the separate `WikiLinkResolution` pathway.
- Preserve canonical destinations in:
  - Link span data used for editing.
  - Link editor inputs.
  - Markdown replacement/removal operations.
  - Source and selection clipboard operations.
- Resolve and validate only at activation time for:
  - Open-link controls.
  - Cmd/Ctrl-click.
  - Direct supported activation.
  - Browser-style **Copy link address**.
- Keep `noopener,noreferrer` behavior where a new browsing context is opened.

### Tests

- Root-relative attachment links receive live widget and click behavior.
- Link editor fields show and save canonical destinations.
- Open and Cmd/Ctrl-click receive the resolved URL.
- Copy-link-address receives the resolved URL.
- Markdown selection copying remains canonical.
- Resolver changes are observed lazily without rebuilding canonical source spans.
- Link titles, fragments, balanced parentheses, and allowed schemes do not regress.
- Images are excluded from link navigation.
- Reference-style links and autolinks do not gain new live widgets accidentally.
- Wikilink behavior does not regress or invoke `resourceUrlResolver`.
- Unsafe and malformed destinations never reach `window.open`, location navigation, or clipboard address-copy behavior.

### Exit criteria

- Live links satisfy navigation, editing, and clipboard invariants.
- Root-relative attachment links work without weakening navigation policy.

## Phase 5 — Hardening, parity, and documentation

### Deliverables

- Add live/static parity fixtures for canonical and resolved resources.
- Add API documentation with:
  - One generic base-origin example.
  - One host-owned attachment example that does not embed MinuNotes knowledge in MinuEditor.
  - Authentication limitations for images and bearer headers.
  - Raw HTML and synchronous-resolver limitations.
  - Resolver purity, performance, repeated invocation, and stable-identity expectations.
  - Static reference-link/autolink scope and narrower live-editor scope.
  - The separate wikilink resolution pipeline.
  - Canonical versus browser-style clipboard behavior.
- Add a changelog entry that separately identifies:
  - The new resolver API.
  - Intentional URL security hardening.
- Audit all standard Markdown DOM/navigation assignment sites for policy bypasses.
- Run package and distribution verification.

### Commands

```bash
pnpm run typecheck
pnpm test
pnpm run build
pnpm run verify:dist
npm pack --dry-run
```

### Exit criteria

- All acceptance tests pass.
- Documentation matches the MinuNotes specification.
- The package build exports the new types and props.
- No MinuNotes-specific route or authentication logic exists in MinuEditor.

## Phase 6 — Release and downstream integration

This phase requires explicit release approval and downstream MinuNotes work.

### Deliverables

1. Choose the package version according to project release policy.
2. Run the full release checklist and create a versioned MinuEditor release.
3. Integrate that released version into MinuNotes.
4. Implement host resolvers for authenticated and public-share contexts.
5. Verify cookie/share authorization and approved legacy-origin handling.
6. Switch new uploads to canonical relative attachment destinations only after live and static integration tests pass.

### Exit criteria

- MinuNotes depends on a released MinuEditor version, not an unpublished workspace state.
- Hosted, self-hosted, and public-share attachment rendering is verified.
- External URLs remain unchanged and unapproved legacy/lookalike origins are not rewritten.

## Cross-phase test matrix

| Invariant | Static renderer | Live image | Live link |
|---|---:|---:|---:|
| Canonical Markdown unchanged | Required | Required | Required |
| Resolver success | Required | Required | Required |
| Resolver exception fallback | Required | Required | Required |
| Final policy after resolution | Required | Required | Required |
| Runtime resolver change | Required | Required | Lazy activation |
| Instance isolation | Required | Required | Required |
| Canonical editing fields | N/A | N/A | Required |
| Canonical Markdown copy | Required | Required | Required |
| Resolved address copy | N/A | N/A | Required |
| Raw HTML excluded | Required | N/A | N/A |

## Risks and controls

### Security behavior changes without a resolver

Final validation intentionally changes unsafe static-renderer output even when no resolver is supplied.

**Control:** Dedicated tests and a separate changelog entry; do not describe this as identity-output compatibility for denied URLs.

### Markdown parsing divergence

Marked and CodeMirror may expose parsed destinations differently for escapes or lexical syntax.

**Control:** Contract on parsed destinations, preserve original documents, and maintain shared fixture cases across live/static surfaces.

### Stale CodeMirror widget DOM

Changing a callback reference does not automatically recreate mounted image widgets.

**Control:** Dedicated facet/compartment reconfiguration and a resolver-generation token included in `ImageWidget.eq`.

### Resolver leakage

A shared mutable renderer could expose one tenant/share context through another component.

**Control:** Per-instance rendering configuration and explicit two-renderer isolation tests.

### Authentication mismatch

`<img>` cannot attach arbitrary authorization headers.

**Control:** Keep authentication host-owned and require cookie-authenticated, share-scoped, pre-signed, or pre-created blob URLs.

### Scope expansion

Raw HTML sanitization, inline image widgets, live reference/autolink widgets, wikilink integration, async URL minting, and export asset management could enlarge the feature substantially.

**Control:** Keep them explicit non-goals and open separate reviewed work if needed.

## Definition of done

- [ ] All seven phases (Phase 0 through Phase 6) meet their exit criteria.
- [x] Public API and package exports are complete.
- [x] URL policy is shared, explicit, and fully tested.
- [x] Static renderer instances are isolated.
- [x] Existing live images refresh when the resolver changes.
- [x] Safe relative links work in live editing.
- [x] Canonical document, editing, history, comments, and Markdown-copy invariants hold.
- [x] Documentation and changelog distinguish resolution from security hardening.
- [x] A versioned MinuEditor release exists before MinuNotes integration.
