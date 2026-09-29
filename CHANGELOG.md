# Changelog

## Unreleased

### Changed

- `ModelInfo.parameters` lists each parameter as `{ id, min, max, default }` instead of its id.

### Fixed

- A `layout` passed together with a new `model` waits for that model to appear, instead of moving the old one while the new one loads.
- A `layout` changed while a model loads is no longer undone when the load finishes.

## 0.1.0

Initial release.
