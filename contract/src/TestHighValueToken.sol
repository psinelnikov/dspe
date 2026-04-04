// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestHighValueToken
 * @notice A test token with high nominal value (18 decimals) for testing high-value transfer policies
 * @dev Mint a large supply to test high-value thresholds in the multisig policy engine
 */
contract TestHighValueToken is ERC20, Ownable {
    uint8 private constant TOKEN_DECIMALS = 18;
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable() {
        // Mint initial supply to deployer
        _mint(msg.sender, initialSupply * 10 ** TOKEN_DECIMALS);
    }
    
    /**
     * @notice Mint additional tokens (only owner)
     * @param to Address to mint tokens to
     * @param amount Amount to mint (in whole tokens, not wei)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount * 10 ** TOKEN_DECIMALS);
    }
    
    /**
     * @notice Batch mint tokens to multiple addresses
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts (in whole tokens)
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i] * 10 ** TOKEN_DECIMALS);
        }
    }
    
    /**
     * @notice Distribute test tokens to multisig wallet and signers
     * @param multisigWallet The multisig wallet address
     * @param signers Array of signer addresses
     * @param amountPerAddress Amount to give each address (in whole tokens)
     */
    function distributeToMultisig(
        address multisigWallet,
        address[] calldata signers,
        uint256 amountPerAddress
    ) external onlyOwner {
        // Mint to multisig wallet (large amount for testing high-value transfers)
        _mint(multisigWallet, amountPerAddress * 10 * 10 ** TOKEN_DECIMALS);
        
        // Mint smaller amounts to signers
        for (uint256 i = 0; i < signers.length; i++) {
            _mint(signers[i], amountPerAddress * 10 ** TOKEN_DECIMALS);
        }
    }
    
    function getTokenInfo(address account) external view returns (
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals,
        uint256 totalSupplyValue,
        uint256 accountBalance
    ) {
        return (
            name(),
            symbol(),
            decimals(),
            totalSupply(),
            balanceOf(account)
        );
    }
}
