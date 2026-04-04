// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TestHighValueToken.sol";

contract DeployTestTokenScript is Script {
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

        console.log("=== Deploying Test High-Value Token ===");
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // Deploy token with 1 million initial supply
        // This creates tokens with high nominal value for testing
        TestHighValueToken token = new TestHighValueToken(
            "Test High Value Token",
            "THVT",
            1000000 // 1 million tokens initial supply
        );
        
        console.log("TestHighValueToken deployed at:", address(token));
        console.log("Token Name: Test High Value Token");
        console.log("Token Symbol: THVT");
        console.log("Initial Supply: 1000000 THVT");
        console.log("Decimals: 18");
        
        // Get deployer balance
        uint256 deployerBalance = token.balanceOf(vm.addr(deployerPrivateKey));
        console.log("Deployer balance:", deployerBalance / 1e18, "THVT");

        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Add to .env:");
        console.log("TEST_TOKEN_ADDR=", address(token));

        vm.stopBroadcast();
    }
}
