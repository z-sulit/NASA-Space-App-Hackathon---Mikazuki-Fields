import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { GeocodeError, searchPlaces, type Place } from "../../api/geocode";

const FALLBACK = "Tap the map instead, or pick a reference site.";
const MESSAGE: Record<GeocodeError["kind"], string> = {
  busy: `Search is busy right now. Wait a moment and try again, or ${FALLBACK.toLowerCase()}`,
  offline: `Search needs an internet connection. ${FALLBACK}`,
  failed: `Search didn't answer. ${FALLBACK}`,
};

/**
 * Step 02: find a farm by place name ("Zamboanga", "Batangas"). Runs on Enter or the
 * search button (see api/geocode.ts for why there is no search-as-you-type), lists up to
 * 5 Philippine matches, and picking one targets it like a tap on the map.
 */
export function PlaceSearch({ onPick, disabled = false }: { onPick: (p: Place) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    const query = q.trim();
    if (query.length < 2) {
      setNote("Type at least 2 letters of a province, city or town.");
      setResults(null);
      return;
    }
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true);
    setNote(null);
    try {
      const found = await searchPlaces(query, ctl.signal);
      if (ctl.signal.aborted) return;
      setResults(found);
      setActive(found.length ? 0 : -1);
      if (!found.length) setNote(`No place in the Philippines matches "${query}". Try a province or town name. ${FALLBACK}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setResults(null);
      setNote(e instanceof GeocodeError ? MESSAGE[e.kind] : MESSAGE.failed);
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  };

  const pick = (p: Place) => {
    setResults(null);
    setNote(null);
    setQ(p.name);
    onPick(p);
  };
  const clear = () => {
    abort.current?.abort();
    setQ("");
    setResults(null);
    setNote(null);
    setBusy(false);
    input.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!results?.length) {
      if (e.key === "Escape" && q) {
        e.preventDefault();
        clear();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = results.length;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setResults(null);
    }
  };

  const open = !!results?.length;
  return (
    <div className="place-search">
      <form
        role="search"
        className="place-search-box"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Search className="size-4 shrink-0 text-ink/70" aria-hidden />
        <input
          ref={input}
          type="search"
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            if (results) setResults(null);
          }}
          onKeyDown={onKey}
          placeholder="Search a province, city or town"
          aria-label="Search a place in the Philippines"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
        />
        {q && !busy && (
          <button type="button" className="place-search-icon" onClick={clear} aria-label="Clear search">
            <X className="size-4" aria-hidden />
          </button>
        )}
        <button type="submit" className="place-search-go" disabled={disabled || busy} aria-label="Search">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Search"}
        </button>
      </form>
      {open && (
        <ul id={listId} role="listbox" aria-label="Places found" className="place-search-list">
          {results!.map((p, i) => (
            <li
              key={`${p.name}-${p.lat}-${p.lon}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(p)}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-sakura" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                {p.context && <span className="block truncate text-xs text-ink/70">{p.context}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="place-search-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
