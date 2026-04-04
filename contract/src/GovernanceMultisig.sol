// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract GovernanceMultisig is Initializable {
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        address target;
        bytes data;
        string description;
        uint256 approvalCount;
        bool executed;
        uint256 createdAt;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    modifier onlySigner() {
        require(isSigner[msg.sender], "Not a signer");
        _;
    }

    function initialize(address[] calldata _signers) external initializer {
        require(_signers.length > 0, "Need signers");
        for (uint256 i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "Zero address");
            require(!isSigner[_signers[i]], "Duplicate signer");
            signers.push(_signers[i]);
            isSigner[_signers[i]] = true;
        }
    }

    constructor() {}

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }

    function getProposal(uint256 _id) external view returns (Proposal memory) {
        return proposals[_id];
    }

    function propose(
        address _target,
        bytes calldata _data,
        string calldata _description
    ) external onlySigner returns (uint256) {
        uint256 id = proposalCount++;
        Proposal storage p = proposals[id];
        p.id = id;
        p.target = _target;
        p.data = _data;
        p.description = _description;
        p.approvalCount = 1;
        p.createdAt = block.number;
        hasApproved[id][msg.sender] = true;
        return id;
    }

    function approve(uint256 _proposalId) external onlySigner {
        Proposal storage p = proposals[_proposalId];
        require(!p.executed, "Already executed");
        require(!hasApproved[_proposalId][msg.sender], "Already approved");
        hasApproved[_proposalId][msg.sender] = true;
        p.approvalCount++;
    }

    function execute(uint256 _proposalId) external onlySigner {
        Proposal storage p = proposals[_proposalId];
        require(!p.executed, "Already executed");
        require(p.approvalCount == signers.length, "Not all signers approved");
        p.executed = true;
        (bool success, ) = p.target.call(p.data);
        require(success, "Execution failed");
    }
}
