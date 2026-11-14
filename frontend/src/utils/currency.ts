export const PHP_PER_USD = 63.96;

export function formatPhpUsd(phpAmount: number): string {
  const php = Math.round(phpAmount) || 0;
  const usd = Math.round(phpAmount / PHP_PER_USD) || 0;
  return `PHP ${php.toLocaleString("en-PH")} / USD ${usd.toLocaleString("en-US")}`;
}

/** Converts backend or cached PHP amounts embedded in narrative bullets into PHP / USD format. */
export function formatPhpUsdInText(text: string): string {
  return text
    .replace(
      /PHP\s+(-?[\d,]+(?:\.\d+)?)(?!\s*\/\s*USD)\s*\(([+-])([\d,]+(?:\.\d+)?)\s+vs\s+Status Quo\)/g,
      (_, main: string, diffSign: string, diff: string) => {
        const m = Number(main.replace(/,/g, ""));
        const d = Number(diff.replace(/,/g, ""));
        const s = diffSign === "-" ? "−" : "+";
        return `${formatPhpUsd(m)} (${s}${formatPhpUsd(d)} vs Status Quo)`;
      },
    )
    .replace(/PHP\s+(-?[\d,]+(?:\.\d+)?)(?!\s*\/\s*USD)/g, (_, num: string) =>
      formatPhpUsd(Number(num.replace(/,/g, ""))),
    )
    .replace(/([−-]?)₱([\d,]+(?:\.\d+)?)/g, (_, sign: string, num: string) => {
      const v = Number(num.replace(/,/g, "")) * (sign ? -1 : 1);
      return formatPhpUsd(v);
    });
}
