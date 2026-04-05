import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseEther, formatEther, encodeFunctionData, parseUnits, type Address, keccak256, hexToBytes, bytesToHex, encodePacked, toBytes, stringToHex } from "viem";
import { useMultisig } from "../context/MultisigContext";
import { POLICY_REGISTRY_ABI } from "../lib/abi";
import { FLARE_COSTON2_CHAIN } from "../lib/constants";
import { MULTISIG_WALLET_ABI, ERC20_ABI, INSTRUCTION_SENDER_ABI } from "../lib/abi";
import { CONTRACTS, shortAddress, riskColor, riskLabel, decodeCheckResults } from "../lib/constants";
import { CopyableAddress } from "../components/CopyableAddress";
import { useSearchParams, Link } from "react-router-dom";
import { 
  encryptEvaluateRequest, 
  fetchTeePublicKey, 
  pollForEvaluationResult, 
  decodeEvaluationResult,
  type EvaluateRequest 
} from "../lib/encryption";

const TEST_SCENARIOS = [
  {
    id: 0,
    name: "Low Value Transfer",
    description: "Test auto-approve policy for transfers under $1,000",
    value: "0.0001",
    expectedRiskScore: 15,
    policyId: 0,
    expectedRequiredSigners: 1,
    tokenValue: "500",
  },
  {
    id: 1,
    name: "High-Value Transfer",
    description: "Test policy for transfers over 1000 USDC requiring 2 signers",
    value: "0.001",
    expectedRiskScore: 45,
    policyId: 1,
    expectedRequiredSigners: 2,
    tokenValue: "1500",
  },
  {
    id: 2,
    name: "Very High Value Transfer",
    description: "Test admin-level policy for very large transfers >$50K",
    value: "0.01",
    expectedRiskScore: 85,
    policyId: 2,
    expectedRequiredSigners: 3,
    tokenValue: "100000",
  },
  {
    id: 3,
    name: "DeFi Interaction",
    description: "Test whitelisted DeFi protocol policy",
    value: "0.0005",
    expectedRiskScore: 35,
    policyId: 3,
    expectedRequiredSigners: 2,
    tokenValue: "5000",
  },
];

// TEE Proxy URL - configurable via env
const TEE_PROXY_URL = import.meta.env.VITE_TEE_PROXY_URL || "/tee";

export default function TestTransactionsPage() {
  const { address } = useAccount();
  const { selectedMultisig, hasSelection } = useMultisig();
  const publicClient = usePublicClient();
  const [searchParams] = useSearchParams();
  const txIdFromUrl = searchParams.get("tx");
  
  const [activeTab, setActiveTab] = useState<"scenarios" | "erc20" | "mint" | "custom" | "tee">("scenarios");
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);
  
  // ERC20 specific state
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [erc20Target, setErc20Target] = useState("");
  const [erc20Amount, setErc20Amount] = useState("");
  
  // Custom transaction state
  const [customTarget, setCustomTarget] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customData, setCustomData] = useState("0x");
  
  // TEE Evaluation state
  const [teeStatus, setTeeStatus] = useState<"idle" | "fetching_key" | "encrypting" | "sending" | "polling" | "attesting" | "complete" | "error">("idle");
  const [teeError, setTeeError] = useState<string | null>(null);
  const [teePublicKey, setTeePublicKey] = useState<`0x${string}` | null>(null);
  const [instructionId, setInstructionId] = useState<`0x${string}` | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<{
    decision: {
      matchedPolicyId: bigint;
      policyName: string;
      riskScore: number;
      requiredSigners: number;
      totalSigners: number;
      signers: Address[];
      checkResults: number;
      policiesEvaluated: number;
      nonce: bigint;
    };
    receipt: {
      evaluationId: `0x${string}`;
      policyId: bigint;
      policyName: string;
      riskScore: number;
      checkResults: number;
      requiredSigners: number;
      totalSigners: number;
      timestamp: bigint;
    };
  } | null>(null);
  
  // Transaction state
  const [txNonce, setTxNonce] = useState(Date.now().toString());
  const [submittedTxId, setSubmittedTxId] = useState<string | null>(txIdFromUrl);
  const [txDetails, setTxDetails] = useState<{
    target: string;
    value: string;
    data: string;
    evaluated: boolean;
    executed: boolean;
    requiredSigners: number;
    approvalCount: number;
    riskScore: number;
  } | null>(null);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  
  const { writeContract: writeEvaluationAttested, data: evalHash, isPending: isEvalPending } = useWriteContract();
  const { isLoading: isEvalConfirming, isSuccess: isEvalConfirmed } = useWaitForTransactionReceipt({ hash: evalHash });

  const { writeContract: writeMockEvaluation, data: mockEvalHash, isPending: isMockEvalPending } = useWriteContract();
  const { isLoading: isMockEvalConfirming, isSuccess: isMockEvalConfirmed } = useWaitForTransactionReceipt({ hash: mockEvalHash });

  // Fetch token balance - defined at component level for reuse
  const fetchBalance = useCallback(async () => {
    if (!selectedMultisig || !publicClient) return;
    try {
      const result = await publicClient.readContract({
        address: CONTRACTS.testToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [selectedMultisig.wallet],
      });
      // Ensure result is bigint before formatting
      const balanceBigInt = typeof result === 'bigint' ? result : BigInt(result as string);
      
      // Token has 18 decimals - use formatEther
      const formatted = formatEther(balanceBigInt);
      setTokenBalance(formatted);
    } catch (err) {
      console.error("Failed to fetch token balance:", err);
      setTokenBalance("0");
    }
  }, [selectedMultisig, publicClient]);

  // Fetch token balance on mount
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Parse transaction receipt and refresh balance when confirmed
  useEffect(() => {
    if (!isConfirmed || !hash || !publicClient || !selectedMultisig) return;
    
    const parseReceipt = async () => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        
        // Refresh token balance after any transaction
        fetchBalance();
        
        // For now, just use the transaction count - 1 as the ID
        const count = await publicClient.readContract({
          address: selectedMultisig.wallet,
          abi: MULTISIG_WALLET_ABI,
          functionName: "txCount",
        });
        const actualTxId = (count - 1n).toString();
        setSubmittedTxId(actualTxId);
      } catch (err) {
        console.error("Failed to parse transaction receipt:", err);
      }
    };
    
    parseReceipt();
  }, [isConfirmed, hash, publicClient, selectedMultisig, fetchBalance]);

  // Poll for balance updates when on mint or erc20 tabs
  useEffect(() => {
    if (!selectedMultisig || !publicClient) return;
    if (activeTab !== "mint" && activeTab !== "erc20") return;
    
    // Initial fetch with delay to ensure connection is ready
    setTimeout(() => {
      console.log("Initial balance fetch on tab change");
      fetchBalance();
    }, 100);
    
    // Poll every 3 seconds
    const interval = setInterval(() => {
      console.log("Polling balance update...");
      fetchBalance();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [activeTab, selectedMultisig, publicClient, fetchBalance]);

  // Fetch TEE public key on mount
  useEffect(() => {
    const fetchKey = async () => {
      try {
        const key = await fetchTeePublicKey(TEE_PROXY_URL);
        setTeePublicKey(key);
      } catch (err) {
        console.error("Failed to fetch TEE public key:", err);
        setTeeError("Failed to fetch TEE public key. Make sure the TEE proxy is running.");
      }
    };
    
    fetchKey();
  }, []);

  // Poll for evaluation result when instruction ID is set
  useEffect(() => {
    if (!instructionId || teeStatus !== "polling") return;
    
    const poll = async () => {
      try {
        const result = await pollForEvaluationResult(TEE_PROXY_URL, instructionId, 30, 2000);
        
        if (result && result.data) {
          const decoded = decodeEvaluationResult(result.data as `0x${string}`);
          setEvaluationResult(decoded);
          setTeeStatus("attesting");
          
          // Automatically submit the attested evaluation
          if (submittedTxId) {
            writeEvaluationAttested({
              address: selectedMultisig!.wallet,
              abi: MULTISIG_WALLET_ABI,
              functionName: "submitEvaluationAttested",
              args: [BigInt(submittedTxId), instructionId],
            });
          }
        }
      } catch (err) {
        console.error("Polling failed:", err);
        setTeeError(`Failed to get evaluation result: ${err}`);
        setTeeStatus("error");
      }
    };
    
    poll();
  }, [instructionId, teeStatus, submittedTxId, selectedMultisig, writeEvaluationAttested]);

  // Handle TEE sendEvaluate transaction completion
  useEffect(() => {
    if (!isConfirmed || !hash || teeStatus !== "sending" || !publicClient) return;
    
    const handleTeeSendComplete = async () => {
      try {
        // Get the transaction details to extract the encrypted message
        const tx = await publicClient.getTransaction({ hash });
        
        if (!tx) {
          setTeeError("Failed to get transaction details");
          setTeeStatus("error");
          return;
        }
        
        // Extract the encrypted message from the transaction input data
        // The data format is: function selector (4 bytes) + encoded arguments
        const txData = tx.input;
        // sendEvaluate(bytes) function selector is 0x + first 4 bytes
        // The argument is offset (32 bytes) + length (32 bytes) + data
        
        // Extract encrypted message from the transaction input
        // skip 4 bytes (selector) + 32 bytes (offset) = 36 bytes = 72 hex chars + 0x = 74
        const offsetHex = txData.slice(10, 74);
        const offset = parseInt(offsetHex, 16);
        // length is at position 36 + offset
        const lengthPos = 36 + offset * 2; // *2 because hex
        const lengthHex = txData.slice(lengthPos, lengthPos + 64);
        const length = parseInt(lengthHex, 16);
        // data starts after length
        const dataStart = lengthPos + 64;
        const encryptedMessage = txData.slice(dataStart, dataStart + length * 2) as `0x${string}`;
        
        // Get the transaction receipt to extract the instructionId from event logs
        const receipt = await publicClient.getTransactionReceipt({ hash });
        
        console.log("Transaction receipt:", {
          blockNumber: receipt.blockNumber.toString(),
          logs: receipt.logs.length,
        });
        
        // Extract instructionId from TeeInstructionsSent event
        // Event signature: TeeInstructionsSent(bytes32 indexed instructionId, address indexed sender, bytes32 indexed opType, uint256 timestamp)
        // Topics: [eventSig, instructionId, sender, opType]
        let instructionId: `0x${string}` | null = null;
        
        if (receipt.logs.length > 0) {
          console.log("Parsing receipt logs...");
          
          for (const log of receipt.logs) {
            console.log("  Log:", {
              address: log.address,
              topics: log.topics,
              data: log.data.slice(0, 100),
            });
            
            // TeeInstructionsSent event has 4 topics: event signature + 3 indexed params
            if (log.topics.length >= 3) {
              // instructionId is topics[1] (first indexed param after event signature)
              instructionId = log.topics[1] as `0x${string}`;
              console.log("  Found instructionId in log:", instructionId);
              break;
            }
          }
        }
        
        if (!instructionId) {
          // Fallback: try to compute it for backwards compatibility with old mock
          console.warn("No TeeInstructionsSent event found, falling back to computation");
          
          // Get the block to get the timestamp used in the transaction
          const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
          const timestamp = block.timestamp;
          
          // Compute instructionId: keccak256(abi.encodePacked(opType, opCommand, message, timestamp))
          const opTypeBytes32 = stringToHex("EVALUATE_RISK", { size: 32 });
          const opCommandBytes32 = stringToHex("", { size: 32 });
          
          // encodePacked matches Solidity's abi.encodePacked
          const packed = encodePacked(
            ['bytes32', 'bytes32', 'bytes', 'uint256'],
            [opTypeBytes32, opCommandBytes32, encryptedMessage, timestamp]
          );
          
          // Compute keccak256
          instructionId = keccak256(packed);
          
          console.log("  Computed instructionId (fallback):", instructionId);
        }
        
        console.log("  Using instructionId:", instructionId);
        console.log("  Querying TEE proxy for result...");
        
        // Before setting the ID and polling, let's try to fetch the result once to see if it exists
        const testResponse = await fetch(`${TEE_PROXY_URL}/action/result/${instructionId}`);
        console.log("  Test fetch result:", testResponse.status, testResponse.status === 200 ? "Found!" : "Not found");
        
        if (testResponse.status === 404) {
          // TEE result not found
          console.warn("TEE evaluation not found at proxy");
          setTeeError(
            "TEE evaluation unavailable: Result not found at proxy. " +
            "Please use the 'Mock Evaluation (Skip TEE)' button below instead."
          );
          setTeeStatus("error");
          return;
        }
        
        setInstructionId(instructionId);
        setTeeStatus("polling");
      } catch (err) {
        console.error("Failed to process TEE send completion:", err);
        setTeeError(`Failed to process TEE response: ${err}`);
        setTeeStatus("error");
      }
    };
    
    handleTeeSendComplete();
  }, [isConfirmed, hash, teeStatus, publicClient]);

  const handleSubmitScenario = async (scenario: typeof TEST_SCENARIOS[0]) => {
    if (!selectedMultisig || !address || !teePublicKey) return;
    
    const nonce = BigInt(Date.now());
    const txId = nonce.toString();
    setTxNonce(txId);
    setSelectedScenario(scenario.id);
    setTeeError(null);
    
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [address, parseUnits(scenario.tokenValue, 18)],
    });
    
    // Step 1: Submit transaction to MultisigWallet
    setSubmittedTxId(txId);
    
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "submitTransaction",
      args: [CONTRACTS.testToken, transferData, nonce],
      value: 0n,
    });
  };

  // Start TEE evaluation after transaction is confirmed
  const startTeeEvaluation = async () => {
    if (!selectedMultisig || !address || !teePublicKey || !submittedTxId) return;
    
    setTeeStatus("encrypting");
    setTeeError(null);
    
    try {
      // Get transaction details
      const txResult = await publicClient!.readContract({
        address: selectedMultisig.wallet,
        abi: MULTISIG_WALLET_ABI,
        functionName: "getTransaction",
        args: [BigInt(submittedTxId)],
      });
      
      const target = txResult[0] as Address;
      const calldata = txResult[1] as `0x${string}`;
      const value = txResult[2] as bigint;
      const nonce = txResult[3] as bigint;
      
      // Create EvaluateRequest
      const request: EvaluateRequest = {
        target,
        calldata,
        value,
        sender: address,
        nonce,
      };
      
      // Encrypt the request
      const encryptedMessage = encryptEvaluateRequest(teePublicKey, request);
      
      setTeeStatus("sending");
      
      // Send to InstructionSender
      writeContract({
        address: CONTRACTS.instructionSender,
        abi: INSTRUCTION_SENDER_ABI,
        functionName: "sendEvaluate",
        args: [encryptedMessage],
        value: 2000n, // TEE fee
      });
    } catch (err) {
      console.error("TEE evaluation failed:", err);
      setTeeError(`TEE evaluation failed: ${err}`);
      setTeeStatus("error");
    }
  };

  const handleSubmitErc20 = () => {
    if (!selectedMultisig || !erc20Target || !erc20Amount) return;
    
    const nonce = BigInt(Date.now());
    setTxNonce(nonce.toString());
    
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [erc20Target as `0x${string}`, parseUnits(erc20Amount, 18)],
    });
    
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "submitTransaction",
      args: [CONTRACTS.testToken, transferData, nonce],
      value: 0n,
    });
  };

  const handleMintToMultisig = () => {
    if (!selectedMultisig) return;
    
    writeContract({
      address: CONTRACTS.testToken,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [selectedMultisig.wallet, 100000n],
    });
  };

  const handleSubmitCustom = () => {
    if (!selectedMultisig || !customTarget || !customValue) return;
    
    const nonce = BigInt(Date.now());
    setTxNonce(nonce.toString());
    
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "submitTransaction",
      args: [customTarget as `0x${string}`, customData as `0x${string}`, nonce],
      value: parseEther(customValue),
    });
  };

  const handleApproveTx = async () => {
    if (!selectedMultisig || !submittedTxId) return;
    
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "approveTx",
      args: [BigInt(submittedTxId)],
    });
  };

  const handleExecuteTx = async () => {
    if (!selectedMultisig || !submittedTxId) return;
    
    writeContract({
      address: selectedMultisig.wallet,
      abi: MULTISIG_WALLET_ABI,
      functionName: "executeTx",
      args: [BigInt(submittedTxId)],
    });
  };

  const handleMockEvaluation = async () => {
    if (!selectedMultisig || !submittedTxId || !address || !publicClient) return;
    
    // Use selected scenario or default to scenario 0 (Low Risk)
    const scenario = TEST_SCENARIOS[selectedScenario ?? 0];
    
    // Fetch the policy to get the actual signers
    try {
      const policy = await publicClient.readContract({
        address: selectedMultisig.policyRegistry,
        abi: POLICY_REGISTRY_ABI,
        functionName: "getPolicy",
        args: [BigInt(scenario.policyId)],
      });
      
      // Use the policy's signers instead of just the connected address
      const policySigners = policy.signers as Address[];
      
      // Generate synthetic check results bitmap (all checks pass for simplicity)
      const checkResults = 0b1111111111; // All 10 checks pass
      
      console.log("Using policy signers for mock evaluation:", policySigners);
      
      writeMockEvaluation({
        address: selectedMultisig.wallet,
        abi: MULTISIG_WALLET_ABI,
        functionName: "submitEvaluation",
        args: [
          BigInt(submittedTxId),
          scenario.expectedRiskScore,
          checkResults,
          BigInt(scenario.policyId),
          scenario.expectedRequiredSigners,
          policySigners,
        ],
      });
    } catch (err) {
      console.error("Failed to fetch policy signers:", err);
      // Fallback to just the connected address if policy fetch fails
      const checkResults = 0b1111111111;
      writeMockEvaluation({
        address: selectedMultisig.wallet,
        abi: MULTISIG_WALLET_ABI,
        functionName: "submitEvaluation",
        args: [
          BigInt(submittedTxId),
          scenario.expectedRiskScore,
          checkResults,
          BigInt(scenario.policyId),
          scenario.expectedRequiredSigners,
          [address],
        ],
      });
    }
  };

  const fetchTxDetails = useCallback(async (txId: string) => {
    if (!selectedMultisig || !publicClient) return;
    
    try {
      const result = await publicClient.readContract({
        address: selectedMultisig.wallet,
        abi: MULTISIG_WALLET_ABI,
        functionName: "getTransaction",
        args: [BigInt(txId)],
      });
      
      // Fetch approval count
      const approvalCount = await publicClient.readContract({
        address: selectedMultisig.wallet,
        abi: MULTISIG_WALLET_ABI,
        functionName: "approvalCount",
        args: [BigInt(txId)],
      });
      
      setTxDetails({
        target: result[0],
        value: formatEther(result[2]),
        data: result[1],
        evaluated: result[5],
        executed: result[4],
        requiredSigners: Number(result[6]),
        approvalCount: Number(approvalCount),
        riskScore: Number(result[7]),
      });
    } catch (err) {
      console.error("Failed to fetch tx details:", err);
    }
  }, [selectedMultisig, publicClient]);

  // Auto-switch to TEE tab and fetch details when coming from Pending page with tx ID
  useEffect(() => {
    if (txIdFromUrl && selectedMultisig && publicClient) {
      setActiveTab("tee");
      fetchTxDetails(txIdFromUrl);
    }
  }, [txIdFromUrl, selectedMultisig, publicClient]);

  if (!hasSelection) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">No Multisig Selected</h2>
        <p className="text-[var(--text-secondary)] mb-6">
          Please select a multisig wallet to test transactions
        </p>
        <Link to="/" className="btn btn-primary">
          Go to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Test Transactions</h1>
        <Link
          to="/pending"
          className="px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-md hover:bg-[var(--border)] text-sm"
        >
          View Pending →
        </Link>
      </div>
      <p className="text-[var(--text-secondary)] mb-2">
        Testing wallet: <CopyableAddress address={selectedMultisig!.wallet} />
      </p>
      <div className="flex items-center gap-4 mb-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md px-3 py-1.5 flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">USDC Balance: </span>
          <span className="text-sm font-mono font-medium">{tokenBalance} USDC</span>
          <button 
            onClick={fetchBalance}
            className="text-xs text-[var(--accent)] hover:text-[var(--text-primary)] ml-2"
            title="Refresh balance"
          >
            ↻
          </button>
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          Token: <CopyableAddress address={CONTRACTS.testToken} />
        </div>
        {teePublicKey && (
          <div className="bg-[var(--green)] bg-opacity-10 border border-[var(--green)] rounded-md px-3 py-1.5">
            <span className="text-xs text-black">TEE Connected</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setActiveTab("scenarios")}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === "scenarios"
              ? "bg-[var(--accent)] text-black"
              : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--border)]"
          }`}
        >
          Test Scenarios
        </button>
        <button
          onClick={() => setActiveTab("tee")}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === "tee"
              ? "bg-[var(--accent)] text-black"
              : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--border)]"
          }`}
        >
          TEE Evaluation
        </button>
        <button
          onClick={() => setActiveTab("erc20")}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === "erc20"
              ? "bg-[var(--accent)] text-black"
              : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--border)]"
          }`}
        >
          ERC20 Transfer
        </button>
        <button
          onClick={() => setActiveTab("mint")}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === "mint"
              ? "bg-[var(--accent)] text-black"
              : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--border)]"
          }`}
        >
          Mint Tokens
        </button>
        <button
          onClick={() => setActiveTab("custom")}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === "custom"
              ? "bg-[var(--accent)] text-black"
              : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--border)]"
          }`}
        >
          Custom Transaction
        </button>
      </div>

      {activeTab === "scenarios" && (
        <div className="space-y-4">
          {TEST_SCENARIOS.map((scenario) => (
            <div
              key={scenario.id}
              className={`bg-[var(--bg-card)] border rounded-lg p-5 transition-all ${
                selectedScenario === scenario.id
                  ? "border-[var(--accent)]"
                  : "border-[var(--border)] hover:border-[var(--text-secondary)]"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{scenario.name}</h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {scenario.description}
                  </p>
                </div>
                <div
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${riskColor(scenario.expectedRiskScore)}20`,
                    color: riskColor(scenario.expectedRiskScore),
                  }}
                >
                  {riskLabel(scenario.expectedRiskScore)} Risk
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                <div className="bg-[var(--bg-secondary)] rounded-md p-3">
                  <div className="text-[var(--text-secondary)] mb-1">Value</div>
                  <div className="font-mono">
                    {`${Number(scenario.tokenValue).toLocaleString()} USDC`}
                  </div>
                </div>
                <div className="bg-[var(--bg-secondary)] rounded-md p-3">
                  <div className="text-[var(--text-secondary)] mb-1">Expected Policy</div>
                  <div className="font-mono">ID {scenario.policyId}</div>
                </div>
                <div className="bg-[var(--bg-secondary)] rounded-md p-3">
                  <div className="text-[var(--text-secondary)] mb-1">Expected Signers</div>
                  <div className="font-mono">{scenario.expectedRequiredSigners}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSubmitScenario(scenario)}
                  disabled={isPending || isConfirming || !teePublicKey}
                  className="flex-1 px-4 py-2 bg-[var(--accent)] text-black rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Submitting..." : isConfirming ? "Confirming..." : "Submit Transaction"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "tee" && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">TEE Policy Evaluation</h3>
            
            {teeError && (
              <div className="bg-[var(--red)] bg-opacity-10 border border-[var(--red)] rounded-md p-4 mb-4">
                <p className="text-[var(--red)] text-sm">{teeError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="bg-[var(--bg-secondary)] rounded-md p-4">
                <h4 className="font-medium mb-2">Step 1: Submit Transaction</h4>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  First, submit a transaction using the Test Scenarios or Custom Transaction tabs.
                </p>
                {submittedTxId ? (
                  <div className="bg-[var(--green)] bg-opacity-10 border border-[var(--green)] rounded-md p-3">
                    <p className="text-sm text-black">
                      Transaction submitted: ID {submittedTxId}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No transaction submitted yet. Go to Test Scenarios tab first.
                  </p>
                )}
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-md p-4">
                <h4 className="font-medium mb-2">Step 2: TEE Evaluation</h4>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  The TEE will evaluate the transaction against active policies and determine the required signers.
                </p>
                
                {!teePublicKey && (
                  <p className="text-sm text-[var(--red)] mb-2">
                    TEE not connected. Make sure the TEE proxy is running at {TEE_PROXY_URL}
                  </p>
                )}

                <button
                  onClick={startTeeEvaluation}
                  disabled={!submittedTxId || !teePublicKey || teeStatus !== "idle" || isPending}
                  className="w-full px-4 py-2 bg-[var(--accent)] text-black rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!teePublicKey 
                    ? "TEE Not Connected" 
                    : !submittedTxId 
                      ? "Submit Transaction First"
                      : teeStatus === "idle"
                        ? "Start TEE Evaluation"
                        : teeStatus === "encrypting"
                          ? "Encrypting..."
                          : teeStatus === "sending"
                            ? "Sending to TEE..."
                            : teeStatus === "polling"
                              ? "Waiting for TEE..."
                              : teeStatus === "attesting"
                                ? "Submitting Attestation..."
                                : teeStatus === "complete"
                                  ? "Evaluation Complete"
                                  : "Error - Try Again"
                  }
                </button>

                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--text-secondary)] mb-2">
                    TEE not working? Use mock evaluation to bypass:
                  </p>
                  <button
                    onClick={handleMockEvaluation}
                    disabled={!submittedTxId || isMockEvalPending}
                    className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--orange)] text-[var(--orange)] rounded-md hover:bg-[var(--orange)] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isMockEvalPending 
                      ? "Submitting Mock Eval..." 
                      : isMockEvalConfirming 
                        ? "Confirming..." 
                        : "Mock Evaluation (Skip TEE)"}
                  </button>
                  {isMockEvalConfirmed && (
                    <p className="text-xs text-[var(--green)] mt-2">
                      Mock evaluation submitted! Transaction is now evaluated and ready for approval.
                    </p>
                  )}
                </div>
              </div>

              {evaluationResult && (
                <div className="bg-[var(--bg-secondary)] rounded-md p-4">
                  <h4 className="font-medium mb-3">Evaluation Result</h4>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-[var(--bg-card)] rounded-md p-3">
                      <div className="text-xs text-[var(--text-secondary)] mb-1">Risk Score</div>
                      <div 
                        className="font-mono text-lg font-medium"
                        style={{ color: riskColor(evaluationResult.decision.riskScore) }}
                      >
                        {evaluationResult.decision.riskScore}/100
                      </div>
                    </div>
                    <div className="bg-[var(--bg-card)] rounded-md p-3">
                      <div className="text-xs text-[var(--text-secondary)] mb-1">Required Signers</div>
                      <div className="font-mono text-lg font-medium">
                        {evaluationResult.decision.requiredSigners} of {evaluationResult.decision.totalSigners}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-card)] rounded-md p-3 mb-3">
                    <div className="text-xs text-[var(--text-secondary)] mb-1">Matched Policy</div>
                    <div className="font-mono text-sm">
                      ID {evaluationResult.decision.matchedPolicyId.toString()}: {evaluationResult.decision.policyName}
                    </div>
                  </div>

                  <div className="bg-[var(--bg-card)] rounded-md p-3">
                    <div className="text-xs text-[var(--text-secondary)] mb-2">Check Results</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {decodeCheckResults(evaluationResult.decision.checkResults).map((check) => (
                        <div 
                          key={check.bit}
                          className={`flex items-center gap-1 ${check.pass ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}
                        >
                          <span>{check.pass ? '✓' : '✗'}</span>
                          <span>{check.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "erc20" && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">ERC20 Token Transfer (USDC)</h3>
          
          <div className="space-y-4">
            <div className="bg-[var(--bg-secondary)] rounded-md p-3 mb-4">
              <div className="text-xs text-[var(--text-secondary)] mb-1">Wallet USDC Balance</div>
              <div className="font-mono text-lg">{tokenBalance} USDC</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Recipient Address</label>
              <input
                type="text"
                value={erc20Target}
                onChange={(e) => setErc20Target(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)] font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount (USDC)</label>
              <input
                type="text"
                value={erc20Amount}
                onChange={(e) => setErc20Amount(e.target.value)}
                placeholder="10000"
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)]"
              />
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Enter amount in USDC (18 decimals). Large amounts trigger high-value policies.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {["1000", "10000", "100000", "1000000"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setErc20Amount(amount)}
                  className="px-3 py-2 bg-[var(--bg-secondary)] text-sm rounded-md hover:bg-[var(--border)] transition-colors"
                >
                  {Number(amount).toLocaleString()}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmitErc20}
              disabled={isPending || isConfirming || !erc20Target || !erc20Amount}
              className="w-full px-4 py-2 bg-[var(--accent)] text-black rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Submitting..." : isConfirming ? "Confirming..." : "Submit ERC20 Transfer"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "mint" && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">Mint USDC to Multisig</h3>
          
          <div className="space-y-4">
            <div className="bg-[var(--bg-secondary)] rounded-md p-3 mb-4">
              <div className="text-xs text-[var(--text-secondary)] mb-1">Current Wallet USDC Balance</div>
              <div className="font-mono text-lg">{tokenBalance} USDC</div>
            </div>

            <button
              onClick={handleMintToMultisig}
              disabled={isPending || isConfirming}
              className="w-full px-4 py-2 bg-[var(--accent)] text-black rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Minting..." : isConfirming ? "Confirming..." : "Mint 100,000 USDC"}
            </button>

            <p className="text-xs text-[var(--text-secondary)] text-center">
              Note: Only the token owner (deployer) can mint new tokens
            </p>
          </div>
        </div>
      )}

      {activeTab === "custom" && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">Custom Transaction</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Target Address</label>
              <input
                type="text"
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)] font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Value (C2FLR)</label>
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="0.001"
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Calldata (hex)</label>
              <input
                type="text"
                value={customData}
                onChange={(e) => setCustomData(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)] font-mono"
              />
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Leave as 0x for simple transfers
              </p>
            </div>

            <button
              onClick={handleSubmitCustom}
              disabled={isPending || isConfirming || !customTarget || !customValue}
              className="w-full px-4 py-2 bg-[var(--accent)] text-black rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Submitting..." : isConfirming ? "Confirming..." : "Submit Custom Transaction"}
            </button>
          </div>
        </div>
      )}

      {hash && (
        <div className="mt-6 bg-[var(--bg-card)] border border-[var(--green)] rounded-lg p-4">
          <h4 className="font-medium text-[var(--green)] mb-2">Transaction Submitted!</h4>
          <div className="text-sm text-[var(--text-secondary)] break-all">{hash}</div>
          {isConfirmed && (
            <p className="text-sm text-[var(--green)] mt-2">Confirmed on-chain</p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-6 bg-[var(--bg-card)] border border-[var(--red)] rounded-lg p-4">
          <h4 className="font-medium text-[var(--red)] mb-2">Error</h4>
          <div className="text-sm text-[var(--text-secondary)]">{error.message}</div>
        </div>
      )}
    </div>
  );
}
