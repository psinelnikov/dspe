---
name: multisig-policy-engine
description: Build a Flare TEE extension for dynamic multisig management with on-chain policy governance, off-chain transaction simulation, oracle price feeds, ERC-7730 clear signing registry checks, and a public audit trail. Follow every step in order.
---

# Multisig policy engine — TEE extension implementation guide

## Goal

Build a system where:

1. **An organization defines policies on-chain** through a unanimous multisig. Policies set conditions like value limits, allow/deny lists, and contract verification requirements. Anyone can read the policies.

2. **A TEE evaluates transactions privately** by simulating them off-chain. The TEE decrypts the proposal inside the enclave, runs it through every active policy's checks — using oracle price feeds for value conversion, the ERC-7730 clear signing registry for contract recognition, block explorer APIs for verification status, and allow/deny lists from the policy itself — then scores the risk and determines how many signers are needed.

3. **Every evaluation produces an audit record** that proves the organization followed its own policies without revealing the sensitive transaction details. The audit record contains the policy that matched, the score, which checks passed or failed, and the signer threshold — but never the target address, calldata, or value.

### Scoring spectrum (concrete examples)

**Lowest risk (score ~5–15, 1-of-N signers):**
A low-value transfer to a verified contract that is on the organization's allowlist and has a descriptor in the ERC-7730 clear signing registry. The contract has been deployed for months, the transaction value is well within daily limits, and the function selector matches a known safe operation.

**Highest risk (score ~85–100, N-of-N signers):**
A high-value transaction to an unverified contract on the denylist with no ERC-7730 descriptor. The contract was deployed recently, the value exceeds per-transaction limits, and the function selector is unknown or calls a proxy pattern with delegatecall.

### Privacy model

**During evaluation (private):** The encrypted proposal is visible on-chain as opaque bytes. Nobody can read the target, calldata, or value. The TEE decrypts inside the enclave, scores, and returns a `PolicyDecision` + `AuditReceipt` through the proxy. The result written back on-chain contains only the policyId, riskScore, checkResults bitmap, signer threshold, and signers — no transaction inputs.

**During execution (public):** When the multisig wallet ultimately executes the transaction, the target, calldata, and value become visible on-chain as part of the execution calldata. This is inherent to EVM execution and expected. The masking protects the evaluation window — preventing front-running and information leakage during scoring.

---

## Prerequisites

- [ ] `FCE-extension-scaffold` repo cloned (Go, Python, or TypeScript)
- [ ] Docker and Docker Compose installed
- [ ] Foundry (`forge`, `cast`) installed
- [ ] Funded Coston2 wallet (C2FLR for gas + TEE fees) — use the [Coston2 faucet](https://faucet.flare.network/coston2)
- [ ] `cloudflared` or `ngrok` for tunneling
- [ ] Language-specific:
  - Go: Go >= 1.23
  - Python: Python >= 3.10, pip
  - TypeScript: Node.js >= 18, npm

### Required dependencies (install in your extension project)

| Language | Dependencies |
|----------|-------------|
| Go | `go-ethereum/accounts/abi`, `go-ethereum/crypto/ecies`, `go-ethereum/ethclient`, `net/http` |
| Python | `eth_abi`, `eciespy`, `web3`, `requests` |
| TypeScript | `viem`, `eciesjs`, `ethers` or `web3` |

These are in addition to whatever the scaffold's `base/` already provides (`hexToBytes`, `bytesToHex`, `keccak256`). The agent must install them before writing handler code.

---

## Architecture overview

```
ON-CHAIN (public, readable by everyone)
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  PolicyRegistry.sol                                          │
│    Stores policies with: allow/deny lists, per-tx and daily  │
│    USD limits, contract verification & ERC-7730 requirements,│
│    custom signer set per policy.                             │
│    Read: public. Write: GovernanceMultisig only.             │
│                                                              │
│  GovernanceMultisig.sol                                      │
│    ALL signers must approve to add/remove/update policies.   │
│                                                              │
│  AuditLog.sol                                                │
│    Append-only log of evaluation receipts.                   │
│    Each entry: policyId, riskScore, checkResults bitmap,     │
│    signerThreshold, timestamp. No sensitive data.            │
│                                                              │
│  MultisigWallet.sol                                          │
│    Executes transactions. Requires TEE-attested audit receipt│
│    with sufficient signer approvals before execution.        │
│                                                              │
│  InstructionSender.sol                                       │
│    Entry point for encrypted evaluation requests to the TEE. │
│                                                              │
└──────────────────────────────────────────────────────────────┘

TEE (private simulation, attested output)
┌──────────────────────────────────────────────────────────────┐
│  Docker container: extension-tee + ext-proxy + redis         │
│  Flare Confidential Environment (Intel TDX)                  │
│                                                              │
│  1. ext-proxy watches chain for instructions                 │
│  2. Forwards POST /action to extension-tee                   │
│  3. Extension decrypts proposal via POST /decrypt            │
│  4. Fetches policies from PolicyRegistry via RPC             │
│  5. Runs simulation checks (oracle, ERC-7730, etc.)          │
│  6. Selects highest-risk matching policy                     │
│  7. Returns PolicyDecision + AuditReceipt in ActionResult    │
│  8. ext-proxy writes attested result back on-chain           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### How the result gets back on-chain

The TEE extension returns the `PolicyDecision` and `AuditReceipt` as ABI-encoded bytes in `ActionResult.Data`. The ext-proxy (TEE node infrastructure) handles writing this result back on-chain — the extension does NOT submit transactions itself. The caller polls the proxy for the result using the instruction ID returned by `sendInstructions`. The `MultisigWallet` contract reads this result, verifies the TEE attestation, and enforces the signer threshold before executing.

---

## Step 1: Define OPType constants and version

Create `app/config.{ext}`:

```
VERSION = "0.1.0"

OP_TYPE_EVALUATE   = "EVALUATE_RISK"
OP_COMMAND_DEFAULT = ""

// Contract addresses — set in .env after deployment
POLICY_REGISTRY_ADDR = env("POLICY_REGISTRY_ADDR")
AUDIT_LOG_ADDR       = env("AUDIT_LOG_ADDR")

// Flare RPC
FLARE_RPC_URL        = env("FLARE_RPC_URL")
// Default: https://coston2-api.flare.network/ext/C/rpc

// FTSO v2 — resolved via FlareContractRegistry
// FlareContractRegistry address is the same on ALL Flare networks:
FLARE_CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
// FLR/USD feed ID (bytes21):
FLR_USD_FEED_ID = "0x01464c522f55534400000000000000000000000000"

// Block explorer API for contract verification
EXPLORER_API_URL = env("EXPLORER_API_URL")
// Coston2: https://coston2-explorer.flare.network/api
// Mainnet: https://flare-explorer.flare.network/api

// ERC-7730 registry
ERC7730_REGISTRY_BASE = "https://raw.githubusercontent.com/LedgerHQ/clear-signing-erc7730-registry/master/registry"
```

### Verification checkpoint

- [ ] `OP_TYPE_EVALUATE` is UPPER_SNAKE_CASE, <= 32 bytes UTF-8
- [ ] `FLARE_CONTRACT_REGISTRY` is `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
- [ ] `FLR_USD_FEED_ID` is `0x01464c522f55534400000000000000000000000000`
- [ ] All external URLs use HTTPS

---

## Step 2: Define types

Create `app/types.{ext}`.

### 2a. Policy (on-chain, public)

```
Policy:
    id:               uint256
    name:             string
    active:           bool
    conditions:       Conditions
    limits:           Limits
    signers:          address[]      — signer set specific to THIS policy
    riskWeight:       uint8          — base amplifier (1–10)
    createdAt:        uint256
    updatedAt:        uint256

Conditions:
    targetAddresses:  address[]      — match if target in list (empty = any)
    functionSelectors: bytes4[]      — match if selector in list (empty = any)
    minValue:         uint256        — match if value >= this (0 = any)
    maxValue:         uint256        — match if value <= this (0 = no cap)
    timeWindowStart:  uint256        — match if timestamp >= this (0 = any)
    timeWindowEnd:    uint256        — match if timestamp <= this (0 = any)
    requireVerified:  bool           — if true, unverified contracts score higher risk
    requireErc7730:   bool           — if true, missing ERC-7730 descriptor scores higher risk

Limits:
    maxValuePerTxUsd:  uint256       — max single-tx value in USD (0 = no limit)
    maxValueDailyUsd:  uint256       — max cumulative daily value in USD for THIS policy (0 = no limit)
    allowlist:         address[]     — if non-empty, target MUST be in this list
    denylist:          address[]     — if non-empty, target MUST NOT be in this list
```

### 2b. EvaluateRequest (encrypted, decrypted only inside TEE)

```
EvaluateRequest:
    target:     address
    calldata:   bytes
    value:      uint256       — in native token (FLR/C2FLR) wei
    sender:     address
    nonce:      uint256
```

ABI layout: `abi.encode(address, bytes, uint256, address, uint256)`

### 2c. CheckResults (bitmap)

Each check produces a pass/fail boolean packed into a uint16. Bit = 1 means pass, bit = 0 means fail. If a check could not be executed (external API timeout), the bit is set to 1 (pass) and the check is excluded from scoring — see fail-open policy in Step 4d.

```
bit 0:  allowlistPass
bit 1:  denylistPass
bit 2:  verifiedPass
bit 3:  erc7730Pass
bit 4:  perTxLimitPass
bit 5:  dailyLimitPass
bit 6:  bytecodePass
bit 7:  contractAgePass
bit 8:  txVolumePass
bit 9:  calldataPass
```

### 2d. PolicyDecision (TEE output — public, no sensitive data)

```
PolicyDecision:
    matchedPolicyId:    uint256
    policyName:         string
    riskScore:          uint8       — 0–100
    requiredSigners:    uint8
    totalSigners:       uint8
    signers:            address[]
    checkResults:       uint16      — bitmap
    policiesEvaluated:  uint8
    nonce:              uint256
```

ABI layout: `abi.encode(uint256, string, uint8, uint8, uint8, address[], uint16, uint8, uint256)`

**NOTE: target, calldata, and value are NEVER included.**

### 2e. AuditReceipt (returned alongside PolicyDecision in ActionResult.Data)

```
AuditReceipt:
    evaluationId:       bytes32     — keccak256(abi.encode(nonce, policyId, timestamp))
    policyId:           uint256
    policyName:         string
    riskScore:          uint8
    checkResults:       uint16
    requiredSigners:    uint8
    totalSigners:       uint8
    timestamp:          uint256
```

The TEE node's attestation signature covers the entire `ActionResult` — it does not need a separate `teeAttestation` field. The on-chain verification uses the TEE registry's built-in attestation verification.

### 2f. StateReport (GET /state)

```
StateReport:
    evaluationsProcessed:   uint64
    lastMatchedPolicyId:    uint256
    lastRiskScore:          uint8
    registryAddress:        string
    auditLogAddress:        string
    policyDailyVolumes:     map<uint256, uint256>   — policyId → USD volume today
```

### Verification checkpoint

- [ ] `PolicyDecision` and `AuditReceipt` contain NO target, calldata, or value
- [ ] `Limits.maxValueDailyUsd` is per-policy, not global
- [ ] `CheckResults` bitmap uses 1 = pass, 0 = fail

---

## Step 3: On-chain contracts

Five contracts. Deploy in the order listed.

### 3a. GovernanceMultisig.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GovernanceMultisig {
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        address target;
        bytes data;
        string description;
        uint256 approvalCount;
        bool executed;
        uint256 createdAt;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    modifier onlySigner() {
        require(isSigner[msg.sender], "Not a signer");
        _;
    }

    constructor(address[] memory _signers) {
        require(_signers.length > 0, "Need signers");
        for (uint256 i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "Zero address");
            require(!isSigner[_signers[i]], "Duplicate signer");
            signers.push(_signers[i]);
            isSigner[_signers[i]] = true;
        }
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }

    function getProposal(uint256 _id) external view returns (Proposal memory) {
        return proposals[_id];
    }

    function propose(
        address _target,
        bytes calldata _data,
        string calldata _description
    ) external onlySigner returns (uint256) {
        uint256 id = proposalCount++;
        Proposal storage p = proposals[id];
        p.id = id;
        p.target = _target;
        p.data = _data;
        p.description = _description;
        p.approvalCount = 1;
        p.createdAt = block.number;
        hasApproved[id][msg.sender] = true;
        return id;
    }

    function approve(uint256 _proposalId) external onlySigner {
        Proposal storage p = proposals[_proposalId];
        require(!p.executed, "Already executed");
        require(!hasApproved[_proposalId][msg.sender], "Already approved");
        hasApproved[_proposalId][msg.sender] = true;
        p.approvalCount++;
    }

    function execute(uint256 _proposalId) external onlySigner {
        Proposal storage p = proposals[_proposalId];
        require(!p.executed, "Already executed");
        require(p.approvalCount == signers.length, "Not all signers approved");
        p.executed = true;
        (bool success, ) = p.target.call(p.data);
        require(success, "Execution failed");
    }
}
```

### 3b. PolicyRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PolicyRegistry {
    address public governanceMultisig;

    struct Conditions {
        address[] targetAddresses;
        bytes4[] functionSelectors;
        uint256 minValue;
        uint256 maxValue;
        uint256 timeWindowStart;
        uint256 timeWindowEnd;
        bool requireVerified;
        bool requireErc7730;
    }

    struct Limits {
        uint256 maxValuePerTxUsd;
        uint256 maxValueDailyUsd;
        address[] allowlist;
        address[] denylist;
    }

    struct Policy {
        uint256 id;
        string name;
        bool active;
        Conditions conditions;
        Limits limits;
        address[] signers;
        uint8 riskWeight;
        uint256 createdAt;
        uint256 updatedAt;
    }

    Policy[] public policies;
    uint256 public nextPolicyId;

    modifier onlyGovernance() {
        require(msg.sender == governanceMultisig, "Only governance multisig");
        _;
    }

    constructor(address _governanceMultisig) {
        governanceMultisig = _governanceMultisig;
    }

    // --- PUBLIC READ (anyone can inspect) ---

    function getPolicyCount() external view returns (uint256) {
        return policies.length;
    }

    function getPolicy(uint256 _index) external view returns (Policy memory) {
        return policies[_index];
    }

    function getActivePolicies() external view returns (Policy[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].active) count++;
        }
        Policy[] memory active = new Policy[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].active) {
                active[j++] = policies[i];
            }
        }
        return active;
    }

    function getPolicySigners(uint256 _policyId) external view returns (address[] memory) {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) return policies[i].signers;
        }
        revert("Policy not found");
    }

    function getPolicyLimits(uint256 _policyId) external view returns (Limits memory) {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) return policies[i].limits;
        }
        revert("Policy not found");
    }

    // --- GOVERNANCE-ONLY WRITES ---

    function addPolicy(
        string calldata _name,
        Conditions calldata _conditions,
        Limits calldata _limits,
        address[] calldata _signers,
        uint8 _riskWeight
    ) external onlyGovernance returns (uint256) {
        require(_signers.length > 0, "Must have signers");
        require(_riskWeight >= 1 && _riskWeight <= 10, "Weight 1-10");

        uint256 id = nextPolicyId++;
        policies.push();
        Policy storage p = policies[policies.length - 1];
        p.id = id;
        p.name = _name;
        p.active = true;
        p.conditions = _conditions;
        p.limits = _limits;
        p.signers = _signers;
        p.riskWeight = _riskWeight;
        p.createdAt = block.number;
        p.updatedAt = block.number;
        return id;
    }

    function updatePolicy(
        uint256 _policyId,
        string calldata _name,
        Conditions calldata _conditions,
        Limits calldata _limits,
        address[] calldata _signers,
        uint8 _riskWeight
    ) external onlyGovernance {
        require(_signers.length > 0, "Must have signers");
        require(_riskWeight >= 1 && _riskWeight <= 10, "Weight 1-10");
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].name = _name;
                policies[i].conditions = _conditions;
                policies[i].limits = _limits;
                policies[i].signers = _signers;
                policies[i].riskWeight = _riskWeight;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }

    function deactivatePolicy(uint256 _policyId) external onlyGovernance {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].active = false;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }

    function reactivatePolicy(uint256 _policyId) external onlyGovernance {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].active = true;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }
}
```

### 3c. AuditLog.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AuditLog {
    struct AuditEntry {
        bytes32 evaluationId;
        uint256 policyId;
        string policyName;
        uint8 riskScore;
        uint16 checkResults;
        uint8 requiredSigners;
        uint8 totalSigners;
        uint256 timestamp;
    }

    AuditEntry[] public entries;

    // Anyone can post — the MultisigWallet verifies the TEE attestation
    // before calling this, so only attested results make it in.
    function postEntry(AuditEntry calldata _entry) external {
        entries.push(_entry);
    }

    function getEntryCount() external view returns (uint256) {
        return entries.length;
    }

    function getEntry(uint256 _index) external view returns (AuditEntry memory) {
        return entries[_index];
    }

    function getEntriesByPolicy(uint256 _policyId) external view returns (AuditEntry[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].policyId == _policyId) count++;
        }
        AuditEntry[] memory result = new AuditEntry[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].policyId == _policyId) {
                result[j++] = entries[i];
            }
        }
        return result;
    }
}
```

### 3d. MultisigWallet.sol

This contract enforces that every transaction execution is backed by a TEE-attested risk evaluation with sufficient signer approvals.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuditLog.sol";

contract MultisigWallet {
    AuditLog public auditLog;

    struct Transaction {
        address target;
        bytes data;
        uint256 value;
        uint256 nonce;
        bool executed;
        // TEE evaluation result (set after evaluation)
        uint8 requiredSigners;
        address[] requiredSignerSet;
        uint8 riskScore;
        uint16 checkResults;
        uint256 matchedPolicyId;
        bool evaluated;
    }

    uint256 public txCount;
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => uint256) public approvalCount;

    constructor(address _auditLog) {
        auditLog = AuditLog(_auditLog);
    }

    /// @notice Submit a TEE evaluation result for a pending transaction.
    /// @dev In production, verify the TEE attestation signature here.
    ///      For MVP, the caller provides the decoded PolicyDecision fields.
    function submitEvaluation(
        uint256 _txId,
        uint256 _matchedPolicyId,
        uint8 _riskScore,
        uint8 _requiredSigners,
        address[] calldata _signers,
        uint16 _checkResults
    ) external {
        Transaction storage t = transactions[_txId];
        require(!t.evaluated, "Already evaluated");
        require(!t.executed, "Already executed");

        t.evaluated = true;
        t.requiredSigners = _requiredSigners;
        t.requiredSignerSet = _signers;
        t.riskScore = _riskScore;
        t.checkResults = _checkResults;
        t.matchedPolicyId = _matchedPolicyId;

        // Post audit entry
        auditLog.postEntry(AuditLog.AuditEntry({
            evaluationId: keccak256(abi.encode(t.nonce, _matchedPolicyId, block.timestamp)),
            policyId: _matchedPolicyId,
            policyName: "",  // Could be passed in; omitted for gas savings
            riskScore: _riskScore,
            checkResults: _checkResults,
            requiredSigners: _requiredSigners,
            totalSigners: uint8(_signers.length),
            timestamp: block.timestamp
        }));
    }

    /// @notice Approve a transaction. Only addresses in the TEE-determined signer set can approve.
    function approveTx(uint256 _txId) external {
        Transaction storage t = transactions[_txId];
        require(t.evaluated, "Not yet evaluated by TEE");
        require(!t.executed, "Already executed");
        require(!hasApproved[_txId][msg.sender], "Already approved");

        // Verify caller is in the required signer set
        bool isSigner = false;
        for (uint256 i = 0; i < t.requiredSignerSet.length; i++) {
            if (t.requiredSignerSet[i] == msg.sender) {
                isSigner = true;
                break;
            }
        }
        require(isSigner, "Not in required signer set for this transaction");

        hasApproved[_txId][msg.sender] = true;
        approvalCount[_txId]++;
    }

    /// @notice Execute a transaction once enough signers have approved.
    function executeTx(uint256 _txId) external {
        Transaction storage t = transactions[_txId];
        require(t.evaluated, "Not yet evaluated by TEE");
        require(!t.executed, "Already executed");
        require(approvalCount[_txId] >= t.requiredSigners, "Insufficient approvals");

        t.executed = true;
        (bool success, ) = t.target.call{value: t.value}(t.data);
        require(success, "Execution failed");
    }

    receive() external payable {}
}
```

### 3e. InstructionSender.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interface/ITeeExtensionRegistry.sol";
import "./interface/ITeeMachineRegistry.sol";

contract InstructionSender {
    ITeeExtensionRegistry public immutable teeExtensionRegistry;
    ITeeMachineRegistry public immutable teeMachineRegistry;
    uint256 public _extensionId;

    bytes32 constant OP_TYPE_EVALUATE = bytes32("EVALUATE_RISK");
    bytes32 constant OP_COMMAND_DEFAULT = bytes32("");

    constructor(address _registry, address _machineRegistry) {
        teeExtensionRegistry = ITeeExtensionRegistry(_registry);
        teeMachineRegistry = ITeeMachineRegistry(_machineRegistry);
    }

    /// @notice Set the extension ID by scanning the registry.
    /// Call once after the extension is registered. Idempotent.
    function setExtensionId() external {
        // The registry tracks which extensions are associated with which
        // InstructionSender contracts. This scans to find our ID.
        // Implementation: call teeExtensionRegistry to enumerate extensions
        // and find the one whose instructionSender == address(this).
        // For MVP, accept it as a parameter:
    }

    /// @notice Alternative: set extension ID directly (MVP convenience)
    function setExtensionIdManual(uint256 _id) external {
        require(_extensionId == 0, "Already set");
        _extensionId = _id;
    }

    function sendEvaluate(bytes calldata _encryptedMessage) external payable returns (bytes32) {
        require(_extensionId != 0, "Extension ID not set");

        address[] memory teeIds = teeMachineRegistry.getRandomTeeIds(_extensionId, 1);

        ITeeExtensionRegistry.TeeInstructionParams memory params;
        params.opType = OP_TYPE_EVALUATE;
        params.opCommand = OP_COMMAND_DEFAULT;
        params.message = _encryptedMessage;  // Do NOT wrap with abi.encode()

        return teeExtensionRegistry.sendInstructions{value: msg.value}(teeIds, params);
    }
}
```

### Contract deployment order

```bash
# 1. GovernanceMultisig
forge create GovernanceMultisig --constructor-args "[SIGNER1,SIGNER2,SIGNER3]" ...

# 2. PolicyRegistry (passing GovernanceMultisig address)
forge create PolicyRegistry --constructor-args $GOVERNANCE_MULTISIG ...

# 3. AuditLog (no constructor args — open posting, MultisigWallet verifies before calling)
forge create AuditLog ...

# 4. MultisigWallet (passing AuditLog address)
forge create MultisigWallet --constructor-args $AUDIT_LOG ...

# 5. InstructionSender (using scaffold deploy tool)
cd go/tools && go run ./cmd/deploy-contract
```

### Verification checkpoint

- [ ] `GovernanceMultisig.execute` requires `approvalCount == signers.length` (unanimous)
- [ ] `PolicyRegistry` write functions all have `onlyGovernance`
- [ ] `PolicyRegistry` read functions are public (no modifier)
- [ ] `MultisigWallet.executeTx` checks `approvalCount >= requiredSigners`
- [ ] `MultisigWallet.submitEvaluation` posts to AuditLog
- [ ] `InstructionSender.sendEvaluate` passes `_encryptedMessage` directly (no wrapping)
- [ ] All contracts compile: `forge build`

---

## Step 4: TEE extension — simulation engine

### 4a. Mutable state

```
State:
    evaluationsProcessed:   uint64
    lastMatchedPolicyId:    uint256
    lastRiskScore:          uint8
    processedNonces:        set<uint256>
    policyDailyVolumes:     map<uint256, DailyVolume>   — per-policy tracking

DailyVolume:
    date:       string       — "YYYY-MM-DD" UTC
    totalUsd:   uint256
```

Daily volume is tracked **per policy**. Each policy's `maxValueDailyUsd` limit only counts transactions that matched that specific policy. This prevents a high-volume trading policy from consuming a treasury policy's daily allowance.

### 4b. Registration

```
register(framework):
    framework.setState(State{})
    framework.handle("EVALUATE_RISK", "", handleEvaluate)
```

### 4c. State reporting

```
reportState(state) -> StateReport:
    return StateReport{
        evaluationsProcessed: state.evaluationsProcessed,
        lastMatchedPolicyId:  state.lastMatchedPolicyId,
        lastRiskScore:        state.lastRiskScore,
        registryAddress:      POLICY_REGISTRY_ADDR,
        auditLogAddress:      AUDIT_LOG_ADDR,
        policyDailyVolumes:   {k: v.totalUsd for k, v in state.policyDailyVolumes}
    }
```

### 4d. Error handling for external checks (FAIL-OPEN policy)

When an external API call fails (timeout, HTTP error, rate limit), the TEE uses a **fail-open** strategy:

- The bitmap bit for that check is set to **1** (pass).
- The check's sub-score is **excluded** from the weighted composite (its weight is redistributed proportionally among successful checks).
- The check IS still recorded — the agent should log which checks were skipped internally for debugging.

This prevents external service outages from causing false-positive lockouts. If the ERC-7730 GitHub API is down, the system doesn't force maximum risk on every transaction.

```
runCheck(checkFn, defaultBit) -> (passed, score, executed):
    try:
        (passed, score) = checkFn()
        return (passed, score, true)
    catch (timeout, httpError, rateLimit):
        return (defaultBit, 0, false)   // fail-open: treated as pass, excluded from score
```

### 4e. Handler: handleEvaluate

```
handleEvaluate(state, msg) -> (data, status, err):

    // ── PHASE 1: Decrypt ──
    rawBytes = hexDecode(msg)
    decrypted = httpPost("http://localhost:{SIGN_PORT}/decrypt", {
        encryptedMessage: base64Encode(rawBytes)
    })
    plaintext = base64Decode(decrypted.decryptedMessage)
    request = abiDecode(plaintext, EvaluateRequest)

    // ── PHASE 2: Validate ──
    if request.target == address(0):
        return (null, 0, "target address is zero")
    if request.nonce in state.processedNonces:
        return (null, 0, "nonce already processed")

    // ── PHASE 3: Fetch policies ──
    activePolicies = rpcCall(POLICY_REGISTRY_ADDR, "getActivePolicies()")
    if len(activePolicies) == 0:
        return (null, 0, "no active policies")

    // ── PHASE 4: Convert value to USD via FTSO ──
    nativeUsdPrice = fetchFtsoPrice()
    txValueUsd = (request.value * nativeUsdPrice) / 1e18

    // ── PHASE 5: Run simulation against each matching policy ──
    highestScore = 0
    selectedPolicy = null
    selectedChecks = 0
    countMatched = 0

    for policy in activePolicies:
        if not matchesConditions(request, policy.conditions):
            continue
        countMatched += 1

        // Roll daily volume for this policy
        pv = state.policyDailyVolumes.getOrDefault(policy.id, DailyVolume{today(), 0})
        if pv.date != today():
            pv = DailyVolume{date: today(), totalUsd: 0}

        checks = runSimulation(request, policy, txValueUsd, pv.totalUsd)
        score = computeScore(checks, policy.riskWeight)

        if score > highestScore:
            highestScore = score
            selectedPolicy = policy
            selectedChecks = checks.bitmap

    if selectedPolicy == null:
        return (null, 0, "no policies match this transaction")

    // ── PHASE 6: Map score → threshold ──
    totalSigners = len(selectedPolicy.signers)
    requiredSigners = mapScoreToThreshold(highestScore, totalSigners)
    selectedSigners = selectedPolicy.signers[0:requiredSigners]

    // ── PHASE 7: Update state ──
    state.evaluationsProcessed += 1
    state.lastMatchedPolicyId = selectedPolicy.id
    state.lastRiskScore = highestScore
    state.processedNonces.add(request.nonce)

    // Update per-policy daily volume
    pv = state.policyDailyVolumes.getOrDefault(selectedPolicy.id, DailyVolume{today(), 0})
    if pv.date != today():
        pv = DailyVolume{date: today(), totalUsd: 0}
    pv.totalUsd += txValueUsd
    state.policyDailyVolumes[selectedPolicy.id] = pv

    // ── PHASE 8: Build audit receipt ──
    receipt = AuditReceipt{
        evaluationId:   keccak256(abi.encode(request.nonce, selectedPolicy.id, now())),
        policyId:       selectedPolicy.id,
        policyName:     selectedPolicy.name,
        riskScore:      highestScore,
        checkResults:   selectedChecks,
        requiredSigners: requiredSigners,
        totalSigners:   totalSigners,
        timestamp:      now()
    }

    // ── PHASE 9: Return ──
    decision = PolicyDecision{
        matchedPolicyId:   selectedPolicy.id,
        policyName:        selectedPolicy.name,
        riskScore:         highestScore,
        requiredSigners:   requiredSigners,
        totalSigners:      totalSigners,
        signers:           selectedSigners,
        checkResults:      selectedChecks,
        policiesEvaluated: countMatched,
        nonce:             request.nonce
    }

    // Encode both decision and receipt together
    encoded = abiEncode(decision, receipt)
    return (bytesToHex(encoded), 1, null)
```

### 4f. Policy condition matching

```
matchesConditions(request, conditions) -> bool:
    c = conditions

    // Target address check (empty = match any)
    if len(c.targetAddresses) > 0:
        if request.target not in c.targetAddresses:
            return false

    // Function selector check (empty = match any)
    if len(c.functionSelectors) > 0:
        if len(request.calldata) < 4:
            return false
        selector = request.calldata[0:4]
        if selector not in c.functionSelectors:
            return false

    // Value range check
    if c.minValue > 0 and request.value < c.minValue:
        return false
    if c.maxValue > 0 and request.value > c.maxValue:
        return false

    // Time window check
    ts = getCurrentBlockTimestamp()
    if c.timeWindowStart > 0 and ts < c.timeWindowStart:
        return false
    if c.timeWindowEnd > 0 and ts > c.timeWindowEnd:
        return false

    return true
```

### 4g. Simulation checks

Create `app/simulation.{ext}`. Each check uses the fail-open wrapper from 4d.

```
runSimulation(request, policy, txValueUsd, policyDailyVolumeUsd) -> SimulationResult:

    result = SimulationResult{bitmap: 0, scores: [], weights: [], executed: []}

    // ── CHECK 0: Allowlist (weight 0.10) ──
    (pass, score, ok) = runCheck(() => {
        if len(policy.limits.allowlist) == 0:
            return (true, 0)
        return (request.target in policy.limits.allowlist,
                0 if request.target in policy.limits.allowlist else 80)
    }, true)
    result.add(0, pass, score, 0.10, ok)

    // ── CHECK 1: Denylist (weight 0.15) ──
    (pass, score, ok) = runCheck(() => {
        if len(policy.limits.denylist) == 0:
            return (true, 0)
        return (request.target not in policy.limits.denylist,
                100 if request.target in policy.limits.denylist else 0)
    }, true)
    result.add(1, pass, score, 0.15, ok)

    // ── CHECK 2: Contract verification (weight 0.12) ──
    (pass, score, ok) = runCheck(() => {
        verified = checkContractVerified(request.target)
        return (verified, 0 if verified else 75)
    }, true)  // fail-open: if explorer API is down, assume pass
    result.add(2, pass, score, 0.12, ok)

    // ── CHECK 3: ERC-7730 registry (weight 0.10) ──
    (pass, score, ok) = runCheck(() => {
        has7730 = checkErc7730Registry(request.target)
        return (has7730, 0 if has7730 else 60)
    }, true)  // fail-open: if GitHub API is down, assume pass
    result.add(3, pass, score, 0.10, ok)

    // ── CHECK 4: Per-tx value limit (weight 0.13) ──
    (pass, score, ok) = runCheck(() => {
        if policy.limits.maxValuePerTxUsd == 0:
            return (true, 10)
        if txValueUsd <= policy.limits.maxValuePerTxUsd:
            ratio = txValueUsd / policy.limits.maxValuePerTxUsd
            return (true, round(ratio * 50))
        return (false, 95)
    }, true)
    result.add(4, pass, score, 0.13, ok)

    // ── CHECK 5: Daily limit — PER POLICY (weight 0.10) ──
    (pass, score, ok) = runCheck(() => {
        if policy.limits.maxValueDailyUsd == 0:
            return (true, 10)
        projected = policyDailyVolumeUsd + txValueUsd
        if projected <= policy.limits.maxValueDailyUsd:
            ratio = projected / policy.limits.maxValueDailyUsd
            return (true, round(ratio * 50))
        return (false, 90)
    }, true)
    result.add(5, pass, score, 0.10, ok)

    // ── CHECK 6: Bytecode analysis (weight 0.10) ──
    (pass, score, ok) = runCheck(() => {
        bytecode = eth_getCode(request.target)
        return analyzeBytecode(bytecode)
    }, true)
    result.add(6, pass, score, 0.10, ok)

    // ── CHECK 7: Contract age (weight 0.07) ──
    (pass, score, ok) = runCheck(() => {
        ageInBlocks = getContractAge(request.target)
        isOld = ageInBlocks > 10000
        if ageInBlocks < 100:        return (isOld, 85)
        else if ageInBlocks < 10000: return (isOld, 50)
        else if ageInBlocks < 100000: return (isOld, 20)
        else:                         return (isOld, 5)
    }, true)
    result.add(7, pass, score, 0.07, ok)

    // ── CHECK 8: Transaction volume (weight 0.06) ──
    (pass, score, ok) = runCheck(() => {
        txCount = eth_getTransactionCount(request.target)
        has = txCount > 100
        if txCount < 10:    return (has, 70)
        else if txCount < 100:  return (has, 40)
        else if txCount < 1000: return (has, 15)
        else:                    return (has, 5)
    }, true)
    result.add(8, pass, score, 0.06, ok)

    // ── CHECK 9: Calldata complexity (weight 0.07) ──
    (pass, score, ok) = runCheck(() => {
        simple = len(request.calldata) <= 68
        if len(request.calldata) == 0:    return (true, 5)
        else if len(request.calldata) <= 68:  return (simple, 15)
        else if len(request.calldata) <= 260: return (false, 40)
        else:                                  return (false, 70)
    }, true)
    result.add(9, pass, score, 0.07, ok)

    return result
```

### 4h. Individual check implementations

**`app/checks/oracle.{ext}` — FTSO v2 price feed**

```
fetchFtsoPrice() -> uint256:
    // Step 1: Resolve FtsoV2 address via FlareContractRegistry
    // FlareContractRegistry is at 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019
    // on ALL Flare networks (Coston2, Flare mainnet, Songbird, Coston).

    ftsoV2Addr = rpcCall(
        "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
        "getContractAddressByName(string)",
        "FtsoV2"
    )

    // Step 2: Call getFeedByIdInWei for FLR/USD
    // Feed ID: 0x01464c522f55534400000000000000000000000000
    // Feed ID encoding: byte 0 = category (0x01 = crypto), bytes 1-20 = name padded
    //
    // getFeedByIdInWei returns (uint256 value, uint64 timestamp)
    // value is the price in wei (18 decimals) — e.g. 15000000000000000 = $0.015
    //
    // On Coston2 (testnet), use getTestFtsoV2() and TestFtsoV2Interface
    // which are view-only (no gas cost).

    // Coston2 (test):
    testFtsoV2Addr = rpcCall(
        "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
        "getContractAddressByName(string)",
        "TestFtsoV2"    // Use "FtsoV2" on mainnet
    )
    (priceWei, timestamp) = rpcCall(
        testFtsoV2Addr,
        "getFeedByIdInWei(bytes21)",
        FLR_USD_FEED_ID
    )

    // Validate staleness — reject if older than 60 seconds
    if now() - timestamp > 60:
        raise StalePriceError("FTSO price is stale")

    return priceWei  // 18 decimals, e.g. 15000000000000000 = $0.015
```

**`app/checks/verification.{ext}` — Block explorer API**

```
checkContractVerified(target) -> bool:
    // Coston2:  https://coston2-explorer.flare.network/api
    // Mainnet:  https://flare-explorer.flare.network/api
    url = EXPLORER_API_URL + "?module=contract&action=getabi&address=" + toHex(target)
    response = httpGet(url, timeout=5s)
    // response.status == "1" means ABI is available = contract is verified
    // response.status == "0" means not verified
    return response.json().status == "1"
```

**`app/checks/erc7730.{ext}` — Clear signing registry lookup**

```
checkErc7730Registry(target) -> bool:
    // The LedgerHQ/clear-signing-erc7730-registry stores ERC-7730 descriptors
    // as JSON files in registry/{entity}/*.json. Each file has:
    //   context.contract.deployments[].address
    //
    // Strategy for MVP: GitHub code search API
    // NOTE: Rate limited to 10 requests/minute unauthenticated.
    // For production: maintain a local index.

    targetLower = lowercase(toHex(target))  // addresses in the registry are lowercase
    url = "https://api.github.com/search/code?q=" + targetLower +
          "+repo:LedgerHQ/clear-signing-erc7730-registry+path:registry"
    response = httpGet(url, timeout=5s)
    return response.json().total_count > 0
```

**`app/checks/bytecode.{ext}` — Opcode scanning**

```
analyzeBytecode(bytecode) -> (pass, score):
    if bytecode == "0x" or bytecode == "" or len(bytecode) <= 2:
        return (false, 70)   // EOA or self-destructed contract

    bytes = hexDecode(bytecode)
    hasDelegateCall = false
    hasSelfDestruct = false

    // Scan bytecode for opcodes. IMPORTANT: skip PUSH data.
    // PUSH1 (0x60) through PUSH32 (0x7f) are followed by 1–32 bytes of data.
    // Opcodes appearing inside PUSH data are NOT real instructions.
    i = 0
    while i < len(bytes):
        op = bytes[i]
        if op >= 0x60 and op <= 0x7f:
            // PUSHn: skip n+1 bytes (opcode + n data bytes)
            i += (op - 0x60) + 2
            continue
        if op == 0xF4:   // DELEGATECALL
            hasDelegateCall = true
        if op == 0xFF:   // SELFDESTRUCT
            hasSelfDestruct = true
        i += 1

    if hasDelegateCall and hasSelfDestruct:
        return (false, 80)
    if hasDelegateCall:
        return (false, 65)   // proxy pattern — elevated risk
    if hasSelfDestruct:
        return (false, 70)
    if len(bytes) < 100:
        return (true, 30)    // very small contract
    return (true, 5)         // normal contract, no dangerous patterns
```

**`app/checks/contract_age.{ext}` — Deploy block via binary search**

```
getContractAge(target) -> uint64:
    // eth_getCode at a block tells us if the contract existed at that block.
    // Binary search between block 0 and current block to find deployment.
    currentBlock = eth_blockNumber()
    low = 0
    high = currentBlock

    // First check: does the contract exist NOW?
    code = eth_getCode(target, "latest")
    if code == "0x" or code == "":
        return 0   // not a contract (EOA)

    // Binary search for the first block where code exists
    while low < high:
        mid = (low + high) / 2
        code = eth_getCode(target, toHex(mid))
        if code == "0x" or code == "":
            low = mid + 1
        else:
            high = mid

    deployBlock = low
    return currentBlock - deployBlock
```

**NOTE:** This makes O(log N) RPC calls where N is the current block number. On Coston2 (~2M blocks), that's ~21 calls. Acceptable for MVP. For production, use the block explorer's contract creation API endpoint instead.

### 4i. Score computation

```
computeScore(checks, policyRiskWeight) -> uint8:
    // Only include checks that actually executed (fail-open: skipped checks excluded)
    totalWeight = 0.0
    weightedSum = 0.0
    for i in range(len(checks.scores)):
        if checks.executed[i]:
            weightedSum += checks.scores[i] * checks.weights[i]
            totalWeight += checks.weights[i]

    if totalWeight == 0:
        composite = 50   // no checks executed at all — moderate baseline
    else:
        composite = weightedSum / totalWeight  // normalize to redistribute weight

    // Apply policy risk weight (1–10)
    amplified = composite * (1.0 + (policyRiskWeight - 1) * 0.1)

    // Hard penalties: critical failures enforce score floors
    if not checks.getBit(1):   // denylist failed
        amplified = max(amplified, 90)
    if not checks.getBit(4):   // per-tx limit exceeded
        amplified = max(amplified, 80)

    return clamp(round(amplified), 0, 100)
```

### 4j. Signer threshold mapping

```
mapScoreToThreshold(score, totalSigners) -> uint8:
    if totalSigners == 1:
        return 1
    fraction = score / 100.0
    required = max(1, ceil(fraction * totalSigners))
    return min(required, totalSigners)
```

### Verification checkpoint

- [ ] FTSO uses `FlareContractRegistry` at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
- [ ] FTSO feed ID for FLR/USD is `0x01464c522f55534400000000000000000000000000`
- [ ] Bytecode scanner skips PUSH data (0x60–0x7f range)
- [ ] `getContractAge` uses binary search with `eth_getCode`
- [ ] Failed external checks are excluded from scoring (fail-open)
- [ ] Daily volume is tracked per-policy, not globally
- [ ] `computeScore` redistributes weight when checks are skipped

---

## Step 5: Dockerfile and network configuration

### 5a. Dockerfile

The container must run both the TEE node and your extension as separate processes. The TEE node binary is built from source (`https://github.com/flare-foundation/tee-node.git`).

```dockerfile
# Example for Go — adjust for Python/TypeScript
FROM golang:1.23-alpine AS builder

# Build TEE node
RUN git clone https://github.com/flare-foundation/tee-node.git /tee-node
WORKDIR /tee-node
RUN go build -o /server ./cmd/server

# Build extension
COPY . /extension
WORKDIR /extension
RUN go build -o /policy-engine ./cmd/main.go

FROM alpine:latest
RUN apk add --no-cache gosu ca-certificates
COPY --from=builder /server /server
COPY --from=builder /policy-engine /policy-engine

ENV CONFIG_PORT=6660
ENV SIGN_PORT=6661
ENV EXTENSION_PORT=6662
ENV MODE=1

CMD ["sh", "-c", "./server & gosu extension ./policy-engine"]
```

**Required environment variables:**

| Variable | Description |
|----------|-------------|
| `CONFIG_PORT` | TEE node config port |
| `SIGN_PORT` | TEE node sign/decrypt/result port |
| `EXTENSION_PORT` | Your extension's HTTP server port |
| `MODE=1` | Test mode (fake attestation, required for Coston2) |
| `FLARE_RPC_URL` | Flare RPC endpoint |
| `POLICY_REGISTRY_ADDR` | Deployed PolicyRegistry address |
| `AUDIT_LOG_ADDR` | Deployed AuditLog address |
| `EXPLORER_API_URL` | Block explorer API base URL |

### 5b. Network egress

The TEE Docker container runs behind a network proxy that restricts outbound connections. The following domains must be reachable:

| Domain | Purpose |
|--------|---------|
| `coston2-api.flare.network` | Flare RPC (or your RPC provider) |
| `coston2-explorer.flare.network` | Contract verification API |
| `api.github.com` | ERC-7730 registry search (MVP) |
| `raw.githubusercontent.com` | ERC-7730 registry raw files |

If using the scaffold's Docker Compose with a network proxy, add these domains to the proxy's allowlist in `config/proxy/extension_proxy.toml` or equivalent network configuration. If a domain is not whitelisted, HTTP requests will fail silently — the fail-open policy (Step 4d) handles this gracefully, but the corresponding check will always be skipped.

---

## Step 6: Client-side encryption workflow

The user must ECIES-encrypt the `EvaluateRequest` before submitting on-chain. This is how the inputs stay private during the evaluation window.

### 6a. Get the TEE's public key

```bash
curl http://localhost:6676/info | jq '.publicKey'
# Returns: "0x04..." (uncompressed secp256k1 public key)
```

### 6b. Encrypt the request

```
// 1. ABI-encode the EvaluateRequest
encoded = abiEncode(target, calldata, value, sender, nonce)

// 2. ECIES-encrypt with the TEE's secp256k1 public key
// Use ECIES with:
//   curve: secp256k1
//   KDF: HKDF-SHA256
//   MAC: HMAC-SHA256
//   cipher: AES-256-GCM
teePublicKey = hexDecode(publicKeyFromProxy)
encrypted = eciesEncrypt(teePublicKey, encoded)

// 3. Hex-encode for the Solidity call
encryptedHex = bytesToHex(encrypted)
```

### 6c. Submit on-chain

```bash
cast send $INSTRUCTION_SENDER \
    "sendEvaluate(bytes)" \
    $ENCRYPTED_HEX \
    --value 2000 \
    --private-key $PRIVATE_KEY \
    --rpc-url $FLARE_RPC_URL
```

The `--value 2000` covers the TEE instruction fee (minimum 1000 wei).

### 6d. Poll for result

The `sendEvaluate` function returns a `bytes32` instruction ID. Use this to poll the proxy:

```bash
# The result appears when the TEE has processed the instruction
# and the proxy has written it back on-chain.
# Poll the proxy's external endpoint:
curl http://localhost:6676/result/<INSTRUCTION_ID>
```

---

## Step 7: Audit trail

### What IS in every audit entry (on-chain, public)

| Field | Purpose |
|---|---|
| `evaluationId` | Unique hash for this evaluation |
| `policyId` + `policyName` | Which policy was applied |
| `riskScore` | The computed risk (0–100) |
| `checkResults` bitmap | Which of the 10 checks passed (1) or failed (0) |
| `requiredSigners` | How many signers the TEE determined were needed |
| `totalSigners` | Total in the matched policy's signer set |
| `timestamp` | When the evaluation occurred |

### What is NEVER in an audit entry

| Excluded | Why |
|---|---|
| Target address | Reveals which contract was called |
| Calldata | Reveals the function and parameters |
| Value | Reveals the transaction amount |
| Sender | Reveals who proposed it |

### How an auditor verifies compliance

1. Read policies: `PolicyRegistry.getActivePolicies()` — fully public.
2. Read audit log: `AuditLog.getEntriesByPolicy(policyId)` — one entry per evaluation.
3. Cross-reference: If policy says `requireVerified = true`, check that `bit 2 = 1` in every entry. If it's 0, the risk score was elevated and more signers were required.
4. Verify the TEE attestation on the `ActionResult` via the TEE registry to confirm the evaluation wasn't tampered with.

---

## Step 8: Write tests

### 8a. Low-risk scenario (score ~5–15)

```
test_low_risk:
    // Verified contract, on allowlist, in ERC-7730 registry,
    // low value, within daily limit, old contract, high volume
    // Expected: score ~5–15, 1-of-3 signers
```

### 8b. High-risk scenario (score ~90–100)

```
test_high_risk:
    // Unverified, on denylist, no ERC-7730, over per-tx limit,
    // new contract, has delegatecall
    // Expected: score ~90–100, 3-of-3 signers
```

### 8c. Multi-policy highest-risk

```
test_highest_risk_wins:
    // Two policies match. policyA: riskWeight 2. policyB: riskWeight 8.
    // Result must select policyB with its signer set.
```

### 8d. Per-policy daily limit

```
test_per_policy_daily_limit:
    // Policy A has dailyLimitUsd = 1000. Policy B has dailyLimitUsd = 5000.
    // First tx matches Policy A: 800 USD → passes.
    // Second tx matches Policy A: 300 USD → fails daily limit (800+300 > 1000).
    // Third tx matches Policy B: 300 USD → passes (Policy B has separate counter).
```

### 8e. Fail-open external check

```
test_erc7730_api_timeout:
    // Mock the GitHub API to return timeout.
    // ERC-7730 check should be skipped (bit 3 = 1, weight excluded).
    // Score should be computed from the remaining 9 checks.
```

### 8f. Audit trail completeness

```
test_audit_no_sensitive_data:
    // Run handleEvaluate, decode the result.
    // Verify AuditReceipt has policyId, riskScore, bitmap, threshold.
    // Verify it does NOT contain target, calldata, value, or sender.
```

### 8g. Bytecode scanning

```
test_delegatecall_in_push_data:
    // Bytecode where 0xF4 appears as PUSH data, not as an instruction.
    // Scanner must NOT flag this as delegatecall.

test_real_delegatecall:
    // Bytecode with actual DELEGATECALL instruction.
    // Scanner must flag this.
```

---

## Step 9: Deploy and register on Coston2

### 9a. Configure environment

```bash
cp .env.example .env
# PRIVATE_KEY=<funded Coston2 wallet>
# INITIAL_OWNER=<wallet address>
# LANGUAGE=<go|python|typescript>
# FLARE_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
# EXPLORER_API_URL=https://coston2-explorer.flare.network/api
# GOVERNANCE_SIGNERS=<comma-separated governance signer addresses>

cp config/proxy/extension_proxy.toml.example config/proxy/extension_proxy.toml
# Fill in DB credentials for the Coston2 C-chain indexer
```

### 9b. Deploy contracts

Follow the deployment order in Step 3. Save each address to `.env`.

### 9c. Add initial policies via governance

```bash
# Signer 1 proposes a "large transfer" policy
cast send $GOVERNANCE_MULTISIG "propose(address,bytes,string)" \
    $POLICY_REGISTRY_ADDR \
    $(cast calldata "addPolicy(string,...)" ...) \
    "Add large transfer policy" \
    --private-key $SIGNER1_KEY --rpc-url $FLARE_RPC_URL

# ALL remaining signers approve (unanimous required)
cast send $GOVERNANCE_MULTISIG "approve(uint256)" 0 --private-key $SIGNER2_KEY ...
cast send $GOVERNANCE_MULTISIG "approve(uint256)" 0 --private-key $SIGNER3_KEY ...

# Execute
cast send $GOVERNANCE_MULTISIG "execute(uint256)" 0 --private-key $SIGNER1_KEY ...
```

### 9d. Register TEE extension and start stack

```bash
cd go/tools
go run ./cmd/register-extension
# Save EXTENSION_ID to .env

docker compose build
docker compose up -d

until curl -sf http://localhost:6676/info >/dev/null 2>&1; do sleep 2; done

cloudflared tunnel --url http://localhost:6676
# Save TUNNEL_URL to .env

cd go/tools
go run ./cmd/allow-tee-version -p http://localhost:6676
go run ./cmd/register-tee -p http://localhost:6676 -l

# Set extension ID on InstructionSender
cast send $INSTRUCTION_SENDER "setExtensionIdManual(uint256)" $EXTENSION_ID \
    --private-key $PRIVATE_KEY --rpc-url $FLARE_RPC_URL
```

### 9e. End-to-end test

```bash
cd go/tools
go run ./cmd/run-test -p http://localhost:6676
```

---

## File summary

```
contract/
    GovernanceMultisig.sol        # Unanimous approval for policy changes
    PolicyRegistry.sol            # Public policy storage
    AuditLog.sol                  # Append-only evaluation receipts
    MultisigWallet.sol            # Execution with TEE-attested audit enforcement
    InstructionSender.sol         # TEE evaluation entry point
    interface/
        ITeeExtensionRegistry.sol # Flare system interface
        ITeeMachineRegistry.sol   # Flare system interface
app/
    config.{ext}                  # OPType, version, addresses, feed IDs
    types.{ext}                   # Policy, EvaluateRequest, PolicyDecision, etc.
    handlers.{ext}                # handleEvaluate, state, registration
    simulation.{ext}              # runSimulation, computeScore, runCheck wrapper
    policy_matcher.{ext}          # matchesConditions
    checks/
        oracle.{ext}              # fetchFtsoPrice (FTSO v2 via ContractRegistry)
        verification.{ext}        # checkContractVerified (explorer API)
        erc7730.{ext}             # checkErc7730Registry (LedgerHQ GitHub)
        bytecode.{ext}            # analyzeBytecode (opcode scanner)
        contract_age.{ext}        # getContractAge (binary search)
        limits.{ext}              # per-tx and per-policy daily USD limits
tests/
    test_low_risk.{ext}
    test_high_risk.{ext}
    test_multi_policy.{ext}
    test_per_policy_daily.{ext}
    test_fail_open.{ext}
    test_audit_trail.{ext}
    test_bytecode_scanner.{ext}
    test_client_encryption.{ext}
base/                              # DO NOT MODIFY — scaffold infrastructure
Dockerfile                         # TEE node + extension, dual-process
docker-compose.yml                 # extension-tee + ext-proxy + redis
```

---

## Common mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Including target/calldata/value in audit receipt | Sensitive data visible on-chain | AuditReceipt contains only policyId, score, bitmap, threshold |
| Not converting value to USD before limit checks | Limits meaningless — token price fluctuates | Always use FTSO oracle to convert first |
| Caching ERC-7730 index indefinitely | New descriptors missed | Refresh at least hourly; for MVP, query live |
| Missing fail-open on external check failure | API timeout causes max-risk lockout | Exclude failed checks from scoring; set bitmap bit to 1 |
| Global daily volume instead of per-policy | One policy's traffic exhausts another's limit | Track `policyDailyVolumes` map in state |
| 0xF4 in PUSH data flagged as DELEGATECALL | False positive on normal contracts | Bytecode scanner must skip PUSHn data bytes |
| Not whitelisting external domains in proxy | All external checks silently fail | Add explorer, GitHub, RPC domains to proxy config |
| Double-wrapping encrypted message | TEE decrypt produces garbage | Pass `_encryptedMessage` directly to `params.message` |
| Using `FtsoV2` instead of `TestFtsoV2` on Coston2 | Calls revert (test interface is view-only) | Use `TestFtsoV2` on testnet, `FtsoV2` on mainnet |
| Forgetting `--value` when calling `sendEvaluate` | Reverts — registry requires min 1000 wei | Always pass `--value 2000` or more |

---

## Extension points (post-MVP)

- **Transaction simulation via `eth_call`**: Fork chain state inside TEE, simulate the tx to detect reverts, state changes, or reentrancy.
- **FTSO multi-asset pricing**: Policies with limits in other currencies via multiple FTSO feeds.
- **FDC cross-chain attestation**: Verify source-chain collateral for bridged assets.
- **ERC-7730 display parsing**: Parse the descriptor to include human-readable intent in the audit log.
- **Policy templates**: Pre-built policies for ERC-20 treasury, DEX trading, NFT minting.
- **Governance signer rotation**: Replace governance signers (unanimous approval).
- **Multi-TEE consensus**: Send to 3+ TEEs, require matching results. Also fixes the per-TEE daily volume limitation.
- **Local ERC-7730 index**: Clone the registry at startup, parse all JSON, build address set in memory. Eliminates GitHub API dependency.