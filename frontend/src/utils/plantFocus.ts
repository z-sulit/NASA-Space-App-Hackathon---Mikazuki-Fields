export const DIMMED_PLOT_OPACITY = 0.18;

/** Resolve the single focused/hovered plot (0–5) and visible label plot (0–5), or -1 for none. */
export function resolveActivePlot(
  season: number,
  externalFocus: number,
  canvasHover: number,
): { focusPlot: number; labelPlot: number } {
  if (season < 0) return { focusPlot: -1, labelPlot: -1 };
  if (season < 6) return { focusPlot: -1, labelPlot: season };
  const focusPlot = canvasHover >= 0 ? canvasHover : externalFocus >= 0 ? externalFocus : -1;
  return { focusPlot, labelPlot: focusPlot };
}

/** Compute next opacity and visibility for a floating 3D plot label sprite. */
export function nextPlotLabelAppearance(
  currentOpacity: number,
  plot: number,
  activeLabel: number,
  instant = false,
): { opacity: number; visible: boolean } {
  const target = activeLabel === plot ? 1 : 0;
  const raw = instant ? target : currentOpacity + (target - currentOpacity) * 0.25;
  const opacity = target === 1 && raw > 0.995 ? 1 : target === 0 && raw < 0.005 ? 0 : raw;
  return { opacity, visible: target === 1 || opacity > 0.01 };
}

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
