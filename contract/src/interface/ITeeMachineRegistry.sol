// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITeeMachineRegistry {
    function getRandomTeeIds(uint256 _extensionId, uint256 _count) external view returns (address[] memory);
    function getActiveTeeMachines(uint256 _extensionId) external view returns (address[] memory);
}
