pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

library V2FundingTypes {
    enum MilestoneState {
        DECLARED,
        FUNDING_OPEN,
        FUNDED,
        REFUNDING,
        PAID
    }

    struct PolicyManifest {
        string commitmentSchemaVersion;
        string policyVersion;
        string supersedesCandidate;
        string policyStatus;
        string pr1FixtureDeploymentIdentity;
        string asset;
        uint256 tokenDecimals;
        bytes32 policyManifestHash;
        uint256 chainId;
        address token;
        address creator;
        address payoutWallet;
        string publicationPolicy;
        string evidenceDisclosurePolicy;
        string daoFormulaVersion;
        uint256 daoParticipationThresholdBps;
        string daoTiePolicy;
        string daoEmptyElectoratePolicy;
        string daoSnapshot;
        string daoContributionCapUnits;
        string daoTotalWeightArithmetic;
        string daoConflictPolicyVersion;
        bool daoExcludeAssignedBeforeOpen;
        string daoExcludedAssignmentHistory;
        string court2SelectionAfter;
        bool court2ExcludeCourt1Judges;
        string court2ExcludeDaoVoters;
        bool daoRetroactiveVoteChanges;
        string resetPolicyVersion;
        string resetDisruptionAllowanceUnits;
        string resetFinalizationAllowanceUnits;
        string resetFinalizationAllowanceMinimumUnits;
        string resetCostMaxUnits;
        string resetFixtureCaseStakeRequirementUnits;
        string requiredLockedStakeRule;
        string resetOffenderAllocation;
        string resetRecipients;
        string actualCostReimbursementCapUnits;
        string resetFundingSource;
        uint256 publicationRewardRateBps;
        string refundDustPolicy;
        string rewardRounding;
        uint256 rewardRateBps;
        uint256 basisPointsDenominator;
        uint256 referenceCourtSize;
        uint256 maxValidCourts;
        uint256 maxResetsPerCourt;
        uint256 maxResetsPerCase;
        string[] lockedParameters;
        string[] pendingParameterGroups;
    }

    struct CampaignCommitment {
        PolicyManifest policyManifest;
        uint256[] milestoneId;
        bytes32[] deliverableCommitment;
        bytes32[] acceptanceCriteriaHash;
        uint256[] fundingTarget;
        uint256[] creatorPayoutBudget;
        uint256[] judgeRewardRateBps;
        uint256[] judgeRewardUnit;
        uint256[] maxReviewReserve;
        uint256[] submissionDeadline;
        uint256[] fundingDeadline;
    }
}

/// @notice Isolated, test-only V2 funding fixture. It is not deployment or user-funding code.
contract V2FundingFixture is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant DEPLOYMENT_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr1-funding-fixture");

    IERC20 public immutable token;
    bytes32 public immutable deploymentIdentity;
    uint256 public nextCampaignId;

    struct Campaign {
        bytes32 commitmentHash;
        string policyVersion;
        address creator;
        address payoutWallet;
        uint256 activeMilestoneId;
        uint256 milestoneCount;
    }

    struct Milestone {
        uint256 milestoneId;
        bytes32 deliverableCommitment;
        bytes32 acceptanceCriteriaHash;
        uint256 fundingTarget;
        uint256 creatorPayoutBudget;
        uint256 judgeRewardRateBps;
        uint256 judgeRewardUnit;
        uint256 maxReviewReserve;
        uint256 submissionDeadline;
        uint256 fundingDeadline;
        V2FundingTypes.MilestoneState state;
    }

    mapping(uint256 => Campaign) private campaigns;
    mapping(uint256 => V2FundingTypes.PolicyManifest) private policyManifests;
    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;

    mapping(uint256 => mapping(uint256 => uint256)) public raised;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public contributionOf;
    mapping(uint256 => mapping(uint256 => uint256)) public refundSnapshot;
    mapping(uint256 => mapping(uint256 => uint256)) public refunded;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public refundClaimed;

    uint256 private contributionSequence;
    uint256 private fundingTransitionSequence;
    uint256 private refundSequence;

    error InvalidCommitment();
    error CampaignNotFound();
    error InvalidMilestone();
    error NotActiveMilestone();
    error FundingNotOpen();
    error FundingDeadlinePassed();
    error ZeroContribution();
    error OverTarget();
    error FundingAlreadySucceeded();
    error FundingDeadlineNotReached();
    error RefundNotOpen();
    error NoRefundAvailable();
    error RefundAlreadyClaimed();
    error PreviousMilestoneNotPaid();
    error MilestoneAlreadyActive();
    error UnsupportedTokenTransfer();

    event CampaignCreated(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        bytes32 commitmentHash,
        string policyVersion,
        address indexed creator,
        uint256 milestoneCount
    );

    event MilestoneFundingOpened(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        uint256 target,
        uint256 deadline
    );

    event MilestoneContributionReceived(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address backer,
        uint256 amount,
        uint256 cumulative,
        uint256 contributionSequence
    );

    event MilestoneFundingFinalized(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bool successful,
        uint256 raised,
        uint256 refundSnapshot,
        uint256 transitionSequence
    );

    event MilestoneRefundClaimed(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address backer,
        uint256 amount,
        uint256 refundSequence
    );

    constructor(IERC20 token_, bytes32 deploymentIdentity_) {
        if (address(token_) == address(0) || deploymentIdentity_ != DEPLOYMENT_IDENTITY) {
            revert InvalidCommitment();
        }
        token = token_;
        deploymentIdentity = deploymentIdentity_;
    }

    function createCampaign(V2FundingTypes.CampaignCommitment calldata commitment)
        external
        returns (uint256 campaignId)
    {
        _validateCommitment(commitment);

        campaignId = ++nextCampaignId;
        campaigns[campaignId] = Campaign({
            commitmentHash: _commitmentHash(commitment),
            policyVersion: commitment.policyManifest.policyVersion,
            creator: commitment.policyManifest.creator,
            payoutWallet: commitment.policyManifest.payoutWallet,
            activeMilestoneId: 0,
            milestoneCount: commitment.milestoneId.length
        });
        policyManifests[campaignId] = commitment.policyManifest;

        for (uint256 i = 0; i < commitment.milestoneId.length; i++) {
            milestones[campaignId][i] = Milestone({
                milestoneId: commitment.milestoneId[i],
                deliverableCommitment: commitment.deliverableCommitment[i],
                acceptanceCriteriaHash: commitment.acceptanceCriteriaHash[i],
                fundingTarget: commitment.fundingTarget[i],
                creatorPayoutBudget: commitment.creatorPayoutBudget[i],
                judgeRewardRateBps: commitment.judgeRewardRateBps[i],
                judgeRewardUnit: commitment.judgeRewardUnit[i],
                maxReviewReserve: commitment.maxReviewReserve[i],
                submissionDeadline: commitment.submissionDeadline[i],
                fundingDeadline: commitment.fundingDeadline[i],
                state: i == 0
                    ? V2FundingTypes.MilestoneState.FUNDING_OPEN
                    : V2FundingTypes.MilestoneState.DECLARED
            });
        }

        emit CampaignCreated(
            deploymentIdentity,
            campaignId,
            campaigns[campaignId].commitmentHash,
            campaigns[campaignId].policyVersion,
            campaigns[campaignId].creator,
            campaigns[campaignId].milestoneCount
        );
        emit MilestoneFundingOpened(
            deploymentIdentity,
            campaignId,
            0,
            commitment.fundingTarget[0],
            commitment.fundingDeadline[0]
        );
    }

    function contribute(uint256 campaignId, uint256 milestoneId, uint256 amount)
        external
        nonReentrant
    {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestoneId != campaign.activeMilestoneId) revert NotActiveMilestone();
        if (milestone.state != V2FundingTypes.MilestoneState.FUNDING_OPEN) {
            revert FundingNotOpen();
        }
        if (block.timestamp >= milestone.fundingDeadline) revert FundingDeadlinePassed();
        if (amount == 0) revert ZeroContribution();

        uint256 cumulative = raised[campaignId][milestoneId] + amount;
        if (cumulative > milestone.fundingTarget) revert OverTarget();

        uint256 custodyBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 custodyAfter = token.balanceOf(address(this));
        if (custodyAfter < custodyBefore || custodyAfter - custodyBefore != amount) {
            revert UnsupportedTokenTransfer();
        }
        raised[campaignId][milestoneId] = cumulative;
        contributionOf[campaignId][milestoneId][msg.sender] += amount;
        _afterContribution(campaignId, milestoneId, msg.sender);
        uint256 sequence = ++contributionSequence;

        if (cumulative == milestone.fundingTarget) {
            milestone.state = V2FundingTypes.MilestoneState.FUNDED;
        }

        emit MilestoneContributionReceived(
            deploymentIdentity, campaignId, milestoneId, msg.sender, amount, cumulative, sequence
        );

        if (cumulative == milestone.fundingTarget) {
            emit MilestoneFundingFinalized(
                deploymentIdentity,
                campaignId,
                milestoneId,
                true,
                cumulative,
                0,
                ++fundingTransitionSequence
            );
        }
    }

    function finalizeFundingFailure(uint256 campaignId, uint256 milestoneId) external {
        Campaign storage campaign = _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestoneId != campaign.activeMilestoneId) revert NotActiveMilestone();
        if (milestone.state != V2FundingTypes.MilestoneState.FUNDING_OPEN) {
            revert FundingNotOpen();
        }
        if (block.timestamp < milestone.fundingDeadline) revert FundingDeadlineNotReached();
        if (raised[campaignId][milestoneId] >= milestone.fundingTarget) {
            revert FundingAlreadySucceeded();
        }

        milestone.state = V2FundingTypes.MilestoneState.REFUNDING;
        refundSnapshot[campaignId][milestoneId] = raised[campaignId][milestoneId];

        emit MilestoneFundingFinalized(
            deploymentIdentity,
            campaignId,
            milestoneId,
            false,
            raised[campaignId][milestoneId],
            refundSnapshot[campaignId][milestoneId],
            ++fundingTransitionSequence
        );
    }

    function claimFundingRefund(uint256 campaignId, uint256 milestoneId) external nonReentrant {
        _campaign(campaignId);
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestone.state != V2FundingTypes.MilestoneState.REFUNDING) revert RefundNotOpen();
        if (refundClaimed[campaignId][milestoneId][msg.sender]) {
            revert RefundAlreadyClaimed();
        }

        uint256 amount = contributionOf[campaignId][milestoneId][msg.sender];
        if (amount == 0) revert NoRefundAvailable();

        refundClaimed[campaignId][milestoneId][msg.sender] = true;
        uint256 custodyBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(msg.sender);
        token.safeTransfer(msg.sender, amount);
        uint256 custodyAfter = token.balanceOf(address(this));
        uint256 recipientAfter = token.balanceOf(msg.sender);
        if (
            custodyAfter > custodyBefore || custodyBefore - custodyAfter != amount
                || recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount
        ) revert UnsupportedTokenTransfer();
        refunded[campaignId][milestoneId] += amount;

        emit MilestoneRefundClaimed(
            deploymentIdentity, campaignId, milestoneId, msg.sender, amount, ++refundSequence
        );
    }

    function openMilestoneFunding(uint256 campaignId, uint256 milestoneId) external {
        Campaign storage campaign = _campaign(campaignId);
        if (milestoneId == 0 || milestoneId != campaign.activeMilestoneId + 1) {
            revert PreviousMilestoneNotPaid();
        }

        Milestone storage previous = _milestone(campaignId, milestoneId - 1);
        if (previous.state != V2FundingTypes.MilestoneState.PAID) {
            revert PreviousMilestoneNotPaid();
        }

        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestone.state != V2FundingTypes.MilestoneState.DECLARED) {
            revert MilestoneAlreadyActive();
        }

        campaign.activeMilestoneId = milestoneId;
        milestone.state = V2FundingTypes.MilestoneState.FUNDING_OPEN;
        emit MilestoneFundingOpened(
            deploymentIdentity,
            campaignId,
            milestoneId,
            milestone.fundingTarget,
            milestone.fundingDeadline
        );
    }

    function policyVersion(uint256 campaignId) external view returns (string memory) {
        return _campaign(campaignId).policyVersion;
    }

    function commitmentHash(uint256 campaignId) external view returns (bytes32) {
        return _campaign(campaignId).commitmentHash;
    }

    function policyManifestHashFor(V2FundingTypes.PolicyManifest calldata manifest)
        external
        pure
        returns (bytes32)
    {
        return _policyManifestHash(manifest);
    }

    function activeMilestoneId(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).activeMilestoneId;
    }

    function campaignCreator(uint256 campaignId) external view returns (address) {
        return _campaign(campaignId).creator;
    }

    function milestoneReviewTerms(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (bytes32 deliverableCommitment, bytes32 acceptanceCriteriaHash)
    {
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        return (milestone.deliverableCommitment, milestone.acceptanceCriteriaHash);
    }

    function milestoneState(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (V2FundingTypes.MilestoneState)
    {
        return _milestone(campaignId, milestoneId).state;
    }

    function milestoneTerms(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (
            uint256,
            bytes32,
            bytes32,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            V2FundingTypes.MilestoneState
        )
    {
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        return (
            milestone.milestoneId,
            milestone.deliverableCommitment,
            milestone.acceptanceCriteriaHash,
            milestone.fundingTarget,
            milestone.creatorPayoutBudget,
            milestone.judgeRewardRateBps,
            milestone.judgeRewardUnit,
            milestone.maxReviewReserve,
            milestone.submissionDeadline,
            milestone.fundingDeadline,
            milestone.state
        );
    }

    function _validateCommitment(V2FundingTypes.CampaignCommitment calldata commitment)
        internal
        view
    {
        V2FundingTypes.PolicyManifest calldata manifest = commitment.policyManifest;
        uint256 count = commitment.milestoneId.length;
        if (count == 0) revert InvalidCommitment();
        if (
            commitment.deliverableCommitment.length != count
                || commitment.acceptanceCriteriaHash.length != count
                || commitment.fundingTarget.length != count
                || commitment.creatorPayoutBudget.length != count
                || commitment.judgeRewardRateBps.length != count
                || commitment.judgeRewardUnit.length != count
                || commitment.maxReviewReserve.length != count
                || commitment.submissionDeadline.length != count
                || commitment.fundingDeadline.length != count
        ) revert InvalidCommitment();

        if (!_validPolicyManifest(manifest)) revert InvalidCommitment();

        for (uint256 i = 0; i < count; i++) {
            if (
                commitment.milestoneId[i] != i || commitment.deliverableCommitment[i] == bytes32(0)
                    || commitment.acceptanceCriteriaHash[i] == bytes32(0)
                    || commitment.fundingTarget[i] == 0 || commitment.creatorPayoutBudget[i] == 0
                    || commitment.judgeRewardRateBps[i] == 0
                    || commitment.judgeRewardRateBps[i] > manifest.basisPointsDenominator
                    || commitment.judgeRewardUnit[i] == 0 || commitment.maxReviewReserve[i] == 0
                    || commitment.maxReviewReserve[i] >= commitment.fundingTarget[i]
                    || commitment.fundingDeadline[i] <= block.timestamp
                    || commitment.submissionDeadline[i] <= commitment.fundingDeadline[i]
            ) revert InvalidCommitment();

            _validateFrozenRewardTerms(
                manifest,
                commitment.fundingTarget[i],
                commitment.creatorPayoutBudget[i],
                commitment.judgeRewardRateBps[i],
                commitment.judgeRewardUnit[i],
                commitment.maxReviewReserve[i]
            );
        }
    }

    function _validateFrozenRewardTerms(
        V2FundingTypes.PolicyManifest calldata manifest,
        uint256 fundingTarget,
        uint256 creatorPayoutBudget,
        uint256 judgeRewardRateBps,
        uint256 judgeRewardUnit,
        uint256 maxReviewReserve
    ) internal pure {
        if (fundingTarget > type(uint256).max / judgeRewardRateBps) {
            revert InvalidCommitment();
        }
        uint256 expectedRewardUnit =
            fundingTarget * judgeRewardRateBps / manifest.basisPointsDenominator;
        if (expectedRewardUnit == 0 || expectedRewardUnit != judgeRewardUnit) {
            revert InvalidCommitment();
        }
        if (expectedRewardUnit > type(uint256).max / manifest.referenceCourtSize) {
            revert InvalidCommitment();
        }
        uint256 expectedReserve = expectedRewardUnit * manifest.referenceCourtSize;
        if (expectedReserve > type(uint256).max / manifest.maxValidCourts) {
            revert InvalidCommitment();
        }
        expectedReserve *= manifest.maxValidCourts;
        if (
            expectedReserve == 0 || expectedReserve >= fundingTarget
                || maxReviewReserve != expectedReserve
                || creatorPayoutBudget != fundingTarget - expectedReserve
        ) revert InvalidCommitment();
    }

    function _commitmentHash(V2FundingTypes.CampaignCommitment calldata commitment)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(deploymentIdentity, commitment));
    }

    function _policyManifestHash(V2FundingTypes.PolicyManifest calldata manifest)
        internal
        pure
        returns (bytes32)
    {
        V2FundingTypes.PolicyManifest memory preimage = manifest;
        preimage.policyManifestHash = bytes32(0);
        return keccak256(abi.encode(preimage));
    }

    function _validPolicyManifest(V2FundingTypes.PolicyManifest calldata manifest)
        internal
        view
        returns (bool)
    {
        if (
            !_same(manifest.commitmentSchemaVersion, "FTV2-COMMIT-2")
                || !_same(manifest.policyVersion, "fundtogether-vnext-v2-pr0-remediation-20261025")
                || !_same(manifest.supersedesCandidate, "fundtogether-vnext-v2-pr0-policy-20261025")
                || !_same(manifest.policyStatus, "PROPOSED_PENDING_APPROVAL")
                || !_same(
                    manifest.pr1FixtureDeploymentIdentity,
                    "fundtogether-vnext-v2-pr1-funding-fixture"
                ) || !_same(manifest.asset, "MockUSDC") || manifest.tokenDecimals != 6
                || manifest.policyManifestHash == bytes32(0) || manifest.chainId != block.chainid
                || manifest.token != address(token) || manifest.creator != msg.sender
                || manifest.payoutWallet == address(0)
                || !_same(manifest.publicationPolicy, "PUBLICATION_PRE_FUND_V1")
                || !_same(manifest.evidenceDisclosurePolicy, "ReviewReferenceV1")
                || !_same(manifest.daoFormulaVersion, "CWQ-1")
                || manifest.daoParticipationThresholdBps != 2_000
                || !_same(manifest.daoTiePolicy, "ACCEPT")
                || !_same(manifest.daoEmptyElectoratePolicy, "ACCEPT")
                || !_same(manifest.daoSnapshot, "at-dao-open")
                || !_same(manifest.daoContributionCapUnits, "uint128_max")
                || !_same(manifest.daoTotalWeightArithmetic, "checked_uint256")
                || !_same(manifest.daoConflictPolicyVersion, "DAO-TEMPORAL-1")
                || !manifest.daoExcludeAssignedBeforeOpen
                || !_same(manifest.daoExcludedAssignmentHistory, "all_court1_attempts")
                || !_same(manifest.court2SelectionAfter, "dao_finalized_appeal")
                || !manifest.court2ExcludeCourt1Judges
                || !_same(manifest.court2ExcludeDaoVoters, "all_valid_accept_or_appeal_ballots")
                || manifest.daoRetroactiveVoteChanges
                || !_same(manifest.resetPolicyVersion, "CCPS-1")
                || !_same(manifest.resetDisruptionAllowanceUnits, "10")
                || !_same(manifest.resetFinalizationAllowanceUnits, "3")
                || !_same(manifest.resetFinalizationAllowanceMinimumUnits, "3")
                || !_same(manifest.resetCostMaxUnits, "23")
                || !_same(manifest.resetFixtureCaseStakeRequirementUnits, "23")
                || !_same(
                    manifest.requiredLockedStakeRule, "max(caseStakeRequirement,resetCostMax)"
                )
                || !_same(
                        manifest.resetOffenderAllocation,
                        "equal_split_remainder_ascending_canonical_address"
                    )
                || !_same(
                    manifest.resetRecipients,
                    "compliant_invalid_court_judges_and_successful_finalizer"
                ) || !_same(manifest.actualCostReimbursementCapUnits, "0")
                || !_same(manifest.resetFundingSource, "offending_locked_stake_only")
                || manifest.publicationRewardRateBps != 0
                || !_same(manifest.refundDustPolicy, "canonical_address_prefix")
                || !_same(manifest.rewardRounding, "floor") || manifest.rewardRateBps != 100
                || manifest.basisPointsDenominator != 10_000 || manifest.referenceCourtSize != 3
                || manifest.maxValidCourts != 2 || manifest.maxResetsPerCourt != 1
                || manifest.maxResetsPerCase != 2 || manifest.lockedParameters.length != 3
                || manifest.pendingParameterGroups.length != 6
                || manifest.policyManifestHash != _policyManifestHash(manifest)
        ) return false;

        return _same(manifest.lockedParameters[0], "referenceCourtSize")
            && _same(manifest.lockedParameters[1], "maxValidCourts")
            && _same(manifest.lockedParameters[2], "court2ExcludeCourt1Judges")
            && _same(manifest.pendingParameterGroups[0], "commitment_schema")
            && _same(manifest.pendingParameterGroups[1], "reward_and_refund_economics")
            && _same(manifest.pendingParameterGroups[2], "CCPS-1_and_limits")
            && _same(manifest.pendingParameterGroups[3], "CWQ-1_and_threshold")
            && _same(manifest.pendingParameterGroups[4], "DAO-TEMPORAL-1")
            && _same(manifest.pendingParameterGroups[5], "publication_boundary");
    }

    function _same(string calldata actual, string memory expected) internal pure returns (bool) {
        return keccak256(bytes(actual)) == keccak256(bytes(expected));
    }

    function _campaign(uint256 campaignId) internal view returns (Campaign storage campaign) {
        campaign = campaigns[campaignId];
        if (campaign.milestoneCount == 0) revert CampaignNotFound();
    }

    function _milestone(uint256 campaignId, uint256 milestoneId)
        internal
        view
        returns (Milestone storage milestone)
    {
        Campaign storage campaign = _campaign(campaignId);
        if (milestoneId >= campaign.milestoneCount) revert InvalidMilestone();
        milestone = milestones[campaignId][milestoneId];
    }

    function _afterContribution(uint256, uint256, address) internal virtual { }
}
