export async function checkErc7730Registry(target: `0x${string}`): Promise<[boolean, number]> {
  const targetLower = target.toLowerCase();
  const url =
    `https://api.github.com/search/code?q=${targetLower}` +
    `+repo:LedgerHQ/clear-signing-erc7730-registry+path:registry`;
  const response = await fetch(url, {
    headers: { "User-Agent": "multisig-policy-engine" },
    signal: AbortSignal.timeout(5000),
  });
  const json = await response.json();
  const has7730 = (json as any).total_count > 0;
  return [has7730, has7730 ? 0 : 60];
}
