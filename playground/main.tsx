import { type CSSProperties, type ReactNode, type RefObject, StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Layout, Live2DCanvas, type Live2DCanvasHandle, type Live2DCanvasProps, type ModelInfo } from "moe-widget";

const MODELS = {
  Mao: "/mao/Mao.model3.json",
  Zundamon: "/zundamon/zundamon.model3.json",
  Roro: "/roro/roro.model3.json",
};

type ModelName = keyof typeof MODELS;

type Follow = NonNullable<Live2DCanvasProps["follow"]>;

// The idle select's values for leaving the prop out and for false; any other value is a group.
const DEFAULT = "";
const OFF = "(off)";

const LOGO = new URL("./logo.webp", import.meta.url).href;

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
// The library's tap slop: a press that moves further is a drag, and never also a tap.
const DRAG_PX = 10;

type View = { scale: number; x: number; y: number };
const HOME: View = { scale: 1, x: 0, y: 0 };

/**
 * Scales by `factor` around a point in stage pixels. The model is centred, so its
 * centre sits at the stage centre plus the offset, and only that centre has to move.
 */
function zoomAt(view: View, factor: number, px: number, py: number, stage: DOMRect): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const k = scale / view.scale;
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  return { scale, x: (px - cx) * (1 - k) + view.x * k, y: (py - cy) * (1 - k) + view.y * k };
}

/** Drag to move, wheel or pinch to zoom around the pointer. */
function usePanZoom(stage: RefObject<HTMLElement | null>): [View, (view: View) => void] {
  const [view, setView] = useState(HOME);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let start = { x: 0, y: 0 };

    const down = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragging = false;
        start = { x: event.clientX, y: event.clientY };
      }
    };
    const move = (event: PointerEvent) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const next = { x: event.clientX, y: event.clientY };
      const rect = element.getBoundingClientRect();
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()] as [typeof next, typeof next];
        const other = a === last ? b : a;
        const before = Math.hypot(last.x - other.x, last.y - other.y);
        const after = Math.hypot(next.x - other.x, next.y - other.y);
        const mx = (next.x + other.x) / 2 - rect.left;
        const my = (next.y + other.y) / 2 - rect.top;
        dragging = true;
        if (before > 0) setView((view) => zoomAt(view, after / before, mx, my, rect));
      } else {
        if (!dragging && Math.hypot(next.x - start.x, next.y - start.y) <= DRAG_PX) return;
        // The first step also covers the distance moved before the drag began.
        const from = dragging ? last : start;
        dragging = true;
        element.classList.add("dragging");
        setView((view) => ({ ...view, x: view.x + next.x - from.x, y: view.y + next.y - from.y }));
      }
      pointers.set(event.pointerId, next);
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) element.classList.remove("dragging");
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((view) => zoomAt(view, factor, event.clientX - rect.left, event.clientY - rect.top, rect));
    };

    // Moves and releases are watched on the window: capturing the pointer would keep
    // pointerup from the canvas, and the library needs it to tell a tap.
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      element.removeEventListener("wheel", wheel);
    };
  }, [stage]);

  return [view, setView];
}

function Segmented<T extends string | boolean>(props: {
  label: string;
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map(([value, label]) => (
        <button
          key={String(value)}
          role="radio"
          aria-checked={props.value === value}
          onClick={() => props.onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Card(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header>
        <h2>{props.title}</h2>
        {props.action}
      </header>
      {props.children}
    </section>
  );
}

function Row(props: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">
        {props.label}
        {props.value !== undefined && <output>{props.value}</output>}
      </span>
      {props.children}
    </div>
  );
}

function Range(props: { min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      style={{ "--fill": `${fill}%` } as CSSProperties}
      onChange={(event) => props.onChange(Number(event.target.value))}
    />
  );
}

function keysOf<T extends object>(object: T): Array<keyof T & string> {
  return Object.keys(object) as Array<keyof T & string>;
}

function App() {
  const live2d = useRef<Live2DCanvasHandle>(null);
  // Changing the key remounts the canvas: the React way to destroy and recreate.
  const [instance, setInstance] = useState(0);
  const [name, setName] = useState<ModelName>("Mao");
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const stage = useRef<HTMLElement>(null);
  const [view, setView] = usePanZoom(stage);
  const [force, setForce] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [idle, setIdle] = useState(DEFAULT);
  const [follow, setFollow] = useState<Follow>("window");
  const started = useRef(performance.now());

  const log = (message: string) =>
    setLines((previous) => [`${new Date().toLocaleTimeString()}  ${message}`, ...previous].slice(0, 60));

  const layout: Layout = { scale: view.scale, offset: [view.x, view.y] };

  function restartClock() {
    started.current = performance.now();
    setLoadMs(null);
    setError(null);
  }

  function choose(next: ModelName) {
    restartClock();
    setIdle(DEFAULT);
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

  const groups = Object.keys(info?.motions ?? {});

  return (
    <main>
      <section className="stage" ref={stage}>
        <Live2DCanvas
          key={instance}
          ref={live2d}
          model={MODELS[name]}
          layout={layout}
          idle={idle === DEFAULT ? undefined : idle === OFF ? false : idle}
          follow={follow}
          onLoad={(loaded, current) => {
            current.mouth = mouth;
            setInfo(loaded);
            setLoadMs(Math.round(performance.now() - started.current));
          }}
          onError={(failure) => setError(String(failure))}
          onMotionStart={({ group, index }) => log(`start ${group}[${index}]`)}
          onMotionEnd={({ group, index }) => log(`end ${group}[${index}]`)}
        />

        <div className="overlay top">
          <h1>{name}</h1>
          <div className="chips">
            {error ? (
              <span className="chip error">{error}</span>
            ) : loadMs === null ? (
              <span className="chip">Loading…</span>
            ) : (
              info && (
                <>
                  <span className="chip">
                    {info.width} × {info.height}
                  </span>
                  <span className="chip">{info.parameters.length} parameters</span>
                  <span className="chip">{loadMs} ms</span>
                </>
              )
            )}
          </div>
        </div>
        <p className="overlay hint">Tap the character ♡ · Drag to move · Scroll or pinch to zoom</p>
      </section>

      <aside className="panel">
        <header className="brand">
          <img src={LOGO} alt="moe-widget" width={220} height={152} />
        </header>

        <Card title="Model">
          <select aria-label="Model" value={name} onChange={(event) => choose(event.target.value as ModelName)}>
            {keysOf(MODELS).map((model) => (
              <option key={model}>{model}</option>
            ))}
          </select>
        </Card>

        <Card
          title="Layout"
          action={
            <button className="link" onClick={() => setView(HOME)}>
              Reset
            </button>
          }
        >
          <Row label="Scale" value={`${view.scale.toFixed(2)}×`}>
            <Range
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.01}
              value={view.scale}
              onChange={(scale) => setView({ ...view, scale })}
            />
          </Row>
          <Row label="Offset" value={`${Math.round(view.x)}, ${Math.round(view.y)} px`} />
        </Card>

        <Card
          title="Motions"
          action={
            <label className="switch">
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
              <span>Force</span>
            </label>
          }
        >
          <div className="buttons">
            {Object.entries(info?.motions ?? {}).map(([group, count]) => (
              <button key={group} className="pill" onClick={() => void motion(group)}>
                {group}
                <small>{count}</small>
              </button>
            ))}
          </div>
          <Row label="Idle">
            <select value={idle} onChange={(event) => setIdle(event.target.value)}>
              <option value={DEFAULT}>Default</option>
              <option value={OFF}>Off</option>
              {groups.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </Row>
          <Row label="Eyes follow">
            <Segmented
              label="Eyes follow"
              options={[
                ["window", "Window"],
                ["canvas", "Canvas"],
                [false, "Nothing"],
              ]}
              value={follow}
              onChange={setFollow}
            />
          </Row>
        </Card>

        <Card title="Expressions">
          {info && info.expressions.length > 0 ? (
            <div className="buttons">
              {info.expressions.map((expression) => (
                <button key={expression} className="pill" onClick={() => live2d.current?.expression(expression)}>
                  {expression}
                </button>
              ))}
              <button className="pill accent" onClick={() => live2d.current?.expression()}>
                Random
              </button>
              <button className="pill ghost" onClick={() => live2d.current?.expression(null)}>
                Clear
              </button>
            </div>
          ) : (
            <p className="empty">This model has no expressions.</p>
          )}
        </Card>

        <Card title="Lip sync">
          <Row label="Mouth" value={`${Math.round(mouth * 100)}%`}>
            <Range
              min={0}
              max={1}
              step={0.01}
              value={mouth}
              onChange={(value) => {
                setMouth(value);
                if (live2d.current) live2d.current.mouth = value;
              }}
            />
          </Row>
          <div className="buttons">
            <button className="pill accent" onClick={() => void listen()}>
              Microphone
            </button>
            <button className="pill ghost" onClick={() => live2d.current?.hush()}>
              Stop
            </button>
          </div>
        </Card>

        <Card title="Instance">
          <div className="buttons">
            <button
              className="pill"
              onClick={() => {
                log("remounted");
                restartClock();
                setInstance((key) => key + 1);
              }}
            >
              Remount
            </button>
            <button
              className="pill"
              onClick={() => {
                // Ten model changes in a row: each aborts the last, and only the final one lands.
                const names = keysOf(MODELS);
                for (let i = 0; i < 10; i++) setTimeout(() => choose(names[i % names.length]!), i * 30);
                log("swapped 10× fast");
              }}
            >
              Swap 10× fast
            </button>
          </div>
        </Card>

        <Card
          title="Events"
          action={
            <button className="link" onClick={() => setLines([])}>
              Clear
            </button>
          }
        >
          <pre className="log">{lines.length > 0 ? lines.join("\n") : "Nothing yet."}</pre>
        </Card>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
