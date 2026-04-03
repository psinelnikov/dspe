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

    struct ActionResult {
        bytes32 id;
        uint8 submissionTag;
        uint8 status;
        string log;
        bytes32 opType;
        bytes32 opCommand;
        bytes additionalResultStatus;
        string version;
        bytes data;
    }

    function sendInstructions(
        address[] calldata _teeIds,
        TeeInstructionParams calldata _params
    ) external payable returns (bytes32);

    function getActionResult(bytes32 _instructionId)
        external
        view
        returns (ActionResult memory);
}
