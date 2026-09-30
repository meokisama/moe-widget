# Guide

How to use `moe2d`, case by case. Every prop, member and type named here has its exact definition in the [API](./api.md).

The examples use Mao, one of [Live2D's sample models](https://www.live2d.com/en/learn/sample/): motion groups `Idle` and `TapBody`, hit areas `Head` and `Body`, expressions `exp_01` to `exp_08`.

## Contents

- [Showing a model](#showing-a-model)
- [Where the model comes from](#where-the-model-comes-from)
- [Loading, progress and errors](#loading-progress-and-errors)
- [Size and layout](#size-and-layout)
- [Knowing what a model has](#knowing-what-a-model-has)
- [Controlling the model](#controlling-the-model)
- [Taps and hit areas](#taps-and-hit-areas)
- [Sound and lip sync](#sound-and-lip-sync)
- [Following motions](#following-motions)
- [Server rendering](#server-rendering)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)

## Showing a model

```sh
npm install moe2d
```

It needs React 18 or newer.

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

That is all a model needs. With only `model`, it:

- plays its `idle` group (matched in any case, so `Idle` works) over and over,
- blinks, breathes and runs its physics,
- turns its eyes and head toward the pointer anywhere on the page,
- reacts to taps (see [the default reaction](#the-default-reaction)).

The canvas fills its parent, so the parent needs a size.

## Where the model comes from

A Live2D model is a folder of files. The `.model3.json` lists the others by relative path:

```
mao/
  Mao.model3.json          <- `model` points here
  Mao.moc3
  Mao.physics3.json
  Mao.2048/texture_00.png
  motions/mtn_01.motion3.json
  expressions/exp_01.exp3.json
```

The library fetches the model3.json, then each file it lists at that path resolved against the model3.json's URL. `Mao.moc3` becomes `/models/mao/Mao.moc3`. Keep the folder as the author shipped it.

### From your own site

Put the folder where your app serves static files as they are: `public/` in Vite, Next.js and Create React App. `public/models/mao/Mao.model3.json` is then `model="/models/mao/Mao.model3.json"`.

### From another site

Any URL works:

```tsx
<Live2DCanvas model="https://cdn.example.com/models/mao/Mao.model3.json" />
```

The other site must allow your page to read its files, by answering with an `Access-Control-Allow-Origin` header (CORS). Without it, the browser blocks the load and `onError` gets a network error. This is the browser's rule, and no library can get around it; host the files yourself if the site does not send the header.

### Which models work

Cubism 3 and later: a `.model3.json` that names a `.moc3`. This covers models made with any recent Cubism Editor, up to Cubism 5.

Cubism 2 models do not load. They have a `model.json` (no `3`), a `.moc` and `.mtn` motions. Loading one fails with `names no .moc3 file`.

### Models made for VTube Studio

They load, but their `.model3.json` leaves out what VTube Studio keeps in its own `.vtube.json` or drives from face tracking. Fill it in once, in the file you serve.

The playground does it: open the model's zip with the folder button beside the model picker, check that it blinks and has its expressions, then press "Download the fixed zip". The button shows only when something was fixed, with what. Nothing leaves the browser. The fixed zip holds every file of the original, and:

- names its files in UTF-8, where a Chinese or Japanese Windows zipped them under its own code page, which other unzippers garble;
- lists in the `.model3.json` every `.exp3.json` and `.motion3.json` in its folder it left out: an expression under its hotkey's name, or its file name without one; the idle motion in `Idle`, the others in `Other`;
- fills an empty `EyeBlink` or `LipSync` group with the ids below, those the model has.

What the `.model3.json` already lists stays as it is.

By hand, add:

```json
{
  "FileReferences": {
    "Expressions": [{ "Name": "blush", "File": "blush.exp3.json" }],
    "Motions": { "Idle": [{ "File": "Scene1.motion3.json" }], "Other": [{ "File": "wave.motion3.json" }] }
  },
  "Groups": [
    { "Target": "Parameter", "Name": "EyeBlink", "Ids": ["ParamEyeLOpen", "ParamEyeROpen"] },
    { "Target": "Parameter", "Name": "LipSync", "Ids": ["ParamMouthOpenY"] }
  ]
}
```

- `Expressions`: every `.exp3.json` beside the model. Their names are on the `ToggleExpression` hotkeys of `.vtube.json`.
- `Motions`: the file `.vtube.json` names as `IdleAnimation` goes in `Idle`, which plays on its own. Group the rest as you like.
- `Groups`: without `EyeBlink` ids the model never blinks. Use the ids the model has, listed in its `.cdi3.json`.

VTube Studio stacks expressions (a face and a hand pose at once). [`expression`](./api.md) keeps one at a time.

### Serving the files yourself

Leave `fetch` out when the files sit at plain URLs, which is almost always. Pass it when they do not:

- the model is in a zip, or a file the user picked, so it only exists in memory,
- the server wants a header, such as `Authorization`,
- each file needs its own signed URL,
- the files come from a cache first.

`fetch(url, init)` is called once for every file, the model3.json included, with `url` already resolved against `model`. It returns a `Response`; one that is not `ok` fails the load. Pass `init` on if you call the page's `fetch`: it carries the signal that cancels the load.

The model3.json still decides which files are fetched. `fetch` only changes how.

A model in a zip, unzipped in memory with [fflate](https://github.com/101arrowz/fflate):

```tsx
import { unzipSync } from "fflate";

const files = unzipSync(new Uint8Array(await file.arrayBuffer()));

const fromZip = async (url: URL) => {
  const data = files[decodeURIComponent(url.pathname.slice(1))];
  return data ? new Response(new Blob([data])) : new Response(null, { status: 404 });
};

<Live2DCanvas model="zip:/Mao/Mao.model3.json" fetch={fromZip} />;
```

`zip:` is not a real scheme. It is just a URL that points at no server, so relative paths resolve as `zip:/Mao/Mao.moc3` and the function looks them up. Any scheme works this way. The playground's zip upload (`playground/zip.ts`) does the same, and also matches file names in any case.

A server that wants a token:

```tsx
import type { Fetch } from "moe2d";

const withToken: Fetch = (url, init) =>
  fetch(url, { ...init, headers: { Authorization: `Bearer ${token}` } });
```

Signed URLs:

```tsx
const signed: Fetch = async (url, init) => fetch(await sign(url), init);
```

The Cache Storage first, then the network:

```tsx
const cached: Fetch = async (url, init) => {
  const cache = await caches.open("models");
  const hit = await cache.match(url);
  if (hit) return hit;
  const response = await fetch(url, init);
  if (response.ok) await cache.put(url, response.clone());
  return response;
};
```

Define the function outside the component or in `useCallback`. It is read when a load starts, so passing a new one does not reload the model; it applies from the next `model` change.

## Loading, progress and errors

### Progress

```tsx
const [progress, setProgress] = useState(0);

<Live2DCanvas
  model="/models/mao/Mao.model3.json"
  onProgress={({ loaded, total }) => setProgress(loaded / total)}
/>;
```

The first call comes once the model3.json has arrived, since only then is `total` known. It counts every file the model waits for before it shows: the moc3, physics, pose, expressions, textures, and the idle group's motions and sounds. Other motions load the first time they play, and are not counted.

### Ready

```tsx
<Live2DCanvas
  model="/models/mao/Mao.model3.json"
  onLoad={(model, live2d) => {
    console.log(model.motions, model.expressions, model.hitAreas);
    void live2d.motion("TapBody");
  }}
/>
```

`onLoad` fires each time a model is on screen, including after every `model` change.

### Errors

```tsx
<Live2DCanvas model={url} onError={(error) => setMessage(String(error))} />
```

`onError` gets every failure to show a model, and a load never hangs instead. The usual causes:

| Error                                            | Why                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `404 Not Found for …`                            | A file is missing, or the folder was not served as it was shipped. |
| `Failed to fetch`, `NetworkError`                | Another site without CORS headers, or no network.                |
| `… names no .moc3 file`                          | Not a Cubism 3 model3.json, often a Cubism 2 model.              |
| `… is not a valid .moc3, or is newer than …`     | A damaged moc3, or one saved by a newer Cubism Editor than the bundled Core. |
| `this browser or canvas cannot create a WebGL context` | WebGL is off or not available.                             |

### Changing the model

Change `model`. The old model keeps playing until the new one is ready, then they swap, so there is no blank frame:

```tsx
const MODELS = ["/models/mao/Mao.model3.json", "/models/roro/roro.model3.json"];

export function Switcher() {
  const [index, setIndex] = useState(0);
  return (
    <>
      <div style={{ width: 300, height: 400 }}>
        <Live2DCanvas model={MODELS[index]!} />
      </div>
      <button onClick={() => setIndex((i) => (i + 1) % MODELS.length)}>Next</button>
    </>
  );
}
```

Changing `model` again mid-load cancels the load in progress. Unmounting mid-load is safe too.

## Size and layout

### Size

The canvas fills its parent (`display: block; width: 100%; height: 100%`). Size the parent, or size the canvas itself with `className` or `style`. A canvas with no size logs a warning.

The drawing buffer follows the CSS size times `pixelRatio`, so the model stays sharp on high-DPI screens and after every resize.

The canvas is transparent: whatever is behind it shows through.

### Layout

`layout` decides which part of the model shows and where it sits. Every value is relative, so one layout holds at any canvas size. Changing it moves the model at once, with no reload.

It works in two steps:

1. `frame` picks a rectangle of the model's own canvas, as `[left, top, width, height]` fractions of it. `[0, 0, 1, 1]` is all of it, `[0, 0, 1, 0.5]` the upper half.
2. `fit` scales that rectangle into your canvas, and `align` places it in the space left over. `scale` and `offset` then adjust it by hand.

Whole body, centered (the default):

```tsx
<Live2DCanvas model={url} />
```

Head and shoulders, filling a square avatar:

```tsx
<div style={{ width: 120, height: 120, borderRadius: "50%", overflow: "hidden" }}>
  <Live2DCanvas model={url} layout={{ frame: [0.25, 0.05, 0.5, 0.35], fit: "cover" }} />
</div>
```

The upper body, standing on the bottom edge:

```tsx
<Live2DCanvas model={url} layout={{ frame: [0, 0, 1, 0.6], align: [0.5, 1] }} />
```

A bit bigger, and nudged 20 px to the right:

```tsx
<Live2DCanvas model={url} layout={{ scale: 1.2, offset: [20, 0] }} />
```

| `fit`       | The frame…                                          |
| ----------- | --------------------------------------------------- |
| `"contain"` | shows in full; there may be space around it.        |
| `"cover"`   | fills the canvas; what does not fit is cropped.     |
| `"width"`   | matches the canvas's width; it may overflow in height. |
| `"height"`  | matches the canvas's height; it may overflow in width. |

Each model's author draws on a canvas of their own size and places the character on it as they like, so the frame numbers above are a starting point to adjust per model. To use a layout per model, pass it alongside `model`: the new layout applies as the new model appears.

### A mascot in the corner of the page

```tsx
<div style={{ position: "fixed", right: 16, bottom: 0, width: 240, height: 320, pointerEvents: "none" }}>
  <Live2DCanvas model={url} layout={{ align: [0.5, 1] }} style={{ pointerEvents: "auto" }} />
</div>
```

The eyes follow the pointer over the whole page by default, so a corner mascot looks at whatever the user is doing.

### Where the model is drawn

`bounds()` gives the box around what the model drew in its last frame, in CSS pixels from the canvas's top left. It follows the layout, so something placed from it holds when `frame` changes. A speech bubble over the head, in a parent the size of the canvas:

```tsx
onLoad={(_, live2d) => {
  const drawn = live2d.bounds();
  if (drawn) setBubbleBottom(canvasHeight - Math.max(0, drawn.y));
}}
```

The box moves with the motions, so read it when you need it rather than once for good. `y` is negative when the layout crops the top of the model.

## Knowing what a model has

Motion groups, expressions, hit areas and parameters are named by each model's author, and vary between models. Read them from the [`ModelInfo`](./api.md#modelinfo) that `onLoad` passes, or from `live2d.model` on the handle, instead of guessing:

```tsx
onLoad={(model) => {
  model.motions;     // { Idle: ["mtn_01", "sample_01"], TapBody: ["mtn_02", "mtn_03", …] }
  model.expressions; // ["exp_01", …]
  model.hitAreas;    // ["Head", "Body"]
  model.parameters;  // [{ id: "ParamAngleX", min: -30, max: 30, default: 0 }, …]
}}
```

Motion names come from their file names. They are labels for a menu; to play one, pass its group and its position in the list.

## Controlling the model

The `ref` is a [`Live2DCanvasHandle`](./api.md#live2dcanvashandle). It is `null` until a model has loaded, hence the `?.`:

```tsx
import { useRef } from "react";
import { Live2DCanvas, type Live2DCanvasHandle } from "moe2d";

export function Mascot() {
  const live2d = useRef<Live2DCanvasHandle>(null);

  return (
    <>
      <div style={{ width: 300, height: 400 }}>
        <Live2DCanvas ref={live2d} model="/models/mao/Mao.model3.json" />
      </div>
      <button onClick={() => live2d.current?.motion("TapBody", { priority: "force" })}>Wave</button>
      <button onClick={() => live2d.current?.expression()}>Surprise me</button>
    </>
  );
}
```

Every callback (`onLoad`, `onTap`) also gets the same handle as its last argument.

### Motions

```tsx
live2d.motion("TapBody");                        // a random motion of the group
live2d.motion("TapBody", { index: 0 });          // the first one
live2d.motion("TapBody", { priority: "force" }); // interrupt whatever plays
live2d.motion(["Wave", "Laugh", "Point"]);       // any motion of these groups
```

- The group matches in any case. With no `index`, it picks at random, avoiding the one played last.
- With several groups, every motion in them is as likely, whatever the size of its group. An `index` needs a single group.
- A motion loads the first time it plays. After that it starts at once.
- An unknown group, or an index past the end, rejects with a `RangeError`.

`motion` resolves `true` when the motion ends, so steps can follow each other:

```tsx
if (await live2d.motion("TapBody")) await live2d.motion("TapBody", { index: 2 });
```

It resolves `false` when the motion did not start. Whether it starts depends on its priority against the motion playing:

| Priority            | Starts when                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `"idle"`            | nothing else plays. For a background motion of your own.            |
| `"normal"` (default) | an idle motion or nothing plays. It is refused while another `normal` or `force` motion plays. |
| `"force"`           | always. It fades out the motion playing and replaces it.            |

For a button, use `"force"` so every press does something. For a reaction that should not cut into another, keep `"normal"`.

### Idle

`idle` names the group played whenever nothing else is. Once a motion ends, the model goes back to it.

```tsx
<Live2DCanvas model={url} idle="Emotion" /> // another group
<Live2DCanvas model={url} idle={false} />   // stand still, only blinking and breathing
```

A change takes over once the motion playing ends. A model with no group of that name simply does not idle.

### Expressions

```tsx
live2d.expression("exp_03"); // by name
live2d.expression();         // a random one
live2d.expression(null);     // back to none
```

An expression stays until another replaces it or it is cleared, and it blends over the motions. An unknown name throws a `RangeError`.

### Parameters

A model moves through its parameters: numbers such as `ParamAngleX` (head turn), `ParamEyeLOpen` (left eye open) or `ParamCheek` (blush). Motions, blinking, breathing and lip sync all set them every frame.

`setParameter` holds one at a value over all of that, until it is released:

```tsx
live2d.setParameter("ParamCheek", 1);    // blush
live2d.setParameter("ParamCheek", null); // let the motions drive it again
```

Each parameter has its own range, set by the author: `model.parameters` gives it. A value outside the range is clamped. An id the model does not have does nothing.

```tsx
const turn = live2d.model.parameters.find((parameter) => parameter.id === "ParamAngleX");
if (turn) live2d.setParameter(turn.id, turn.max); // as far as this model turns its head
```

### Where the model looks

`follow` picks what the eyes and head follow:

| `follow`             | Follows                                                |
| -------------------- | ------------------------------------------------------ |
| `"window"` (default) | the pointer anywhere on the page. Leaving the page turns the model back to the front. |
| `"canvas"`           | the pointer over the canvas only.                      |
| `false`              | nothing; use `lookAt`.                                 |

On a touch screen there is no pointer between touches, so the model follows a finger only while it touches the screen.

With `follow={false}`, point the model yourself. Coordinates are in the viewport, like a pointer event's `clientX` and `clientY`:

```tsx
const box = button.getBoundingClientRect();
live2d.lookAt(box.x + box.width / 2, box.y + box.height / 2); // look at a button
live2d.lookAt(null);                                          // back to the front
```

## Taps and hit areas

A tap is a press and release that moves less than 10 px. A drag fires no tap.

### The default reaction

With no `onTap`:

- a tap on a hit area whose name contains "head" sets a random expression, if the model has any,
- any other tap plays a motion from the groups whose name contains "tap", or else from every group other than the idle one.

Mao has a `Head` hit area and a `TapBody` group, so its head changes expressions and its body waves.

### Your own reaction

`onTap` replaces the default reaction entirely:

```tsx
<Live2DCanvas
  model="/models/mao/Mao.model3.json"
  onTap={({ hitAreas }, live2d) => {
    if (hitAreas.includes("Head")) live2d.expression();
    else if (hitAreas.includes("Body")) void live2d.motion("TapBody", { priority: "force" });
  }}
/>
```

`hitAreas` lists the hit areas under the point. It is empty for a tap outside them, and always empty on a model that defines none, such as Roro and Zundamon. `x` and `y` give the point in CSS pixels from the canvas's top left, and `event` the `PointerEvent` itself.

To do nothing on a tap, pass `onTap={() => {}}`.

### Hit areas outside taps

`hitTest` works at any point, for example to show a hand cursor over the model's head:

```tsx
<div
  style={{ width: 300, height: 400 }}
  onPointerMove={(event) => {
    const over = live2d.current?.hitTest(event.clientX, event.clientY) ?? [];
    event.currentTarget.style.cursor = over.includes("Head") ? "pointer" : "";
  }}
>
  <Live2DCanvas ref={live2d} model={url} />
</div>
```

## Sound and lip sync

### Speaking a recording

```tsx
await live2d.speak("/voice/hello.mp3");
```

`speak` plays the audio and opens the mouth with its loudness. It resolves when the audio ends, when `hush()` stops it, or when another voice starts. It takes:

- a URL. One on another site needs CORS headers, like model files, or it does not play.
- an `<audio>` or `<video>` element you control. `speak` plays it; pause or seek it as usual. For a file on another site, set `crossOrigin = "anonymous"` on it and serve CORS headers, or it plays with the mouth closed.
- a `MediaStream`, such as the microphone or a WebRTC call. It is only listened to, never played back, so a microphone does not echo.

```tsx
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
void live2d.speak(mic);

// Later:
live2d.hush();
for (const track of mic.getTracks()) track.stop(); // hush() leaves the microphone on
```

To stop one particular voice, pass a signal:

```tsx
const controller = new AbortController();
void live2d.speak("/voice/long.mp3", { signal: controller.signal });
controller.abort();
```

Browsers block audio until the user has clicked, tapped or pressed a key on the page. Call `speak` from such a gesture the first time; if it is blocked, the promise rejects with a `NotAllowedError`.

### Which parameters move

The lips move the parameters in the model's `LipSync` group, set in the Cubism Editor. A model that lists none uses `ParamMouthOpenY`, if it has it. A model with neither has no mouth to move.

### Sounds in motions

A motion can carry a sound in its model3.json entry. It plays when the motion starts, moves the lips like `speak`, and replaces any voice playing. `volume` (0 to 1) sets how loud these sounds are; it does not change voices you pass to `speak`.

The autoplay rule applies here too: before the first user gesture, the motion plays silently.

### Opening the mouth by hand

`mouth` sets how open the mouth is, from 0 to 1. The mouth opens by the larger of `mouth` and any voice playing. It suits text with no audio, such as a chat bubble being typed out:

```tsx
async function type(text: string, show: (shown: string) => void) {
  for (let i = 1; i <= text.length; i++) {
    show(text.slice(0, i));
    if (live2d.current) live2d.current.mouth = /[aeiou]/i.test(text[i - 1]!) ? 0.8 : 0.3;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (live2d.current) live2d.current.mouth = 0;
}
```

The mouth stays at the value set until it is set again, so set it back to 0 at the end.

## Following motions

```tsx
<Live2DCanvas
  model={url}
  onMotionStart={({ group, index }) => setPlaying(`${group} ${index}`)}
  onMotionEnd={() => setPlaying(null)}
  onMotionEvent={(value) => console.log(value)}
/>
```

- `onMotionStart` and `onMotionEnd` fire for every motion, idle ones included.
- `onMotionEvent` fires for the user events an author placed on a motion's timeline in the Cubism Editor, with the text they gave it. Use it to sync something to a moment of the motion, such as showing a line of dialogue.

## Server rendering

`Live2DCanvas` is a client component (`"use client"`). In the Next.js App Router, use it from a server component as is:

```tsx
// app/page.tsx
import { Live2DCanvas } from "moe2d";

export default function Page() {
  return (
    <div style={{ width: 300, height: 400 }}>
      <Live2DCanvas model="/models/mao/Mao.model3.json" />
    </div>
  );
}
```

Callbacks and refs need a client component of your own, as with any React component: put `"use client"` at the top of the file that passes them.

Importing the package on the server touches nothing browser-only, so there is no need for `next/dynamic` or `ssr: false`. The server renders an empty canvas and the model loads in the browser.

## Performance

- Importing costs a few kilobytes. The Cubism Core and Framework, about 110 kB gzipped, load when the first canvas mounts, as their own chunks, and are shared by every canvas on the page.
- A canvas that is scrolled away or hidden draws nothing.
- Any number of canvases can be on a page, and they can come and go in any order. Each one has its own WebGL context; browsers allow around 16 at once.
- `pixelRatio` trades sharpness for speed. The default is the screen's, capped at 2. `pixelRatio={1}` draws four times fewer pixels on a phone.
- `debug` logs Cubism's own messages, to find out why a model looks wrong.

Changing `pixelRatio` or `debug` restarts the canvas and reloads the model, so set them once.

## Troubleshooting

| Symptom                                   | Check                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nothing shows, and a warning about size   | The canvas's parent has no width or height.                                               |
| Nothing shows, no warning                 | `onError`: the model failed to load. See [Errors](#errors).                               |
| The model is cut off or tiny              | Adjust `layout`: most often `frame`, then `fit`.                                           |
| A motion does not play                    | `motion` resolved `false`: another motion of equal or higher priority plays. Use `"force"`. |
| A tap does nothing                        | The model has no motion groups other than the idle one, and no "head" hit area. Pass `onTap`. |
| No sound                                  | No user gesture yet on the page, or `volume` is 0.                                        |
| The mouth does not move                   | The model has no `LipSync` group and no `ParamMouthOpenY`, or an element you passed plays a file from another site without CORS. |
| Cubism 2 model (`model.json`, `.moc`)     | Not supported. Use a Cubism 3 or later model.                                             |
| No expressions or motions, eyes never blink | A model made for VTube Studio. See [Models made for VTube Studio](#models-made-for-vtube-studio). |
