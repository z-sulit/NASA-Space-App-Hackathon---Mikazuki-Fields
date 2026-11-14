import { useCallback, useState } from "react";
import { Languages } from "lucide-react";
import { Mission } from "./components/mission/Mission";
import presetsJson from "./data/presets.json";
import type { Preset } from "./types";
import { LANGUAGES, LanguagePicker, type Lang } from "./components/LanguagePicker";
import { prefersReducedMotion } from "./components/ui";

const PRESETS = presetsJson as Preset[];

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: just don't remember */
    }
  },
};

/** One screen, no page scroll: the mission walks through every step in order. */
export default function App() {
  // ?lang=en (or fil, ceb, ilo) in a shared link skips the picker; otherwise use the saved choice.
  const [lang, setLang] = useState<Lang | null>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (LANGUAGES.some((l) => l.code === fromUrl)) return fromUrl as Lang;
    return storage.get("mf-lang") as Lang | null;
  });
  const [booted, setBooted] = useState(prefersReducedMotion);
  const onBooted = useCallback(() => setBooted(true), []);
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label;

  return (
    <div className="h-[100svh] overflow-clip">
      {lang === null && booted && (
        <LanguagePicker
          onPick={(l) => {
            storage.set("mf-lang", l);
            setLang(l);
          }}
        />
      )}

      <Mission
        presets={PRESETS}
        onReady={onBooted}
        topRight={
          <button
            type="button"
            onClick={() => setLang(null)}
            className="micro inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#f6efeb]/50 bg-[#1d240a]/40 px-4 text-[#f6efeb] backdrop-blur transition-colors duration-150 hover:bg-[#f6efeb]/10"
          >
            <Languages className="size-4" aria-hidden />
            {langLabel ?? "Language"}
          </button>
        }
      />

      {lang && lang !== "en" && (
        <p className="pointer-events-none fixed top-20 right-4 z-50 max-w-[280px] rounded-md bg-accent px-3 py-2 text-sm text-foreground shadow-lg">
          {langLabel} translation is coming soon. Showing English for now.
        </p>
      )}
    </div>
  );
}
