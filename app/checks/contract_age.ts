import { getEthCode, getBlockNumber } from "../rpc.js";

// COMPLEXITY NOTE: Binary search for contract deploy block makes O(log N) RPC calls.
// On Coston2 (~2M blocks) that's ~21 calls. Acceptable for MVP.
// For production, use the block explorer's contract creation API instead.
export async function checkContractAge(target: `0x${string}`): Promise<[boolean, number]> {
  const currentBlock = await getBlockNumber();
  const currentCode = await getEthCode(target);
  if (!currentCode || currentCode === "0x") {
    return [false, 70];
  }

  let low = 0n;
  let high = currentBlock;

  while (low < high) {
    const mid = (low + high) / 2n;
    const code = await getEthCode(target, mid);
    if (!code || code === "0x") {
      low = mid + 1n;
    } else {
      high = mid;
    }
  }

  const ageInBlocks = Number(currentBlock - low);

  if (ageInBlocks < 100) return [false, 85];
  if (ageInBlocks < 10000) return [true, 50];
  if (ageInBlocks < 100000) return [true, 20];
  return [true, 5];
}
