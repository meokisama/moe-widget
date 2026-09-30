# Changelog

## Unreleased

## 0.3.0

### Added

- `motion()` takes an array of groups and picks among all their motions alike.
- `bounds()` on the handle gives the box around what the model drew, in CSS pixels from the canvas's top left, to place a speech bubble or a label over it.

### Changed

- The default tap reaction picks among the motions of every group named like "tap", or else of every group but the idle one, each motion as likely. It used to pick a group first.

## 0.2.0

### Changed

- `ModelInfo.parameters` lists each parameter as `{ id, min, max, default }` instead of its id.

### Fixed

- A `layout` passed together with a new `model` waits for that model to appear, instead of moving the old one while the new one loads.
- A `layout` changed while a model loads is no longer undone when the load finishes.

## 0.1.0

Initial release.
