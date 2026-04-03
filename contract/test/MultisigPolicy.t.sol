// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GovernanceMultisig.sol";
import "../src/PolicyRegistry.sol";
import "../src/AuditLog.sol";
import "../src/MultisigWallet.sol";

contract MultisigPolicyTest is Test {
    GovernanceMultisig public gov;
    PolicyRegistry public registry;
    AuditLog public auditLog;
    MultisigWallet public wallet;

    address signer1 = address(0x1);
    address signer2 = address(0x2);
    address signer3 = address(0x3);
    address[] signers;

    function setUp() public {
        signers.push(signer1);
        signers.push(signer2);
        signers.push(signer3);

        gov = new GovernanceMultisig(signers);
        registry = new PolicyRegistry(address(gov));
        auditLog = new AuditLog();
        wallet = new MultisigWallet(address(auditLog));
    }

    // ── Governance Tests ──

    function test_governance_setup() public view {
        assertEq(gov.getSignerCount(), 3);
        address[] memory s = gov.getSigners();
        assertEq(s[0], signer1);
        assertEq(s[1], signer2);
        assertEq(s[2], signer3);
    }

    function test_propose_and_approve() public {
        vm.prank(signer1);
        uint256 id = gov.propose(address(registry), "", "Test proposal");
        assertEq(id, 0);

        vm.prank(signer2);
        gov.approve(id);
        vm.prank(signer3);
        gov.approve(id);

        GovernanceMultisig.Proposal memory p = gov.getProposal(id);
        assertEq(p.approvalCount, 3);
    }

    function test_execute_requires_unanimous() public {
        vm.prank(signer1);
        uint256 id = gov.propose(address(0), "", "Test");

        vm.prank(signer2);
        gov.approve(id);
        // Missing signer3 approval

        vm.prank(signer1);
        vm.expectRevert("Not all signers approved");
        gov.execute(id);
    }

    // ── PolicyRegistry Tests ──

    function test_add_policy() public {
        vm.prank(address(gov));
        uint256 pid = registry.addPolicy(
            "Test Policy",
            PolicyRegistry.Conditions({
                targetAddresses: new address[](0),
                functionSelectors: new bytes4[](0),
                minValue: 0,
                maxValue: 0,
                timeWindowStart: 0,
                timeWindowEnd: 0,
                requireVerified: false,
                requireErc7730: false
            }),
            PolicyRegistry.Limits({
                maxValuePerTxUsd: 1000e18,
                maxValueDailyUsd: 10000e18,
                allowlist: new address[](0),
                denylist: new address[](0)
            }),
            signers,
            5
        );
        assertEq(pid, 0);
        assertEq(registry.getPolicyCount(), 1);
    }

    function test_only_governance_can_add() public {
        vm.prank(signer1);
        vm.expectRevert("Only governance multisig");
        registry.addPolicy(
            "Unauthorized",
            PolicyRegistry.Conditions({
                targetAddresses: new address[](0),
                functionSelectors: new bytes4[](0),
                minValue: 0,
                maxValue: 0,
                timeWindowStart: 0,
                timeWindowEnd: 0,
                requireVerified: false,
                requireErc7730: false
            }),
            PolicyRegistry.Limits({
                maxValuePerTxUsd: 0,
                maxValueDailyUsd: 0,
                allowlist: new address[](0),
                denylist: new address[](0)
            }),
            signers,
            1
        );
    }

    function test_deactivate_reactivate() public {
        vm.prank(address(gov));
        registry.addPolicy(
            "Test",
            PolicyRegistry.Conditions({
                targetAddresses: new address[](0),
                functionSelectors: new bytes4[](0),
                minValue: 0,
                maxValue: 0,
                timeWindowStart: 0,
                timeWindowEnd: 0,
                requireVerified: false,
                requireErc7730: false
            }),
            PolicyRegistry.Limits({
                maxValuePerTxUsd: 0,
                maxValueDailyUsd: 0,
                allowlist: new address[](0),
                denylist: new address[](0)
            }),
            signers,
            1
        );

        vm.prank(address(gov));
        registry.deactivatePolicy(0);
        PolicyRegistry.Policy memory p = registry.getPolicy(0);
        assertFalse(p.active);

        vm.prank(address(gov));
        registry.reactivatePolicy(0);
        p = registry.getPolicy(0);
        assertTrue(p.active);
    }

    function test_get_active_policies() public {
        vm.startPrank(address(gov));
        registry.addPolicy(
            "Active1",
            PolicyRegistry.Conditions({
                targetAddresses: new address[](0),
                functionSelectors: new bytes4[](0),
                minValue: 0,
                maxValue: 0,
                timeWindowStart: 0,
                timeWindowEnd: 0,
                requireVerified: false,
                requireErc7730: false
            }),
            PolicyRegistry.Limits({
                maxValuePerTxUsd: 0,
                maxValueDailyUsd: 0,
                allowlist: new address[](0),
                denylist: new address[](0)
            }),
            signers,
            1
        );
        registry.addPolicy(
            "Active2",
            PolicyRegistry.Conditions({
                targetAddresses: new address[](0),
                functionSelectors: new bytes4[](0),
                minValue: 0,
                maxValue: 0,
                timeWindowStart: 0,
                timeWindowEnd: 0,
                requireVerified: false,
                requireErc7730: false
            }),
            PolicyRegistry.Limits({
                maxValuePerTxUsd: 0,
                maxValueDailyUsd: 0,
                allowlist: new address[](0),
                denylist: new address[](0)
            }),
            signers,
            1
        );
        vm.stopPrank();

        PolicyRegistry.Policy[] memory active = registry.getActivePolicies();
        assertEq(active.length, 2);
    }

    // ── AuditLog Tests ──

    function test_audit_log() public {
        AuditLog.AuditEntry memory entry = AuditLog.AuditEntry({
            evaluationId: keccak256("test"),
            policyId: 0,
            policyName: "Test Policy",
            riskScore: 50,
            checkResults: 0x03FF,
            requiredSigners: 2,
            totalSigners: 3,
            timestamp: block.timestamp
        });

        auditLog.postEntry(entry);
        assertEq(auditLog.getEntryCount(), 1);

        AuditLog.AuditEntry memory retrieved = auditLog.getEntry(0);
        assertEq(retrieved.riskScore, 50);
        assertEq(retrieved.policyName, "Test Policy");
    }

    function test_audit_no_sensitive_data() public {
        AuditLog.AuditEntry memory entry = AuditLog.AuditEntry({
            evaluationId: keccak256("test"),
            policyId: 1,
            policyName: "Large Transfer",
            riskScore: 25,
            checkResults: 0x01FF,
            requiredSigners: 1,
            totalSigners: 3,
            timestamp: block.timestamp
        });

        auditLog.postEntry(entry);
        AuditLog.AuditEntry memory retrieved = auditLog.getEntry(0);

        // Verify only non-sensitive fields present
        assertGt(bytes(retrieved.policyName).length, 0);
        assertTrue(retrieved.evaluationId > bytes32(0));
        assertEq(retrieved.riskScore, 25);
        assertEq(retrieved.checkResults, 0x01FF);
    }

    // ── MultisigWallet Tests ──

    function test_submit_and_evaluate_tx() public {
        uint256 txId = wallet.submitTransaction{value: 1 ether}(
            address(0xdead),
            "",
            1
        );
        assertEq(txId, 0);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = signer1;
        evalSigners[1] = signer2;

        wallet.submitEvaluation(0, 0, 50, 2, evalSigners, 0x01FF);

        // signer1 approves
        vm.prank(signer1);
        wallet.approveTx(0);
    }

    function test_execute_requires_evaluated() public {
        wallet.submitTransaction{value: 1 ether}(address(0xdead), "", 1);

        vm.prank(signer1);
        vm.expectRevert("Not yet evaluated by TEE");
        wallet.executeTx(0);
    }

    function test_execute_requires_sufficient_approvals() public {
        wallet.submitTransaction{value: 1 ether}(address(0xdead), "", 1);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = signer1;
        evalSigners[1] = signer2;

        wallet.submitEvaluation(0, 0, 50, 2, evalSigners, 0x01FF);

        // Only 1 approval, need 2
        vm.prank(signer1);
        wallet.approveTx(0);

        vm.prank(signer1);
        vm.expectRevert("Insufficient approvals");
        wallet.executeTx(0);
    }

    function test_full_lifecycle() public {
        // Submit tx
        uint256 txId = wallet.submitTransaction{value: 0.1 ether}(
            address(0xdead),
            hex"abcdef",
            42
        );
        assertEq(txId, 0);

        // TEE evaluates
        address[] memory evalSigners = new address[](1);
        evalSigners[0] = signer1;

        wallet.submitEvaluation(0, 0, 10, 1, evalSigners, 0x03FF);

        // Approve
        vm.prank(signer1);
        wallet.approveTx(0);

        // Execute
        vm.prank(signer1);
        wallet.executeTx(0);

        // Verify audit log entry was created
        assertEq(auditLog.getEntryCount(), 1);
    }

    // ── Integration: governance → policy → wallet ──

    function test_governance_adds_policy_then_wallet_uses_it() public {
        // Add policy through governance
        vm.prank(address(gov));
        registry.addPolicy(
            "Treasury Policy",
            PolicyRegistry.Conditions({
                targetAddresses: new address[](0),
                functionSelectors: new bytes4[](0),
                minValue: 0,
                maxValue: 0,
                timeWindowStart: 0,
                timeWindowEnd: 0,
                requireVerified: true,
                requireErc7730: true
            }),
            PolicyRegistry.Limits({
                maxValuePerTxUsd: 5000e18,
                maxValueDailyUsd: 50000e18,
                allowlist: new address[](0),
                denylist: new address[](0)
            }),
            signers,
            5
        );

        // Verify policy is active
        PolicyRegistry.Policy[] memory active = registry.getActivePolicies();
        assertEq(active.length, 1);
        assertEq(active[0].name, "Treasury Policy");
        assertTrue(active[0].conditions.requireVerified);
        assertTrue(active[0].conditions.requireErc7730);

        // Submit and evaluate a tx
        wallet.submitTransaction{value: 0.5 ether}(address(0xbeef), "", 1);

        address[] memory evalSigners = new address[](2);
        evalSigners[0] = signer1;
        evalSigners[1] = signer2;

        wallet.submitEvaluation(0, 0, 75, 2, evalSigners, 0x00FF);

        // Both signers approve
        vm.prank(signer1);
        wallet.approveTx(0);
        vm.prank(signer2);
        wallet.approveTx(0);

        vm.prank(signer1);
        wallet.executeTx(0);

        assertEq(auditLog.getEntryCount(), 1);
    }
}
