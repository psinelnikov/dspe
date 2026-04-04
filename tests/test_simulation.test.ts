import { describe, it, expect, vi } from "vitest";
import { analyzeBytecode } from "../app/checks/bytecode.js";
import {
  checkAllowlist,
  checkDenylist,
  checkPerTxLimit,
  checkDailyLimit,
} from "../app/checks/limits.js";
import { matchesConditions, mapScoreToThreshold } from "../app/policy_matcher.js";
import { computeScore, runSimulation } from "../app/simulation.js";
import { hexToBytes, bytesToHex, bytes32ToString, stringToBytes32 } from "../base/utils.js";
import type { EvaluateRequest, Policy, SimulationResult, Conditions, Limits } from "../app/types.js";

vi.mock("../app/rpc.js", () => ({
  getEthCode: vi.fn().mockResolvedValue("0x600160005260206000f3"),
  getBlockNumber: vi.fn().mockResolvedValue(2000000n),
  getTransactionCount: vi.fn().mockResolvedValue(500),
  fetchActivePolicies: vi.fn(),
  getCurrentBlockTimestamp: vi.fn(),
  client: {},
  flareCoston2: {},
}));

vi.mock("../app/checks/verification.js", () => ({
  checkContractVerified: vi.fn().mockResolvedValue([true, 0]),
}));

vi.mock("../app/checks/erc7730.js", () => ({
  checkErc7730Registry: vi.fn().mockResolvedValue([true, 0]),
}));

const MOCK_TARGET = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const MOCK_ALLOW_TARGET = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as `0x${string}`;
const MOCK_DENY_TARGET = "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD" as `0x${string}`;
const MOCK_SIGNERS = [
  "0x1111111111111111111111111111111111111111" as `0x${string}`,
  "0x2222222222222222222222222222222222222222" as `0x${string}`,
  "0x3333333333333333333333333333333333333333" as `0x${string}`,
];

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 0n,
    name: "Test Policy",
    active: true,
    conditions: {
      targetAddresses: [],
      functionSelectors: [],
      minValue: 0n,
      maxValue: 0n,
      timeWindowStart: 0n,
      timeWindowEnd: 0n,
      requireVerified: false,
      requireErc7730: false,
    },
    limits: {
      maxValuePerTxUsd: 10000n * 10n ** 18n,
      maxValueDailyUsd: 100000n * 10n ** 18n,
      allowlist: [],
      denylist: [],
    },
    signers: MOCK_SIGNERS,
    riskWeight: 5,
    createdAt: 0n,
    updatedAt: 0n,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<EvaluateRequest> = {}): EvaluateRequest {
  return {
    target: MOCK_TARGET,
    calldata: "0x12345678" as `0x${string}`,
    value: 100n * 10n ** 18n,
    sender: "0x4444444444444444444444444444444444444444" as `0x${string}`,
    nonce: 1n,
    ...overrides,
  };
}

// ── Utils ──

describe("utils", () => {
  it("hexToBytes / bytesToHex roundtrip", () => {
    const hex = "0xdeadbeef";
    const bytes = hexToBytes(hex);
    expect(bytesToHex(bytes)).toBe("0xdeadbeef");
  });

  it("bytes32ToString / stringToBytes32 roundtrip", () => {
    const str = "EVALUATE_RISK";
    const b32 = stringToBytes32(str);
    expect(bytes32ToString(b32)).toBe(str);
  });

  it("stringToBytes32 pads to 32 bytes", () => {
    const b32 = stringToBytes32("AB");
    const bytes = hexToBytes(b32);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0x41); // 'A'
    expect(bytes[1]).toBe(0x42); // 'B'
    expect(bytes[2]).toBe(0x00); // padding
  });
});

// ── Bytecode Scanner ──

describe("bytecode scanner", () => {
  it("returns high risk for empty/EOA", () => {
    const [pass, score] = analyzeBytecode("0x");
    expect(pass).toBe(false);
    expect(score).toBe(70);
  });

  it("detects DELEGATECALL", () => {
    const bytecode = "0x60016000f4"; // PUSH1 0x01, PUSH1 0x00, DELEGATECALL
    const [pass, score] = analyzeBytecode(bytecode);
    expect(pass).toBe(false);
    expect(score).toBe(65);
  });

  it("does NOT flag 0xF4 in PUSH data", () => {
    // PUSH2 contains 0x00f4 as data, not as instruction
    const bytecode = "0x6100f46000"; // PUSH2 0x00f4, PUSH1 0x00
    const [pass, score] = analyzeBytecode(bytecode);
    expect(pass).toBe(true);
    expect(score).toBe(30); // small contract (< 100 bytes) but no dangerous patterns
  });

  it("detects SELFDESTRUCT", () => {
    const bytecode = "0x30ff"; // ADDRESS, SELFDESTRUCT
    const [pass, score] = analyzeBytecode(bytecode);
    expect(pass).toBe(false);
    expect(score).toBe(70);
  });

  it("detects DELEGATECALL + SELFDESTRUCT", () => {
    const bytecode = "0x6000f4ff"; // PUSH1 0x00, DELEGATECALL, SELFDESTRUCT
    const [pass, score] = analyzeBytecode(bytecode);
    expect(pass).toBe(false);
    expect(score).toBe(80);
  });

  it("normal contract is low risk", () => {
    // A simple contract without dangerous opcodes
    const bytecode = "0x600160005260206000f3"; // PUSH1 0x01, PUSH1 0x00, MSTORE, PUSH1 0x20, PUSH1 0x00, RETURN
    const [pass, score] = analyzeBytecode(bytecode);
    expect(pass).toBe(true);
    expect(score).toBe(30); // small contract (<100 bytes)
  });
});

// ── Limit Checks ──

describe("limit checks", () => {
  it("allowlist: passes when empty", () => {
    const [pass, score] = checkAllowlist(MOCK_TARGET, []);
    expect(pass).toBe(true);
    expect(score).toBe(0);
  });

  it("allowlist: passes when target is in list", () => {
    const [pass, score] = checkAllowlist(MOCK_ALLOW_TARGET, [MOCK_ALLOW_TARGET]);
    expect(pass).toBe(true);
    expect(score).toBe(0);
  });

  it("allowlist: fails when target not in list", () => {
    const [pass, score] = checkAllowlist(MOCK_TARGET, [MOCK_ALLOW_TARGET]);
    expect(pass).toBe(false);
    expect(score).toBe(80);
  });

  it("denylist: passes when empty", () => {
    const [pass, score] = checkDenylist(MOCK_TARGET, []);
    expect(pass).toBe(true);
    expect(score).toBe(0);
  });

  it("denylist: fails when target in list", () => {
    const [pass, score] = checkDenylist(MOCK_DENY_TARGET, [MOCK_DENY_TARGET]);
    expect(pass).toBe(false);
    expect(score).toBe(100);
  });

  it("denylist: passes when target not in list", () => {
    const [pass, score] = checkDenylist(MOCK_TARGET, [MOCK_DENY_TARGET]);
    expect(pass).toBe(true);
    expect(score).toBe(0);
  });

  it("per-tx limit: passes when within limit", () => {
    const [pass, _score] = checkPerTxLimit(500n * 10n ** 18n, 1000n * 10n ** 18n);
    expect(pass).toBe(true);
  });

  it("per-tx limit: fails when exceeds limit", () => {
    const [pass, score] = checkPerTxLimit(2000n * 10n ** 18n, 1000n * 10n ** 18n);
    expect(pass).toBe(false);
    expect(score).toBe(95);
  });

  it("daily limit: tracks per-policy", () => {
    const [pass1] = checkDailyLimit(
      800n * 10n ** 18n,
      0n,
      1000n * 10n ** 18n
    );
    expect(pass1).toBe(true);

    const [pass2] = checkDailyLimit(
      300n * 10n ** 18n,
      800n * 10n ** 18n,
      1000n * 10n ** 18n
    );
    expect(pass2).toBe(false); // 800+300 > 1000
  });
});

// ── Policy Matcher ──

describe("policy matcher", () => {
  it("matches when no conditions set", () => {
    const request = makeRequest();
    const conditions: Conditions = {
      targetAddresses: [],
      functionSelectors: [],
      minValue: 0n,
      maxValue: 0n,
      timeWindowStart: 0n,
      timeWindowEnd: 0n,
      requireVerified: false,
      requireErc7730: false,
    };
    expect(matchesConditions(request, conditions)).toBe(true);
  });

  it("matches by target address", () => {
    const request = makeRequest({ target: MOCK_ALLOW_TARGET });
    const conditions: Conditions = {
      ...makePolicy().conditions,
      targetAddresses: [MOCK_ALLOW_TARGET],
    };
    expect(matchesConditions(request, conditions)).toBe(true);
  });

  it("rejects non-matching target", () => {
    const request = makeRequest();
    const conditions: Conditions = {
      ...makePolicy().conditions,
      targetAddresses: [MOCK_ALLOW_TARGET],
    };
    expect(matchesConditions(request, conditions)).toBe(false);
  });

  it("matches by function selector", () => {
    const request = makeRequest({ calldata: "0xa9059cbb00000000" as `0x${string}` });
    const conditions: Conditions = {
      ...makePolicy().conditions,
      functionSelectors: ["0xa9059cbb" as `0x${string}`],
    };
    expect(matchesConditions(request, conditions)).toBe(true);
  });

  it("rejects non-matching selector", () => {
    const request = makeRequest({ calldata: "0xa9059cbb00000000" as `0x${string}` });
    const conditions: Conditions = {
      ...makePolicy().conditions,
      functionSelectors: ["0x12345678" as `0x${string}`],
    };
    expect(matchesConditions(request, conditions)).toBe(false);
  });

  it("matches by value range", () => {
    const request = makeRequest({ value: 500n });
    const conditions: Conditions = {
      ...makePolicy().conditions,
      minValue: 100n,
      maxValue: 1000n,
    };
    expect(matchesConditions(request, conditions)).toBe(true);
  });

  it("rejects value below minimum", () => {
    const request = makeRequest({ value: 50n });
    const conditions: Conditions = {
      ...makePolicy().conditions,
      minValue: 100n,
    };
    expect(matchesConditions(request, conditions)).toBe(false);
  });
});

// ── Score Computation ──

describe("score computation", () => {
  it("computes weighted score from checks", () => {
    const checks: SimulationResult = {
      bitmap: 0x03FF,
      scores: [0, 0, 0, 0, 10, 10, 5, 5, 5, 15],
      weights: [0.1, 0.15, 0.12, 0.1, 0.13, 0.1, 0.1, 0.07, 0.06, 0.07],
      executed: new Array(10).fill(true),
    };
    const score = computeScore(checks, 1);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeLessThan(20);
  });

  it("applies hard penalty for denylist failure", () => {
    const checks: SimulationResult = {
      bitmap: 0x00, // all bits 0 = all checks fail
      scores: [80, 100, 75, 60, 95, 90, 65, 85, 70, 70],
      weights: [0.1, 0.15, 0.12, 0.1, 0.13, 0.1, 0.1, 0.07, 0.06, 0.07],
      executed: new Array(10).fill(true),
    };
    const score = computeScore(checks, 1);
    expect(score).toBeGreaterThanOrEqual(90); // denylist penalty
  });

  it("applies hard penalty for per-tx limit failure", () => {
    // denylist passes (bit 1 set), per-tx fails (bit 4 not set)
    const checks: SimulationResult = {
      bitmap: 0x02, // only bit 1 set (denylist pass)
      scores: [80, 0, 75, 60, 95, 90, 65, 85, 70, 70],
      weights: [0.1, 0.15, 0.12, 0.1, 0.13, 0.1, 0.1, 0.07, 0.06, 0.07],
      executed: new Array(10).fill(true),
    };
    const score = computeScore(checks, 1);
    expect(score).toBeGreaterThanOrEqual(80); // per-tx limit penalty
  });

  it("excludes failed checks from scoring (fail-open)", () => {
    const checks: SimulationResult = {
      bitmap: 0x03FF,
      scores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      weights: [0.1, 0.15, 0.12, 0.1, 0.13, 0.1, 0.1, 0.07, 0.06, 0.07],
      executed: [true, true, false, false, true, true, true, true, true, true],
    };
    const score = computeScore(checks, 1);
    expect(score).toBe(0);
  });

  it("amplifies score by policy risk weight", () => {
    const checks: SimulationResult = {
      bitmap: 0x03FF,
      scores: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      weights: [0.1, 0.15, 0.12, 0.1, 0.13, 0.1, 0.1, 0.07, 0.06, 0.07],
      executed: new Array(10).fill(true),
    };
    const score1 = computeScore(checks, 1);
    const score10 = computeScore(checks, 10);
    expect(score10).toBeGreaterThan(score1);
  });
});

// ── Threshold Mapping ──

describe("threshold mapping", () => {
  it("single signer always returns 1", () => {
    expect(mapScoreToThreshold(100, 1)).toBe(1);
    expect(mapScoreToThreshold(0, 1)).toBe(1);
  });

  it("low score → 1-of-3", () => {
    expect(mapScoreToThreshold(10, 3)).toBe(1);
  });

  it("high score → 3-of-3", () => {
    expect(mapScoreToThreshold(100, 3)).toBe(3);
  });

  it("medium score → 2-of-3", () => {
    expect(mapScoreToThreshold(50, 3)).toBe(2);
  });
});

// ── Simulation Integration ──

describe("simulation integration", () => {
  it("low-risk scenario produces low score", async () => {
    const request = makeRequest({
      target: MOCK_ALLOW_TARGET,
      calldata: "0x12345678" as `0x${string}`,
      value: 10n * 10n ** 18n,
    });

    const policy = makePolicy({
      limits: {
        maxValuePerTxUsd: 10000n * 10n ** 18n,
        maxValueDailyUsd: 100000n * 10n ** 18n,
        allowlist: [MOCK_ALLOW_TARGET],
        denylist: [],
      },
      riskWeight: 1,
    });

    const result = await runSimulation(request, policy, 10n * 10n ** 18n, 0n);
    const score = computeScore(result, policy.riskWeight);

    expect(score).toBeLessThan(30);
    expect(result.bitmap & (1 << 0)).toBeTruthy();
    expect(result.bitmap & (1 << 1)).toBeTruthy();
  });

  it("high-risk denylist scenario produces high score", async () => {
    const request = makeRequest({
      target: MOCK_DENY_TARGET,
      value: 50000n * 10n ** 18n,
    });

    const policy = makePolicy({
      limits: {
        maxValuePerTxUsd: 1000n * 10n ** 18n,
        maxValueDailyUsd: 5000n * 10n ** 18n,
        allowlist: [],
        denylist: [MOCK_DENY_TARGET],
      },
      riskWeight: 8,
    });

    const result = await runSimulation(request, policy, 50000n * 10n ** 18n, 0n);
    const score = computeScore(result, policy.riskWeight);

    expect(score).toBeGreaterThanOrEqual(90);
    expect(result.bitmap & (1 << 1)).toBeFalsy();
  });

  it("highest-risk-wins across multiple policies", async () => {
    const request = makeRequest({ value: 1000n * 10n ** 18n });

    const policyA = makePolicy({
      id: 0n,
      riskWeight: 2,
      limits: {
        maxValuePerTxUsd: 0n,
        maxValueDailyUsd: 0n,
        allowlist: [],
        denylist: [],
      },
    });

    const policyB = makePolicy({
      id: 1n,
      riskWeight: 8,
      limits: {
        maxValuePerTxUsd: 0n,
        maxValueDailyUsd: 0n,
        allowlist: [],
        denylist: [],
      },
    });

    const resultA = await runSimulation(request, policyA, 1000n * 10n ** 18n, 0n);
    const resultB = await runSimulation(request, policyB, 1000n * 10n ** 18n, 0n);
    const scoreA = computeScore(resultA, policyA.riskWeight);
    const scoreB = computeScore(resultB, policyB.riskWeight);

    expect(scoreB).toBeGreaterThan(scoreA);
  });
});
