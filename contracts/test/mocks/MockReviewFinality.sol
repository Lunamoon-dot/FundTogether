// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { VNextTypes } from "../../src/campaigns/VNextTypes.sol";

/// @dev Test-only review boundary. Production escrow reads the real JuryReview
/// contract through the same small interface.
contract MockReviewFinality {
    uint256 private nextCase;
    mapping(bytes32 => VNextTypes.ReviewOutcome) public finalOutcome;
    mapping(bytes32 => uint8) public reviewResults;
    mapping(bytes32 => bool) public settlementCompleteOverride;
    mapping(bytes32 => bool) public settlementCompleteOverrideSet;

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

    function setSettlementComplete(bytes32 reviewCaseId, bool complete) external {
        settlementCompleteOverride[reviewCaseId] = complete;
        settlementCompleteOverrideSet[reviewCaseId] = true;
    }

    function setReviewResult(bytes32 reviewCaseId, uint8 result) external {
        reviewResults[reviewCaseId] = result;
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

    function reviewResult(bytes32 reviewCaseId) external view returns (uint8 result) {
        return reviewResults[reviewCaseId];
    }

    function settlementComplete(bytes32 reviewCaseId) external view returns (bool) {
        if (settlementCompleteOverrideSet[reviewCaseId]) {
            return settlementCompleteOverride[reviewCaseId];
        }
        return finalOutcome[reviewCaseId] != VNextTypes.ReviewOutcome.NONE;
    }
}
