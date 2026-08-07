# Controlled comments

MinuEditor renders and edits comments but does not persist them or make network requests. A host such as MinuNotes owns comment records, actors, permissions, activity events, and CRUD endpoints.

## Integration

Pass a controlled `comments` configuration:

```tsx
<MarkdownEditor
  ref={editorRef}
  value={markdown}
  onChange={setMarkdown}
  comments={{
    items: comments,
    documentVersion: contentHash,
    onCreate: async (input) => api.createComment(noteId, input),
    onUpdate: async (id, update) => api.updateComment(id, update),
    onDelete: async (id) => api.deleteComment(id),
    onAnchorChange: (id, anchor) => updateMappedAnchor(id, anchor),
    onSelect: setSelectedComment,
  }}
/>
```

The host must update `items` after a callback succeeds. CRUD callbacks may be synchronous or asynchronous; rejected promises are shown in the comment panel. Comment and line-group ordering follows the host-provided `items` order. The built-in panel is enabled by default. A host-provided popover can pass `showPanel: false`, use `onRequest(anchor)` to open its composer, `onSelect` for one anchor, and `onSelectGroup(comments)` to receive every visible comment represented by a clicked line icon. The built-in panel scrolls to and selects attached anchors when their cards are opened; detached cards remain available without navigating. When `createdAt` or `updatedAt` is present, the panel displays the latest timestamp and accepts `formatTimestamp(timestamp, comment)` for host-localized labels.

## Interaction

- Select source text and choose **Comment** from the selection toolbar.
- Hosts can invoke the same flow with `editorRef.current?.requestComment()`.
- Hover or place the cursor on a line to reveal its right-side comment action. Clicking it selects the complete source line and opens the composer.
- Commented text receives an inline highlight and a compact right-gutter comment icon; the icon does not display a count.
- Selecting a highlight or existing icon opens the simple side panel.
- The panel supports plain-text creation/editing, resolve/reopen, and delete.
- Independent comments may share an exact anchor, overlap, or target separate ranges on one source line. A clicked line icon opens that complete group. The panel exposes every card with its own quoted anchor text and comment body under **Other comments on this passage** and provides **Add another comment on this text** for the active exact anchor.
- Narrow layouts move the panel below the editor.

Replies, mentions, reactions, suggested edits, and network behavior are not part of this contract.

## Anchors

A comment anchor stores exact source offsets plus the original quote and optional surrounding context:

```ts
{
  anchorType: 'range',
  from: 42,
  to: 61,
  quote: 'selected source text',
  prefix: 'up to 32 source characters',
  suffix: 'up to 32 source characters',
  documentVersion: contentHash,
}
```

When the document changes, MinuEditor maps `from` and `to` through the CodeMirror change set and calls `onAnchorChange`.

- `range` anchors retain their original quote and become `detached` when the mapped range no longer contains it.
- `line` anchors normalize back to complete source-line boundaries and update their quote/context as that line is edited. They become detached when the anchored range is fully removed.

Detached comments remain available in the side-panel list but do not highlight unrelated text.

The host should persist mapped anchors as appropriate. When loading a comment against a newer document version, the host may use quote plus prefix/suffix context to reattach it. If no unique match exists, pass `detached: true` rather than guessing.

## Generic annotations and diff review

`DocumentAnnotation` remains a lower-level, host-controlled decoration API. It can represent diagnostics, review metadata, or ranges derived from a version diff. Comments use the dedicated controlled contract above; there is no AI-specific wrapper or persistence model in MinuEditor.
