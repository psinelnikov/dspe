import { State, StateReport } from "./types.js";
import { OP_TYPE_EVALUATE, OP_COMMAND_DEFAULT, POLICY_REGISTRY_ADDR, AUDIT_LOG_ADDR } from "./config.js";
import { handleEvaluate } from "./handlers.js";
import type { Framework } from "../base/types.js";

export function register(framework: Framework): void {
  const initialState: State = {
    evaluationsProcessed: 0n,
    lastMatchedPolicyId: 0n,
    lastRiskScore: 0,
    processedNonces: new Set<string>(),
    policyDailyVolumes: new Map<string, { date: string; totalUsd: bigint }>(),
  };

  framework.setState(initialState);
  framework.handle(OP_TYPE_EVALUATE, OP_COMMAND_DEFAULT, handleEvaluate as any);
}

export function reportState(state: unknown): StateReport {
  const s = state as State;
  const volumes: Record<string, string> = {};
  s.policyDailyVolumes.forEach((v, k) => {
    volumes[k] = v.totalUsd.toString();
  });
  return {
    evaluationsProcessed: s.evaluationsProcessed.toString(),
    lastMatchedPolicyId: s.lastMatchedPolicyId.toString(),
    lastRiskScore: s.lastRiskScore,
    registryAddress: POLICY_REGISTRY_ADDR,
    auditLogAddress: AUDIT_LOG_ADDR,
    policyDailyVolumes: volumes,
  };
}
