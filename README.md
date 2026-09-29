# moe-widget

Live2D Cubism models on the web, with React bindings. Built on the official Cubism SDK for Web 5-r.5 and Cubism Core 6.

- **One install, no setup.** The Cubism Core and the WebGL shaders ship inside the package. There are no script tags, CDN files, or folders to copy.
- **Small until used.** Importing costs a few kilobytes. The Core and the Framework (about 110 kB gzipped) load on the first `Live2D.create`, as their own chunks.
- **SSR safe.** Importing on the server touches nothing browser-only.
- **Honest promises.** `load()` rejects on a missing or invalid file instead of hanging, and takes an `AbortSignal`. `motion()` resolves when the motion ends.
- **Safe to tear down.** Any number of canvases can come and go in any order, even while loading. React StrictMode works.
- **Layouts that hold at any size.** Choose the part of the model to show and how to fit it, rather than tuning scale and position by eye.

## Install

```sh
npm install moe-widget
```

## Usage

```ts
import { Live2D } from "moe-widget";

const live2d = await Live2D.create(document.querySelector("canvas")!);
await live2d.load("/models/mao/Mao.model3.json");

live2d.on("tap", ({ hitAreas }) => {
  if (hitAreas.includes("Head")) live2d.expression();
  else live2d.motion("TapBody");
});
```

The canvas is sized with CSS, and the drawing buffer follows it, including on high-DPI screens. Model files are fetched relative to the model3.json, so serve the model's folder as it is.

### React

```tsx
import { Live2DCanvas } from "moe-widget/react";

<div style={{ width: 300, height: 400 }}>
  <Live2DCanvas
    model="/models/mao/Mao.model3.json"
    layout={{ frame: [0, 0, 1, 0.6], align: [0.5, 1] }}
    onTap={({ hitAreas }, live2d) => live2d.motion("TapBody")}
  />
</div>;
```

The canvas fills its parent. `ref` gives the `Live2D` instance for calling `motion`, `speak`, and the rest. Changing `model` loads the new model over the old one.

## Layout

```ts
live2d.layout = {
  frame: [0, 0, 1, 0.6], // the upper 60% of the model's canvas: [left, top, width, height]
  fit: "contain",        // or "cover", "width", "height"
  align: [0.5, 1],       // bottom center of the leftover space
  scale: 1,
  offset: [0, 0],        // CSS pixels
};
```

Every value is relative, so the same layout works for any canvas size.

## API

### `Live2D.create(canvas, options?)`

| Option | Default | |
| --- | --- | --- |
| `layout` | `{}` | See above. |
| `follow` | `"window"` | What the eyes follow: the pointer anywhere, `"canvas"` only over it, or `false`. |
| `idle` | the group named "idle" | The motion group played when nothing else is, or `false`. |
| `pixelRatio` | `min(devicePixelRatio, 2)` | Drawing-buffer pixels per CSS pixel. |
| `debug` | `false` | Logs Cubism's messages. |

### Instance

| Member | |
| --- | --- |
| `load(url, { signal?, layout?, mouth? })` | Loads a model3.json. The previous model stays on screen until the new one is ready. A newer load aborts an older one. |
| `model` | Motion groups, expressions, hit areas, parameters and size of the loaded model, or `null`. |
| `motion(group, { index?, priority? })` | Resolves `true` when the motion ends, `false` if it could not start or was cut off. The priority is `"idle"`, `"normal"` (the default), or `"force"`. |
| `expression(name?)` | Sets an expression. With no name it picks a random one, and `null` clears it. |
| `mouth` | How open the mouth is, from 0 to 1. |
| `speak(voice, { signal? })` | Moves the lips with a URL, a media element, or a `MediaStream` such as a microphone. |
| `hush()` | Stops the voice. |
| `lookAt(clientX, clientY)`, `lookAt(null)` | Turns the head toward a point, or back to the front. |
| `hitTest(clientX, clientY)` | The hit areas under a point. |
| `setParameter(id, value)` | Holds a parameter at a value over motions. Pass `null` to release it. |
| `pause()`, `resume()`, `paused` | Stops and restarts the animation. Drawing also stops on its own while the canvas is off screen. |
| `on(event, listener)` | Returns a function that unsubscribes. The events are `load`, `error`, `tap`, `motionstart`, `motionend` and `motionevent`. |
| `destroy()` | Frees everything. Safe at any time. |

## Development

```sh
npm install
npm run dev              # playground at http://localhost:5173 with sample models
npm run build:playground # static build of the playground in playground/dist, ready to deploy
npm run check        # types
npm test
npm run build
```

`cubism/` holds the Live2D SDK and is generated. To move to a newer SDK, run `npm run sync-cubism -- <version>`, for example `5-r.6`. The script downloads the official release, applies the patches listed in `scripts/sync-cubism.mjs`, and fails loudly if one no longer fits.

### Releasing

```sh
npm run changeset    # describe the change and pick patch, minor or major
npx changeset version
npm run release      # checks, tests, builds and publishes to npm
```

## License

The code in `src/` is under the MIT license. The package also includes Live2D Cubism components under Live2D's own licenses. See [NOTICE.md](./NOTICE.md). Those licenses are free for individuals and small businesses. A business with annual revenue of 10 million JPY or more needs a [Cubism SDK Release License](https://www.live2d.com/en/sdk/license/) to publish content that uses them.

Models belong to their authors and follow their own terms.
