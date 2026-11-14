// Run with `npm test` (Node's built-in runner; Node 23.6+ runs .ts directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhpUsd, formatPhpUsdInText } from "./currency.ts";

test("formatPhpUsd shows both currencies, rounded", () => {
  assert.equal(formatPhpUsd(63960), "PHP 63,960 / USD 1,000");
  assert.equal(formatPhpUsd(NaN), "PHP 0 / USD 0");
});

test("formatPhpUsdInText rewrites backend money phrases once", () => {
  // Backend why-bullet with a difference vs Status Quo
  assert.equal(
    formatPhpUsdInText("Profit PHP 127,920 (+63,960 vs Status Quo)"),
    "Profit PHP 127,920 / USD 2,000 (+PHP 63,960 / USD 1,000 vs Status Quo)",
  );
  // A negative difference keeps its sign
  assert.match(formatPhpUsdInText("PHP 10 (-63,960 vs Status Quo)"), /\(−PHP 63,960 \/ USD 1,000 vs Status Quo\)/);
  // Peso-sign amounts, including negatives
  assert.equal(formatPhpUsdInText("Loses −₱63,960"), "Loses PHP -63,960 / USD -1,000");
  // Already converted text is left alone
  assert.equal(formatPhpUsdInText("PHP 63,960 / USD 1,000"), "PHP 63,960 / USD 1,000");
  // Plain amounts at the end of a sentence, as the optimizer writes them
  assert.equal(formatPhpUsdInText("urea cost PHP 63,960."), "urea cost PHP 63,960 / USD 1,000.");
  // The real backend bullet shape
  assert.equal(
    formatPhpUsdInText("Net 3-year profit is PHP 342,522 (+213,527 vs Status Quo) with -6.1% El Niño shift."),
    "Net 3-year profit is PHP 342,522 / USD 5,355 (+PHP 213,527 / USD 3,338 vs Status Quo) with -6.1% El Niño shift.",
  );
});
