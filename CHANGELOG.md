# Changelog

## 0.2.1

- Fixed initial markdown heading rendering by refreshing CodeMirror decorations after the editor mounts and layout has had a frame to stabilize.
- Added a full-document decoration scan fallback for cases where CodeMirror visible ranges are not ready during initial render.

Verified with typecheck, tests, build, dist verification, and package dry run.
