// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Shared state and identity primitives for the VNext protocol.
/// @dev This library contains no custody or token-transfer behavior.
library VNextTypes {
    enum CampaignState {
        CREATED,
        FUNDING,
        FUNDED,
        MILESTONES_RUNNING,
        COMPLETED,
        REFUNDING,
        REFUNDING_REMAINDER,
        REFUND_SETTLED
    }

    enum MilestoneState {
        PENDING,
        SUBMITTED,
        REVIEW_ENROLLMENT,
        BASE_REVIEW,
        RETRY_PENDING,
        PROVISIONAL_RULING,
        APPEAL_WINDOW,
        FINAL_RULING,
        PAYABLE,
        CHALLENGE_WINDOW,
        PAID,
        CORRECTION,
        RESUBMIT,
        TERMINAL
    }

    enum ReviewOutcome {
        NONE,
        FINAL_PASS,
        VERDICT_FAIL,
        PROTOCOL_FAIL,
        TIED,
        INVALID
    }

    /// @notice Returns true only for a settled substantive PASS that has
    /// cleared both appeal and challenge conditions and has not paid before.
    function payoutEligible(
        MilestoneState milestoneState,
        ReviewOutcome outcome,
        bool appealClosed,
        bool challengeClosed,
        bool alreadyPaid
    ) internal pure returns (bool) {
        bool releaseState = milestoneState == MilestoneState.PAYABLE
            || milestoneState == MilestoneState.CHALLENGE_WINDOW;

        return releaseState && outcome == ReviewOutcome.FINAL_PASS && appealClosed
            && challengeClosed && !alreadyPaid;
    }

    /// @notice A protocol failure is operational and has no winning factual
    /// side for coherence slashing.
    function isSubstantive(ReviewOutcome outcome) internal pure returns (bool) {
        return outcome == ReviewOutcome.FINAL_PASS || outcome == ReviewOutcome.VERDICT_FAIL;
    }

    function requiredCaseStake(uint256 minimumStakeFloor, uint256 riskMultiplierBps, uint256 riskValue)
        internal
        pure
        returns (uint256)
    {
        uint256 riskStake = (riskValue * riskMultiplierBps + 9_999) / 10_000;
        return riskStake > minimumStakeFloor ? riskStake : minimumStakeFloor;
    }

    function refundPrefixShare(
        uint256 refundPool,
        uint256 prefixContribution,
        uint256 previousPrefixContribution,
        uint256 refundSnapshot
    ) internal pure returns (uint256) {
        return refundPool * prefixContribution / refundSnapshot
            - refundPool * previousPrefixContribution / refundSnapshot;
    }

    /// @notice Stable identity for one review revision and round. Vote
    /// commitments add the chain, address, vote and salt around this identity.
    function reviewKey(
        uint256 campaignId,
        uint256 milestoneId,
        uint256 evidenceRevision,
        uint256 reviewCaseId,
        uint256 roundId,
        uint256 courtId,
        uint256 policyVersion
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                campaignId,
                milestoneId,
                evidenceRevision,
                reviewCaseId,
                roundId,
                courtId,
                policyVersion
            )
        );
    }
}
