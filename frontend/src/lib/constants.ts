export const FLARE_COSTON2_CHAIN = {
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "C2FLR", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
} as const;

export const CONTRACTS = {
  governanceMultisig: import.meta.env.VITE_GOVERNANCE_MULTISIG_ADDR as `0x${string}`,
  policyRegistry: import.meta.env.VITE_POLICY_REGISTRY_ADDR as `0x${string}`,
  auditLog: import.meta.env.VITE_AUDIT_LOG_ADDR as `0x${string}`,
  multisigWallet: import.meta.env.VITE_MULTISIG_WALLET_ADDR as `0x${string}`,
} as const;

export const CHECK_LABELS: Record<number, string> = {
  0: "Allowlist",
  1: "Denylist",
  2: "Verification",
  3: "ERC-7730",
  4: "Per-Tx Limit",
  5: "Daily Limit",
  6: "Bytecode",
  7: "Contract Age",
  8: "Tx Volume",
  9: "Calldata",
};

export function riskColor(score: number): string {
  if (score <= 25) return "var(--green)";
  if (score <= 50) return "var(--accent)";
  if (score <= 75) return "#f97316";
  return "var(--red)";
}

export function riskLabel(score: number): string {
  if (score <= 25) return "Low";
  if (score <= 50) return "Medium";
  if (score <= 75) return "High";
  return "Critical";
}

export function decodeCheckResults(bitmap: number): { bit: number; label: string; pass: boolean }[] {
  const results: { bit: number; label: string; pass: boolean }[] = [];
  for (let i = 0; i <= 9; i++) {
    results.push({
      bit: i,
      label: CHECK_LABELS[i] || `Check ${i}`,
      pass: (bitmap & (1 << i)) !== 0,
    });
  }
  return results;
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString();
}

export function explorerUrl(addr: string): string {
  return `https://coston2-explorer.flare.network/address/${addr}`;
}
