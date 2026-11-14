import { useState, type CSSProperties, type PointerEvent } from "react";
import { Bean, RotateCw, Sprout, Wheat } from "lucide-react";
import type { Crop, PlanId, PlanResult } from "../types";
import { CROPS, FAMILY_LABEL } from "../data/crops";
import { Reveal, SectionTitle } from "./ui";

const FAMILY_VAR = { Poaceae: "var(--family-poaceae)", Fabaceae: "var(--family-fabaceae)", Convolvulaceae: "var(--family-convolvulaceae)" } as const;
const FAMILY_ICON = { Poaceae: Wheat, Fabaceae: Bean, Convolvulaceae: Sprout } as const;
const PLAN_DOT: Record<PlanId, string> = { A: "bg-plan-a", B: "bg-plan-b", C: "bg-plan-c" };
const SLICES = [-4, -2, 0, 2, 4];

function waterNeed(c: Crop) {
  if (c.id === "paddy_rice") return "Very high";
  if (c.high_water) return "High";
  const load = c.kc * c.days;
  return load < 65 ? "Low" : load < 100 ? "Medium" : "High";
}

function CropTile({ crop, index, usedBy }: { crop: Crop; index: number; usedBy: PlanId[] }) {
  const [flipped, setFlipped] = useState(false);
  const Icon = FAMILY_ICON[crop.family];
  const n = crop.soil_n_delta;

  // Tilt toward the pointer: --tx / --ty run from -1 to 1 across the tile.
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(2));
    e.currentTarget.style.setProperty("--ty", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(2));
  };
  const onLeave = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty("--tx", "0");
    e.currentTarget.style.setProperty("--ty", "0");
  };

  return (
    <button
      type="button"
      className="crop3d-scene"
      style={{ ["--fam" as string]: FAMILY_VAR[crop.family] } as CSSProperties}
      aria-pressed={flipped}
      aria-label={`${crop.name}. ${flipped ? "Showing details" : "Tap to see details"}.`}
      onClick={() => setFlipped((f) => !f)}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <span className="crop3d" data-flipped={flipped}>
        {SLICES.map((z) => (
          <span key={z} className="crop3d-slice" style={{ transform: `translateZ(${z}px)` }} />
        ))}

        <span className="crop3d-face crop3d-front" aria-hidden={flipped}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: FAMILY_VAR[crop.family] }} />
          <span className="micro mt-0.5 flex items-center justify-between text-[10.5px] text-olive">
            MF-{String(index + 1).padStart(2, "0")}
            <RotateCw className="size-3" aria-hidden />
          </span>
          <Icon className="mt-auto size-6" style={{ color: FAMILY_VAR[crop.family] }} aria-hidden />
          <span className="mt-1.5 block font-display text-[15px] leading-[18px] font-medium tracking-[-0.01em] text-foreground">{crop.short}</span>
          <span className="block truncate text-[11px] leading-[14px] text-muted-foreground">{FAMILY_LABEL[crop.family]}</span>
          <span className="mt-1 flex min-h-4 items-center gap-0.5">
            {usedBy.map((p) => (
              <span key={p} className={`inline-flex size-4 items-center justify-center rounded-full text-[9.5px] font-semibold text-[#f6efeb] ${PLAN_DOT[p]}`}>
                {p}
              </span>
            ))}
            {usedBy.length > 0 && <span className="sr-only">Used in plan {usedBy.join(", ")}</span>}
          </span>
          <span className="crop3d-shine" />
        </span>

        <span className="crop3d-face crop3d-back" aria-hidden={!flipped}>
          <span className="micro text-[10.5px] text-sakura">{crop.short}</span>
          <span className="mt-auto grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 text-[11px] leading-[13px]">
            <span className="text-[#f6efeb]/65">Grows</span>
            <span className="tabular">{crop.days} days</span>
            <span className="text-[#f6efeb]/65">Water</span>
            <span>{waterNeed(crop)}</span>
            <span className="text-[#f6efeb]/65">Soil N</span>
            <span className="tabular">{n > 0 ? `+${n} feeds soil` : `−${Math.abs(n)} drains`}</span>
            <span className="text-[#f6efeb]/65">Heat</span>
            <span className="tabular">to {crop.heat_limit_c} °C</span>
            <span className="text-[#f6efeb]/65">For</span>
            <span>{crop.fits_goal.map((g) => (g === "cash" ? "cash" : "feed")).join(", ")}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

/** "Hangar": the 8 crops as 3D tiles that tilt toward the pointer and flip to show their stats. */
export function CropHangar({ plans }: { plans: PlanResult[] | null }) {
  return (
    <section aria-labelledby="hangar-h" className="mx-auto max-w-[1280px] px-4 pt-10">
      <Reveal>
        <SectionTitle id="hangar-h" num="00" kicker="Hangar">
          8 crops, ready to deploy
        </SectionTitle>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          Tap a tile to flip it and see what the crop needs. The letters show which of your 3 routes use it.
        </p>
      </Reveal>
      <ul className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {CROPS.map((c, i) => (
          <li key={c.id}>
            <Reveal delay={i * 60}>
              <CropTile crop={c} index={i} usedBy={(plans ?? []).filter((p) => p.rotation.includes(c.id)).map((p) => p.id)} />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
