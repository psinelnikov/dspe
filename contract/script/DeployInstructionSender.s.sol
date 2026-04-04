// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/InstructionSender.sol";
import "../test/mocks/MockTeeExtensionRegistry.sol";
import "../test/mocks/MockTeeMachineRegistry.sol";

contract DeployInstructionSender is Script {
    function run() external {
        // Load environment variables
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

        console.log("=== Deploying InstructionSender ===");
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // Deploy mock registries for testing
        MockTeeExtensionRegistry teeExtensionRegistry = new MockTeeExtensionRegistry();
        console.log("MockTeeExtensionRegistry deployed at:", address(teeExtensionRegistry));

        MockTeeMachineRegistry teeMachineRegistry = new MockTeeMachineRegistry();
        console.log("MockTeeMachineRegistry deployed at:", address(teeMachineRegistry));

        // Deploy InstructionSender
        InstructionSender instructionSender = new InstructionSender(
            address(teeExtensionRegistry),
            address(teeMachineRegistry)
        );
        console.log("InstructionSender deployed at:", address(instructionSender));

        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("=== Contract Addresses (add these to .env) ===");
        console.log("TEE_EXTENSION_REGISTRY_ADDR=", address(teeExtensionRegistry));
        console.log("TEE_MACHINE_REGISTRY_ADDR=", address(teeMachineRegistry));
        console.log("INSTRUCTION_SENDER_ADDR=", address(instructionSender));

        vm.stopBroadcast();
    }
}
