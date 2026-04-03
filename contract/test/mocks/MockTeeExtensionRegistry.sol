// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interface/ITeeExtensionRegistry.sol";

contract MockTeeExtensionRegistry is ITeeExtensionRegistry {
    mapping(bytes32 => ActionResult) internal actionResults;

    function sendInstructions(
        address[] calldata,
        TeeInstructionParams calldata _params
    ) external payable returns (bytes32) {
        bytes32 instructionId = keccak256(abi.encodePacked(_params.opType, _params.opCommand, _params.message, block.timestamp));
        actionResults[instructionId] = ActionResult({
            id: instructionId,
            submissionTag: 2,
            status: 1,
            log: "",
            opType: _params.opType,
            opCommand: _params.opCommand,
            additionalResultStatus: "",
            version: "0.1.0",
            data: ""
        });
        return instructionId;
    }

    function setActionResult(bytes32 _instructionId, ActionResult calldata _result) external {
        actionResults[_instructionId] = _result;
    }

    function getActionResult(bytes32 _instructionId) external view returns (ActionResult memory) {
        return actionResults[_instructionId];
    }
}
