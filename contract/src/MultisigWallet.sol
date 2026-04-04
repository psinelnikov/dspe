// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./AuditLog.sol";
import "./TeeVerifier.sol";
import "./interface/ITeeExtensionRegistry.sol";

contract MultisigWallet is Initializable {
    AuditLog public auditLog;
    ITeeExtensionRegistry public teeExtensionRegistry;
    address public governance;

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
        bytes32 instructionId;
    }

    uint256 public txCount;
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => uint256) public approvalCount;
    mapping(bytes32 => bool) public processedInstructions;

    event TransactionSubmitted(uint256 indexed txId, address indexed target, uint256 nonce);
    event EvaluationAttested(
        uint256 indexed txId,
        bytes32 indexed instructionId,
        uint256 matchedPolicyId,
        uint8 riskScore,
        uint16 checkResults
    );
    event TxApproved(uint256 indexed txId, address indexed signer);
    event TxExecuted(uint256 indexed txId);

    constructor() {}

    function initialize(
        address _auditLog,
        address _teeExtensionRegistry,
        address _governance
    ) external initializer {
        auditLog = AuditLog(_auditLog);
        teeExtensionRegistry = ITeeExtensionRegistry(_teeExtensionRegistry);
        governance = _governance;
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
        emit TransactionSubmitted(id, _target, _nonce);
        return id;
    }

    function submitEvaluation(
        uint256 _txId,
        uint8 _riskScore,
        uint16 _checkResults,
        uint256 _matchedPolicyId,
        uint8 _requiredSigners,
        address[] calldata _signers
    ) external {
        Transaction storage t = transactions[_txId];
        require(!t.evaluated, "Already evaluated");
        require(!t.executed, "Already executed");

        t.evaluated = true;
        t.riskScore = _riskScore;
        t.checkResults = _checkResults;
        t.matchedPolicyId = _matchedPolicyId;
        t.requiredSigners = _requiredSigners;
        t.requiredSignerSet = _signers;

        auditLog.postEntry(
            AuditLog.AuditEntry({
                evaluationId: keccak256(abi.encode(t.nonce, _matchedPolicyId, block.timestamp)),
                policyId: _matchedPolicyId,
                policyName: "",
                riskScore: _riskScore,
                checkResults: _checkResults,
                requiredSigners: _requiredSigners,
                totalSigners: uint8(_signers.length),
                timestamp: block.timestamp
            })
        );
    }

    function submitEvaluationAttested(
        uint256 _txId,
        bytes32 _instructionId
    ) external {
        Transaction storage t = transactions[_txId];
        require(!t.evaluated, "Already evaluated");
        require(!t.executed, "Already executed");
        require(!processedInstructions[_instructionId], "Instruction already processed");

        TeeVerifier.VerifiedEvaluation memory eval = TeeVerifier.verifyAndDecode(
            teeExtensionRegistry,
            _instructionId
        );

        processedInstructions[_instructionId] = true;

        t.evaluated = true;
        t.requiredSigners = eval.requiredSigners;
        t.requiredSignerSet = eval.signers;
        t.riskScore = eval.riskScore;
        t.checkResults = eval.checkResults;
        t.matchedPolicyId = eval.matchedPolicyId;
        t.instructionId = _instructionId;

        auditLog.postEntryMemory(
            AuditLog.AuditEntry({
                evaluationId: keccak256(abi.encode(t.nonce, eval.matchedPolicyId, block.timestamp, _instructionId)),
                policyId: eval.matchedPolicyId,
                policyName: eval.policyName,
                riskScore: eval.riskScore,
                checkResults: eval.checkResults,
                requiredSigners: eval.requiredSigners,
                totalSigners: uint8(eval.signers.length),
                timestamp: block.timestamp
            })
        );

        emit EvaluationAttested(
            _txId,
            _instructionId,
            eval.matchedPolicyId,
            eval.riskScore,
            eval.checkResults
        );
    }

    function approveTx(uint256 _txId) external {
        Transaction storage t = transactions[_txId];
        require(t.evaluated, "Not yet evaluated");
        require(!t.executed, "Already executed");
        require(!hasApproved[_txId][msg.sender], "Already approved");

        bool isSigner = false;
        for (uint256 i = 0; i < t.requiredSignerSet.length; i++) {
            if (t.requiredSignerSet[i] == msg.sender) {
                isSigner = true;
                break;
            }
        }
        require(isSigner, "Not in required signer set");

        hasApproved[_txId][msg.sender] = true;
        approvalCount[_txId]++;
        emit TxApproved(_txId, msg.sender);
    }

    function executeTx(uint256 _txId) external {
        Transaction storage t = transactions[_txId];
        require(t.evaluated, "Not yet evaluated");
        require(!t.executed, "Already executed");
        require(approvalCount[_txId] >= t.requiredSigners, "Insufficient approvals");

        t.executed = true;
        (bool success, ) = t.target.call{value: t.value}(t.data);
        require(success, "Execution failed");
        emit TxExecuted(_txId);
    }

    function getTransaction(uint256 _txId)
        external
        view
        returns (
            address target,
            bytes memory data,
            uint256 value,
            uint256 nonce,
            bool executed,
            bool evaluated,
            uint8 requiredSigners,
            uint8 riskScore,
            uint16 checkResults,
            uint256 matchedPolicyId,
            bytes32 instructionId
        )
    {
        Transaction storage t = transactions[_txId];
        return (
            t.target,
            t.data,
            t.value,
            t.nonce,
            t.executed,
            t.evaluated,
            t.requiredSigners,
            t.riskScore,
            t.checkResults,
            t.matchedPolicyId,
            t.instructionId
        );
    }

    receive() external payable {}
}
