export type Currency = "PHP" | "USD";

export const PHP_PER_USD = 58;

export function convertPhp(phpAmount: number, currency: Currency): number {
  return currency === "USD" ? phpAmount / PHP_PER_USD : phpAmount;
}

export function formatCurrency(phpAmount: number, currency: Currency = "PHP"): string {
  const rounded = Math.round(convertPhp(phpAmount, currency)) || 0;
  const sign = rounded < 0 ? "−" : "";
  const symbol = currency === "USD" ? "$" : "₱";
  const locale = currency === "USD" ? "en-US" : "en-PH";
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString(locale)}`;
}

export function formatCurrencyK(phpAmount: number, currency: Currency = "PHP"): string {
  const rounded = Math.round(convertPhp(phpAmount, currency) / 1000) || 0;
  const sign = rounded < 0 ? "−" : "";
  const symbol = currency === "USD" ? "$" : "₱";
  const locale = currency === "USD" ? "en-US" : "en-PH";
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString(locale)}k`;
}

/** Converts backend or cached PHP amounts embedded in narrative bullets when toggled to USD. */
export function localizeCurrencyText(text: string, currency: Currency): string {
  if (currency === "PHP") return text;
  return text
    .replace(
      /PHP\s+(-?[\d,]+(?:\.\d+)?)\s*\(([+-])([\d,]+(?:\.\d+)?)\s+vs\s+Status Quo\)/g,
      (_, main: string, diffSign: string, diff: string) => {
        const m = Number(main.replace(/,/g, ""));
        const d = Number(diff.replace(/,/g, ""));
        const s = diffSign === "-" ? "−" : "+";
        return `${formatCurrency(m, "USD")} (${s}${formatCurrency(d, "USD")} vs Status Quo)`;
      },
    )
    .replace(/PHP\s+(-?[\d,]+(?:\.\d+)?)/g, (_, num: string) =>
      formatCurrency(Number(num.replace(/,/g, "")), "USD"),
    )
    .replace(/([−-]?)₱([\d,]+(?:\.\d+)?)/g, (_, sign: string, num: string) => {
      const v = Number(num.replace(/,/g, "")) * (sign ? -1 : 1);
      return formatCurrency(v, "USD");
    });
}
