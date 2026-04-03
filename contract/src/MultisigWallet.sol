// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuditLog.sol";

contract MultisigWallet {
    AuditLog public auditLog;

    struct Transaction {
        address target;
        bytes data;
        uint256 value;
        uint256 nonce;
        bool executed;
        uint8 requiredSigners;
        address[] requiredSignerSet;
        uint8 riskScore;
        uint16 checkResults;
        uint256 matchedPolicyId;
        bool evaluated;
    }

    uint256 public txCount;
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => uint256) public approvalCount;

    constructor(address _auditLog) {
        auditLog = AuditLog(_auditLog);
    }

    function submitTransaction(
        address _target,
        bytes calldata _data,
        uint256 _nonce
    ) external payable returns (uint256) {
        uint256 id = txCount++;
        Transaction storage t = transactions[id];
        t.target = _target;
        t.data = _data;
        t.value = msg.value;
        t.nonce = _nonce;
        return id;
    }

    function submitEvaluation(
        uint256 _txId,
        uint256 _matchedPolicyId,
        uint8 _riskScore,
        uint8 _requiredSigners,
        address[] calldata _signers,
        uint16 _checkResults
    ) external {
        Transaction storage t = transactions[_txId];
        require(!t.evaluated, "Already evaluated");
        require(!t.executed, "Already executed");

        t.evaluated = true;
        t.requiredSigners = _requiredSigners;
        t.requiredSignerSet = _signers;
        t.riskScore = _riskScore;
        t.checkResults = _checkResults;
        t.matchedPolicyId = _matchedPolicyId;

        auditLog.postEntry(AuditLog.AuditEntry({
            evaluationId: keccak256(abi.encode(t.nonce, _matchedPolicyId, block.timestamp)),
            policyId: _matchedPolicyId,
            policyName: "",
            riskScore: _riskScore,
            checkResults: _checkResults,
            requiredSigners: _requiredSigners,
            totalSigners: uint8(_signers.length),
            timestamp: block.timestamp
        }));
    }

    function approveTx(uint256 _txId) external {
        Transaction storage t = transactions[_txId];
        require(t.evaluated, "Not yet evaluated by TEE");
        require(!t.executed, "Already executed");
        require(!hasApproved[_txId][msg.sender], "Already approved");

        bool isSigner = false;
        for (uint256 i = 0; i < t.requiredSignerSet.length; i++) {
            if (t.requiredSignerSet[i] == msg.sender) {
                isSigner = true;
                break;
            }
        }
        require(isSigner, "Not in required signer set for this transaction");

        hasApproved[_txId][msg.sender] = true;
        approvalCount[_txId]++;
    }

    function executeTx(uint256 _txId) external {
        Transaction storage t = transactions[_txId];
        require(t.evaluated, "Not yet evaluated by TEE");
        require(!t.executed, "Already executed");
        require(approvalCount[_txId] >= t.requiredSigners, "Insufficient approvals");

        t.executed = true;
        (bool success, ) = t.target.call{value: t.value}(t.data);
        require(success, "Execution failed");
    }

    function getTransaction(uint256 _txId) external view returns (
        address target,
        bytes memory data,
        uint256 value,
        uint256 nonce,
        bool executed,
        bool evaluated,
        uint8 requiredSigners,
        uint8 riskScore,
        uint16 checkResults,
        uint256 matchedPolicyId
    ) {
        Transaction storage t = transactions[_txId];
        return (
            t.target, t.data, t.value, t.nonce, t.executed, t.evaluated,
            t.requiredSigners, t.riskScore, t.checkResults, t.matchedPolicyId
        );
    }

    receive() external payable {}
}
