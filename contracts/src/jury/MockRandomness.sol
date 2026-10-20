// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Deterministic randomness adapter for the disposable Anvil pilot.
/// @dev This contract is intentionally not a production randomness primitive.
contract MockRandomness {
    mapping(bytes32 => bytes32) private overrides;

    function setSeed(bytes32 reviewCaseId, bytes32 seed) external {
        require(seed != bytes32(0), "seed required");
        overrides[reviewCaseId] = seed;
    }

    function randomSeed(bytes32 reviewCaseId) external view returns (bytes32) {
        bytes32 configured = overrides[reviewCaseId];
        return configured == bytes32(0)
            ? keccak256(abi.encode("fundtogether-vnext-local-randomness", reviewCaseId))
            : configured;
    }
}
