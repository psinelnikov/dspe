export const GOVERNANCE_MULTISIG_ABI = [
  {
    type: "function",
    name: "getSigners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "getSignerCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getProposal",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "target", type: "address" },
          { name: "data", type: "bytes" },
          { name: "description", type: "string" },
          { name: "approvalCount", type: "uint256" },
          { name: "executed", type: "bool" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "proposalCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "propose",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_target", type: "address" },
      { name: "_data", type: "bytes" },
      { name: "_description", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "_proposalId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ name: "_proposalId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "hasApproved",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const POLICY_REGISTRY_ABI = [
  {
    type: "function",
    name: "getPolicyCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPolicy",
    stateMutability: "view",
    inputs: [{ name: "_index", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "name", type: "string" },
          { name: "active", type: "bool" },
          {
            name: "conditions",
            type: "tuple",
            components: [
              { name: "targetAddresses", type: "address[]" },
              { name: "functionSelectors", type: "bytes4[]" },
              { name: "minValue", type: "uint256" },
              { name: "maxValue", type: "uint256" },
              { name: "timeWindowStart", type: "uint256" },
              { name: "timeWindowEnd", type: "uint256" },
              { name: "requireVerified", type: "bool" },
              { name: "requireErc7730", type: "bool" },
            ],
          },
          {
            name: "limits",
            type: "tuple",
            components: [
              { name: "maxValuePerTxUsd", type: "uint256" },
              { name: "maxValueDailyUsd", type: "uint256" },
              { name: "allowlist", type: "address[]" },
              { name: "denylist", type: "address[]" },
            ],
          },
          { name: "signers", type: "address[]" },
          { name: "riskWeight", type: "uint8" },
          { name: "createdAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getActivePolicies",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "id", type: "uint256" },
          { name: "name", type: "string" },
          { name: "active", type: "bool" },
          {
            name: "conditions",
            type: "tuple",
            components: [
              { name: "targetAddresses", type: "address[]" },
              { name: "functionSelectors", type: "bytes4[]" },
              { name: "minValue", type: "uint256" },
              { name: "maxValue", type: "uint256" },
              { name: "timeWindowStart", type: "uint256" },
              { name: "timeWindowEnd", type: "uint256" },
              { name: "requireVerified", type: "bool" },
              { name: "requireErc7730", type: "bool" },
            ],
          },
          {
            name: "limits",
            type: "tuple",
            components: [
              { name: "maxValuePerTxUsd", type: "uint256" },
              { name: "maxValueDailyUsd", type: "uint256" },
              { name: "allowlist", type: "address[]" },
              { name: "denylist", type: "address[]" },
            ],
          },
          { name: "signers", type: "address[]" },
          { name: "riskWeight", type: "uint8" },
          { name: "createdAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "addPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_name", type: "string" },
      {
        name: "_conditions",
        type: "tuple",
        components: [
          { name: "targetAddresses", type: "address[]" },
          { name: "functionSelectors", type: "bytes4[]" },
          { name: "minValue", type: "uint256" },
          { name: "maxValue", type: "uint256" },
          { name: "timeWindowStart", type: "uint256" },
          { name: "timeWindowEnd", type: "uint256" },
          { name: "requireVerified", type: "bool" },
          { name: "requireErc7730", type: "bool" },
        ],
      },
      {
        name: "_limits",
        type: "tuple",
        components: [
          { name: "maxValuePerTxUsd", type: "uint256" },
          { name: "maxValueDailyUsd", type: "uint256" },
          { name: "allowlist", type: "address[]" },
          { name: "denylist", type: "address[]" },
        ],
      },
      { name: "_signers", type: "address[]" },
      { name: "_riskWeight", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const AUDIT_LOG_ABI = [
  {
    type: "function",
    name: "getEntryCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getEntry",
    stateMutability: "view",
    inputs: [{ name: "_index", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "evaluationId", type: "bytes32" },
          { name: "policyId", type: "uint256" },
          { name: "policyName", type: "string" },
          { name: "riskScore", type: "uint8" },
          { name: "checkResults", type: "uint16" },
          { name: "requiredSigners", type: "uint8" },
          { name: "totalSigners", type: "uint8" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getEntriesByPolicy",
    stateMutability: "view",
    inputs: [{ name: "_policyId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "evaluationId", type: "bytes32" },
          { name: "policyId", type: "uint256" },
          { name: "policyName", type: "string" },
          { name: "riskScore", type: "uint8" },
          { name: "checkResults", type: "uint16" },
          { name: "requiredSigners", type: "uint8" },
          { name: "totalSigners", type: "uint8" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
] as const;
