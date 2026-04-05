import { encrypt } from "eciesjs";
import { encodeAbiParameters, decodeAbiParameters, parseAbiParameters, type Address, hexToBytes, bytesToHex } from "viem";

export interface EvaluateRequest {
  target: Address;
  calldata: `0x${string}`;
  value: bigint;
  sender: Address;
  nonce: bigint;
}

/**
 * ABI-encode the EvaluateRequest for encryption
 */
export function encodeEvaluateRequest(request: EvaluateRequest): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters("address target, bytes calldata, uint256 value, address sender, uint256 nonce"),
    [request.target, request.calldata, request.value, request.sender, request.nonce]
  );
}

/**
 * Encrypt an EvaluateRequest using ECIES with the TEE's public key
 * @param teePublicKey - The TEE's secp256k1 public key (uncompressed hex string starting with 0x04)
 * @param request - The EvaluateRequest to encrypt
 * @returns The encrypted bytes as a hex string
 */
export function encryptEvaluateRequest(
  teePublicKey: `0x${string}`,
  request: EvaluateRequest
): `0x${string}` {
  const encoded = encodeEvaluateRequest(request);
  const encodedBytes = hexToBytes(encoded);
  
  // Create PublicKey from hex - eciesjs expects the key without the 0x04 prefix
  const pubKeyHex = teePublicKey.startsWith("0x04") 
    ? teePublicKey.slice(4) 
    : teePublicKey.slice(2);
  
  const encrypted = encrypt(pubKeyHex, encodedBytes);
  
  return bytesToHex(encrypted);
}

/**
 * Fetch the TEE public key from the proxy
 * @param proxyUrl - The TEE proxy URL (e.g., http://localhost:6676)
 * @returns The TEE public key as an uncompressed hex string (0x04 + x + y)
 */
export async function fetchTeePublicKey(proxyUrl: string): Promise<`0x${string}`> {
  const response = await fetch(`${proxyUrl}/info`);
  if (!response.ok) {
    throw new Error(`Failed to fetch TEE info: ${response.status}`);
  }
  
  const info = await response.json();
  const pubKey = info.teeInfo?.publicKey;
  
  if (!pubKey || !pubKey.x || !pubKey.y) {
    throw new Error("No publicKey in TEE info response");
  }
  
  // Combine x and y coordinates into uncompressed format: 0x04 + x + y
  const x = pubKey.x.replace(/^0x/, "");
  const y = pubKey.y.replace(/^0x/, "");
  return `0x04${x}${y}` as `0x${string}`;
}

/**
 * Poll for TEE evaluation result
 * @param proxyUrl - The TEE proxy URL
 * @param instructionId - The instruction ID returned from sendEvaluate
 * @param maxAttempts - Maximum number of polling attempts (default: 30)
 * @param intervalMs - Polling interval in milliseconds (default: 2000)
 * @returns The evaluation result
 */
export async function pollForEvaluationResult(
  proxyUrl: string,
  instructionId: `0x${string}`,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${proxyUrl}/action/result/${instructionId}`);
    
    if (response.ok) {
      const result = await response.json();
      // Check if result is ready (not pending)
      if (result && result.data) {
        return result;
      }
    }
    
    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Evaluation result not available after ${maxAttempts} attempts`);
}

/**
 * Decode PolicyDecision and AuditReceipt from the evaluation result
 */
export function decodeEvaluationResult(data: `0x${string}`): {
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
} {
  const decisionParams = parseAbiParameters(
    "tuple(uint256 matchedPolicyId, string policyName, uint8 riskScore, uint8 requiredSigners, uint8 totalSigners, address[] signers, uint16 checkResults, uint8 policiesEvaluated, uint256 nonce) decision, " +
    "tuple(bytes32 evaluationId, uint256 policyId, string policyName, uint8 riskScore, uint16 checkResults, uint8 requiredSigners, uint8 totalSigners, uint256 timestamp) receipt"
  );

  const decoded = decodeAbiParameters(decisionParams, data);

  const decisionData = decoded[0] as any;
  const receiptData = decoded[1] as any;

  return {
    decision: {
      matchedPolicyId: decisionData.matchedPolicyId,
      policyName: decisionData.policyName,
      riskScore: Number(decisionData.riskScore),
      requiredSigners: Number(decisionData.requiredSigners),
      totalSigners: Number(decisionData.totalSigners),
      signers: decisionData.signers as Address[],
      checkResults: Number(decisionData.checkResults),
      policiesEvaluated: Number(decisionData.policiesEvaluated),
      nonce: decisionData.nonce,
    },
    receipt: {
      evaluationId: receiptData.evaluationId,
      policyId: receiptData.policyId,
      policyName: receiptData.policyName,
      riskScore: Number(receiptData.riskScore),
      checkResults: Number(receiptData.checkResults),
      requiredSigners: Number(receiptData.requiredSigners),
      totalSigners: Number(receiptData.totalSigners),
      timestamp: receiptData.timestamp,
    },
  };
}
