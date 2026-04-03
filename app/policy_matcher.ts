import { Policy, EvaluateRequest, State, StateReport } from "./types.js";
import { bytesToHex, hexToBytes } from "../base/utils.js";

export function matchesConditions(request: EvaluateRequest, conditions: Policy["conditions"]): boolean {
  const c = conditions;

  if (c.targetAddresses.length > 0) {
    if (!c.targetAddresses.some((a) => a.toLowerCase() === request.target.toLowerCase())) {
      return false;
    }
  }

  if (c.functionSelectors.length > 0) {
    if (request.calldata.length < 10) return false;
    const selector = request.calldata.slice(0, 10) as `0x${string}`;
    if (!c.functionSelectors.some((s) => s.toLowerCase() === selector.toLowerCase())) {
      return false;
    }
  }

  if (c.minValue > 0n && request.value < c.minValue) return false;
  if (c.maxValue > 0n && request.value > c.maxValue) return false;

  return true;
}

export function mapScoreToThreshold(score: number, totalSigners: number): number {
  if (totalSigners === 1) return 1;
  const fraction = score / 100.0;
  const required = Math.max(1, Math.ceil(fraction * totalSigners));
  return Math.min(required, totalSigners);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
