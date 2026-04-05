// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TestHighValueToken.sol";

contract DeployUSDCTokenScript is Script {
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

        console.log("=== Deploying USDC Token ===");
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        // Deploy USDC token with 1 billion initial supply (6 decimals like real USDC)
        TestHighValueToken token = new TestHighValueToken(
            "USD Coin",
            "USDC",
            1000000000 // 1 billion tokens initial supply
        );
        
        console.log("USDC Token deployed at:", address(token));
        console.log("Token Name: USD Coin");
        console.log("Token Symbol: USDC");
        console.log("Initial Supply: 1000000000 USDC");
        console.log("Decimals: 18");
        
        // Get deployer balance
        uint256 deployerBalance = token.balanceOf(vm.addr(deployerPrivateKey));
        console.log("Deployer balance:", deployerBalance / 1e18, "USDC");

        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Add to .env:");
        console.log("TEST_TOKEN_ADDR=", address(token));
        console.log("VITE_TEST_TOKEN_ADDR=", address(token));

        vm.stopBroadcast();
    }
}
