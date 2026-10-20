// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IVNextEvents } from "../interfaces/IVNextEvents.sol";
import { VNextTypes } from "./VNextTypes.sol";

interface IVNextReviewCaseCreator {
    function createReviewCase(
        address creator,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 evidenceRevision,
        uint256 riskValue
    ) external returns (bytes32 reviewCaseId);

    function openAppeal(bytes32 reviewCaseId, address requester)
        external
        returns (bytes32 appealCaseId);

    function openRetry(bytes32 reviewCaseId) external returns (bytes32 retryCaseId);

    function reviewResult(bytes32 reviewCaseId) external view returns (uint8 result);

    function finalOutcome(bytes32 reviewCaseId)
        external
        view
        returns (VNextTypes.ReviewOutcome outcome);

    function settlementComplete(bytes32 reviewCaseId) external view returns (bool);
}

/// @notice Contract-owned campaign and contribution escrow for the VNext pilot.
/// @dev Financial transitions are permissionless and consume only canonical
/// review outcomes. No Resolver or Admin address can approve, redirect, or
/// withdraw contribution funds.
contract CampaignEscrowVNext is ReentrancyGuard, IVNextEvents {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MILESTONE_CORRECTIONS = 1;

    IERC20 public immutable supportedToken;
    IVNextReviewCaseCreator public immutable reviewEngine;
    uint256 public immutable protocolVersion;
    bytes32 public immutable policyHash;
    uint64 public immutable challengeWindowDuration;
    uint64 public immutable milestoneSubmissionWindow;
    uint64 public immutable correctionWindow;

    struct Campaign {
        address creator;
        address payoutWallet;
        bytes32 termsHash;
        uint256 goal;
        uint256 fundingDeadline;
        uint256 raised;
        uint256 paidOut;
        uint256 refunded;
        uint256 refundPool;
        uint256 refundSnapshot;
        uint256 refundAllocationCursor;
        uint256 refundAllocationPrefix;
        bool refundAllocationsFrozen;
        uint256 milestoneCount;
        bytes32 publicationEvidenceHash;
        bytes32 publicationReviewCaseId;
        VNextTypes.ReviewOutcome publicationOutcome;
        VNextTypes.CampaignState state;
    }

    struct Milestone {
        uint256 budget;
        bytes32 acceptanceCriteriaHash;
        uint256 evidenceRevision;
        bytes32 evidenceHash;
        bytes32 reviewCaseId;
        VNextTypes.ReviewOutcome finalOutcome;
        uint256 challengeDeadline;
        uint256 submissionDeadline;
        uint256 correctionDeadline;
        bytes32 challengeReviewCaseId;
        bytes32 challengeEvidenceHash;
        bool challengeOpened;
        uint256 correctionCount;
        VNextTypes.MilestoneState state;
        bool paid;
    }

    uint256 public campaignCount;
    mapping(uint256 => Campaign) private campaigns;
    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;
    mapping(uint256 => mapping(address => uint256)) private contributions;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => address[]) private contributors;
    mapping(uint256 => mapping(address => bool)) private contributorSeen;
    mapping(uint256 => mapping(address => uint256)) private refundEntitlements;

    error InvalidAddress();
    error InvalidTerms();
    error UnknownCampaign();
    error WrongState();
    error FundingStillOpen();
    error FundingClosed();
    error InvalidAmount();
    error ContributionExceedsGoal();
    error NoRefund();
    error RefundAlreadyClaimed();
    error NotCampaignCreator();
    error InvalidEvidence();
    error EvidenceReviewActive();
    error MilestoneAlreadyPaid();
    error ReviewNotFinal();
    error ReviewSettlementPending();
    error FinalRulingAlreadySynced();
    error ChallengeWindowOpen();
    error ChallengeActive();
    error ChallengeNotAllowed();
    error ChallengeNotFinal();
    error PayoutUnavailable();
    error AppealNotAllowed();
    error CorrectionLimitReached();
    error MilestoneDeadlineExpired();
    error RefundAllocationIncomplete();
    error InvalidAllocationBatch();

    constructor(
        address token_,
        address reviewEngine_,
        uint256 protocolVersion_,
        bytes32 policyHash_,
        uint64 challengeWindowDuration_,
        uint64 milestoneSubmissionWindow_,
        uint64 correctionWindow_
    ) {
        if (
            token_ == address(0) || token_.code.length == 0 || reviewEngine_ == address(0)
                || reviewEngine_.code.length == 0
        ) {
            revert InvalidAddress();
        }
        if (
            protocolVersion_ == 0 || policyHash_ == bytes32(0) || challengeWindowDuration_ == 0
                || milestoneSubmissionWindow_ == 0 || correctionWindow_ == 0
        ) {
            revert InvalidTerms();
        }
        supportedToken = IERC20(token_);
        reviewEngine = IVNextReviewCaseCreator(reviewEngine_);
        protocolVersion = protocolVersion_;
        policyHash = policyHash_;
        challengeWindowDuration = challengeWindowDuration_;
        milestoneSubmissionWindow = milestoneSubmissionWindow_;
        correctionWindow = correctionWindow_;
    }

    function createCampaign(
        address payoutWallet,
        uint256 goal,
        uint256 fundingDeadline,
        uint256[] calldata milestoneBudgets,
        bytes32[] calldata acceptanceCriteriaHashes,
        bytes32 publicationEvidenceHash_
    ) external nonReentrant returns (uint256 campaignId) {
        if (payoutWallet == address(0) || goal == 0 || fundingDeadline <= block.timestamp) {
            revert InvalidTerms();
        }
        if (
            milestoneBudgets.length == 0
                || milestoneBudgets.length != acceptanceCriteriaHashes.length
                || publicationEvidenceHash_ == bytes32(0)
        ) revert InvalidTerms();

        uint256 budgetTotal;
        for (uint256 i = 0; i < milestoneBudgets.length; i++) {
            if (milestoneBudgets[i] == 0 || acceptanceCriteriaHashes[i] == bytes32(0)) {
                revert InvalidTerms();
            }
            budgetTotal += milestoneBudgets[i];
        }
        if (budgetTotal != goal) revert InvalidTerms();

        campaignId = campaignCount++;
        bytes32 termsHash = keccak256(
            abi.encode(
                msg.sender,
                payoutWallet,
                goal,
                fundingDeadline,
                milestoneBudgets,
                acceptanceCriteriaHashes,
                publicationEvidenceHash_,
                protocolVersion,
                policyHash,
                challengeWindowDuration,
                milestoneSubmissionWindow,
                correctionWindow
            )
        );
        bytes32 publicationReviewCaseId =
            _createReviewCase(msg.sender, campaignId, type(uint256).max, 1, goal);
        if (publicationReviewCaseId == bytes32(0)) revert InvalidEvidence();
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            payoutWallet: payoutWallet,
            termsHash: termsHash,
            goal: goal,
            fundingDeadline: fundingDeadline,
            raised: 0,
            paidOut: 0,
            refunded: 0,
            refundPool: 0,
            refundSnapshot: 0,
            refundAllocationCursor: 0,
            refundAllocationPrefix: 0,
            refundAllocationsFrozen: false,
            milestoneCount: milestoneBudgets.length,
            publicationEvidenceHash: publicationEvidenceHash_,
            publicationReviewCaseId: publicationReviewCaseId,
            publicationOutcome: VNextTypes.ReviewOutcome.NONE,
            state: VNextTypes.CampaignState.CREATED
        });

        for (uint256 i = 0; i < milestoneBudgets.length; i++) {
            milestones[campaignId][i] = Milestone({
                budget: milestoneBudgets[i],
                acceptanceCriteriaHash: acceptanceCriteriaHashes[i],
                evidenceRevision: 0,
                evidenceHash: bytes32(0),
                reviewCaseId: bytes32(0),
                finalOutcome: VNextTypes.ReviewOutcome.NONE,
                challengeDeadline: 0,
                submissionDeadline: 0,
                correctionDeadline: 0,
                challengeReviewCaseId: bytes32(0),
                challengeEvidenceHash: bytes32(0),
                challengeOpened: false,
                correctionCount: 0,
                state: VNextTypes.MilestoneState.PENDING,
                paid: false
            });
        }

        emit CampaignCreated(
            campaignId,
            msg.sender,
            payoutWallet,
            termsHash,
            goal,
            fundingDeadline,
            publicationEvidenceHash_,
            publicationReviewCaseId,
            protocolVersion
        );
        emit PublicationEvidenceSubmitted(
            campaignId, publicationEvidenceHash_, publicationReviewCaseId
        );
    }

    /// @notice Materializes the publication court's canonical outcome before
    /// any contribution can enter escrow. This transition is permissionless.
    function finalizePublication(uint256 campaignId) external {
        Campaign storage campaign = _campaign(campaignId);
        if (campaign.state != VNextTypes.CampaignState.CREATED) return;

        VNextTypes.ReviewOutcome outcome =
            reviewEngine.finalOutcome(campaign.publicationReviewCaseId);
        if (outcome == VNextTypes.ReviewOutcome.NONE) revert ReviewNotFinal();
        if (!reviewEngine.settlementComplete(campaign.publicationReviewCaseId)) {
            revert ReviewSettlementPending();
        }

        campaign.publicationOutcome = outcome;
        bool successful = outcome == VNextTypes.ReviewOutcome.FINAL_PASS;
        emit PublicationFinalized(campaignId, successful, campaign.publicationReviewCaseId);
        if (successful) {
            campaign.state = VNextTypes.CampaignState.FUNDING;
        } else {
            _openRefunds(campaignId, campaign);
        }
    }

    /// @notice Requests the next bounded publication review attempt after the
    /// current attempt is eligible for retry. No central party can alter the
    /// publication commitment or force the result.
    function retryPublication(uint256 campaignId) external returns (bytes32 reviewCaseId) {
        Campaign storage campaign = _campaign(campaignId);
        if (campaign.state != VNextTypes.CampaignState.CREATED) revert WrongState();
        reviewCaseId = reviewEngine.openRetry(campaign.publicationReviewCaseId);
        campaign.publicationReviewCaseId = reviewCaseId;
        emit PublicationReviewCaseChanged(campaignId, reviewCaseId);
    }

    function contribute(uint256 campaignId, uint256 amount) external nonReentrant {
        Campaign storage campaign = _campaign(campaignId);
        if (campaign.state != VNextTypes.CampaignState.FUNDING) revert WrongState();
        if (block.timestamp >= campaign.fundingDeadline) revert FundingClosed();
        if (amount == 0) revert InvalidAmount();
        if (campaign.raised + amount > campaign.goal) revert ContributionExceedsGoal();

        supportedToken.safeTransferFrom(msg.sender, address(this), amount);
        if (!contributorSeen[campaignId][msg.sender]) {
            contributorSeen[campaignId][msg.sender] = true;
            contributors[campaignId].push(msg.sender);
        }
        contributions[campaignId][msg.sender] += amount;
        campaign.raised += amount;
        emit ContributionReceived(campaignId, msg.sender, amount, campaign.raised);
    }

    /// @notice Permissionless funding transition. Calling after the first
    /// finalization is a safe no-op, which makes retries idempotent.
    function finalizeFunding(uint256 campaignId) external {
        Campaign storage campaign = _campaign(campaignId);
        if (campaign.state != VNextTypes.CampaignState.FUNDING) return;
        if (block.timestamp < campaign.fundingDeadline) revert FundingStillOpen();

        bool successful = campaign.raised == campaign.goal;
        emit FundingFinalized(campaignId, successful, campaign.raised);
        if (successful) {
            campaign.state = VNextTypes.CampaignState.MILESTONES_RUNNING;
            milestones[campaignId][0].submissionDeadline =
                block.timestamp + milestoneSubmissionWindow;
        } else {
            _openRefunds(campaignId, campaign);
        }
    }

    function freezeRefundAllocations(uint256 campaignId, uint256 maxBackers) external {
        Campaign storage campaign = _campaign(campaignId);
        if (campaign.state != VNextTypes.CampaignState.REFUNDING) revert NoRefund();
        if (campaign.refundAllocationsFrozen) return;
        if (maxBackers == 0) revert InvalidAllocationBatch();

        uint256 contributorCount = contributors[campaignId].length;
        uint256 processed;
        while (
            campaign.refundAllocationCursor < contributorCount && processed < maxBackers
        ) {
            address backer = contributors[campaignId][campaign.refundAllocationCursor];
            uint256 prefix = campaign.refundAllocationPrefix + contributions[campaignId][backer];
            refundEntitlements[campaignId][backer] = VNextTypes.refundPrefixShare(
                campaign.refundPool,
                prefix,
                campaign.refundAllocationPrefix,
                campaign.refundSnapshot
            );
            campaign.refundAllocationPrefix = prefix;
            campaign.refundAllocationCursor++;
            processed++;
        }
        if (campaign.refundAllocationCursor == contributorCount) {
            campaign.refundAllocationsFrozen = true;
            emit RefundAllocationsFrozen(campaignId, contributorCount, campaign.refundSnapshot);
        }
    }

    function claimRefund(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = _campaign(campaignId);
        if (campaign.state != VNextTypes.CampaignState.REFUNDING) revert NoRefund();
        if (!campaign.refundAllocationsFrozen) revert RefundAllocationIncomplete();
        if (refundClaimed[campaignId][msg.sender]) revert RefundAlreadyClaimed();

        uint256 contribution = contributions[campaignId][msg.sender];
        if (contribution == 0) revert NoRefund();
        uint256 amount = refundEntitlements[campaignId][msg.sender];
        refundClaimed[campaignId][msg.sender] = true;
        campaign.refunded += amount;

        if (amount > 0) supportedToken.safeTransfer(msg.sender, amount);
        emit BackerRefundClaimed(campaignId, msg.sender, amount);
    }

    /// @notice Binds one immutable evidence revision to one review case.
    /// @dev Acceptance criteria and budget are copied from the frozen campaign
    /// terms and are never supplied by this function.
    function submitMilestoneEvidence(uint256 campaignId, uint256 milestoneId, bytes32 evidenceHash)
        external
        nonReentrant
        returns (bytes32 reviewCaseId)
    {
        Campaign storage campaign = _campaign(campaignId);
        if (msg.sender != campaign.creator) revert NotCampaignCreator();
        if (
            campaign.state != VNextTypes.CampaignState.MILESTONES_RUNNING
        ) revert WrongState();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();

        Milestone storage milestone = _milestone(campaignId, milestoneId);
        bool isCorrection = milestone.state == VNextTypes.MilestoneState.CORRECTION;
        if (milestone.paid) revert MilestoneAlreadyPaid();
        if (
            milestone.state == VNextTypes.MilestoneState.PENDING
                && block.timestamp >= milestone.submissionDeadline
        ) revert MilestoneDeadlineExpired();
        if (
            isCorrection && block.timestamp >= milestone.correctionDeadline
        ) revert MilestoneDeadlineExpired();
        if (
            milestone.state != VNextTypes.MilestoneState.PENDING
                && milestone.state != VNextTypes.MilestoneState.CORRECTION
                && milestone.state != VNextTypes.MilestoneState.RESUBMIT
        ) revert EvidenceReviewActive();
        if (
            milestone.state == VNextTypes.MilestoneState.CORRECTION
                && milestone.correctionCount >= MAX_MILESTONE_CORRECTIONS
        ) revert CorrectionLimitReached();

        uint256 revision = milestone.evidenceRevision + 1;
        reviewCaseId =
            _createReviewCase(campaign.creator, campaignId, milestoneId, revision, milestone.budget);
        if (reviewCaseId == bytes32(0)) revert InvalidEvidence();

        milestone.evidenceRevision = revision;
        milestone.evidenceHash = evidenceHash;
        milestone.reviewCaseId = reviewCaseId;
        milestone.finalOutcome = VNextTypes.ReviewOutcome.NONE;
        milestone.challengeDeadline = 0;
        milestone.submissionDeadline = 0;
        milestone.correctionDeadline = 0;
        milestone.challengeReviewCaseId = bytes32(0);
        milestone.challengeEvidenceHash = bytes32(0);
        milestone.challengeOpened = false;
        if (isCorrection) milestone.correctionCount++;
        milestone.state = VNextTypes.MilestoneState.REVIEW_ENROLLMENT;
        campaign.state = VNextTypes.CampaignState.MILESTONES_RUNNING;

        emit MilestoneEvidenceSubmitted(
            campaignId, milestoneId, revision, evidenceHash, reviewCaseId
        );
        if (revision > 1) {
            emit MilestoneRevisionSubmitted(campaignId, milestoneId, revision, evidenceHash);
        }
        _emitMilestoneReviewState(campaignId, milestoneId, milestone);
    }

    /// @notice Ends a failed milestone after the frozen correction allowance
    /// is exhausted. Anyone may trigger the terminal refund path.
    function finalizeCorrectionFailure(uint256 campaignId, uint256 milestoneId) external {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (
            milestone.state != VNextTypes.MilestoneState.CORRECTION
                || milestone.correctionCount < MAX_MILESTONE_CORRECTIONS
                || block.timestamp < milestone.correctionDeadline
        ) revert CorrectionLimitReached();
        milestone.state = VNextTypes.MilestoneState.TERMINAL;
        _emitMilestoneReviewState(campaignId, milestoneId, milestone);
        _openRefunds(campaignId, campaign);
    }

    function expireMilestoneSubmission(uint256 campaignId, uint256 milestoneId) external {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        bool submissionExpired = milestone.state == VNextTypes.MilestoneState.PENDING
            && milestone.submissionDeadline != 0
            && block.timestamp >= milestone.submissionDeadline;
        bool correctionExpired = milestone.state == VNextTypes.MilestoneState.CORRECTION
            && milestone.correctionDeadline != 0
            && block.timestamp >= milestone.correctionDeadline;
        if (!submissionExpired && !correctionExpired) revert MilestoneDeadlineExpired();

        milestone.state = VNextTypes.MilestoneState.TERMINAL;
        _emitMilestoneReviewState(campaignId, milestoneId, milestone);
        _openRefunds(campaignId, campaign);
    }

    /// @notice Materializes the review engine's canonical final outcome into
    /// the milestone state machine. Anyone may call this synchronization.
    function syncFinalRuling(uint256 campaignId, uint256 milestoneId)
        external
        nonReentrant
        returns (VNextTypes.ReviewOutcome outcome)
    {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestone.reviewCaseId == bytes32(0)) revert ReviewNotFinal();
        if (
            milestone.state != VNextTypes.MilestoneState.REVIEW_ENROLLMENT
                && milestone.state != VNextTypes.MilestoneState.BASE_REVIEW
                && milestone.state != VNextTypes.MilestoneState.PROVISIONAL_RULING
                && milestone.state != VNextTypes.MilestoneState.APPEAL_WINDOW
        ) revert FinalRulingAlreadySynced();

        outcome = reviewEngine.finalOutcome(milestone.reviewCaseId);
        if (outcome == VNextTypes.ReviewOutcome.NONE) {
            uint8 result = reviewEngine.reviewResult(milestone.reviewCaseId);
            if (result == 3 || result == 4) {
                milestone.state = VNextTypes.MilestoneState.RETRY_PENDING;
                _emitMilestoneReviewState(campaignId, milestoneId, milestone);
                return outcome;
            }
            revert ReviewNotFinal();
        }
        if (!reviewEngine.settlementComplete(milestone.reviewCaseId)) {
            revert ReviewSettlementPending();
        }

        milestone.finalOutcome = outcome;
        if (outcome == VNextTypes.ReviewOutcome.FINAL_PASS) {
            milestone.state = VNextTypes.MilestoneState.CHALLENGE_WINDOW;
            milestone.challengeDeadline = block.timestamp + challengeWindowDuration;
        } else if (outcome == VNextTypes.ReviewOutcome.VERDICT_FAIL) {
            milestone.state = VNextTypes.MilestoneState.CORRECTION;
            milestone.correctionDeadline = block.timestamp + correctionWindow;
        } else {
            milestone.state = VNextTypes.MilestoneState.TERMINAL;
            _openRefunds(campaignId, campaign);
        }
        _emitMilestoneReviewState(campaignId, milestoneId, milestone);
    }

    /// @notice Opens the next bounded review attempt after an invalid/tied or
    /// timed-out review. The review engine owns retry eligibility and Judge
    /// pool non-overlap; this contract only moves the milestone pointer.
    function retryMilestoneReview(uint256 campaignId, uint256 milestoneId)
        external
        nonReentrant
        returns (bytes32 reviewCaseId)
    {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (campaign.state == VNextTypes.CampaignState.REFUNDING || milestone.paid) {
            revert WrongState();
        }
        if (
            milestone.state != VNextTypes.MilestoneState.RETRY_PENDING
                && milestone.state != VNextTypes.MilestoneState.REVIEW_ENROLLMENT
                && milestone.state != VNextTypes.MilestoneState.BASE_REVIEW
        ) revert WrongState();

        reviewCaseId = reviewEngine.openRetry(milestone.reviewCaseId);
        milestone.reviewCaseId = reviewCaseId;
        milestone.finalOutcome = VNextTypes.ReviewOutcome.NONE;
        milestone.state = VNextTypes.MilestoneState.REVIEW_ENROLLMENT;
        _emitMilestoneReviewState(campaignId, milestoneId, milestone);
    }

    /// @notice Lets an eligible Backer request the next review round. The
    /// review engine owns bond accounting, Judge non-overlap and round limits.
    function openAppeal(uint256 campaignId, uint256 milestoneId)
        external
        nonReentrant
        returns (bytes32 appealCaseId)
    {
        Campaign storage campaign = _campaign(campaignId);
        if (milestoneId == type(uint256).max) {
            if (
                msg.sender != campaign.creator
                    || reviewEngine.reviewResult(campaign.publicationReviewCaseId) != 2
            ) revert AppealNotAllowed();
            appealCaseId = reviewEngine.openAppeal(campaign.publicationReviewCaseId, msg.sender);
            if (appealCaseId == bytes32(0)) revert AppealNotAllowed();
            campaign.publicationReviewCaseId = appealCaseId;
            emit PublicationReviewCaseChanged(campaignId, appealCaseId);
            return appealCaseId;
        }

        Milestone storage milestone = _milestone(campaignId, milestoneId);
        bool creatorAppeal = msg.sender == campaign.creator
            && reviewEngine.reviewResult(milestone.reviewCaseId) == 2;
        if (!creatorAppeal && contributions[campaignId][msg.sender] == 0) {
            revert AppealNotAllowed();
        }
        if (
            milestone.state != VNextTypes.MilestoneState.REVIEW_ENROLLMENT
                && milestone.state != VNextTypes.MilestoneState.BASE_REVIEW
                && milestone.state != VNextTypes.MilestoneState.PROVISIONAL_RULING
                && milestone.state != VNextTypes.MilestoneState.APPEAL_WINDOW
        ) revert AppealNotAllowed();
        appealCaseId = reviewEngine.openAppeal(milestone.reviewCaseId, msg.sender);
        if (appealCaseId == bytes32(0)) revert AppealNotAllowed();
        milestone.reviewCaseId = appealCaseId;
        milestone.state = VNextTypes.MilestoneState.APPEAL_WINDOW;
        _emitMilestoneReviewState(campaignId, milestoneId, milestone);
    }

    /// @notice Releases exactly the frozen milestone budget after final PASS
    /// and the separate challenge window. No caller-specific authority exists.
    function payMilestone(uint256 campaignId, uint256 milestoneId) external nonReentrant {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (campaign.state == VNextTypes.CampaignState.REFUNDING) revert PayoutUnavailable();
        if (milestone.paid) revert MilestoneAlreadyPaid();
        if (milestone.state != VNextTypes.MilestoneState.CHALLENGE_WINDOW) {
            revert PayoutUnavailable();
        }
        if (block.timestamp < milestone.challengeDeadline) revert ChallengeWindowOpen();
        if (milestone.finalOutcome != VNextTypes.ReviewOutcome.FINAL_PASS) {
            revert PayoutUnavailable();
        }
        if (milestone.challengeOpened) revert ChallengeActive();
        if (campaign.paidOut + milestone.budget > campaign.goal) revert PayoutUnavailable();

        milestone.paid = true;
        milestone.state = VNextTypes.MilestoneState.PAID;
        campaign.paidOut += milestone.budget;
        supportedToken.safeTransfer(campaign.payoutWallet, milestone.budget);
        emit MilestonePaid(campaignId, milestoneId, campaign.payoutWallet, milestone.budget);

        if (campaign.paidOut == _totalMilestoneBudget(campaignId, campaign.milestoneCount)) {
            campaign.state = VNextTypes.CampaignState.COMPLETED;
            emit CampaignCompleted(campaignId);
        } else if (milestoneId + 1 < campaign.milestoneCount) {
            milestones[campaignId][milestoneId + 1].submissionDeadline =
                block.timestamp + milestoneSubmissionWindow;
        }
    }

    /// @notice Challenge review is disabled by the active local policy.
    function openChallenge(uint256 campaignId, uint256 milestoneId, bytes32 challengeEvidenceHash)
        external
        returns (bytes32 challengeCaseId)
    {
        campaignId;
        milestoneId;
        challengeEvidenceHash;
        revert ChallengeNotAllowed();
    }

    /// @notice Challenge resolution is disabled by the active local policy.
    function resolveChallenge(uint256 campaignId, uint256 milestoneId)
        external
        returns (VNextTypes.ReviewOutcome outcome)
    {
        campaignId;
        milestoneId;
        revert ChallengeNotAllowed();
    }

    function campaignCreator(uint256 campaignId) external view returns (address) {
        return _campaign(campaignId).creator;
    }

    function campaignPayoutWallet(uint256 campaignId) external view returns (address) {
        return _campaign(campaignId).payoutWallet;
    }

    function campaignTermsHash(uint256 campaignId) external view returns (bytes32) {
        return _campaign(campaignId).termsHash;
    }

    function campaignGoal(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).goal;
    }

    function campaignRaised(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).raised;
    }

    function campaignPaidOut(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).paidOut;
    }

    function campaignRefunded(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).refunded;
    }

    function campaignRefundPool(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).refundPool;
    }

    function campaignRefundSnapshot(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).refundSnapshot;
    }

    function campaignState(uint256 campaignId) external view returns (VNextTypes.CampaignState) {
        return _campaign(campaignId).state;
    }

    function publicationEvidenceHash(uint256 campaignId) external view returns (bytes32) {
        return _campaign(campaignId).publicationEvidenceHash;
    }

    function publicationReviewCase(uint256 campaignId) external view returns (bytes32) {
        return _campaign(campaignId).publicationReviewCaseId;
    }

    function publicationOutcome(uint256 campaignId)
        external
        view
        returns (VNextTypes.ReviewOutcome)
    {
        return _campaign(campaignId).publicationOutcome;
    }

    function contributionOf(uint256 campaignId, address backer) external view returns (uint256) {
        _campaign(campaignId);
        return contributions[campaignId][backer];
    }

    function refundEntitlement(uint256 campaignId, address backer)
        external
        view
        returns (uint256)
    {
        _campaign(campaignId);
        return refundEntitlements[campaignId][backer];
    }

    function refundAllocationsFrozen(uint256 campaignId) external view returns (bool) {
        return _campaign(campaignId).refundAllocationsFrozen;
    }

    function milestoneSubmissionDeadline(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (uint256)
    {
        return _milestone(campaignId, milestoneId).submissionDeadline;
    }

    function milestoneCorrectionDeadline(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (uint256)
    {
        return _milestone(campaignId, milestoneId).correctionDeadline;
    }

    function milestoneBudget(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (uint256)
    {
        return _milestone(campaignId, milestoneId).budget;
    }

    function milestoneAcceptanceCriteria(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (bytes32)
    {
        return _milestone(campaignId, milestoneId).acceptanceCriteriaHash;
    }

    function milestoneEvidenceRevision(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (uint256)
    {
        return _milestone(campaignId, milestoneId).evidenceRevision;
    }

    function milestoneEvidenceHash(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (bytes32)
    {
        return _milestone(campaignId, milestoneId).evidenceHash;
    }

    function milestoneReviewCase(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (bytes32)
    {
        return _milestone(campaignId, milestoneId).reviewCaseId;
    }

    function milestoneState(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (VNextTypes.MilestoneState)
    {
        return _milestone(campaignId, milestoneId).state;
    }

    function _openRefunds(uint256 campaignId, Campaign storage campaign) private {
        if (campaign.state == VNextTypes.CampaignState.REFUNDING) return;
        campaign.state = VNextTypes.CampaignState.REFUNDING;
        campaign.refundPool = campaign.raised - campaign.paidOut;
        campaign.refundSnapshot = campaign.raised;
        campaign.refundAllocationCursor = 0;
        campaign.refundAllocationPrefix = 0;
        campaign.refundAllocationsFrozen = contributors[campaignId].length == 0;
        emit CampaignRefundsOpened(campaignId, campaign.refundPool, campaign.refundSnapshot);
    }

    function _totalMilestoneBudget(uint256 campaignId, uint256 count)
        private
        view
        returns (uint256 total)
    {
        for (uint256 i = 0; i < count; i++) {
            total += milestones[campaignId][i].budget;
        }
    }

    function _createReviewCase(
        address creator,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 evidenceRevision,
        uint256 riskValue
    ) private returns (bytes32) {
        return reviewEngine.createReviewCase(
            creator, campaignId, milestoneId, evidenceRevision, riskValue
        );
    }

    function _emitMilestoneReviewState(
        uint256 campaignId,
        uint256 milestoneId,
        Milestone storage milestone
    ) private {
        emit MilestoneReviewStateChanged(
            campaignId,
            milestoneId,
            milestone.reviewCaseId,
            uint8(milestone.state),
            uint8(milestone.finalOutcome),
            milestone.challengeDeadline,
            milestone.correctionDeadline
        );
    }

    function _campaign(uint256 campaignId) private view returns (Campaign storage campaign) {
        campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert UnknownCampaign();
    }

    function _milestone(uint256 campaignId, uint256 milestoneId)
        private
        view
        returns (Milestone storage milestone)
    {
        Campaign storage campaign = _campaign(campaignId);
        if (milestoneId >= campaign.milestoneCount) revert InvalidTerms();
        milestone = milestones[campaignId][milestoneId];
    }
}
