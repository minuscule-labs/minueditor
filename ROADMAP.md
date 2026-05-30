# Roadmap

## Planned: Notion-style image insertion

`/Image` currently inserts raw markdown image syntax (`![]()`). Paste and drop already support uploaded images through the consumer-provided `onImageUpload(file) => Promise<string>` hook.

Build a richer `/Image` flow that keeps storage application-owned while making image insertion editor-owned.

### Goals

1. Selecting `/Image` opens an inline image picker block/popover instead of only inserting `![]()`.
2. The picker supports:
   - **Upload**: choose a local image file with a hidden `<input type="file" accept="image/*">` and call `onImageUpload`.
   - **Link**: paste an image URL and insert markdown directly.
3. The editor owns markdown insertion, loading state, focus handling, and visible upload errors.
4. The host application continues to own storage, auth, validation, and the final URL returned from `onImageUpload`.

### Non-goals for the first pass

1. Built-in storage providers.
2. Built-in Unsplash/GIPHY integrations.
3. Media library management.

These can be added later as provider slots supplied by the host app.

### Suggested UX

1. User types `/image` and selects **Image**.
2. Editor inserts a temporary "Add an image" widget at the current position.
3. Widget shows tabs/buttons for **Upload** and **Link**.
4. Upload flow:
   - user clicks **Upload file**
   - native file picker opens
   - editor inserts an uploading placeholder
   - `onImageUpload(file)` resolves to a URL
   - placeholder becomes `![filename](url)`
5. Link flow:
   - user enters a URL
   - editor inserts `![](url)`

### API boundary

Keep the existing simple API working:

```tsx
<MarkdownEditor
  value={value}
  onChange={setValue}
  onImageUpload={async (file) => uploadAndReturnUrl(file)}
/>
```

If `onImageUpload` is absent, the picker should still allow **Link** and should hide or disable **Upload** with a clear message.

### Implementation notes

- Reuse the existing paste/drop upload path in `src/extensions/images.ts` where possible.
- Consider extracting shared upload placeholder helpers from `imagePasteHandler`.
- `/Image` is defined in `src/extensions/slash-commands.ts` and currently calls `insertImage` from `src/toolbar/commands.ts`.
- A richer picker likely belongs in the image extension rather than toolbar commands, because it needs DOM UI, file input, async upload state, and focus handling.
