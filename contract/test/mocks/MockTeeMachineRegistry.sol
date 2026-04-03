// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interface/ITeeMachineRegistry.sol";

contract MockTeeMachineRegistry is ITeeMachineRegistry {
    mapping(address => bool) public isActiveTee;
    address[] public activeMachines;

    function addTeeMachine(address _teeId) external {
        isActiveTee[_teeId] = true;
        activeMachines.push(_teeId);
    }

    function getRandomTeeIds(uint256, uint256 _count) external pure returns (address[] memory) {
        address[] memory ids = new address[](_count);
        return ids;
    }

    function getActiveTeeMachines(uint256) external view returns (address[] memory) {
        return activeMachines;
    }

    function getTeeMachine(address)
        external
        pure
        returns (
            uint256 extensionId,
            address initialOwner,
            bytes32 codeHash,
            bytes32 platform,
            PublicKey memory pubKey
        )
    {
        return (0, address(0), bytes32(0), bytes32(0), PublicKey({x: bytes32(0), y: bytes32(0)}));
    }

    function isTeeMachineActive(address _teeId) external view returns (bool) {
        return isActiveTee[_teeId];
    }
}
