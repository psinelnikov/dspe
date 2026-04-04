import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import { FLARE_COSTON2_CHAIN, CONTRACTS, shortAddress, validateAddress } from "../lib/constants";
import { WALLET_FACTORY_ABI, MULTISIG_WALLET_ABI } from "../lib/abi";
import { useMultisig, type MultisigDeployment } from "../context/MultisigContext";
import { CopyableAddress } from "../components/CopyableAddress";
import type { Address } from "viem";

// Helper function to fetch logs with pagination for RPC providers with block range limits
async function fetchWalletCreatedLogs(publicClient: any, contractAddress: string, maxBlocks: number = 1000): Promise<any[]> {
  const allLogs: any[] = [];
  const latestBlock = await publicClient.getBlockNumber();
  const CHUNK_SIZE = 30; // RPC limit
  
  // Search backwards through blocks in chunks with delays
  for (let start = 0; start < maxBlocks; start += CHUNK_SIZE) {
    const toBlock = latestBlock - BigInt(start);
    const fromBlock = toBlock - BigInt(CHUNK_SIZE - 1);
    
    if (fromBlock < 0n) break;
    
    try {
      const logs = await publicClient.getLogs({
        address: contractAddress as `0x${string}`,
        event: {
          type: "event",
          name: "WalletCreated",
          inputs: [
            { indexed: true, name: "creator", type: "address" },
            { indexed: true, name: "wallet", type: "address" },
            { indexed: true, name: "governance", type: "address" },
            { indexed: false, name: "policyRegistry", type: "address" },
            { indexed: false, name: "auditLog", type: "address" },
            { indexed: false, name: "signers", type: "address[]" },
          ],
        },
        fromBlock: fromBlock < 0n ? 0n : fromBlock,
        toBlock,
      });
      
      allLogs.push(...logs);
      
      // Add delay to avoid rate limiting (100ms between requests)
      if (start + CHUNK_SIZE < maxBlocks) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.error(`Failed to fetch logs for blocks ${fromBlock} to ${toBlock}:`, err);
      // Continue to next chunk
    }
  }
  
  return allLogs;
}

export default function HomePage() {
  const { address } = useAccount();
  const navigate = useNavigate();
  const publicClient = usePublicClient();
  const { selectMultisig } = useMultisig();
  const [manualAddress, setManualAddress] = useState("");
  const [error, setError] = useState("");
  const [signerWallets, setSignerWallets] = useState<MultisigDeployment[]>([]);
  const [isLoadingSignerWallets, setIsLoadingSignerWallets] = useState(false);

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

  const handleManualSubmit = async () => {
    setError("");
    if (!validateAddress(manualAddress)) {
      setError("Please enter a valid Ethereum address (0x...)");
      return;
    }

    if (!publicClient) {
      setError("Wallet not connected");
      return;
    }

    if (!CONTRACTS.walletFactory) {
      setError("Wallet factory address not configured. Check your environment variables.");
      return;
    }

    try {
      console.log("Looking up multisig for address:", manualAddress);
      console.log("Wallet factory:", CONTRACTS.walletFactory);

      // Fetch logs with pagination (search last 300 blocks = ~10 requests)
      const logs = await fetchWalletCreatedLogs(publicClient, CONTRACTS.walletFactory, 300);

      console.log("Found", logs.length, "WalletCreated events");

      // Search for the entered address in wallet, governance, or other fields
      const enteredAddress = manualAddress.toLowerCase();
      let foundDeployment: MultisigDeployment | null = null;

      for (const log of logs) {
        const wallet = (log.args.wallet as Address).toLowerCase();
        const governance = (log.args.governance as Address).toLowerCase();
        const policyRegistry = (log.args.policyRegistry as Address).toLowerCase();
        const auditLog = (log.args.auditLog as Address).toLowerCase();

        // Check if entered address matches any component of this deployment
        if (wallet === enteredAddress || 
            governance === enteredAddress || 
            policyRegistry === enteredAddress || 
            auditLog === enteredAddress) {
          foundDeployment = {
            wallet: log.args.wallet as Address,
            governance: log.args.governance as Address,
            policyRegistry: log.args.policyRegistry as Address,
            auditLog: log.args.auditLog as Address,
          };
          console.log("Found deployment:", foundDeployment);
          break;
        }
      }

      if (!foundDeployment) {
        // Fallback: try to verify if entered address is a MultisigWallet contract
        // by reading its txCount (should work if it's a valid wallet)
        try {
          const txCount = await publicClient.readContract({
            address: manualAddress as `0x${string}`,
            abi: MULTISIG_WALLET_ABI,
            functionName: "txCount",
          });
          
          // If we can read txCount, it's likely a valid MultisigWallet
          // We'll create a partial deployment with just the wallet address
          // Other pages will need to handle missing governance/policyRegistry gracefully
          console.log("Verified MultisigWallet at", manualAddress, "with txCount:", txCount);
          foundDeployment = {
            wallet: manualAddress as `0x${string}`,
            governance: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            policyRegistry: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            auditLog: "0x0000000000000000000000000000000000000000" as `0x${string}`,
          };
        } catch (verifyErr) {
          console.log("Address is not a valid MultisigWallet:", verifyErr);
        }
      }

      if (!foundDeployment) {
        setError("Multisig not found. Please enter a valid multisig wallet, governance, or related contract address.");
        return;
      }

      selectMultisig(foundDeployment);
      navigate("/policies");
    } catch (err) {
      console.error("Failed to lookup multisig:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to lookup multisig: ${errorMsg.slice(0, 100)}`);
    }
  };

  // Fetch wallets where user is a signer
  useEffect(() => {
    if (!address || !publicClient) return;
    
    const fetchSignerWallets = async () => {
      setIsLoadingSignerWallets(true);
      try {
        // Fetch logs with pagination (search last 300 blocks)
        const logs = await fetchWalletCreatedLogs(publicClient, CONTRACTS.walletFactory, 300);
        
        const uniqueWallets = new Map<string, MultisigDeployment>();
        
        for (const log of logs) {
          const wallet = log.args.wallet as Address;
          const governance = log.args.governance as Address;
          const policyRegistry = log.args.policyRegistry as Address;
          const auditLog = log.args.auditLog as Address;
          const signers = log.args.signers as Address[];
          
          // Skip if already added
          if (uniqueWallets.has(wallet.toLowerCase())) continue;
          
          // Check if connected address is in the signers array
          if (signers.some(s => s.toLowerCase() === address.toLowerCase())) {
            uniqueWallets.set(wallet.toLowerCase(), {
              wallet,
              governance,
              policyRegistry,
              auditLog,
            });
          }
        }
        
        setSignerWallets(Array.from(uniqueWallets.values()));
      } catch (err) {
        console.error("Failed to fetch signer wallets:", err);
      } finally {
        setIsLoadingSignerWallets(false);
      }
    };
    
    fetchSignerWallets();
  }, [address, publicClient]);

  // Merge creator wallets and signer wallets (avoiding duplicates)
  const creatorWalletList = (creatorWallets as MultisigDeployment[] | undefined) || [];
  const allWallets = [...creatorWalletList];
  
  // Add signer wallets that aren't already in the creator list
  for (const signerWallet of signerWallets) {
    const exists = allWallets.some(w => 
      w.wallet.toLowerCase() === signerWallet.wallet.toLowerCase()
    );
    if (!exists) {
      allWallets.push(signerWallet);
    }
  }

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
          Enter a multisig wallet address to browse its policies, audit log, and proposals.
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
        ) : allWallets.length === 0 ? (
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
            {allWallets.map((wallet, index) => (
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
              <span className="font-medium">Address:</span>{" "}
              <CopyableAddress address={wallet.wallet} />
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
