<div align="center">

<img src="./assets/moe2d.png" alt="moe2d" width="480" />

**Adorable Live2D characters that live on your web pages.**

<p>
  <a href="https://www.npmjs.com/package/moe2d"><img src="https://img.shields.io/npm/v/moe2d?style=flat-square&color=ff8fc7&labelColor=4b2a8a" alt="npm version" /></a>
  <a href="https://github.com/meokisama/moe2d/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/meokisama/moe2d/ci.yml?style=flat-square&color=8b6cf0&labelColor=4b2a8a&label=ci" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-b79cf5?style=flat-square&labelColor=4b2a8a" alt="MIT license" /></a>
</p>

</div>

<p align="center"><img src="./assets/demo.gif" alt="Mao, Zundamon and Roro following the pointer, reacting to taps and zooming in the playground" width="560" /></p>

## Features

- **One install, no setup.** The Cubism Core and the WebGL shaders ship inside the package, and nothing but React is needed. No PixiJS, script tags, CDN files, or folders to copy.
- **Alive with only a model.** It idles, follows the pointer and reacts to taps: a new expression on the head, a motion anywhere else.
- **Lip sync.** `speak()` moves the mouth with an audio URL, a media element or a `MediaStream`, so a TTS voice or a microphone works as well as a recording.
- **UI that sticks to the character.** `bounds()` tells where the model is drawn and `hitTest()` which part is under a point, so a speech bubble can sit on its head.
- **Layouts that hold at any size.** Choose the part of the model to show and how to fit it, rather than tuning scale and position by eye.
- **Small until used.** Importing costs a few kilobytes. The Core and the Framework (about 110 kB gzipped) load when the first canvas mounts, as their own chunks. Nothing is drawn while the canvas is off screen.
- **SSR safe.** Works in Next.js and other server-rendered apps. The component is a client component, and importing on the server touches nothing browser-only.
- **Robust.** A missing or invalid model reaches `onError` instead of hanging. Any number of canvases can come and go in any order, even while loading, and StrictMode works.

## Install

```sh
npm install moe2d
```

Needs React 18 or newer.

## Quick start

```tsx
import { Live2DCanvas } from "moe2d";

export function Mascot() {
  return (
    <div style={{ width: 300, height: 400 }}>
      <Live2DCanvas model="/models/mao/Mao.model3.json" />
    </div>
  );
}
```

The canvas fills its parent, so give the parent a size.

## A canvas, not a widget

**Moe2D** draws the model and lets you drive it: motions, expressions, the mouth, where it looks, where it is drawn. It ships no buttons, speech bubbles or panels, so the character fits your site's own design instead of bringing one of its own.

Those parts are a few lines of your own React. [`examples/companion.tsx`](./examples/companion.tsx) is a corner companion with a typed speech bubble and buttons to play a motion, swap the character and hide it. A reading site built from it:

<p align="center"><img src="./assets/companion.gif" alt="A book site with a companion in the corner that greets, moves, answers a tap and swaps from Zundamon to Mao" width="720" /></p>

## Documentation

- [Guide](./docs/guide.md): controlling the model, taps, lip sync, layout, server rendering.
- [API](./docs/api.md): every prop, the handle, and the exported types.
- [Architecture](./docs/architecture.md): how the library is built, and how to work on it.

## License

The code in `src` is under the [MIT license](./LICENSE). The package also includes Live2D Cubism components under Live2D's own licenses. See [NOTICE.md](./NOTICE.md). Those licenses are free for individuals and small businesses. A business with annual revenue of 10 million JPY or more needs a [Cubism SDK Release License](https://www.live2d.com/en/sdk/license/) to publish content that uses them.

Models belong to their authors and follow their own terms.
