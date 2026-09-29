import { useEffect, useState } from "react";
import type { Model } from "./collection";

export function Gallery(props: {
  entries: Model[];
  current: string;
  onPick: (entry: Model) => void;
  onClose: () => void;
  /** Shows the capture button when given. */
  onCapture: ((models: Model[]) => void) | undefined;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [props.onClose]);

  const missing = props.entries.filter((entry) => !entry.preview);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = props.entries.filter((entry) => words.every((word) => entry.name.toLowerCase().includes(word)));

  return (
    <section className="gallery" aria-label="Collection">
      <header className="gallery-bar">
        <h1>Collection</h1>
        <span className="chip">
          {shown.length} / {props.entries.length}
        </span>
        <input
          type="search"
          placeholder="Search by name"
          aria-label="Search"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {props.onCapture && props.entries.length > 0 && (
          <button
            className="pill"
            title="Loads each model, captures it, and downloads the pictures as previews.zip"
            onClick={() => props.onCapture!(missing.length > 0 ? missing : props.entries)}
          >
            {missing.length > 0 ? `Capture ${missing.length} missing previews` : "Capture all previews"}
          </button>
        )}
        <button className="pill ghost" onClick={props.onClose}>
          Close
        </button>
      </header>

      <ul className="grid">
        {shown.map((entry) => (
          <li key={entry.name}>
            <button className="tile" aria-current={entry.name === props.current} onClick={() => props.onPick(entry)}>
              {entry.preview ? (
                <img src={entry.preview} alt="" loading="lazy" />
              ) : (
                <span className="placeholder" aria-hidden="true">
                  {entry.name.slice(0, 1)}
                </span>
              )}
              <strong>{entry.name}</strong>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="empty">Nothing matches.</p>}
    </section>
  );
}
