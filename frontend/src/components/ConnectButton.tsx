import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { FLARE_COSTON2_CHAIN, shortAddress } from "../lib/constants";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address, chainId: FLARE_COSTON2_CHAIN.id });

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        {balance && (
          <span className="text-xs text-[var(--text-secondary)]">
            {Number.parseFloat(balance.formatted).toFixed(4)} C2FLR
          </span>
        )}
        <a
          href={`https://coston2-explorer.flare.network/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-mono text-[var(--text-primary)] hover:text-[var(--accent)]"
        >
          {shortAddress(address)}
        </a>
        <button
          onClick={() => disconnect()}
          className="btn btn-secondary btn-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          className="btn btn-primary"
        >
          Connect Wallet
        </button>
      ))}
    </div>
  );
}
