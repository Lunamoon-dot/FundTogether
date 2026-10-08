pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @dev Shared storage, authority and internal accounting for one deployed escrow.
/// Keep storage declarations in order; all modules use the same reentrancy guard.
abstract contract FundTogetherBase is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    enum CampaignState {
        DRAFT,
        APPROVED,
        FUNDING,
        FUNDED,
        FUNDING_FAILED,
        CANCELLED,
        MILESTONE_ACTIVE,
        IN_REVIEW,
        CHALLENGED,
        MILESTONE_SETTLED,
        COMPLETED,
        EVIDENCE_PENDING,
        FAILED
    }

    enum MilestoneState {
        PENDING,
        ACTIVE,
        REVIEWING,
        CHALLENGED,
        SETTLED,
        SUBMITTED,
        FAILED
    }

    struct Milestone {
        uint256 budget;
        MilestoneState state;
    }

    struct Campaign {
        string name;
        address donationToken;
        uint256 goal;
        uint256 requiredBond;
        address organizer;
        bool bondLocked;
        uint256 bondAmount;
        uint256 totalContributed;
    }

    struct Evidence {
        bytes32 evidenceHash;
        uint256 reviewEnd;
    }

    enum SubmissionState {
        NONE,
        SUBMITTED,
        ACCEPTED,
        REJECTED,
        EXPIRED
    }

    struct EvidenceSubmission {
        bytes32 evidenceHash;
        SubmissionState status;
        address assignedVerifier;
        address verifiedBy;
        uint256 verifiedAt;
        bytes32 reasonHash;
    }

    uint256 public constant REVIEW_WINDOW = 72 hours;
    uint256 public constant ACTIVATION_WINDOW = 7 days;
    uint256 public constant EVIDENCE_WINDOW = 30 days;
    uint256 public constant ADMISSION_WINDOW = 72 hours;
    uint256 public constant RESUBMISSION_WINDOW = 7 days;
    uint256 public constant MAX_SUBMISSIONS = 3;
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum FailureReason {
        ACTIVATION_TIMEOUT,
        EVIDENCE_TIMEOUT,
        REJECTIONS_EXHAUSTED,
        ADMISSION_TIMEOUTS_EXHAUSTED,
        DISPUTE_STOP,
        DISPUTE_TIMEOUT
    }

    mapping(uint256 campaignId => uint256) public activationDeadlines;
    mapping(uint256 campaignId => mapping(uint256 milestoneIndex => uint256)) public
        evidenceDeadlines;
    mapping(
        uint256 campaignId => mapping(uint256 milestoneIndex => mapping(uint256 version => uint256))
    ) public admissionDeadlines;

    uint256 public nextCampaignId;
    address public immutable resolver;
    mapping(uint256 campaignId => Campaign) public campaigns;
    mapping(uint256 campaignId => uint256) public fundingDeadlines;
    mapping(uint256 campaignId => CampaignState) public campaignState;
    mapping(uint256 campaignId => mapping(address donor => uint256)) public contributions;
    mapping(uint256 campaignId => mapping(address donor => bool)) public claimedRefund;
    mapping(uint256 campaignId => uint256) public refundPool;
    mapping(uint256 campaignId => bool) public refundSnapshotted;
    mapping(uint256 campaignId => Milestone[]) public milestones;
    mapping(uint256 campaignId => uint256) public currentMilestoneIndex;
    mapping(uint256 campaignId => mapping(uint256 milestoneIndex => Evidence)) public
        milestoneEvidence;
    mapping(uint256 campaignId => uint256) public totalReleased;
    mapping(uint256 campaignId => mapping(uint256 milestoneIndex => uint256)) public
        submissionVersion;
    mapping(
        uint256 campaignId
            => mapping(uint256 milestoneIndex => mapping(uint256 version => EvidenceSubmission))
    ) public evidenceSubmissions;
    mapping(uint256 campaignId => mapping(uint256 milestoneIndex => bytes32)) public
        milestoneCriteria;

    event CampaignCreated(
        uint256 indexed campaignId,
        string name,
        address donationToken,
        uint256 goal,
        uint256 requiredBond
    );
    event BondLocked(uint256 indexed campaignId, address indexed organizer, uint256 amount);
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event CampaignApproved(uint256 indexed campaignId, address indexed resolver);
    event CampaignPublished(uint256 indexed campaignId, uint256 fundingDeadline);
    event FundingFinalized(uint256 indexed campaignId, CampaignState state);
    event CampaignCancelled(uint256 indexed campaignId, address indexed organizer);
    event RefundPoolSnapshotted(uint256 indexed campaignId, uint256 amount);
    event BondReturned(uint256 indexed campaignId, address indexed organizer, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event MilestoneConfigured(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 budget
    );
    event MilestoneActivated(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 budget
    );
    event MilestoneCriteriaConfigured(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, bytes32 criteriaHash
    );
    event EvidenceSubmissionCreated(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        bytes32 evidenceHash
    );
    event VerifierAssigned(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address previousVerifier,
        address verifier
    );
    event SubmissionVerified(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address verifier,
        bytes32 evidenceHash,
        uint256 reviewEnd
    );
    event SubmissionRejected(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address verifier,
        bytes32 reasonHash
    );
    event ChallengeOpened(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        address indexed donor,
        bytes32 reasonHash
    );
    event MilestoneSettled(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 amount
    );
    event CampaignCompleted(uint256 indexed campaignId);
    event MilestoneActivationDeadlineSet(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 deadline
    );
    event EvidenceDeadlineSet(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 deadline
    );
    event AdmissionDeadlineSet(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        uint256 deadline
    );
    event EvidenceSubmissionExpired(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 indexed version
    );
    event CampaignFailed(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, FailureReason reason
    );

    constructor() {
        resolver = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _setActivationDeadline(uint256 campaignId, uint256 milestoneIndex) internal {
        uint256 deadline = block.timestamp + ACTIVATION_WINDOW;
        activationDeadlines[campaignId] = deadline;
        emit MilestoneActivationDeadlineSet(campaignId, milestoneIndex, deadline);
    }

    function _setEvidenceDeadline(uint256 campaignId, uint256 milestoneIndex, uint256 window)
        internal
    {
        uint256 deadline = block.timestamp + window;
        evidenceDeadlines[campaignId][milestoneIndex] = deadline;
        emit EvidenceDeadlineSet(campaignId, milestoneIndex, deadline);
    }

    function _snapshotRefundAndReturnBond(uint256 campaignId) internal {
        Campaign storage campaign = campaigns[campaignId];
        // Only unreleased donor escrow enters the immutable pool; bond is returned separately.
        require(!refundSnapshotted[campaignId], "refund already snapshotted");
        uint256 amount = campaign.totalContributed - totalReleased[campaignId];
        refundPool[campaignId] = amount;
        refundSnapshotted[campaignId] = true;
        emit RefundPoolSnapshotted(campaignId, amount);
        _returnBond(campaignId);
    }

    function _returnBond(uint256 campaignId) internal virtual {
        Campaign storage campaign = campaigns[campaignId];
        uint256 amount = campaign.bondAmount;
        campaign.bondAmount = 0;
        campaign.bondLocked = false;
        if (amount > 0) {
            IERC20(campaign.donationToken).safeTransfer(campaign.organizer, amount);
            emit BondReturned(campaignId, campaign.organizer, amount);
        }
    }
}
