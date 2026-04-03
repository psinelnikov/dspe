import { FLARE_CONTRACT_REGISTRY, FLR_USD_FEED_ID, FLARE_RPC_URL } from "../config.js";
import { createPublicClient, http, decodeFunctionResult, encodeFunctionData } from "viem";
import { defineChain } from "viem";

const flareCoston2 = defineChain({
  id: 114,
  name: "Flare Coston2",
  nativeCurrency: { name: "C2FLR", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [FLARE_RPC_URL] } },
});

const client = createPublicClient({
  chain: flareCoston2,
  transport: http(FLARE_RPC_URL),
});

const REGISTRY_ABI = [
  {
    name: "getContractAddressByName",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const FTSO_ABI = [
  {
    name: "getFeedByIdInWei",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "feedId", type: "bytes21" }],
    outputs: [
      { name: "value", type: "uint256" },
      { name: "timestamp", type: "uint64" },
    ],
  },
] as const;

let cachedPrice: bigint | null = null;
let cachedTimestamp: number = 0;

export async function fetchFtsoPrice(): Promise<bigint> {
  if (cachedPrice !== null && Date.now() / 1000 - cachedTimestamp < 30) {
    return cachedPrice;
  }

  const ftsoV2Addr = await client.readContract({
    address: FLARE_CONTRACT_REGISTRY as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getContractAddressByName",
    args: ["TestFtsoV2"],
  });

  const [priceWei, timestamp] = await client.readContract({
    address: ftsoV2Addr,
    abi: FTSO_ABI,
    functionName: "getFeedByIdInWei",
    args: [FLR_USD_FEED_ID as `0x${string}`],
  });

  const now = Math.floor(Date.now() / 1000);
  if (now - Number(timestamp) > 60) {
    throw new Error("FTSO price is stale");
  }

  cachedPrice = priceWei;
  cachedTimestamp = now;
  return priceWei;
}
