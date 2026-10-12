# Release Checklist

## Scope and Approval

1. Confirm the release branch contains only the intended commits and includes the latest `origin/main`.
2. Choose the version, update `package.json`/`package-lock.json`, and move the release notes out of `Unreleased`.
3. Commit preparation locally so `release:tag:dry-run` can validate a clean tree.
4. Run `pnpm run release:tag:dry-run` before creating a tag. This validates the release without tagging or pushing.
5. Get approval before integrating/pushing to `main`, creating/pushing `v<version>`, or publishing to npm. The tag script does not publish to npm or create a GitHub Release.

## Before Packing

1. Run `npm run check:release`
2. If it fails, fix the reported issue before packing or publishing.

## Release Build

1. Run `npm run build:release`
2. Run `npm run verify:dist`

This confirms:

1. `dist/` was rebuilt from a clean state
2. expected runtime and CSS files exist
3. no sourcemaps were emitted into the release output

## Package Validation

1. Run `npm pack --dry-run`
2. Confirm the package includes:
   - `dist/index.js`
   - `dist/index.cjs`
   - `dist/index.d.ts`
   - `dist/theme.css`
   - `dist/themes/light.css`
   - `dist/themes/dark.css`

3. Run `npm pack`
4. Inspect the tarball if needed:

```bash
tar -tf dpklabs-minueditor-<version>.tgz
```

## Consumer App Validation

### Tarball Install

1. In a separate app, install the tarball:

```bash
npm install /absolute/path/to/dpklabs-minueditor-<version>.tgz
```

2. Verify these imports work:

```ts
import { MarkdownEditor, MarkdownRenderer } from '@dpklabs/minueditor'
import '@dpklabs/minueditor/theme.css'
import '@dpklabs/minueditor/themes/dark.css'
```

3. Verify runtime behavior:
   - editor renders
   - renderer renders
   - toolbar works
   - image upload works when `onImageUpload` is provided
   - app build succeeds

### GitHub Install

1. In a separate app, install directly from GitHub:

```bash
npm install github:minuscule-labs/minueditor#v<version>
```

2. Verify the same imports and runtime behavior after the approved tag has been pushed; use the exact tag rather than `main` for reproducible validation.
3. Confirm `prepare` runs and the package is usable after install.

## Convenience Script

Run the combined package check:

```bash
npm run check:package
```

For a clean release-oriented validation flow:

```bash
npm run check:release
```
