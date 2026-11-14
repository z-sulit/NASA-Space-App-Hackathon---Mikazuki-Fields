import { useCallback, useState } from "react";
import { Languages } from "lucide-react";
import { Mission } from "./components/mission/Mission";
import presetsJson from "./data/presets.json";
import type { Preset } from "./types";
import { LANGUAGES, LanguagePicker, type Lang } from "./components/LanguagePicker";
import type { Currency } from "./components/ui";

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
  const [currency, setCurrency] = useState<Currency>(() => {
    const saved = storage.get("mf-currency");
    return saved === "USD" || saved === "PHP" ? saved : "PHP";
  });
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
        currency={currency}
        topRight={
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <div
              role="group"
              aria-label="Currency"
              className="inline-flex min-h-11 items-center gap-0.5 rounded-full border border-ink/50 bg-hud/55 p-1 text-xs font-medium text-ink sm:text-sm"
            >
              {(
                [
                  ["PHP", "PHP (₱)", "₱ PHP"],
                  ["USD", "USD ($)", "$ USD"],
                ] as const
              ).map(([code, full, compact]) => {
                const active = currency === code;
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      storage.set("mf-currency", code);
                      setCurrency(code);
                    }}
                    className={`min-h-9 rounded-full px-2.5 transition-colors duration-150 sm:px-3 ${
                      active ? "bg-ink font-semibold text-foreground" : "text-ink/80 hover:bg-[#f6efeb]/10"
                    }`}
                  >
                    <span className="sm:hidden">{compact}</span>
                    <span className="hidden sm:inline">{full}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowLangPicker(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink/50 bg-hud/55 px-3 text-xs font-medium text-ink transition-colors duration-150 hover:bg-[#f6efeb]/10 sm:px-4 sm:text-sm"
            >
              <Languages className="size-4" aria-hidden />
              {langLabel}
            </button>
          </div>
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
