export const PHP_PER_USD = 63.96;

export function formatPhpUsd(phpAmount: number): string {
  const php = Math.round(phpAmount) || 0;
  const usd = Math.round(phpAmount / PHP_PER_USD) || 0;
  return `PHP ${php.toLocaleString("en-PH")} / USD ${usd.toLocaleString("en-US")}`;
}

// A whole amount: never stop mid-number (that let a second pass split "127,920").
const AMOUNT = String.raw`(-?\d[\d,]*(?:\.\d+)?)(?!\d|[.,]\d)`;
const MONEY = new RegExp(
  String.raw`PHP\s+${AMOUNT}(?!\s*\/\s*USD)(?:\s*\(([+-])${AMOUNT}\s+vs Status Quo\))?|([−-]?)₱${AMOUNT}`,
  "g",
);
const num = (s: string) => Number(s.replace(/,/g, ""));

/** Converts backend or cached PHP amounts embedded in narrative bullets into PHP / USD format, in one pass. */
export function formatPhpUsdInText(text: string): string {
  return text.replace(MONEY, (_, php?: string, sign?: string, diff?: string, pesoSign?: string, peso?: string) =>
    php === undefined
      ? formatPhpUsd(num(peso!) * (pesoSign ? -1 : 1))
      : formatPhpUsd(num(php)) + (diff ? ` (${sign === "-" ? "−" : "+"}${formatPhpUsd(num(diff))} vs Status Quo)` : ""),
  );
}
