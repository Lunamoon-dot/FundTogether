// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { VNextTypes } from "../../src/campaigns/VNextTypes.sol";

/// @dev Test-only review boundary. Production escrow reads the real JuryReview
/// contract through the same small interface.
contract MockReviewFinality {
    uint256 private nextCase;
    mapping(bytes32 => VNextTypes.ReviewOutcome) public finalOutcome;

    function createReviewCase(
        address,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 evidenceRevision,
        uint256
    ) external returns (bytes32 reviewCaseId) {
        reviewCaseId = keccak256(
            abi.encode(msg.sender, campaignId, milestoneId, evidenceRevision, nextCase++)
        );
    }

    function setFinalOutcome(bytes32 reviewCaseId, VNextTypes.ReviewOutcome outcome) external {
        finalOutcome[reviewCaseId] = outcome;
    }

    function openAppeal(bytes32 reviewCaseId, address requester)
        external
        returns (bytes32 appealCaseId)
    {
        appealCaseId = keccak256(abi.encode(reviewCaseId, requester, nextCase++));
    }

    function openRetry(bytes32 reviewCaseId) external returns (bytes32 retryCaseId) {
        retryCaseId = keccak256(abi.encode(reviewCaseId, bytes32("RETRY"), nextCase++));
    }

    function reviewResult(bytes32) external pure returns (uint8 result) {
        return result;
    }
}
