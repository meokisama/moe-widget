"use client";

// A corner companion built on moe2d: it slides in, greets, types lines into a speech bubble
// with its mouth moving, and has buttons to move, swap and hide. Copy it and make it yours.

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { type Layout, Live2DCanvas, type Live2DCanvasHandle } from "moe2d";

const WIDTH = 300;
const HEIGHT = 340;
// The bubble's tail hangs below it; this keeps it off the model's head.
const GAP = 12;
const TYPE_MS = 90;
const TIP_MS = 5000;

type Character = { model: string; layout: Layout; wand: string[] };

// Paths, frames and groups are per model: read the groups from `onLoad`'s ModelInfo.
const CHARACTERS: Character[] = [
  {
    model: "/models/zundamon/zundamon.model3.json",
    layout: { frame: [0, 0, 1, 0.7], fit: "cover", align: [0.5, 0] },
    wand: ["Wave", "Laugh", "Point", "Think"],
  },
  {
    model: "/models/mao/Mao.model3.json",
    layout: { frame: [0, 0, 1, 0.6], fit: "cover", align: [0.5, 0] },
    wand: ["TapBody"],
  },
];

const LINES = ["Looking for something?", "Take a break now and then.", "Tap me if you are bored."];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function Companion() {
  const live2d = useRef<Live2DCanvasHandle>(null);
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [head, setHead] = useState(0);
  const [tip, setTip] = useState<{ text: string; typed: number } | null>(null);
  const typing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const character = CHARACTERS[index]!;
  const shown = !hidden && loaded === index;

  function say(text: string) {
    clearTimeout(typing.current);
    const chars = [...text];
    let typed = 0;
    const step = () => {
      const handle = live2d.current;
      if (typed < chars.length) {
        typed++;
        setTip({ text, typed });
        // No audio, so open and close the mouth on every other character.
        if (handle) handle.mouth = typed % 2 ? 0.8 : 0;
        typing.current = setTimeout(step, TYPE_MS);
      } else {
        if (handle) handle.mouth = 0;
        typing.current = setTimeout(() => setTip(null), TIP_MS);
      }
    };
    step();
  }

  useEffect(() => {
    if (!shown) return;
    const greet = setTimeout(() => say("Hello! Nice to see you."), 700);
    return () => {
      clearTimeout(greet);
      clearTimeout(typing.current);
      setTip(null);
    };
  }, [shown]);

  if (hidden) {
    return (
      <button style={{ ...fixed, bottom: 32 }} onClick={() => setHidden(false)}>
        Call back
      </button>
    );
  }

  return (
    <div style={{ ...fixed, width: WIDTH, height: HEIGHT, pointerEvents: "none", transform: shown ? "none" : "translateY(100%)", transition: "transform 0.7s ease-out" }}>
      <Live2DCanvas
        ref={live2d}
        model={character.model}
        layout={character.layout}
        style={{ pointerEvents: "auto" }}
        onLoad={(_, handle) => {
          // The top of what the model drew, so the bubble sits on its head whatever the layout.
          setHead(Math.max(0, handle.bounds()?.y ?? 0));
          setLoaded(index);
        }}
        onTap={() => say(pick(LINES))}
      />

      {tip && (
        <p style={{ ...bubble, bottom: HEIGHT - head + GAP }}>
          {[...tip.text].slice(0, tip.typed).join("")}
          {/* The rest, invisible, so the bubble does not grow as it types. */}
          <span style={{ visibility: "hidden" }}>{[...tip.text].slice(tip.typed).join("")}</span>
        </p>
      )}

      <div style={{ position: "absolute", top: "25%", left: 0, display: "flex", flexDirection: "column", gap: 4, pointerEvents: "auto" }}>
        <button title="Move" onClick={() => void live2d.current?.motion(character.wand, { priority: "force" })}>
          ✨
        </button>
        <button title="Swap" onClick={() => setIndex((index + 1) % CHARACTERS.length)}>
          ⇄
        </button>
        <button title="Hide" onClick={() => {
          setHidden(true);
          setLoaded(null);
        }}>
          ▾
        </button>
      </div>
    </div>
  );
}

const fixed: CSSProperties = { position: "fixed", right: 0, bottom: 0, zIndex: 30 };

const bubble: CSSProperties = {
  position: "absolute",
  right: 16,
  maxWidth: 256,
  margin: 0,
  padding: "12px 18px",
  background: "white",
  border: "1px solid #ddd",
  fontSize: 14,
};
