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
  walletFactory: import.meta.env.VITE_WALLET_FACTORY_ADDR as `0x${string}`,
  governanceMultisig: import.meta.env.VITE_GOVERNANCE_MULTISIG_ADDR as `0x${string}`,
  policyRegistry: import.meta.env.VITE_POLICY_REGISTRY_ADDR as `0x${string}`,
  auditLog: import.meta.env.VITE_AUDIT_LOG_ADDR as `0x${string}`,
  multisigWallet: import.meta.env.VITE_MULTISIG_WALLET_ADDR as `0x${string}`,
  presetPolicyRegistry: import.meta.env.VITE_PRESET_POLICY_REGISTRY_ADDR as `0x${string}`,
  instructionSender: import.meta.env.VITE_INSTRUCTION_SENDER_ADDR as `0x${string}`,
  testToken: import.meta.env.VITE_TEST_TOKEN_ADDR as `0x${string}`,
} as const;

// Validate addresses to prevent burn address usage
export function validateAddress(address: string | undefined): address is `0x${string}` {
  return !!address && address !== "0x0000000000000000000000000000000000000000" && address.startsWith("0x") && address.length === 42;
}

export const PRESET_DESCRIPTIONS: Record<number, string> = {
  0: "Auto-approve transfers under $1,000. Low friction for everyday operations.",
  1: "Transfers from $1K to $50K. Requires multi-sig approval with medium risk checks.",
  2: "Admin operations like signer changes. Requires verified contracts and unanimous approval.",
  3: "Interact with whitelisted DeFi protocols. Moderate limits with balanced security.",
};

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

export function formatUsd(val: bigint): string {
  const num = Number(val) / 1e18;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}
