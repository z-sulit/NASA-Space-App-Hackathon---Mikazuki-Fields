import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMMED_PLOT_OPACITY,
  nextPlotCropAppearance,
  nextPlotLabelAppearance,
  resolveActivePlot,
} from "./plantFocus.ts";

test("nextPlotCropAppearance keeps focused plot opaque, fades non-selected plots to 0.18, and restores when focus clears", () => {
  assert.deepEqual(nextPlotCropAppearance(1, 2, 2), {
    opacity: 1,
    transparent: false,
    depthWrite: true,
  });

  let op = 1;
  for (let i = 0; i < 40; i++) {
    const res = nextPlotCropAppearance(op, 0, 2);
    assert.equal(res.transparent, true);
    assert.equal(res.depthWrite, false);
    op = res.opacity;
  }
  assert.ok(Math.abs(op - DIMMED_PLOT_OPACITY) < 1e-4);

  for (let i = 0; i < 40; i++) {
    op = nextPlotCropAppearance(op, 0, -1).opacity;
  }
  assert.deepEqual(nextPlotCropAppearance(op, 0, -1), {
    opacity: 1,
    transparent: false,
    depthWrite: true,
  });
});

test("resolveActivePlot hides all labels when idle and shows only one plot during hover, selection, or planting", () => {
  assert.deepEqual(resolveActivePlot(-1, -1, -1), { focusPlot: -1, labelPlot: -1 });
  assert.deepEqual(resolveActivePlot(2, -1, 4), { focusPlot: -1, labelPlot: 2 });
  assert.deepEqual(resolveActivePlot(6, -1, -1), { focusPlot: -1, labelPlot: -1 });
  assert.deepEqual(resolveActivePlot(6, 3, -1), { focusPlot: 3, labelPlot: 3 });
  assert.deepEqual(resolveActivePlot(6, 3, 1), { focusPlot: 1, labelPlot: 1 });
});

test("nextPlotLabelAppearance hides all 6 labels by default and illuminates only the single active plot", () => {
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(nextPlotLabelAppearance(0, i, -1), { opacity: 0, visible: false });
  }

  let activeOp = 0;
  for (let step = 0; step < 30; step++) {
    const res = nextPlotLabelAppearance(activeOp, 2, 2);
    assert.equal(res.visible, true);
    activeOp = res.opacity;
  }
  assert.equal(activeOp, 1);

  for (let i = 0; i < 6; i++) {
    if (i === 2) continue;
    let otherOp = 1;
    for (let step = 0; step < 30; step++) {
      otherOp = nextPlotLabelAppearance(otherOp, i, 2).opacity;
    }
    const done = nextPlotLabelAppearance(otherOp, i, 2);
    assert.equal(done.opacity, 0);
    assert.equal(done.visible, false);
  }
});
