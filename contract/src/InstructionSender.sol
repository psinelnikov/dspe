// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interface/ITeeExtensionRegistry.sol";
import "./interface/ITeeMachineRegistry.sol";

contract InstructionSender {
    ITeeExtensionRegistry public immutable teeExtensionRegistry;
    ITeeMachineRegistry public immutable teeMachineRegistry;
    uint256 public extensionId;

    bytes32 constant OP_TYPE_EVALUATE = bytes32("EVALUATE_RISK");
    bytes32 constant OP_COMMAND_DEFAULT = bytes32("");

    constructor(address _registry, address _machineRegistry) {
        teeExtensionRegistry = ITeeExtensionRegistry(_registry);
        teeMachineRegistry = ITeeMachineRegistry(_machineRegistry);
    }

    function setExtensionIdManual(uint256 _id) external {
        require(extensionId == 0, "Already set");
        extensionId = _id;
    }

    function sendEvaluate(bytes calldata _encryptedMessage) external payable returns (bytes32) {
        require(extensionId != 0, "Extension ID not set");

        address[] memory teeIds = teeMachineRegistry.getRandomTeeIds(extensionId, 1);

        ITeeExtensionRegistry.TeeInstructionParams memory params;
        params.opType = OP_TYPE_EVALUATE;
        params.opCommand = OP_COMMAND_DEFAULT;
        params.message = _encryptedMessage;

        return teeExtensionRegistry.sendInstructions{value: msg.value}(teeIds, params);
    }
}
