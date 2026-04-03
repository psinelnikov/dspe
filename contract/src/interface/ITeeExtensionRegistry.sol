// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITeeExtensionRegistry {
    struct TeeInstructionParams {
        bytes32 opType;
        bytes32 opCommand;
        bytes message;
        uint256 votingRound;
        uint256 inputValidityTimestamp;
        uint256 inputValidityDeadlineTimestamp;
    }

    function sendInstructions(
        address[] calldata _teeIds,
        TeeInstructionParams calldata _params
    ) external payable returns (bytes32);
}
