import { type CSSProperties, type ReactNode, type RefObject, StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Layout, Live2DCanvas, type Live2DCanvasHandle, type Live2DCanvasProps, type LoadProgress, type ModelInfo } from "moe2d";
import { zipSync } from "fflate";
import { type Model, loadCollection } from "./collection";
import { Gallery } from "./gallery";
import { snapshot } from "./preview";
import { type Source, type Upload, sourceFromZip } from "./zip";

type Follow = NonNullable<Live2DCanvasProps["follow"]>;

// The idle select's values for leaving the prop out and for false; any other value is a group.
const DEFAULT = "";
const OFF = "(off)";

// The model shown on open, when the collection has it.
const FIRST = "Zundamon";

const LOGO = new URL("./logo.png", import.meta.url).href;

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

function save(blob: Blob, file: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Whether the collection is open, kept in the hash so Back closes it. */
function useBrowsing(): [boolean, (open: boolean) => void] {
  const [browsing, setBrowsing] = useState(location.hash === "#collection");
  useEffect(() => {
    const change = () => setBrowsing(location.hash === "#collection");
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const set = (open: boolean) => {
    if (open === (location.hash === "#collection")) return;
    // Back only undoes an entry this page pushed: a page opened at #collection would leave the site.
    if (open) history.pushState({ collection: true }, "", "#collection");
    else if (history.state?.collection) history.back();
    else history.replaceState(null, "", location.pathname + location.search);
    setBrowsing(open);
  };
  return [browsing, set];
}

function App() {
  const live2d = useRef<Live2DCanvasHandle>(null);
  // Changing the key remounts the canvas: the React way to destroy and recreate.
  const [instance, setInstance] = useState(0);
  const [entries, setEntries] = useState<Model[]>([]);
  const [name, setName] = useState("");
  const [browsing, setBrowsing] = useBrowsing();
  const [capturing, setCapturing] = useState<string | null>(null);
  // Resolves the capture's wait for a model: true once it loads, false if it fails.
  const settle = useRef<((loaded: boolean) => void) | null>(null);
  // Keyed by file name, whose ".zip" keeps it apart from the sample models.
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const upload = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const stage = useRef<HTMLElement>(null);
  const [view, setView] = usePanZoom(stage);
  const [force, setForce] = useState(true);
  const [mouth, setMouth] = useState(0);
  const [idle, setIdle] = useState(DEFAULT);
  const [follow, setFollow] = useState<Follow>("window");
  const started = useRef(performance.now());

  useEffect(() => {
    loadCollection().then(
      (loaded) => {
        started.current = performance.now();
        setEntries(loaded);
        setName((current) => current || (loaded.find((entry) => entry.name === FIRST) ?? loaded[0])?.name || "");
      },
      (failure) => setError(`collection: ${failure}`),
    );
  }, []);

  const log = (message: string) =>
    setLines((previous) => [`${new Date().toLocaleTimeString()}  ${message}`, ...previous].slice(0, 60));

  const layout: Layout = { scale: view.scale, offset: [view.x, view.y] };

  function restartClock() {
    started.current = performance.now();
    setLoadMs(null);
    setProgress(null);
    setError(null);
  }

  function choose(next: string) {
    restartClock();
    setIdle(DEFAULT);
    setName(next);
  }

  async function open(file: File) {
    try {
      const source = await sourceFromZip(file);
      setUploads((previous) => ({ ...previous, [file.name]: source }));
      choose(file.name);
      log(`opened ${file.name}${source.changes.length > 0 ? `: ${source.changes.join(", ")}` : ""}`);
    } catch (failure) {
      setError(String(failure));
    }
  }

  const entry = entries.find((entry) => entry.name === name);
  const source: Source | undefined = uploads[name] ?? (entry && { url: entry.model });

  async function capture(models: Model[]) {
    setBrowsing(false);
    setView(HOME);
    const files: Record<string, Uint8Array> = {};
    for (const [index, model] of models.entries()) {
      setCapturing(`${index + 1} / ${models.length}`);
      const loaded = new Promise<boolean>((resolve) => (settle.current = resolve));
      // Remounting loads the model even when it is already on screen.
      choose(model.name);
      setInstance((key) => key + 1);
      if (!(await loaded)) continue;
      // Lets the idle motion and physics settle out of the load pose.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const png = await snapshot(live2d.current!.canvas);
        files[model.folder ? `${model.folder}/preview.png` : "preview.png"] = new Uint8Array(await png.arrayBuffer());
      } catch (failure) {
        log(`preview of ${model.name}: ${failure}`);
      }
    }
    settle.current = null;
    setCapturing(null);
    const count = Object.keys(files).length;
    log(`captured ${count} of ${models.length} previews`);
    if (count === 0) return;
    save(new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }), "previews.zip");
  }

  async function motion(group: string, index: number) {
    const finished = await live2d.current?.motion(group, { index, priority: force ? "force" : "normal" });
    log(`motion ${group}[${index}] ${finished ? "finished" : "did not play"}`);
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
      <section
        className="stage"
        ref={stage}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void open(file);
        }}
      >
        {source && (
          <Live2DCanvas
            key={instance}
            ref={live2d}
            model={source.url}
            fetch={source.fetch}
            layout={layout}
            idle={idle === DEFAULT ? undefined : idle === OFF ? false : idle}
            follow={follow}
            volume={volume}
            onProgress={(next) => {
              setProgress(next);
              if (next.loaded === next.total) log(`fetched ${next.total} files`);
            }}
            onLoad={(loaded, current) => {
              settle.current?.(true);
              current.mouth = mouth;
              setInfo(loaded);
              setLoadMs(Math.round(performance.now() - started.current));
            }}
            onError={(failure) => {
              settle.current?.(false);
              setError(String(failure));
            }}
            onMotionStart={({ group, index }) => log(`start ${group}[${index}]`)}
            onMotionEnd={({ group, index }) => log(`end ${group}[${index}]`)}
          />
        )}

        <div className="overlay top">
          <h1>{name}</h1>
          <div className="chips">
            {capturing && <span className="chip">Capturing previews {capturing}</span>}
            {error ? (
              <span className="chip error">{error}</span>
            ) : !source ? null : loadMs === null ? (
              <span className="chip">Loading… {progress && `${progress.loaded} / ${progress.total} files`}</span>
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
        <p className="overlay hint">Tap the character ♡ · Drag to move · Scroll or pinch to zoom · Drop a model zip</p>
      </section>

      <aside className="panel">
        <header className="brand">
          <img src={LOGO} alt="moe2d" width={220} height={95} />
        </header>

        <Card title="Model">
          <div className="picker">
            <select aria-label="Model" value={name} onChange={(event) => choose(event.target.value)}>
              {[...entries.map((entry) => entry.name), ...Object.keys(uploads)].map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
            <button className="icon" title="Open a model zip" aria-label="Open a model zip" onClick={() => upload.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <button className="pill" onClick={() => setBrowsing(true)}>
            Browse the collection ({entries.length})
          </button>
          {uploads[name] && uploads[name].changes.length > 0 && (
            <>
              <p className="empty">Fixed on import: {uploads[name].changes.join(", ")}.</p>
              <button className="pill" onClick={() => save(uploads[name]!.normalized(), name.replace(/\.zip$/i, ".fixed.zip"))}>
                Download the fixed zip
              </button>
            </>
          )}
          <input
            ref={upload}
            type="file"
            accept=".zip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void open(file);
            }}
          />
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
          {Object.entries(info?.motions ?? {}).map(([group, names]) => (
            <Row key={group} label={group} value={String(names.length)}>
              <div className="buttons">
                {names.map((name, index) => (
                  <button key={index} className="pill" onClick={() => void motion(group, index)}>
                    {name}
                  </button>
                ))}
              </div>
            </Row>
          ))}
          <Row label="Idle">
            <select value={idle} onChange={(event) => setIdle(event.target.value)}>
              <option value={DEFAULT}>Default</option>
              <option value={OFF}>Off</option>
              {groups.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </Row>
          <Row label="Sound volume" value={`${Math.round(volume * 100)}%`}>
            <Range min={0} max={1} step={0.01} value={volume} onChange={setVolume} />
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
                const names = entries.map((entry) => entry.name);
                if (names.length === 0) return;
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

      {browsing && (
        <Gallery
          entries={entries}
          current={name}
          onPick={(picked) => {
            if (picked.name !== name) choose(picked.name);
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
          onCapture={import.meta.env.DEV ? (models) => void capture(models) : undefined}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
