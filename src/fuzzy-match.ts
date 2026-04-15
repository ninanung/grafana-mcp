export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function suggestClosest(
  target: string,
  candidates: string[],
  max: number = 5
): string[] {
  const lowerTarget = target.toLowerCase();
  const scored = candidates.map((c) => ({
    value: c,
    distance: levenshtein(lowerTarget, c.toLowerCase()),
    containsMatch:
      c.toLowerCase().includes(lowerTarget) || lowerTarget.includes(c.toLowerCase()),
  }));
  const threshold = Math.max(2, Math.floor(target.length / 3));
  return scored
    .filter((s) => s.containsMatch || s.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max)
    .map((s) => s.value);
}
