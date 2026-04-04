import { useState } from "react";

interface CopyableAddressProps {
  address: string;
  short?: boolean;
  className?: string;
}

export function CopyableAddress({ address, short = true, className = "" }: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const displayAddress = short && address.length > 10
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 font-mono hover:text-[var(--accent)] transition-colors ${className}`}
      title={address}
    >
      <span>{displayAddress}</span>
      <span className="text-xs opacity-60">
        {copied ? "✓" : "📋"}
      </span>
    </button>
  );
}
