// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Canonical event vocabulary for the VNext Campaign/Jury protocol.
/// @dev Financial truth remains in the emitting contract; this interface only
/// fixes names and indexed identifiers for the idempotent indexer.
interface IVNextEvents {
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address payoutWallet,
        bytes32 commitmentHash,
        uint256 goal,
        uint256 fundingDeadline,
        bytes32 publicationEvidenceHash,
        bytes32 publicationReviewCaseId,
        uint256 policyVersion
    );

    event ContributionReceived(
        uint256 indexed campaignId, address indexed backer, uint256 amount, uint256 cumulativeRaised
    );

    event FundingFinalized(uint256 indexed campaignId, bool successful, uint256 raised);

    event PublicationEvidenceSubmitted(
        uint256 indexed campaignId, bytes32 evidenceHash, bytes32 reviewCaseId
    );

    event PublicationFinalized(uint256 indexed campaignId, bool successful, bytes32 reviewCaseId);

    event MilestoneEvidenceSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        uint256 evidenceRevision,
        bytes32 evidenceHash,
        bytes32 reviewCaseId
    );

    event JudgeStakeDeposited(address indexed judge, uint256 amount, uint256 totalDeposited);

    event CaseRegistered(
        bytes32 indexed reviewCaseId,
        bytes32 indexed poolId,
        uint256 enrollmentDeadline,
        uint256 requiredCaseStake
    );

    event UnenrolledCaseStakeReleased(
        bytes32 indexed reviewCaseId, address indexed judge, uint256 amount
    );

    event JudgeEnrolled(
        bytes32 indexed reviewCaseId,
        address indexed judge,
        bytes32 indexed poolId,
        uint256 caseStake
    );

    event JurySnapshotFinalized(
        bytes32 indexed reviewCaseId,
        uint256 snapshotBlock,
        uint256 eligibleCount,
        bytes32 randomnessRequestId
    );

    event CourtAssigned(
        bytes32 indexed reviewCaseId,
        uint256 indexed roundId,
        uint256 indexed courtId,
        address judgeOne,
        address judgeTwo,
        address judgeThree
    );

    event VoteCommitted(
        bytes32 indexed reviewCaseId,
        uint256 indexed roundId,
        uint256 indexed courtId,
        address judge,
        bytes32 commitment
    );

    event VoteRevealed(
        bytes32 indexed reviewCaseId,
        uint256 indexed roundId,
        uint256 indexed courtId,
        address judge,
        uint8 vote
    );

    event CourtFinalized(
        bytes32 indexed reviewCaseId,
        uint256 indexed roundId,
        uint256 indexed courtId,
        uint8 outcome
    );

    event ReviewRoundFinalized(
        bytes32 indexed reviewCaseId,
        uint256 indexed roundId,
        uint8 outcome,
        uint256 passCourts,
        uint256 failCourts
    );

    event ReviewRetryOpened(
        bytes32 indexed rootCaseId, uint256 indexed retryRoundId, bytes32 indexed reviewCaseId
    );

    event AppealOpened(
        bytes32 indexed reviewCaseId,
        bytes32 indexed appealCaseId,
        uint256 indexed appealRoundId,
        address requester,
        uint256 bond
    );

    event AppealRoundFinalized(
        bytes32 indexed reviewCaseId, uint256 indexed appealRoundId, uint8 outcome
    );

    event FinalRulingEstablished(bytes32 indexed reviewCaseId, uint8 outcome);

    event ReviewCaseCreated(
        bytes32 indexed reviewCaseId,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        uint256 evidenceRevision,
        address creator,
        uint256 riskValue,
        uint256 requiredCaseStake
    );

    event ReviewCaseSettled(
        bytes32 indexed reviewCaseId, uint8 outcome, uint256 totalSlash, uint256 winners
    );

    event ReviewSettlementProgress(
        bytes32 indexed reviewCaseId,
        uint8 outcome,
        uint256 phase,
        uint256 cursor,
        uint256 enrolledCount,
        bool complete
    );

    event JudgeSlashed(bytes32 indexed reviewCaseId, address indexed judge, uint256 amount);

    event JudgeRewardClaimed(bytes32 indexed reviewCaseId, address indexed judge, uint256 amount);

    event MilestoneRevisionSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        uint256 evidenceRevision,
        bytes32 evidenceHash
    );

    /// @notice Canonical milestone state after a permissionless review
    /// transition. The indexer must not infer this state from a database row
    /// or from a Judge vote event alone.
    event MilestoneReviewStateChanged(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 indexed reviewCaseId,
        uint8 state,
        uint8 outcome,
        uint256 challengeDeadline,
        uint256 correctionDeadline
    );

    event PublicationReviewCaseChanged(
        uint256 indexed campaignId, bytes32 indexed reviewCaseId
    );

    event MilestonePaid(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address indexed creator,
        uint256 amount
    );

    event CampaignRefundsOpened(
        uint256 indexed campaignId, uint256 refundPool, uint256 contributionSnapshot
    );

    event RefundAllocationsFrozen(
        uint256 indexed campaignId, uint256 contributorCount, uint256 refundSnapshot
    );

    event ChallengeOpened(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 indexed challengeCaseId,
        address challenger,
        bytes32 evidenceHash
    );

    event ChallengeResolved(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 indexed challengeCaseId,
        uint8 outcome
    );

    event BackerRefundClaimed(uint256 indexed campaignId, address indexed backer, uint256 amount);

    event CampaignCompleted(uint256 indexed campaignId);
}
