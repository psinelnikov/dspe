// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./MultisigWallet.sol";
import "./GovernanceMultisig.sol";
import "./PolicyRegistry.sol";
import "./AuditLog.sol";
import "./PresetPolicyRegistry.sol";

contract WalletFactory {
    address public immutable walletSingleton;
    address public immutable teeExtensionRegistry;
    address public immutable presetPolicyRegistry;

    struct WalletDeployment {
        address wallet;
        address governance;
        address policyRegistry;
        address auditLog;
    }

    mapping(address => WalletDeployment[]) public creatorWallets;
    mapping(address => uint256) public creatorWalletCount;

    event WalletCreated(
        address indexed creator,
        address indexed wallet,
        address indexed governance,
        address policyRegistry,
        address auditLog,
        address[] signers
    );

    constructor(
        address _walletSingleton,
        address _teeExtensionRegistry,
        address _presetPolicyRegistry
    ) {
        walletSingleton = _walletSingleton;
        teeExtensionRegistry = _teeExtensionRegistry;
        presetPolicyRegistry = _presetPolicyRegistry;
    }

    function createWallet(
        address[] calldata _signers,
        uint256[] calldata _presetPolicyIds
    ) external returns (WalletDeployment memory) {
        require(_signers.length > 0, "Need signers");

        GovernanceMultisig gov = new GovernanceMultisig(_signers);
        PolicyRegistry policyReg = new PolicyRegistry(address(gov));
        AuditLog audit = new AuditLog();

        address walletProxy = Clones.clone(walletSingleton);
        MultisigWallet wallet = MultisigWallet(payable(walletProxy));
        wallet.initialize(address(audit), teeExtensionRegistry, address(gov));

        if (_presetPolicyIds.length > 0) {
            policyReg.addPresetPolicies(_presetPolicyIds, _signers, presetPolicyRegistry);
        }
        policyReg.lockProvisioning();

        WalletDeployment memory deployment = WalletDeployment({
            wallet: walletProxy,
            governance: address(gov),
            policyRegistry: address(policyReg),
            auditLog: address(audit)
        });

        creatorWallets[msg.sender].push(deployment);
        creatorWalletCount[msg.sender]++;

        emit WalletCreated(msg.sender, walletProxy, address(gov), address(policyReg), address(audit), _signers);

        return deployment;
    }

    function createWalletNoPresets(
        address[] calldata _signers
    ) external returns (WalletDeployment memory) {
        uint256[] memory empty = new uint256[](0);
        return this.createWallet(_signers, empty);
    }

    function getWalletsForCreator(address _creator) external view returns (WalletDeployment[] memory) {
        return creatorWallets[_creator];
    }

    function getWalletForCreatorAtIndex(address _creator, uint256 _index) external view returns (WalletDeployment memory) {
        return creatorWallets[_creator][_index];
    }
}
