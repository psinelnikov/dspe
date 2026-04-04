import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { FLARE_COSTON2_CHAIN, CONTRACTS, shortAddress, validateAddress } from "../lib/constants";
import { WALLET_FACTORY_ABI } from "../lib/abi";
import { useMultisig, type MultisigDeployment } from "../context/MultisigContext";

export default function HomePage() {
  const { address } = useAccount();
  const navigate = useNavigate();
  const { selectMultisig } = useMultisig();
  const [manualAddress, setManualAddress] = useState("");
  const [error, setError] = useState("");

  // Fetch wallets created by the connected user
  const { data: creatorWallets, isLoading } = useReadContract({
    address: CONTRACTS.walletFactory,
    abi: WALLET_FACTORY_ABI,
    functionName: "getWalletsForCreator",
    args: address ? [address] : undefined,
    chainId: FLARE_COSTON2_CHAIN.id,
    query: { enabled: !!address },
  });

  const handleSelectMultisig = (multisig: MultisigDeployment) => {
    selectMultisig(multisig);
    navigate("/policies");
  };

  const handleManualSubmit = () => {
    setError("");
    if (!validateAddress(manualAddress)) {
      setError("Please enter a valid Ethereum address (0x...)");
      return;
    }

    // For manual entry, we assume the governance address is entered
    // In a real app, you might want to fetch the related contracts from the governance
    const manualMultisig: MultisigDeployment = {
      wallet: manualAddress as `0x${string}`,
      governance: manualAddress as `0x${string}`,
      policyRegistry: manualAddress as `0x${string}`,
      auditLog: manualAddress as `0x${string}`,
    };
    selectMultisig(manualMultisig);
    navigate("/policies");
  };

  const walletList = (creatorWallets as MultisigDeployment[] | undefined) || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Multisig Policy Engine</h1>
        <p className="text-lg text-[var(--text-secondary)]">
          Secure, policy-driven multisig wallet management with TEE-powered enforcement
        </p>
      </div>

      {/* Manual Entry Section */}
      <div className="card mb-8">
        <h2 className="text-xl font-semibold mb-4">Browse Multisig</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Enter a multisig wallet or governance address to view its policies, audit log, and proposals.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder="0x... multisig address"
            className="flex-1"
          />
          <button onClick={handleManualSubmit} className="btn btn-primary">
            Browse
          </button>
        </div>
        {error && <p className="text-[var(--red)] text-sm mt-2">{error}</p>}
      </div>

      {/* User's Multisigs Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Your Multisig Wallets</h2>
          <button
            onClick={() => navigate("/onboarding")}
            className="btn btn-primary"
          >
            + Create New Wallet
          </button>
        </div>

        {!address ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-secondary)] mb-4">
              Connect your wallet to see your multisig wallets
            </p>
          </div>
        ) : isLoading ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-secondary)]">Loading your wallets...</p>
          </div>
        ) : walletList.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-secondary)] mb-4">
              You haven't created any multisig wallets yet
            </p>
            <button
              onClick={() => navigate("/onboarding")}
              className="btn btn-primary"
            >
              Create Your First Wallet
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {walletList.map((wallet, index) => (
              <MultisigCard
                key={index}
                wallet={wallet}
                index={index}
                onSelect={() => handleSelectMultisig(wallet)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
        <FeatureCard
          title="Policy Enforcement"
          description="Define granular policies with risk weights, allowlists, denylists, and spending limits"
        />
        <FeatureCard
          title="Audit Trail"
          description="Complete audit log of all policy evaluations and transaction checks"
        />
        <FeatureCard
          title="Governance"
          description="Multi-signature governance for policy changes and wallet administration"
        />
      </div>
    </div>
  );
}

function MultisigCard({
  wallet,
  index,
  onSelect,
}: {
  wallet: MultisigDeployment;
  index: number;
  onSelect: () => void;
}) {
  return (
    <div className="card hover:border-[var(--accent)] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">Wallet #{index + 1}</h3>
          <div className="space-y-1 text-sm">
            <p className="text-[var(--text-secondary)]">
              <span className="font-medium">Wallet:</span>{" "}
              <span className="font-mono">{shortAddress(wallet.wallet)}</span>
            </p>
            <p className="text-[var(--text-secondary)]">
              <span className="font-medium">Governance:</span>{" "}
              <span className="font-mono">{shortAddress(wallet.governance)}</span>
            </p>
          </div>
        </div>
        <button onClick={onSelect} className="btn btn-primary">
          Select
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-[var(--text-secondary)]">Policies</p>
          <p className="text-sm font-medium">View</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-secondary)]">Audit Log</p>
          <p className="text-sm font-medium">View</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-secondary)]">Proposals</p>
          <p className="text-sm font-medium">View</p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}
