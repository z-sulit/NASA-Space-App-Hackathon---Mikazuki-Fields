import { useCallback, useState } from "react";
import { Languages } from "lucide-react";
import { Mission } from "./components/mission/Mission";
import presetsJson from "./data/presets.json";
import type { Preset } from "./types";
import { LANGUAGES, LanguagePicker, type Lang } from "./components/LanguagePicker";

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
  const [lang, setLang] = useState<Lang>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (LANGUAGES.some((l) => l.code === fromUrl)) return fromUrl as Lang;
    const saved = storage.get("mf-lang");
    if (LANGUAGES.some((l) => l.code === saved)) return saved as Lang;
    return "en";
  });
  const [showLangPicker, setShowLangPicker] = useState(false);
  const onReady = useCallback(() => {}, []);
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label ?? "English";

  return (
    <div className="h-[100svh] overflow-clip">
      {showLangPicker && (
        <LanguagePicker
          onPick={(l) => {
            storage.set("mf-lang", l);
            setLang(l);
            setShowLangPicker(false);
          }}
          onClose={() => setShowLangPicker(false)}
        />
      )}

      <Mission
        presets={PRESETS}
        onReady={onReady}
        topRight={
          <button
            type="button"
            onClick={() => setShowLangPicker(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink/50 bg-hud/55 px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-[#f6efeb]/10"
          >
            <Languages className="size-4" aria-hidden />
            {langLabel}
          </button>
        }
      />

      {lang !== "en" && (
        <p className="pointer-events-none fixed top-20 right-4 z-50 max-w-[280px] rounded-md bg-accent px-3 py-2 text-sm text-foreground shadow-lg">
          {langLabel} translation is coming soon. Showing English for now.
        </p>
      )}
    </div>
  );
}
