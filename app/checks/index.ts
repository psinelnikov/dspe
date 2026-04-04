export type CheckFn = () => [boolean, number];
export type AsyncCheckFn = () => Promise<[boolean, number]>;

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

export async function runCheckAsync(
  checkFn: AsyncCheckFn,
  defaultBit: boolean
): Promise<[boolean, number, boolean]> {
  try {
    const result = await checkFn();
    return [result[0], result[1], true];
  } catch (err: unknown) {
    console.warn("Async check failed (fail-open):", err instanceof Error ? err.message : err);
    return [defaultBit, 0, false];
  }
}
