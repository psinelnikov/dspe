# Multisig Policy Engine — Flare TEE Extension

Dynamic multisig management with on-chain policy governance, off-chain transaction simulation, oracle price feeds, ERC-7730 clear signing registry checks, and a public audit trail.

## Architecture

```
ON-CHAIN                          TEE (Private)
┌─────────────────────────┐       ┌─────────────────────────────────┐
│ GovernanceMultisig      │       │ 1. Decrypt proposal via TEE key │
│ PolicyRegistry          │◄─────►│ 2. Fetch policies from registry │
│ AuditLog                │       │ 3. Simulate 10 risk checks      │
│ MultisigWallet          │       │ 4. Score risk → signer threshold │
│ InstructionSender       │       │ 5. Return decision + audit receipt│
└─────────────────────────┘       └─────────────────────────────────┘
```

Every evaluation produces an audit receipt on-chain with the policy, risk score, and check results — but **never** the target address, calldata, or value.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Funded [Coston2](https://faucet.flare.network/coston2) wallet (C2FLR for gas)
- `cloudflared` or `ngrok` for tunneling

## Setup

### 1. Clone and install dependencies

```bash
npm install
```

### 2. Install Solidity dependencies

```bash
cd contract
forge install foundry-rs/forge-std --no-git
cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
PRIVATE_KEY=your_coston2_private_key
FLARE_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
EXPLORER_API_URL=https://coston2-explorer.flare.network/api
GOVERNANCE_SIGNERS=0xSigner1,0xSigner2,0xSigner3
```

### 4. Build Solidity contracts

```bash
cd contract
forge build
```

### 5. Run tests

**Solidity tests (14 tests):**

```bash
cd contract
forge test -v
```

**TypeScript tests (37 tests):**

```bash
npx vitest run
```

## Deployed Contracts (Coston2 Testnet)

The following contracts are already deployed on Coston2 (Chain ID 114):

| Contract | Address | Notes |
|----------|---------|-------|
| InstructionSender | `0x6655Ff0B55508E79f808CB341DCF3Eb176b80EcC` | Entry point for encrypted evaluation requests |
| TeeExtensionRegistry | `0x3d478d43426081BD5854be9C7c5c183bfe76C981` | Flare TEE extension registry |
| TeeMachineRegistry | `0x5918Cd58e5caf755b8584649Aa24077822F87613` | Flare TEE machine registry |

## Deploying to Coston2

### 1. Deploy core contracts (in order)

The InstructionSender contract is already deployed. Deploy your organization's core contracts:

```bash
# Load env
export $(cat .env | xargs)

# 1. GovernanceMultisig (requires ALL signers to approve)
forge create --rpc-url $FLARE_RPC_URL --private-key $PRIVATE_KEY --broadcast \
  contract/src/GovernanceMultisig.sol:GovernanceMultisig \
  --constructor-args "[$GOVERNANCE_SIGNERS]"

# Save the deployed address
echo "GOVERNANCE_MULTISIG_ADDR=<deployed-address>" >> .env

# 2. PolicyRegistry (passing GovernanceMultisig address)
forge create --rpc-url $FLARE_RPC_URL --private-key $PRIVATE_KEY --broadcast \
  contract/src/PolicyRegistry.sol:PolicyRegistry \
  --constructor-args $GOVERNANCE_MULTISIG_ADDR

# Save the deployed address
echo "POLICY_REGISTRY_ADDR=<deployed-address>" >> .env

# 3. AuditLog (no constructor args)
forge create --rpc-url $FLARE_RPC_URL --private-key $PRIVATE_KEY --broadcast \
  contract/src/AuditLog.sol:AuditLog

# Save the deployed address
echo "AUDIT_LOG_ADDR=<deployed-address>" >> .env

# 4. MultisigWallet (passing AuditLog address)
forge create --rpc-url $FLARE_RPC_URL --private-key $PRIVATE_KEY --broadcast \
  contract/src/MultisigWallet.sol:MultisigWallet \
  --constructor-args $AUDIT_LOG_ADDR

# Save the deployed address
echo "MULTISIG_WALLET_ADDR=<deployed-address>" >> .env
```

**Note:** The InstructionSender contract (`0x6655Ff0B55508E79f808CB341DCF3Eb176b80EcC`) is already deployed on Coston2 and serves as the entry point for all TEE evaluation requests.

### 2. Add initial policies via governance

```bash
# Signer 1 proposes a policy
cast send $GOVERNANCE_MULTISIG_ADDR "propose(address,bytes,string)" \
  $POLICY_REGISTRY_ADDR \
  "0x" \
  "Add treasury policy" \
  --private-key $PRIVATE_KEY --rpc-url $FLARE_RPC_URL

# All remaining signers approve (requires ALL signers for this multisig)
cast send $GOVERNANCE_MULTISIG_ADDR "approve(uint256)" 0 --private-key <SIGNER2_KEY> --rpc-url $FLARE_RPC_URL
cast send $GOVERNANCE_MULTISIG_ADDR "approve(uint256)" 0 --private-key <SIGNER3_KEY> --rpc-url $FLARE_RPC_URL

# Execute (after all approvals)
cast send $GOVERNANCE_MULTISIG_ADDR "execute(uint256)" 0 --private-key $PRIVATE_KEY --rpc-url $FLARE_RPC_URL
```

**Note:** This multisig requires ALL signers to approve before execution. For complex policy creation, you may need to create custom scripts or use the frontend interface at `app/`.

### 3. Build and start the TEE extension

The TEE extension stack includes the extension-tee, ext-proxy, and redis services:

```bash
docker compose build
docker compose up -d

# Wait for the service to be ready
until curl -sf http://localhost:6676/info >/dev/null 2>&1; do sleep 2; done
echo "Extension proxy is ready"
```

### 4. Register the TEE extension

Follow the Flare TEE registration process using the tools in `go/tools/`:

```bash
# In a separate terminal, expose the extension via tunnel
cloudflared tunnel --url http://localhost:6676
# Copy the HTTPS URL and save to .env as TUNNEL_URL

# Then register the extension and TEE machine (see FLARE_TEE_README.md for details)
cd go/tools
go run ./cmd/register-extension  # Save the printed EXTENSION_ID
go run ./cmd/allow-tee-version -p http://localhost:6676
go run ./cmd/register-tee -p http://localhost:6676 -l
```

### 5. Link InstructionSender to your extension

Once your extension is registered, set the extension ID on the InstructionSender:

```bash
# The InstructionSender is already deployed at:
INSTRUCTION_SENDER=0x6655Ff0B55508E79f808CB341DCF3Eb176b80EcC

# Set the extension ID (requires the extension owner)
cast send $INSTRUCTION_SENDER "setExtensionIdManual(uint256)" $EXTENSION_ID \
  --private-key $PRIVATE_KEY --rpc-url $FLARE_RPC_URL
```

## Sending an Evaluation

```bash
# 1. Get TEE public key from your local extension
TEE_PUB_KEY=$(curl -s http://localhost:6676/info | jq -r '.publicKey')

# 2. Encrypt the request (use eciesjs or similar)
# Encode: abi.encode(target, calldata, value, sender, nonce)
# Encrypt: eciesEncrypt(teePublicKey, encoded)

# 3. Submit on-chain using the deployed InstructionSender
cast send 0x6655Ff0B55508E79f808CB341DCF3Eb176b80EcC "sendEvaluate(bytes)" $ENCRYPTED_HEX \
  --value 2000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $FLARE_RPC_URL
```

## Scoring Spectrum

| Risk | Score | Signers | Example |
|------|-------|---------|---------|
| Lowest | 5–15 | 1-of-N | Low value, verified contract, on allowlist, ERC-7730 descriptor |
| Medium | 40–60 | 2-of-3 | Moderate value, unverified but old contract |
| Highest | 85–100 | N-of-N | High value, unverified, on denylist, no ERC-7730, proxy pattern |

## 10 Risk Checks

| # | Check | Weight | Source |
|---|-------|--------|--------|
| 0 | Allowlist | 0.10 | Policy |
| 1 | Denylist | 0.15 | Policy |
| 2 | Contract verification | 0.12 | Block explorer API |
| 3 | ERC-7730 registry | 0.10 | LedgerHQ GitHub |
| 4 | Per-tx USD limit | 0.13 | FTSO oracle |
| 5 | Daily USD limit (per-policy) | 0.10 | FTSO oracle |
| 6 | Bytecode analysis | 0.10 | RPC eth_getCode |
| 7 | Contract age | 0.07 | RPC binary search |
| 8 | Transaction volume | 0.06 | RPC getTransactionCount |
| 9 | Calldata complexity | 0.07 | Calldata length |

External API failures use a **fail-open** policy: the check bit is set to pass and excluded from scoring.

## Project Structure

```
contract/src/         Solidity contracts (5 + 2 interfaces)
contract/test/        Forge tests (14 tests)
contract/broadcast/   Deployment records
config/coston2/       Deployed addresses for Coston2 testnet
app/                  TEE extension business logic
app/checks/           Individual risk check implementations
base/                 Infrastructure (HTTP server, routing, utilities)
tests/                Vitest tests (37 tests)
frontend/             React-based web interface for governance
Dockerfile            TEE node + extension dual-process container
docker-compose.yml    extension-tee + ext-proxy + redis
```

## License

MIT
