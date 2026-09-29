import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Layout, Live2DCanvas, type Live2DCanvasHandle, type ModelInfo } from "moe-widget";

const MODELS = {
  mao: "/mao/Mao.model3.json",
  zundamon: "/zundamon/zundamon.model3.json",
  roro: "/roro/roro.model3.json",
};

type ModelName = keyof typeof MODELS;

const FRAMES = {
  "Whole canvas": [0, 0, 1, 1],
  "Upper 60%": [0, 0, 1, 0.6],
  "Head and shoulders": [0.2, 0, 0.6, 0.4],
} as const;

const ALIGNS = {
  Center: [0.5, 0.5],
  Bottom: [0.5, 1],
  "Bottom right": [1, 1],
} as const;

type Fit = NonNullable<Layout["fit"]>;

function App() {
  const live2d = useRef<Live2DCanvasHandle>(null);
  // Changing the key remounts the canvas: the React way to destroy and recreate.
  const [instance, setInstance] = useState(0);
  const [name, setName] = useState<ModelName>("mao");
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [lines, setLines] = useState<string[]>([]);
  const [fit, setFit] = useState<Fit>("contain");
  const [frame, setFrame] = useState<keyof typeof FRAMES>("Whole canvas");
  const [align, setAlign] = useState<keyof typeof ALIGNS>("Center");
  const [scale, setScale] = useState(1);
  const [force, setForce] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [paused, setPaused] = useState(false);
  const started = useRef(performance.now());

  const log = (message: string) =>
    setLines((previous) => [`${new Date().toLocaleTimeString()}  ${message}`, ...previous].slice(0, 60));

  const layout: Layout = { fit, frame: FRAMES[frame], align: ALIGNS[align], scale };

  function choose(next: ModelName) {
    started.current = performance.now();
    setStatus(`Loading ${next}…`);
    setName(next);
  }

  async function motion(group: string) {
    const finished = await live2d.current?.motion(group, { priority: force ? "force" : "normal" });
    log(`motion ${group} ${finished ? "finished" : "did not play"}`);
  }

  async function listen() {
    const current = live2d.current;
    if (!current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log("listening to the microphone");
    await current.speak(stream);
    for (const track of stream.getTracks()) track.stop();
    log("microphone stopped");
  }

  return (
    <main>
      <section className="stage">
        <Live2DCanvas
          key={instance}
          ref={live2d}
          model={MODELS[name]}
          layout={layout}
          paused={paused}
          onLoad={(loaded, current) => {
            current.mouth = mouth;
            setInfo(loaded);
            setStatus(
              `${name}: ${loaded.width}×${loaded.height}px, ${loaded.parameters.length} parameters, loaded in ${Math.round(performance.now() - started.current)}ms`,
            );
          }}
          onError={(error) => setStatus(`Failed: ${String(error)}`)}
          onMotionStart={({ group, index }) => log(`start ${group}[${index}]`)}
          onMotionEnd={({ group, index }) => log(`end ${group}[${index}]`)}
        />
        <p className="status">{status}</p>
      </section>

      <aside className="panel">
        <h1>moe-widget</h1>

        <label>
          Model
          <select value={name} onChange={(event) => choose(event.target.value as ModelName)}>
            {Object.keys(MODELS).map((model) => (
              <option key={model}>{model}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Layout</legend>
          <label>
            Fit
            <select value={fit} onChange={(event) => setFit(event.target.value as Fit)}>
              {["contain", "cover", "width", "height"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Frame
            <select value={frame} onChange={(event) => setFrame(event.target.value as keyof typeof FRAMES)}>
              {Object.keys(FRAMES).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Align
            <select value={align} onChange={(event) => setAlign(event.target.value as keyof typeof ALIGNS)}>
              {Object.keys(ALIGNS).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Scale
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Motions</legend>
          <div className="buttons">
            {Object.entries(info?.motions ?? {}).map(([group, count]) => (
              <button key={group} onClick={() => void motion(group)}>
                {group} ({count})
              </button>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} /> Force
            priority
          </label>
        </fieldset>

        <fieldset>
          <legend>Expressions</legend>
          {info && info.expressions.length > 0 ? (
            <div className="buttons">
              {info.expressions.map((expression) => (
                <button key={expression} onClick={() => live2d.current?.expression(expression)}>
                  {expression}
                </button>
              ))}
              <button onClick={() => live2d.current?.expression()}>Random</button>
              <button onClick={() => live2d.current?.expression(null)}>Clear</button>
            </div>
          ) : (
            "None"
          )}
        </fieldset>

        <fieldset>
          <legend>Lip sync</legend>
          <label>
            Mouth
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={mouth}
              onChange={(event) => {
                const value = Number(event.target.value);
                setMouth(value);
                if (live2d.current) live2d.current.mouth = value;
              }}
            />
          </label>
          <div className="buttons">
            <button onClick={() => void listen()}>Microphone</button>
            <button onClick={() => live2d.current?.hush()}>Stop</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Instance</legend>
          <div className="buttons">
            <button onClick={() => setPaused((value) => !value)}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => {
                log("remounted");
                started.current = performance.now();
                setInstance((key) => key + 1);
              }}
            >
              Remount
            </button>
            <button
              onClick={() => {
                // Ten model changes in a row: each aborts the last, and only the final one lands.
                const names = Object.keys(MODELS) as ModelName[];
                for (let i = 0; i < 10; i++) setTimeout(() => choose(names[i % names.length]!), i * 30);
                log("swapped 10× fast");
              }}
            >
              Swap 10× fast
            </button>
          </div>
        </fieldset>

        <pre className="log">{lines.join("\n")}</pre>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
