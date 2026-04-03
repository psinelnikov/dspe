export function checkAllowlist(
  target: `0x${string}`,
  allowlist: `0x${string}`[]
): [boolean, number] {
  if (allowlist.length === 0) return [true, 0];
  const found = allowlist.some((a) => a.toLowerCase() === target.toLowerCase());
  return [found, found ? 0 : 80];
}

export function checkDenylist(
  target: `0x${string}`,
  denylist: `0x${string}`[]
): [boolean, number] {
  if (denylist.length === 0) return [true, 0];
  const found = denylist.some((a) => a.toLowerCase() === target.toLowerCase());
  return [!found, found ? 100 : 0];
}

export function checkPerTxLimit(
  txValueUsd: bigint,
  maxValuePerTxUsd: bigint
): [boolean, number] {
  if (maxValuePerTxUsd === 0n) return [true, 10];
  if (txValueUsd <= maxValuePerTxUsd) {
    const ratio = Number((txValueUsd * 10000n) / maxValuePerTxUsd) / 10000;
    return [true, Math.round(ratio * 50)];
  }
  return [false, 95];
}

export function checkDailyLimit(
  txValueUsd: bigint,
  policyDailyVolumeUsd: bigint,
  maxValueDailyUsd: bigint
): [boolean, number] {
  if (maxValueDailyUsd === 0n) return [true, 10];
  const projected = policyDailyVolumeUsd + txValueUsd;
  if (projected <= maxValueDailyUsd) {
    const ratio = Number((projected * 10000n) / maxValueDailyUsd) / 10000;
    return [true, Math.round(ratio * 50)];
  }
  return [false, 90];
}
