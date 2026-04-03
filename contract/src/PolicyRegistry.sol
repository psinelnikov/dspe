// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PolicyRegistry {
    address public governanceMultisig;

    struct Conditions {
        address[] targetAddresses;
        bytes4[] functionSelectors;
        uint256 minValue;
        uint256 maxValue;
        uint256 timeWindowStart;
        uint256 timeWindowEnd;
        bool requireVerified;
        bool requireErc7730;
    }

    struct Limits {
        uint256 maxValuePerTxUsd;
        uint256 maxValueDailyUsd;
        address[] allowlist;
        address[] denylist;
    }

    struct Policy {
        uint256 id;
        string name;
        bool active;
        Conditions conditions;
        Limits limits;
        address[] signers;
        uint8 riskWeight;
        uint256 createdAt;
        uint256 updatedAt;
    }

    Policy[] public policies;
    uint256 public nextPolicyId;

    modifier onlyGovernance() {
        require(msg.sender == governanceMultisig, "Only governance multisig");
        _;
    }

    constructor(address _governanceMultisig) {
        governanceMultisig = _governanceMultisig;
    }

    function getPolicyCount() external view returns (uint256) {
        return policies.length;
    }

    function getPolicy(uint256 _index) external view returns (Policy memory) {
        return policies[_index];
    }

    function getActivePolicies() external view returns (Policy[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].active) count++;
        }
        Policy[] memory active = new Policy[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].active) {
                active[j++] = policies[i];
            }
        }
        return active;
    }

    function getPolicySigners(uint256 _policyId) external view returns (address[] memory) {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) return policies[i].signers;
        }
        revert("Policy not found");
    }

    function getPolicyLimits(uint256 _policyId) external view returns (Limits memory) {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) return policies[i].limits;
        }
        revert("Policy not found");
    }

    function addPolicy(
        string calldata _name,
        Conditions calldata _conditions,
        Limits calldata _limits,
        address[] calldata _signers,
        uint8 _riskWeight
    ) external onlyGovernance returns (uint256) {
        require(_signers.length > 0, "Must have signers");
        require(_riskWeight >= 1 && _riskWeight <= 10, "Weight 1-10");

        uint256 id = nextPolicyId++;
        policies.push();
        Policy storage p = policies[policies.length - 1];
        p.id = id;
        p.name = _name;
        p.active = true;
        p.conditions = _conditions;
        p.limits = _limits;
        p.signers = _signers;
        p.riskWeight = _riskWeight;
        p.createdAt = block.number;
        p.updatedAt = block.number;
        return id;
    }

    function updatePolicy(
        uint256 _policyId,
        string calldata _name,
        Conditions calldata _conditions,
        Limits calldata _limits,
        address[] calldata _signers,
        uint8 _riskWeight
    ) external onlyGovernance {
        require(_signers.length > 0, "Must have signers");
        require(_riskWeight >= 1 && _riskWeight <= 10, "Weight 1-10");
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].name = _name;
                policies[i].conditions = _conditions;
                policies[i].limits = _limits;
                policies[i].signers = _signers;
                policies[i].riskWeight = _riskWeight;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }

    function deactivatePolicy(uint256 _policyId) external onlyGovernance {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].active = false;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }

    function reactivatePolicy(uint256 _policyId) external onlyGovernance {
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].id == _policyId) {
                policies[i].active = true;
                policies[i].updatedAt = block.number;
                return;
            }
        }
        revert("Policy not found");
    }
}
