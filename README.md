<div align="center">

<img src="./assets/moe.png" alt="moe-widget" width="360" />

**Adorable Live2D characters that live on your web pages.**

<p>
  <a href="https://www.npmjs.com/package/moe-widget"><img src="https://img.shields.io/npm/v/moe-widget?style=flat-square&color=ff8fc7&labelColor=4b2a8a" alt="npm version" /></a>
  <a href="https://github.com/meokisama/moe-widget/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/meokisama/moe-widget/ci.yml?style=flat-square&color=8b6cf0&labelColor=4b2a8a&label=ci" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-b79cf5?style=flat-square&labelColor=4b2a8a" alt="MIT license" /></a>
</p>

</div>

<!--
  Demo GIF goes here, for example:
  <p align="center"><img src="./assets/demo.gif" alt="moe-widget demo" width="720" /></p>
-->

## Features

- **One install, no setup.** The Cubism Core and the WebGL shaders ship inside the package. No script tags, CDN files, or folders to copy.
- **Small until used.** Importing costs a few kilobytes. The Core and the Framework (about 110 kB gzipped) load when the first canvas mounts, as their own chunks. Nothing is drawn while the canvas is off screen.
- **SSR safe.** Works in Next.js and other server-rendered apps. The component is a client component, and importing on the server touches nothing browser-only.
- **Honest promises.** A missing or invalid model reaches `onError` instead of hanging. `motion()` resolves when the motion ends.
- **Safe to unmount.** Any number of canvases can come and go in any order, even while loading. StrictMode works.
- **Layouts that hold at any size.** Choose the part of the model to show and how to fit it, rather than tuning scale and position by eye.

## Install

```sh
npm install moe-widget
```

Needs React 18 or newer.

## Quick start

```tsx
import { Live2DCanvas } from "moe-widget";

export function Mascot() {
  return (
    <div style={{ width: 300, height: 400 }}>
      <Live2DCanvas model="/models/mao/Mao.model3.json" />
    </div>
  );
}
```

> The canvas fills its parent, so give the parent a size. The drawing buffer follows it, including on high-DPI screens.
> Model files are fetched relative to the model3.json, so serve the model's folder as it is, for example from `public/`.

The model idles, follows the pointer, and reacts to taps: a hit area named like "head" changes the expression, anywhere else plays a motion. Pass `onTap` to react your own way. Motion groups, expressions and hit areas are named by each model's author, so read them from `onLoad(model)` rather than guessing.

Changing `model` loads the new model over the old one. The old one stays on screen until the new one is ready.

## Controlling the model

The `ref` is a `Live2DCanvasHandle`, `null` until a model has loaded. Use it to play motions, change expressions, speak, and the rest.

```tsx
import { useRef } from "react";
import { Live2DCanvas, type Live2DCanvasHandle } from "moe-widget";

export function Mascot() {
  const live2d = useRef<Live2DCanvasHandle>(null);

  return (
    <>
      <div style={{ width: 300, height: 400 }}>
        <Live2DCanvas ref={live2d} model="/models/mao/Mao.model3.json" />
      </div>
      <button onClick={() => live2d.current?.motion("TapBody")}>Wave</button>
      <button onClick={() => live2d.current?.expression()}>Surprise me</button>
    </>
  );
}
```

### Lip sync

```tsx
// A URL or a media element. Resolves when the voice ends.
await live2d.current?.speak("/voice/hello.mp3");

// Or a MediaStream, such as the microphone.
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
live2d.current?.speak(mic);

live2d.current?.hush();
```

## Layout

Choose the part of the model to show and how to fit it:

```tsx
<Live2DCanvas
  model="/models/mao/Mao.model3.json"
  layout={{
    frame: [0, 0, 1, 0.6], // the upper 60% of the model's canvas: [left, top, width, height]
    fit: "contain", // or "cover", "width", "height"
    align: [0.5, 1], // bottom center of the leftover space
    scale: 1,
    offset: [0, 0], // CSS pixels
  }}
/>
```

Every value is relative, so the same layout works for any size. Changing `layout` moves the model without reloading it.

## API

### `<Live2DCanvas>` props

| Prop                                                               | Default                    |                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `model`                                                            |                            | URL of the model3.json. Required.                                                                               |
| `layout`                                                           | `{}`                       | See [Layout](#layout).                                                                                          |
| `follow`                                                           | `"window"`                 | What the eyes follow: the pointer anywhere, `"canvas"` only over it, or `false`.                                |
| `idle`                                                             | `"idle"`                   | The motion group played when nothing else is, in any case, or `false`.                                          |
| `pixelRatio`                                                       | `min(devicePixelRatio, 2)` | Drawing-buffer pixels per CSS pixel.                                                                            |
| `debug`                                                            | `false`                    | Logs Cubism's messages.                                                                                         |
| `className`, `style`                                               |                            | Passed to the canvas.                                                                                           |
| `onLoad(model, live2d)`                                            |                            | A model finished loading. `model` lists its motion groups, expressions, hit areas, parameters and size.         |
| `onError(error)`                                                   |                            | Loading failed.                                                                                                 |
| `onTap(event, live2d)`                                             | the reaction above         | The canvas was tapped. `event` has `x`, `y` (CSS pixels from the top left), `hitAreas`, and the `PointerEvent`. |
| `onMotionStart({ group, index })`, `onMotionEnd({ group, index })` |                            | A motion started or ended.                                                                                      |
| `onMotionEvent(value)`                                             |                            | A user event fired from a motion's timeline.                                                                    |

The callbacks get the same handle as the `ref`. Changing `pixelRatio` or `debug` restarts the canvas.

### `Live2DCanvasHandle`

| Member                                     |                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `motion(group, { index?, priority? })`     | Resolves `true` when the motion ends, `false` if it could not start or was cut off. The group matches in any case. The priority is `"idle"`, `"normal"` (the default), or `"force"`. |
| `expression(name?)`                        | Sets an expression. With no name it picks a random one, and `null` clears it.                                                                                                        |
| `speak(voice, { signal? })`                | Moves the lips with a URL, a media element, or a `MediaStream`.                                                                                                                      |
| `hush()`                                   | Stops the voice.                                                                                                                                                                     |
| `mouth`                                    | How open the mouth is, from 0 to 1.                                                                                                                                                  |
| `lookAt(clientX, clientY)`, `lookAt(null)` | Turns the head toward a point, or back to the front.                                                                                                                                 |
| `hitTest(clientX, clientY)`                | The hit areas under a point.                                                                                                                                                         |
| `setParameter(id, value)`                  | Holds a parameter at a value over motions. Pass `null` to release it.                                                                                                                |
| `model`                                    | Information about the model on screen.                                                                                                                                               |
| `canvas`                                   | The canvas element.                                                                                                                                                                  |

## Development

```sh
npm install
npm run dev              # playground at http://localhost:5173 with sample models
npm run build:playground # static build of the playground in playground/dist, ready to deploy
npm run check            # types
npm test
npm run build
```

`cubism/` holds the Live2D SDK and is generated. To move to a newer SDK, run `npm run sync-cubism -- <version>`, for example `5-r.6`. The script downloads the official release, applies the patches listed in `scripts/sync-cubism.mjs`, and fails loudly if one no longer fits.

<details>
<summary><b>Releasing</b></summary>

```sh
npm run changeset    # describe the change and pick patch, minor or major
npx changeset version
npm run release      # checks, tests, builds and publishes to npm
```

</details>

## License

The code in `src/` is under the [MIT license](./LICENSE). The package also includes Live2D Cubism components under Live2D's own licenses. See [NOTICE.md](./NOTICE.md).

> Those licenses are free for individuals and small businesses. A business with annual revenue of 10 million JPY or more needs a [Cubism SDK Release License](https://www.live2d.com/en/sdk/license/) to publish content that uses them.

Models belong to their authors and follow their own terms.
