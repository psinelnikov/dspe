export type CheckFn = () => [boolean, number];

export function runCheck(
  checkFn: CheckFn,
  defaultBit: boolean
): [boolean, number, boolean] {
  try {
    const result = checkFn();
    return [result[0], result[1], true];
  } catch (err: unknown) {
    console.warn("Check failed (fail-open):", err instanceof Error ? err.message : err);
    return [defaultBit, 0, false];
  }
}
