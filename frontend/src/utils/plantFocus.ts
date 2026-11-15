export const DIMMED_PLOT_OPACITY = 0.18;

/** Compute per-plot crop material opacity/blending state for focus spotlighting. */
export function nextPlotCropAppearance(
  currentOpacity: number,
  plot: number,
  focus: number,
  instant = false,
): { opacity: number; transparent: boolean; depthWrite: boolean } {
  const on = focus < 0 || focus === plot;
  const target = on ? 1 : DIMMED_PLOT_OPACITY;
  const raw = instant ? target : currentOpacity + (target - currentOpacity) * 0.25;
  const opacity = on && raw > 0.995 ? 1 : raw;
  const opaque = opacity >= 1;
  return { opacity, transparent: !opaque, depthWrite: opaque };
}
