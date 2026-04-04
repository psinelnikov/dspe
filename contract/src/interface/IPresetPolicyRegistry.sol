// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPresetPolicyRegistry {
    function presetName(uint256 _id) external view returns (string memory);
    function presetTargetAddresses(uint256 _id) external view returns (address[] memory);
    function presetFunctionSelectors(uint256 _id) external view returns (bytes4[] memory);
    function presetMinValue(uint256 _id) external view returns (uint256);
    function presetMaxValue(uint256 _id) external view returns (uint256);
    function presetTimeWindowStart(uint256 _id) external view returns (uint256);
    function presetTimeWindowEnd(uint256 _id) external view returns (uint256);
    function presetRequireVerified(uint256 _id) external view returns (bool);
    function presetRequireErc7730(uint256 _id) external view returns (bool);
    function presetMaxValuePerTxUsd(uint256 _id) external view returns (uint256);
    function presetMaxValueDailyUsd(uint256 _id) external view returns (uint256);
    function presetAllowlist(uint256 _id) external view returns (address[] memory);
    function presetDenylist(uint256 _id) external view returns (address[] memory);
    function presetRiskWeight(uint256 _id) external view returns (uint8);
    function getPresetCount() external view returns (uint256);
}
