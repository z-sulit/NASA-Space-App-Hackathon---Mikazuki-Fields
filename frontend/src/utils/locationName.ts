import type { Preset } from "../types";

/** Format a Nominatim reverse-geocode address into concise `Barangay, City/Municipality, Province`. */
export function formatReverseAddress(address?: Record<string, string | undefined>, displayName?: string): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  const pushPart = (raw?: string) => {
    const val = raw?.trim();
    if (!val || /^philippines$/i.test(val) || /^\d{4}$/.test(val)) return;
    const lower = val.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    parts.push(val);
  };
  if (address) {
    pushPart(address.village || address.suburb || address.quarter || address.neighbourhood);
    pushPart(address.city || address.town || address.municipality);
    pushPart(address.province || address.state);
  }
  if (parts.length === 0 && displayName) {
    for (const seg of displayName.split(", ")) {
      pushPart(seg);
      if (parts.length >= 3) break;
    }
  }
  return parts.length ? parts.join(", ") : null;
}

/** True when a custom pin or boundary target has a geocoded/searched place name instead of the coordinate placeholder. */
export function hasResolvedPinName(target: Pick<Preset, "id" | "name">): boolean {
  return target.id.startsWith("pin-") && Boolean(target.name.trim()) && !/^Pinned farm\b/i.test(target.name);
}

/** Display name for HUD headers (falls back to "Your farm" for unresolved pins). */
export function shortTargetName(target: Pick<Preset, "id" | "name">): string {
  if (!target.id.startsWith("pin-")) return target.name.split(" (")[0];
  return hasResolvedPinName(target) ? target.name : "Your farm";
}

/** Compact label for the Step 02 Lock button so multi-part addresses stay on one line. */
export function lockTargetName(target: Pick<Preset, "id" | "name">): string {
  if (!target.id.startsWith("pin-")) return target.name.split(" (")[0];
  return hasResolvedPinName(target) ? target.name.split(",")[0].trim() : "Your farm";
}

/** Phrase-friendly location name for headings ("Route B in ..."). */
export function inTargetName(target: Pick<Preset, "id" | "name">): string {
  if (!target.id.startsWith("pin-")) return shortTargetName(target);
  return hasResolvedPinName(target) ? target.name : "your farm";
}

/** Clean location segment for the PDF report filename. */
export function reportTargetSlug(target: Pick<Preset, "id" | "name">): string {
  if (!target.id.startsWith("pin-")) return target.name.split(" (")[0];
  return hasResolvedPinName(target) ? target.name : "Your-Farm";
}
