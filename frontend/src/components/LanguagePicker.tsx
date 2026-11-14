import { Moon } from "lucide-react";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
  { code: "ceb", label: "Cebuano" },
  { code: "ilo", label: "Ilocano" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];

export function LanguagePicker({ onPick }: { onPick: (l: Lang) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="lang-h">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-[0_1px_2px_rgb(31_42_30/0.08)]">
        <Moon className="size-8 fill-moon text-moon" aria-hidden />
        <h2 id="lang-h" className="mt-3 text-[32px] leading-9 font-bold">
          Choose your language
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {LANGUAGES.map((l, i) => (
            <button
              key={l.code}
              type="button"
              autoFocus={i === 0}
              onClick={() => onPick(l.code)}
              className="min-h-12 rounded-md border border-input bg-card px-3 text-left font-bold transition-colors duration-150 hover:bg-muted"
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
