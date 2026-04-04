// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MultisigWallet.sol";
import "../src/GovernanceMultisig.sol";
import "../src/PolicyRegistry.sol";
import "../src/AuditLog.sol";
import "../src/PresetPolicyRegistry.sol";
import "../src/WalletFactory.sol";

contract DeployScript is Script {
    function run() external {
        // Load environment variables - handle private key
        string memory pkString = vm.envString("PRIVATE_KEY");
        
        // Check if key has 0x prefix
        bytes memory pkBytes = bytes(pkString);
        if (pkBytes.length >= 2 && pkBytes[0] == "0" && (pkBytes[1] == "x" || pkBytes[1] == "X")) {
            // Has 0x prefix
        } else {
            // Add 0x prefix
            pkString = string.concat("0x", pkString);
        }
        uint256 deployerPrivateKey = vm.parseUint(pkString);
        
        vm.startBroadcast(deployerPrivateKey);

        console.log("=== Starting Deployment ===");
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // 1. Deploy PresetPolicyRegistry (standalone contract)
        PresetPolicyRegistry presetRegistry = new PresetPolicyRegistry();
        console.log("PresetPolicyRegistry deployed at:", address(presetRegistry));

        // 2. Deploy singleton contracts (used as templates for clones)
        MultisigWallet walletSingleton = new MultisigWallet();
        console.log("MultisigWallet singleton deployed at:", address(walletSingleton));

        GovernanceMultisig govSingleton = new GovernanceMultisig();
        console.log("GovernanceMultisig singleton deployed at:", address(govSingleton));

        PolicyRegistry policyRegSingleton = new PolicyRegistry();
        console.log("PolicyRegistry singleton deployed at:", address(policyRegSingleton));

        AuditLog auditLogSingleton = new AuditLog();
        console.log("AuditLog singleton deployed at:", address(auditLogSingleton));

        // 3. Deploy WalletFactory with all singleton addresses
        // Note: TeeExtensionRegistry is an external Flare contract, not deployed here
        // For testing, you can use a mock or the real Flare registry address
        address teeExtensionRegistry = vm.envOr("TEE_EXTENSION_REGISTRY", address(0));
        
        WalletFactory factory = new WalletFactory(
            address(walletSingleton),
            address(govSingleton),
            address(policyRegSingleton),
            address(auditLogSingleton),
            teeExtensionRegistry,
            address(presetRegistry)
        );
        console.log("WalletFactory deployed at:", address(factory));

        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("=== Contract Addresses (add these to .env) ===");
        console.log("PRESET_POLICY_REGISTRY_ADDR=", address(presetRegistry));
        console.log("MULTISIG_WALLET_ADDR=", address(walletSingleton));
        console.log("GOVERNANCE_MULTISIG_ADDR=", address(govSingleton));
        console.log("POLICY_REGISTRY_ADDR=", address(policyRegSingleton));
        console.log("AUDIT_LOG_ADDR=", address(auditLogSingleton));
        console.log("WALLET_FACTORY_ADDR=", address(factory));

        vm.stopBroadcast();
    }
}
