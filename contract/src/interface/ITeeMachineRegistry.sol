// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITeeMachineRegistry {
    struct PublicKey {
        bytes32 x;
        bytes32 y;
    }

    struct TeeMachineData {
        uint256 extensionId;
        address initialOwner;
        bytes32 codeHash;
        bytes32 platform;
        PublicKey publicKey;
    }

    function getRandomTeeIds(uint256 _extensionId, uint256 _count)
        external
        view
        returns (address[] memory);

    function getActiveTeeMachines(uint256 _extensionId)
        external
        view
        returns (address[] memory);

    function getTeeMachine(address _teeId)
        external
        view
        returns (
            uint256 extensionId,
            address initialOwner,
            bytes32 codeHash,
            bytes32 platform,
            PublicKey memory publicKey
        );

    function isTeeMachineActive(address _teeId)
        external
        view
        returns (bool);
}
