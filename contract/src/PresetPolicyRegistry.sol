// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interface/IPresetPolicyRegistry.sol";

contract PresetPolicyRegistry is IPresetPolicyRegistry {
    struct PresetTemplate {
        string name;
        address[] targetAddresses;
        bytes4[] functionSelectors;
        uint256 minValue;
        uint256 maxValue;
        uint256 timeWindowStart;
        uint256 timeWindowEnd;
        bool requireVerified;
        bool requireErc7730;
        uint256 maxValuePerTxUsd;
        uint256 maxValueDailyUsd;
        address[] allowlist;
        address[] denylist;
        uint8 riskWeight;
    }

    PresetTemplate[] internal _presets;

    constructor() {
        _presets.push(PresetTemplate({
            name: "Low-Value Transfer",
            targetAddresses: new address[](0),
            functionSelectors: new bytes4[](0),
            minValue: 0,
            maxValue: type(uint256).max,
            timeWindowStart: 0,
            timeWindowEnd: type(uint256).max,
            requireVerified: false,
            requireErc7730: false,
            maxValuePerTxUsd: 1_000e18,
            maxValueDailyUsd: 10_000e18,
            allowlist: new address[](0),
            denylist: new address[](0),
            riskWeight: 2
        }));

        _presets.push(PresetTemplate({
            name: "High-Value Transfer",
            targetAddresses: new address[](0),
            functionSelectors: new bytes4[](0),
            minValue: 1_000e18,
            maxValue: type(uint256).max,
            timeWindowStart: 0,
            timeWindowEnd: type(uint256).max,
            requireVerified: false,
            requireErc7730: false,
            maxValuePerTxUsd: 50_000e18,
            maxValueDailyUsd: 100_000e18,
            allowlist: new address[](0),
            denylist: new address[](0),
            riskWeight: 5
        }));

        _presets.push(PresetTemplate({
            name: "Treasury Management",
            targetAddresses: new address[](0),
            functionSelectors: new bytes4[](0),
            minValue: 0,
            maxValue: type(uint256).max,
            timeWindowStart: 0,
            timeWindowEnd: type(uint256).max,
            requireVerified: true,
            requireErc7730: true,
            maxValuePerTxUsd: type(uint256).max,
            maxValueDailyUsd: type(uint256).max,
            allowlist: new address[](0),
            denylist: new address[](0),
            riskWeight: 9
        }));

        _presets.push(PresetTemplate({
            name: "DeFi Interaction",
            targetAddresses: new address[](0),
            functionSelectors: new bytes4[](0),
            minValue: 0,
            maxValue: type(uint256).max,
            timeWindowStart: 0,
            timeWindowEnd: type(uint256).max,
            requireVerified: false,
            requireErc7730: false,
            maxValuePerTxUsd: 25_000e18,
            maxValueDailyUsd: 250_000e18,
            allowlist: new address[](0),
            denylist: new address[](0),
            riskWeight: 6
        }));
    }

    function presetName(uint256 _id) external view override returns (string memory) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].name;
    }

    function presetTargetAddresses(uint256 _id) external view override returns (address[] memory) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].targetAddresses;
    }

    function presetFunctionSelectors(uint256 _id) external view override returns (bytes4[] memory) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].functionSelectors;
    }

    function presetMinValue(uint256 _id) external view override returns (uint256) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].minValue;
    }

    function presetMaxValue(uint256 _id) external view override returns (uint256) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].maxValue;
    }

    function presetTimeWindowStart(uint256 _id) external view override returns (uint256) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].timeWindowStart;
    }

    function presetTimeWindowEnd(uint256 _id) external view override returns (uint256) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].timeWindowEnd;
    }

    function presetRequireVerified(uint256 _id) external view override returns (bool) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].requireVerified;
    }

    function presetRequireErc7730(uint256 _id) external view override returns (bool) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].requireErc7730;
    }

    function presetMaxValuePerTxUsd(uint256 _id) external view override returns (uint256) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].maxValuePerTxUsd;
    }

    function presetMaxValueDailyUsd(uint256 _id) external view override returns (uint256) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].maxValueDailyUsd;
    }

    function presetAllowlist(uint256 _id) external view override returns (address[] memory) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].allowlist;
    }

    function presetDenylist(uint256 _id) external view override returns (address[] memory) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].denylist;
    }

    function presetRiskWeight(uint256 _id) external view override returns (uint8) {
        require(_id < _presets.length, "Preset not found");
        return _presets[_id].riskWeight;
    }

    function getPresetCount() external view override returns (uint256) {
        return _presets.length;
    }
}
