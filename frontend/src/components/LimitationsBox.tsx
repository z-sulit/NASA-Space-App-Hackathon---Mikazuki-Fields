import { Info } from "lucide-react";
import { SectionTitle } from "./ui";

/** Copy from docs/frontend_spec.md, section 2B (team copy deck). */
export function LimitationsBox() {
  return (
    <section aria-labelledby="limits-h" className="flex gap-3 rounded-lg border border-border bg-muted p-4">
      <Info className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <SectionTitle id="limits-h" num="05" kicker="Limits">
          Know the limits and confirm locally
        </SectionTitle>
        <p className="mt-1 max-w-[75ch]">
          NASA POWER weather is averaged over a regional grid cell roughly 50–70 km across. MODIS greenness is 250 m per pixel and mixes
          several small farms. SRTM terrain elevation dates from 2000. Soil Thirst comes from a land-surface model (MERRA-2), not an
          in-ground sensor. Crop numbers are general regional baselines, not variety-specific, and farmgate prices change.
        </p>
        <p className="mt-2 max-w-[75ch]">
          <strong>Next step:</strong> test your field's soil pH and nutrients at a Department of Agriculture (DA) regional soils
          laboratory, and review any rotation plan with your Municipal Agriculturist before switching crops.{" "}
          <em>Mikazuki Fields supports farmer judgment; it does not replace it.</em>
        </p>
      </div>
    </section>
  );
}
