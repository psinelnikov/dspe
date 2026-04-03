// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interface/ITeeExtensionRegistry.sol";
import "./interface/ITeeMachineRegistry.sol";

library TeeVerifier {
    using ECDSA for bytes32;

    bytes32 constant OP_TYPE_EVALUATE = bytes32("EVALUATE_RISK");

    struct VerifiedEvaluation {
        uint256 matchedPolicyId;
        string policyName;
        uint8 riskScore;
        uint8 requiredSigners;
        uint8 totalSigners;
        address[] signers;
        uint16 checkResults;
        uint8 policiesEvaluated;
        uint256 nonce;
    }

    error InvalidInstructionId();
    error ResultNotReady();
    error WrongOPType(bytes32 expected, bytes32 actual);
    error ResultProcessingFailed();

    function verifyAndDecode(
        ITeeExtensionRegistry _registry,
        bytes32 _instructionId
    ) internal view returns (VerifiedEvaluation memory eval) {
        ITeeExtensionRegistry.ActionResult memory result;

        try _registry.getActionResult(_instructionId) returns (
            ITeeExtensionRegistry.ActionResult memory r
        ) {
            result = r;
        } catch {
            revert InvalidInstructionId();
        }

        if (result.status != 1) {
            revert ResultNotReady();
        }

        if (result.opType != OP_TYPE_EVALUATE) {
            revert WrongOPType(OP_TYPE_EVALUATE, result.opType);
        }

        if (result.status == 0 && bytes(result.log).length > 0) {
            revert ResultProcessingFailed();
        }

        (
            uint256 matchedPolicyId,
            string memory policyName,
            uint8 riskScore,
            uint8 requiredSigners,
            uint8 totalSigners,
            address[] memory signers,
            uint16 checkResults,
            uint8 policiesEvaluated,
            uint256 nonce
        ) = abi.decode(
                result.data,
                (uint256, string, uint8, uint8, uint8, address[], uint16, uint8, uint256)
            );

        eval = VerifiedEvaluation({
            matchedPolicyId: matchedPolicyId,
            policyName: policyName,
            riskScore: riskScore,
            requiredSigners: requiredSigners,
            totalSigners: totalSigners,
            signers: signers,
            checkResults: checkResults,
            policiesEvaluated: policiesEvaluated,
            nonce: nonce
        });
    }
}
