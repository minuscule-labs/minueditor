# Resource URL Resolver Baseline

## Scope

This records resource behavior before resolver implementation on:

- MinuEditor `v0.12.0`
- Baseline commit `6813545`
- Branch `feat/resource-url-resolver`
- `marked` `15.0.12`

Authoritative specification: MinuNotes note `note_e77e21d089084c2ab6144d983977e437`.

The baseline was converted into current regression coverage in `src/resource-url-behavior.test.tsx` as the implementation advanced.

## Static renderer

`MarkdownRenderer` currently delegates standard Markdown destinations directly to a module-level `Marked` instance.

| Destination/form | Current result | Planned result |
|---|---|---|
| `http:` / `https:` links and images | Emitted | Allow |
| Root/document-relative links and images | Emitted | Allow |
| Link fragments | Emitted | Allow |
| `mailto:` / `tel:` links | Emitted | Allow |
| `blob:` links and images | Emitted | Allow |
| Protocol-relative links and images | Emitted | Allow as external |
| Raster `data:` image | Emitted | Deny initially |
| `javascript:` link/image | Emitted unsanitized | Deny |
| Reference-style link | Resolved by Marked and emitted | Resolve at runtime |
| Angle-bracket autolink | Emitted as link | Resolve at runtime |
| GFM bare-URL autolink | Emitted as link | Resolve at runtime |
| Raw HTML link/image | Emitted unchanged | Remain outside resolver scope |
| Image title | Parsed separately and emitted correctly | Preserve |
| Balanced-parenthesis destination | Parsed correctly | Preserve |
| Angle-bracket image destination | Parsed and normalized correctly | Preserve |
| Encoded quote in destination | Remains inside `href`/`src`; does not create an event attribute | Preserve equivalent attribute safety |

The unsafe-scheme differences are intentional security hardening, not compatibility regressions.

## Live editor

| Form | Current result | Planned result |
|---|---|---|
| Inline HTTP(S) link | Live link widget and navigation | Preserve, then resolve at activation |
| Root/document-relative inline link | No live link widget | Add safe live behavior |
| Reference-style link | No live link widget | No new widget in this iteration |
| Angle/bare autolink | No live link widget from the external-link extension | No new widget in this iteration |
| Standalone ordinary image | Live image widget | Resolve runtime `src` |
| Inline image | No image widget | Remain outside this iteration |
| Image with optional title | Widget receives destination plus title as its `src` | Parse `Image`/`URL` nodes correctly |
| Image destination containing balanced parentheses | No image widget | Parse and render correctly |
| Link with optional title | No external-link widget | Parse and render inline link correctly |
| Link destination containing balanced parentheses | Widget is created with a truncated URL | Parse complete URL correctly |

## Confirmed implementation hazards

1. Static Markdown destinations have no final URL policy.
2. The live image regex does not separate an optional title and rejects balanced-parenthesis destinations.
3. The live link regex rejects titled links and truncates balanced-parenthesis destinations.
4. Live link recognition is HTTP(S)-only.
5. Reference links and autolinks have intentionally narrower live behavior than static rendering.
6. Raw HTML remains a separate trusted-content/security concern.

## Baseline verification

```bash
pnpm run typecheck
pnpm test
```

Phase 0 is complete when these tests pass and the expected intentional changes above agree with the authoritative specification.
