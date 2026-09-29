# Guide

Every prop and member named here is listed in the [API](./api.md).

## Showing a model

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

- The canvas fills its parent, so give the parent a size. The drawing buffer follows it, including on high-DPI screens. A canvas with no size logs a warning.
- Model files are fetched relative to the model3.json, so serve the model's folder as it is, for example from `public/`.
- The model idles, follows the pointer, and reacts to taps with no other props.
- Motion groups, expressions and hit areas are named by each model's author, so read them from `onLoad(model)` rather than guessing.
- Changing `model` keeps the old model on screen until the new one is ready.
- A missing or invalid model reaches `onError`. Nothing is drawn while the canvas is off screen.

## Controlling the model

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

The ref is `null` until a model has loaded, hence the `?.`.

## Reacting to taps

```tsx
<Live2DCanvas
  model="/models/mao/Mao.model3.json"
  onTap={({ hitAreas }, live2d) => {
    if (hitAreas.includes("Body")) void live2d.motion("TapBody");
  }}
/>
```

Passing `onTap` replaces the default reaction entirely.

## Lip sync

```tsx
// A URL or a media element. Resolves when the voice ends.
await live2d.current?.speak("/voice/hello.mp3");

// Or a MediaStream, such as the microphone.
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
live2d.current?.speak(mic);

live2d.current?.hush();
```

The lips move the parameters in the model's LipSync group, or `ParamMouthOpenY` when it lists none. Browsers only start audio after a user gesture, so call `speak` from one.

## Layout

Choose the part of the model to show and how to fit it:

```tsx
<Live2DCanvas
  model="/models/mao/Mao.model3.json"
  layout={{
    frame: [0, 0, 1, 0.6], // the upper 60% of the model's canvas
    fit: "contain",
    align: [0.5, 1], // bottom center of the leftover space
  }}
/>
```

Every value is relative, so the same layout works at any canvas size.

## Server rendering

`Live2DCanvas` is a client component (`"use client"`), so it works from a Next.js server component as is. Importing the package on the server touches nothing browser-only.
