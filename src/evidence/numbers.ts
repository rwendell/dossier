const MULTIPLIERS: Record<string, string> = {
  m: 'm',
  million: 'm',
  k: 'k',
  thousand: 'k',
  b: 'b',
  billion: 'b',
  '%': '%',
  x: 'x',
};

export function extractNumbers(text: unknown): string[] {
  const matches =
    String(text ?? '').match(
      /(?<![A-Za-z0-9.])\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:M|k|K|million|billion|thousand|%|[xX]))?(?![A-Za-z0-9])/g,
    ) ?? [];

  return matches.map((raw) => {
    const value = raw.replace(/,/g, '').replace(/\s+/g, '').toLowerCase();
    const match = value.match(
      /^(.*?)(million|billion|thousand|m|k|b|%|x)$/,
    );
    if (!match) return value;
    return `${match[1]}${MULTIPLIERS[match[2]!]}`;
  });
}

export function stripTimes(value: unknown): string {
  return String(value ?? '')
    .replace(/\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' ');
}
