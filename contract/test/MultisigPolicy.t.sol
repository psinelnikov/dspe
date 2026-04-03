// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GovernanceMultisig.sol";
import "../src/PolicyRegistry.sol";
import "../src/AuditLog.sol";
import "../src/MultisigWallet.sol";
import "./mocks/MockTeeExtensionRegistry.sol";

contract MockTarget {
    bool public called;
    function doSomething() external { called = true; }
}

contract MultisigPolicyTest is Test {
    GovernanceMultisig public gov;
    PolicyRegistry public policyReg;
    AuditLog public auditLog;
    MultisigWallet public wallet;
    MockTeeExtensionRegistry public mockRegistry;

    address[] signers;
    address alice;
    address bob;
    address carol;

    function setUp() public {
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");

        signers.push(alice);
        signers.push(bob);
        signers.push(carol);

        gov = new GovernanceMultisig(signers);
        policyReg = new PolicyRegistry(address(gov));
        auditLog = new AuditLog();
        mockRegistry = new MockTeeExtensionRegistry();
        wallet = new MultisigWallet(address(auditLog), address(mockRegistry));
    }

    // --- GovernanceMultisig tests ---

    function test_GovConstructor() public view {
        assertEq(gov.getSignerCount(), 3);
        address[] memory s = gov.getSigners();
        assertEq(s[0], alice);
        assertEq(s[1], bob);
        assertEq(s[2], carol);
    }

    function test_RevertDuplicateSigner() public {
        address[] memory badSigners = new address[](2);
        badSigners[0] = alice;
        badSigners[1] = alice;
        vm.expectRevert("Duplicate signer");
        new GovernanceMultisig(badSigners);
    }

    function test_Propose() public {
        vm.prank(alice);
        uint256 id = gov.propose(address(policyReg), "", "Test proposal");
        assertEq(id, 0);
        GovernanceMultisig.Proposal memory p = gov.getProposal(id);
        assertEq(p.id, 0);
        assertEq(p.approvalCount, 1);
        assertFalse(p.executed);
    }

    function test_RevertProposeNonSigner() public {
        address nonSigner = makeAddr("nobody");
        vm.prank(nonSigner);
        vm.expectRevert("Not a signer");
        gov.propose(address(policyReg), "", "Bad");
    }

    function test_Approve() public {
        vm.startPrank(alice);
        uint256 id = gov.propose(address(policyReg), "", "Test");
        vm.stopPrank();

        vm.prank(bob);
        gov.approve(id);
        GovernanceMultisig.Proposal memory p = gov.getProposal(id);
        assertEq(p.approvalCount, 2);
    }

    function test_RevertApproveTwice() public {
        vm.prank(alice);
        uint256 id = gov.propose(address(policyReg), "", "Test");

        vm.expectRevert("Already approved");
        vm.prank(alice);
        gov.approve(id);
    }

    function test_ExecuteUnanimous() public {
        MockTarget target = new MockTarget();
        vm.prank(alice);
        uint256 id = gov.propose(address(target), abi.encodeCall(MockTarget.doSomething, ()), "Test");

        vm.prank(bob);
        gov.approve(id);
        vm.prank(carol);
        gov.approve(id);

        vm.prank(alice);
        gov.execute(id);
        GovernanceMultisig.Proposal memory p = gov.getProposal(id);
        assertTrue(p.executed);
        assertTrue(target.called());
    }

    function test_RevertExecuteNotAllApproved() public {
        vm.prank(alice);
        uint256 id = gov.propose(address(policyReg), "", "Test");

        vm.prank(bob);
        gov.approve(id);

        vm.prank(alice);
        vm.expectRevert("Not all signers approved");
        gov.execute(id);
    }

    // --- PolicyRegistry tests ---

    function test_AddPolicy() public {
        PolicyRegistry.Conditions memory conditions = _defaultConditions();
        PolicyRegistry.Limits memory limits = _defaultLimits();
        address[] memory pSigners = new address[](2);
        pSigners[0] = alice;
        pSigners[1] = bob;

        uint256 pid = _addPolicyViaGov("Test Policy", conditions, limits, pSigners, 5);
        assertEq(pid, 0);

        PolicyRegistry.Policy memory p = policyReg.getPolicy(0);
        assertEq(p.id, 0);
        assertTrue(p.active);
        assertEq(p.signers.length, 2);
    }

    function test_GetActivePolicies() public {
        PolicyRegistry.Conditions memory conditions = _defaultConditions();
        PolicyRegistry.Limits memory limits = _defaultLimits();
        address[] memory pSigners = new address[](1);
        pSigners[0] = alice;

        _addPolicyViaGov("P1", conditions, limits, pSigners, 3);
        _addPolicyViaGov("P2", conditions, limits, pSigners, 5);

        PolicyRegistry.Policy[] memory active = policyReg.getActivePolicies();
        assertEq(active.length, 2);
    }

    function test_DeactivatePolicy() public {
        PolicyRegistry.Conditions memory conditions = _defaultConditions();
        PolicyRegistry.Limits memory limits = _defaultLimits();
        address[] memory pSigners = new address[](1);
        pSigners[0] = alice;

        _addPolicyViaGov("P1", conditions, limits, pSigners, 3);

        _deactivatePolicyViaGov(0);

        PolicyRegistry.Policy memory p = policyReg.getPolicy(0);
        assertFalse(p.active);

        PolicyRegistry.Policy[] memory active = policyReg.getActivePolicies();
        assertEq(active.length, 0);
    }

    function test_RevertAddPolicyNonGov() public {
        PolicyRegistry.Conditions memory conditions = _defaultConditions();
        PolicyRegistry.Limits memory limits = _defaultLimits();
        address[] memory pSigners = new address[](1);
        pSigners[0] = alice;

        vm.expectRevert("Only governance multisig");
        policyReg.addPolicy("Bad", conditions, limits, pSigners, 5);
    }

    // --- AuditLog tests ---

    function test_PostEntry() public {
        auditLog.postEntry(_defaultAuditEntry());
        assertEq(auditLog.getEntryCount(), 1);
    }

    function test_GetEntriesByPolicy() public {
        auditLog.postEntry(_auditEntryForPolicy(1));
        auditLog.postEntry(_auditEntryForPolicy(2));
        auditLog.postEntry(_auditEntryForPolicy(1));

        AuditLog.AuditEntry[] memory entries = auditLog.getEntriesByPolicy(1);
        assertEq(entries.length, 2);
    }

    // --- MultisigWallet tests ---

    function test_SubmitTransaction() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);
        assertEq(id, 0);
        assertEq(wallet.txCount(), 1);
    }

    function test_SubmitEvaluation() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = alice;
        evalSigners[1] = bob;

        wallet.submitEvaluation(id, 3, 0x00FF, 0, 2, evalSigners);

        (
            ,
            ,
            ,
            ,
            bool executed,
            bool evaluated,
            uint8 reqSigners,
            uint8 riskScore,
            uint16 checkResults,
            uint256 matchedPolicyId,
            bytes32 instructionId
        ) = wallet.getTransaction(id);

        assertFalse(executed);
        assertTrue(evaluated);
        assertEq(reqSigners, 2);
        assertEq(riskScore, 3);
        assertEq(checkResults, 0x00FF);
        assertEq(matchedPolicyId, 0);
        assertEq(instructionId, bytes32(0));
    }

    function test_ApproveTx() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = alice;
        evalSigners[1] = bob;

        wallet.submitEvaluation(id, 3, 0x00FF, 0, 2, evalSigners);

        vm.prank(alice);
        wallet.approveTx(id);

        assertEq(wallet.approvalCount(id), 1);
        assertTrue(wallet.hasApproved(id, alice));
    }

    function test_ExecuteTx() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = alice;
        evalSigners[1] = bob;

        wallet.submitEvaluation(id, 3, 0x00FF, 0, 2, evalSigners);

        vm.prank(alice);
        wallet.approveTx(id);
        vm.prank(bob);
        wallet.approveTx(id);

        wallet.executeTx(id);

        (, , , , bool executed, , , , , , ) = wallet.getTransaction(id);
        assertTrue(executed);
    }

    function test_RevertExecuteInsufficientApprovals() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = alice;
        evalSigners[1] = bob;

        wallet.submitEvaluation(id, 3, 0x00FF, 0, 2, evalSigners);

        vm.prank(alice);
        wallet.approveTx(id);

        vm.expectRevert("Insufficient approvals");
        wallet.executeTx(id);
    }

    function test_RevertApproveNonSigner() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        address[] memory evalSigners = new address[](1);
        evalSigners[0] = alice;

        wallet.submitEvaluation(id, 3, 0x00FF, 0, 1, evalSigners);

        vm.prank(bob);
        vm.expectRevert("Not in required signer set");
        wallet.approveTx(id);
    }

    // --- TEE Attestation tests ---

    function test_SubmitEvaluationAttested() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        bytes memory evalData = abi.encode(
            uint256(0),
            "Test Policy",
            uint8(3),
            uint8(2),
            uint8(2),
            _signerArray(alice, bob),
            uint16(0x00FF),
            uint8(1),
            uint256(123)
        );

        bytes32 instructionId = keccak256("test-instruction-1");
        ITeeExtensionRegistry.ActionResult memory result = ITeeExtensionRegistry.ActionResult({
            id: instructionId,
            submissionTag: 2,
            status: 1,
            log: "",
            opType: bytes32("EVALUATE_RISK"),
            opCommand: bytes32(""),
            additionalResultStatus: "",
            version: "0.1.0",
            data: evalData
        });
        mockRegistry.setActionResult(instructionId, result);

        wallet.submitEvaluationAttested(id, instructionId);

        (
            ,
            ,
            ,
            ,
            bool executed,
            bool evaluated,
            uint8 reqSigners,
            uint8 riskScore,
            uint16 checkResults,
            uint256 matchedPolicyId,
            bytes32 instrId
        ) = wallet.getTransaction(id);

        assertFalse(executed);
        assertTrue(evaluated);
        assertEq(reqSigners, 2);
        assertEq(riskScore, 3);
        assertEq(checkResults, 0x00FF);
        assertEq(matchedPolicyId, 0);
        assertEq(instrId, instructionId);
        assertEq(auditLog.getEntryCount(), 1);
    }

    function test_RevertAttestedTwice() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        bytes memory evalData = abi.encode(
            uint256(0), "Test", uint8(3), uint8(2), uint8(2), _signerArray(alice, bob),
            uint16(0x00FF), uint8(1), uint256(123)
        );

        bytes32 instrId = keccak256("test-instr-2");
        ITeeExtensionRegistry.ActionResult memory result = ITeeExtensionRegistry.ActionResult({
            id: instrId,
            submissionTag: 2,
            status: 1,
            log: "",
            opType: bytes32("EVALUATE_RISK"),
            opCommand: bytes32(""),
            additionalResultStatus: "",
            version: "0.1.0",
            data: evalData
        });
        mockRegistry.setActionResult(instrId, result);

        wallet.submitEvaluationAttested(id, instrId);

        uint256 id2 = wallet.submitTransaction(address(0x2), "", 1);
        vm.expectRevert("Instruction already processed");
        wallet.submitEvaluationAttested(id2, instrId);
    }

    function test_RevertAttestedBadOpType() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        bytes32 instrId = keccak256("bad-op");
        ITeeExtensionRegistry.ActionResult memory result = ITeeExtensionRegistry.ActionResult({
            id: instrId,
            submissionTag: 2,
            status: 1,
            log: "",
            opType: bytes32("WRONG_TYPE"),
            opCommand: bytes32(""),
            additionalResultStatus: "",
            version: "0.1.0",
            data: ""
        });
        mockRegistry.setActionResult(instrId, result);

        vm.expectRevert();
        wallet.submitEvaluationAttested(id, instrId);
    }

    function test_AttestedThenApproveAndExecute() public {
        uint256 id = wallet.submitTransaction(address(0x1), "", 0);

        bytes memory evalData = abi.encode(
            uint256(0), "Test", uint8(3), uint8(2), uint8(2), _signerArray(alice, bob),
            uint16(0x00FF), uint8(1), uint256(123)
        );

        bytes32 instrId = keccak256("full-flow");
        ITeeExtensionRegistry.ActionResult memory result = ITeeExtensionRegistry.ActionResult({
            id: instrId,
            submissionTag: 2,
            status: 1,
            log: "",
            opType: bytes32("EVALUATE_RISK"),
            opCommand: bytes32(""),
            additionalResultStatus: "",
            version: "0.1.0",
            data: evalData
        });
        mockRegistry.setActionResult(instrId, result);

        wallet.submitEvaluationAttested(id, instrId);

        vm.prank(alice);
        wallet.approveTx(id);
        vm.prank(bob);
        wallet.approveTx(id);

        wallet.executeTx(id);

        (, , , , bool executed, , , , , , ) = wallet.getTransaction(id);
        assertTrue(executed);
    }

    // --- Helpers ---

    function _defaultConditions() internal pure returns (PolicyRegistry.Conditions memory) {
        return PolicyRegistry.Conditions({
            targetAddresses: new address[](0),
            functionSelectors: new bytes4[](0),
            minValue: 0,
            maxValue: type(uint256).max,
            timeWindowStart: 0,
            timeWindowEnd: type(uint256).max,
            requireVerified: false,
            requireErc7730: false
        });
    }

    function _defaultLimits() internal pure returns (PolicyRegistry.Limits memory) {
        return PolicyRegistry.Limits({
            maxValuePerTxUsd: 100000e18,
            maxValueDailyUsd: 1000000e18,
            allowlist: new address[](0),
            denylist: new address[](0)
        });
    }

    function _addPolicyViaGov(
        string memory name,
        PolicyRegistry.Conditions memory conditions,
        PolicyRegistry.Limits memory limits,
        address[] memory pSigners,
        uint8 riskWeight
    ) internal returns (uint256) {
        vm.prank(address(gov));
        return policyReg.addPolicy(name, conditions, limits, pSigners, riskWeight);
    }

    function _deactivatePolicyViaGov(uint256 pid) internal {
        vm.prank(address(gov));
        policyReg.deactivatePolicy(pid);
    }

    function _defaultAuditEntry() internal view returns (AuditLog.AuditEntry memory) {
        return AuditLog.AuditEntry({
            evaluationId: keccak256("test"),
            policyId: 0,
            policyName: "Test",
            riskScore: 3,
            checkResults: 0x00FF,
            requiredSigners: 2,
            totalSigners: 3,
            timestamp: block.timestamp
        });
    }

    function _auditEntryForPolicy(uint256 pid) internal view returns (AuditLog.AuditEntry memory) {
        return AuditLog.AuditEntry({
            evaluationId: keccak256(abi.encode(pid)),
            policyId: pid,
            policyName: "Test",
            riskScore: 3,
            checkResults: 0x00FF,
            requiredSigners: 2,
            totalSigners: 3,
            timestamp: block.timestamp
        });
    }

    function _signerArray(address a, address b) internal pure returns (address[] memory) {
        address[] memory arr = new address[](2);
        arr[0] = a;
        arr[1] = b;
        return arr;
    }
}
