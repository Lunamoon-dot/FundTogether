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
        bytes32 policyManifestHash;
        uint256 chainId;
        address token;
        address creator;
        address payoutWallet;
        string publicationPolicy;
        string evidenceDisclosurePolicy;
        string daoFormulaVersion;
        string daoConflictPolicyVersion;
        string resetPolicyVersion;
        uint256 rewardRateBps;
        uint256 basisPointsDenominator;
        uint256 referenceCourtSize;
        uint256 maxValidCourts;
        uint256 maxResetsPerCourt;
        uint256 maxResetsPerCase;
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

        token.safeTransferFrom(msg.sender, address(this), amount);
        raised[campaignId][milestoneId] = cumulative;
        contributionOf[campaignId][milestoneId][msg.sender] += amount;
        uint256 sequence = ++contributionSequence;

        if (cumulative == milestone.fundingTarget) {
            milestone.state = V2FundingTypes.MilestoneState.FUNDED;
        }

        emit MilestoneContributionReceived(
            deploymentIdentity,
            campaignId,
            milestoneId,
            msg.sender,
            amount,
            cumulative,
            sequence
        );
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
            ++refundSequence
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
        token.safeTransfer(msg.sender, amount);
        refunded[campaignId][milestoneId] += amount;

        emit MilestoneRefundClaimed(
            deploymentIdentity,
            campaignId,
            milestoneId,
            msg.sender,
            amount,
            ++refundSequence
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

    function activeMilestoneId(uint256 campaignId) external view returns (uint256) {
        return _campaign(campaignId).activeMilestoneId;
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

    function _validateCommitment(V2FundingTypes.CampaignCommitment calldata commitment) internal view {
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

        if (
            keccak256(bytes(manifest.commitmentSchemaVersion))
                != keccak256(bytes("FTV2-COMMIT-2"))
                || bytes(manifest.policyVersion).length == 0
                || manifest.policyManifestHash == bytes32(0)
                || manifest.chainId != block.chainid
                || manifest.token != address(token)
                || manifest.creator != msg.sender
                || manifest.payoutWallet == address(0)
                || bytes(manifest.publicationPolicy).length == 0
                || bytes(manifest.evidenceDisclosurePolicy).length == 0
                || bytes(manifest.daoFormulaVersion).length == 0
                || bytes(manifest.daoConflictPolicyVersion).length == 0
                || bytes(manifest.resetPolicyVersion).length == 0
                || manifest.basisPointsDenominator == 0
                || manifest.rewardRateBps > manifest.basisPointsDenominator
                || manifest.referenceCourtSize != 3
                || manifest.maxValidCourts != 2
                || manifest.maxResetsPerCourt != 1
                || manifest.maxResetsPerCase != 2
        ) revert InvalidCommitment();

        for (uint256 i = 0; i < count; i++) {
            if (
                commitment.milestoneId[i] != i
                    || commitment.deliverableCommitment[i] == bytes32(0)
                    || commitment.acceptanceCriteriaHash[i] == bytes32(0)
                    || commitment.fundingTarget[i] == 0
                    || commitment.creatorPayoutBudget[i] == 0
                    || commitment.judgeRewardRateBps[i] == 0
                    || commitment.judgeRewardRateBps[i] > manifest.basisPointsDenominator
                    || commitment.judgeRewardUnit[i] == 0
                    || commitment.maxReviewReserve[i] == 0
                    || commitment.maxReviewReserve[i] >= commitment.fundingTarget[i]
                    || commitment.creatorPayoutBudget[i] + commitment.maxReviewReserve[i]
                        > commitment.fundingTarget[i]
                    || commitment.fundingDeadline[i] <= block.timestamp
                    || commitment.submissionDeadline[i] <= commitment.fundingDeadline[i]
        ) revert InvalidCommitment();
        }
    }

    function _commitmentHash(V2FundingTypes.CampaignCommitment calldata commitment)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                deploymentIdentity,
                commitment
            )
        );
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
}
