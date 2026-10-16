export function fundingProgressPercent(pledged: string, goal: string): number {
  try {
    const pledgedBig = BigInt(pledged || '0');
    const goalBig = BigInt(goal || '0');
    if (pledgedBig <= 0n || goalBig <= 0n) return 0;
    const percent = (pledgedBig * 100n) / goalBig;
    return Number(percent > 100n ? 100n : percent);
  } catch {
    return 0;
  }
}
