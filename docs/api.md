# API

Everything is imported from `moe-widget`. For how to use it, see the [guide](./guide.md).

## `<Live2DCanvas>` props

| Prop                                                               | Default                    |                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `model`                                                            |                            | URL of the model3.json. Required. Changing it loads the new model over the old one.                             |
| `fetch(url, init)`                                                 | `fetch`                    | Fetches each of the model's files, at URLs resolved against `model`. Returns a `Response`; one that is not ok fails the load. Read when a load starts, so changing it does not reload the model. |
| `layout`                                                           | `{}`                       | A [`Layout`](#layout). Changing it moves the model without reloading it.                                        |
| `follow`                                                           | `"window"`                 | What the eyes follow: the pointer anywhere, `"canvas"` only over it, or `false`.                                |
| `idle`                                                             | `"idle"`                   | The motion group played when nothing else is, in any case, or `false`.                                          |
| `volume`                                                           | `1`                        | How loud the sounds motions play are, 0 to 1.                                                                   |
| `pixelRatio`                                                       | `min(devicePixelRatio, 2)` | Drawing-buffer pixels per CSS pixel.                                                                            |
| `debug`                                                            | `false`                    | Logs Cubism's messages.                                                                                         |
| `className`, `style`                                               |                            | Passed to the canvas.                                                                                           |
| `onProgress({ loaded, total })`                                    |                            | Another of the files a load waits for arrived: the model3.json first, then the rest up to the idle group's motions. |
| `onLoad(model, live2d)`                                            |                            | A model finished loading. `model` is a [`ModelInfo`](#modelinfo).                                               |
| `onError(error)`                                                   |                            | Loading failed.                                                                                                 |
| `onTap(event, live2d)`                                             | see below                  | The canvas was tapped. `event` is a [`TapEvent`](#tapevent).                                                    |
| `onMotionStart({ group, index })`, `onMotionEnd({ group, index })` |                            | A motion started or ended.                                                                                      |
| `onMotionEvent(value)`                                             |                            | A user event fired from a motion's timeline.                                                                    |

A motion's sound plays as a voice: it moves the lips, replaces any voice playing, and `hush()` stops it. Browsers block it until the page has had a user gesture.

The callbacks get the same handle as the `ref`. Changing `pixelRatio` or `debug` restarts the canvas.

Without `onTap`, a tap on a hit area named like "head" sets a random expression. Anywhere else it plays a motion from a group named like "tap", or from any group but the idle one.

## `Live2DCanvasHandle`

The `ref`, `null` until a model has loaded. Coordinates are in the viewport, like a pointer event's `clientX` and `clientY`.

| Member                                     |                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `motion(group, { index?, priority? })`     | Resolves `true` when the motion ends, `false` if it could not start or was cut off. The group matches in any case. The index is random by default, avoiding the last one played.                       |
| `expression(name?)`                        | Sets an expression. With no name it picks a random one, and `null` clears it.                                                                                                                          |
| `speak(voice, { signal? })`                | Moves the lips with a [`Voice`](#voice). Resolves when it ends, is stopped, or another voice starts.                                                                                                   |
| `hush()`                                   | Stops the voice.                                                                                                                                                                                       |
| `mouth`                                    | How open the mouth is, from 0 to 1, on top of any voice playing.                                                                                                                                       |
| `lookAt(clientX, clientY)`, `lookAt(null)` | Turns the head toward a point, or back to the front.                                                                                                                                                   |
| `hitTest(clientX, clientY)`                | The hit areas under a point.                                                                                                                                                                           |
| `setParameter(id, value)`                  | Holds a parameter at a value over motions. Pass `null` to release it.                                                                                                                                  |
| `model`                                    | The [`ModelInfo`](#modelinfo) on screen. During a model change it is the old one until the new one loads.                                                                                              |
| `canvas`                                   | The canvas element.                                                                                                                                                                                    |

## Types

### `Layout`

| Field    | Default        |                                                                                                   |
| -------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `frame`  | `[0, 0, 1, 1]` | The part of the model's canvas to fit, as `[left, top, width, height]` fractions of it.           |
| `fit`    | `"contain"`    | `"contain"` shows all of the frame, `"cover"` fills the canvas and crops, `"width"` and `"height"` match that side. |
| `align`  | `[0.5, 0.5]`   | Where the frame sits in the leftover space, from `[0, 0]` (top left) to `[1, 1]` (bottom right).  |
| `scale`  | `1`            | Multiplies the fitted size.                                                                       |
| `offset` | `[0, 0]`       | Shifts the model, in CSS pixels.                                                                  |

### `ModelInfo`

| Field                 |                                                     |
| --------------------- | --------------------------------------------------- |
| `url`                 | The resolved model3.json URL.                       |
| `motions`             | Each motion group's motions in index order, named by file without its folder or `.motion3.json`. Labels only: play one by group and `index`. |
| `expressions`         | Expression names.                                   |
| `hitAreas`            | Hit area names.                                     |
| `parameters`          | Parameter ids.                                      |
| `width`, `height`     | The model's canvas in its own pixels.               |

### `TapEvent`

| Field      |                                                                |
| ---------- | -------------------------------------------------------------- |
| `x`, `y`   | CSS pixels from the canvas's top left.                         |
| `hitAreas` | The hit areas under the point, in the order the model lists them. |
| `event`    | The `PointerEvent`.                                            |

A press that moves more than 10 px is a drag and fires no tap.

### Others

| Type            |                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `MotionOptions` | `{ index?, priority? }`, the second argument of `motion`.                                                             |
| `Priority`      | `"idle"` yields to everything, `"normal"` (the default) is refused while a `normal` or `force` motion plays, `"force"` interrupts. |
| `MotionEvent`   | `{ group, index }`, passed to `onMotionStart` and `onMotionEnd`.                                                      |
| `Voice`         | A URL, an `HTMLMediaElement`, or a `MediaStream`.                                                                     |
| `LoadProgress`  | `{ loaded, total }`, passed to `onProgress`.                                                                          |
| `Fetch`         | `(url: URL, init: RequestInit) => Promise<Response>`, the type of the `fetch` prop.                                   |
| `Live2DCanvasProps` | The props above.                                                                                                  |
