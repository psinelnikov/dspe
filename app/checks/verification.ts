import { EXPLORER_API_URL } from "../config.js";

export async function checkContractVerified(target: `0x${string}`): Promise<[boolean, number]> {
  const url = `${EXPLORER_API_URL}?module=contract&action=getabi&address=${target}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const json = await response.json();
  const verified = json.status === "1";
  return [verified, verified ? 0 : 75];
}
