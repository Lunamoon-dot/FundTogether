pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract FundTogether is ReentrancyGuard, AccessControl {
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
        EVIDENCE_PENDING
    }

    enum MilestoneState {
        PENDING,
        ACTIVE,
        REVIEWING,
        CHALLENGED,
        SETTLED,
        SUBMITTED
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
        REJECTED
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
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

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

    constructor() {
        resolver = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createCampaign(
        string calldata name,
        address donationToken,
        uint256 fundingDeadline,
        uint256[] calldata milestoneBudgets
    ) external returns (uint256 campaignId) {
        require(bytes(name).length > 0, "name required");
        require(donationToken != address(0), "token required");
        require(fundingDeadline > block.timestamp, "deadline required");
        require(milestoneBudgets.length > 0, "milestones required");

        campaignId = nextCampaignId;
        uint256 goal = 0;
        uint256 requiredBond = 0;
        for (uint256 i; i < milestoneBudgets.length; ++i) {
            uint256 budget = milestoneBudgets[i];
            require(budget > 0, "budget required");
            goal += budget;
            if (budget > requiredBond) requiredBond = budget;
            milestones[campaignId].push(
                Milestone({ budget: budget, state: MilestoneState.PENDING })
            );
        }

        nextCampaignId++;
        campaigns[campaignId] = Campaign({
            name: name,
            donationToken: donationToken,
            goal: goal,
            requiredBond: requiredBond,
            organizer: msg.sender,
            bondLocked: false,
            bondAmount: 0,
            totalContributed: 0
        });
        fundingDeadlines[campaignId] = fundingDeadline;
        campaignState[campaignId] = CampaignState.DRAFT;
        emit CampaignCreated(campaignId, name, donationToken, goal, requiredBond);
        for (uint256 i; i < milestoneBudgets.length; ++i) {
            emit MilestoneConfigured(campaignId, i, milestoneBudgets[i]);
        }
    }

    function configureMilestoneCriteria(
        uint256 campaignId,
        uint256 milestoneIndex,
        bytes32 criteriaHash
    ) external {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == campaigns[campaignId].organizer, "only organizer");
        require(campaignState[campaignId] == CampaignState.DRAFT, "invalid state");
        require(milestoneIndex < milestones[campaignId].length, "unknown milestone");
        require(criteriaHash != bytes32(0), "criteria required");
        milestoneCriteria[campaignId][milestoneIndex] = criteriaHash;
        emit MilestoneCriteriaConfigured(campaignId, milestoneIndex, criteriaHash);
    }

    function approveCampaign(uint256 campaignId) external {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == resolver, "only resolver");
        require(campaignState[campaignId] == CampaignState.DRAFT, "invalid state");
        for (uint256 i; i < milestones[campaignId].length; ++i) {
            require(milestoneCriteria[campaignId][i] != bytes32(0), "criteria not configured");
        }

        campaignState[campaignId] = CampaignState.APPROVED;
        emit CampaignApproved(campaignId, msg.sender);
    }

    function publishCampaign(uint256 campaignId) external {
        require(campaignId < nextCampaignId, "unknown campaign");

        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        require(campaignState[campaignId] == CampaignState.APPROVED, "invalid state");
        require(campaign.bondLocked, "bond not locked");
        require(fundingDeadlines[campaignId] > block.timestamp, "deadline passed");

        campaignState[campaignId] = CampaignState.FUNDING;
        emit CampaignPublished(campaignId, fundingDeadlines[campaignId]);
    }

    function lockBond(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");

        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        require(
            campaignState[campaignId] == CampaignState.DRAFT
                || campaignState[campaignId] == CampaignState.APPROVED,
            "invalid state"
        );
        require(!campaign.bondLocked, "bond already locked");

        IERC20(campaign.donationToken)
            .safeTransferFrom(msg.sender, address(this), campaign.requiredBond);
        campaign.bondLocked = true;
        campaign.bondAmount = campaign.requiredBond;
        emit BondLocked(campaignId, msg.sender, campaign.requiredBond);
    }

    function donate(uint256 campaignId, uint256 amount) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(amount > 0, "amount required");

        Campaign storage campaign = campaigns[campaignId];
        require(campaignState[campaignId] == CampaignState.FUNDING, "invalid state");
        require(block.timestamp < fundingDeadlines[campaignId], "deadline passed");
        require(campaign.totalContributed + amount <= campaign.goal, "exceeds goal");

        campaign.totalContributed += amount;
        contributions[campaignId][msg.sender] += amount;
        IERC20(campaign.donationToken).safeTransferFrom(msg.sender, address(this), amount);
        emit DonationReceived(campaignId, msg.sender, amount);

        if (campaign.totalContributed == campaign.goal) {
            campaignState[campaignId] = CampaignState.FUNDED;
            emit FundingFinalized(campaignId, CampaignState.FUNDED);
        }
    }

    function milestoneCount(uint256 campaignId) external view returns (uint256) {
        require(campaignId < nextCampaignId, "unknown campaign");
        return milestones[campaignId].length;
    }

    function activateMilestone(uint256 campaignId, uint256 milestoneIndex) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        require(
            campaignState[campaignId] == CampaignState.FUNDED
                || campaignState[campaignId] == CampaignState.MILESTONE_SETTLED,
            "invalid state"
        );
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not next milestone");

        Milestone storage milestone = milestones[campaignId][milestoneIndex];
        require(
            campaign.bondLocked && campaign.bondAmount >= milestone.budget, "bond coverage required"
        );
        milestone.state = MilestoneState.ACTIVE;
        campaignState[campaignId] = CampaignState.MILESTONE_ACTIVE;
        emit MilestoneActivated(campaignId, milestoneIndex, milestone.budget);
    }

    function submitEvidence(uint256 campaignId, uint256 milestoneIndex, bytes32 evidenceHash)
        external
        nonReentrant
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == campaigns[campaignId].organizer, "only organizer");
        require(campaignState[campaignId] == CampaignState.MILESTONE_ACTIVE, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(evidenceHash != bytes32(0), "evidence required");
        uint256 version = ++submissionVersion[campaignId][milestoneIndex];
        evidenceSubmissions[campaignId][milestoneIndex][version] = EvidenceSubmission({
            evidenceHash: evidenceHash,
            status: SubmissionState.SUBMITTED,
            assignedVerifier: address(0),
            verifiedBy: address(0),
            verifiedAt: 0,
            reasonHash: bytes32(0)
        });
        milestoneEvidence[campaignId][milestoneIndex] = Evidence(evidenceHash, 0);
        milestones[campaignId][milestoneIndex].state = MilestoneState.SUBMITTED;
        campaignState[campaignId] = CampaignState.EVIDENCE_PENDING;
        emit EvidenceSubmissionCreated(campaignId, milestoneIndex, version, evidenceHash);
    }

    function assignVerifier(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        address verifier
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            verifier != address(0) && hasRole(VERIFIER_ROLE, verifier), "verifier role required"
        );
        require(verifier != campaigns[campaignId].organizer, "organizer cannot verify");
        address previousVerifier = submission.assignedVerifier;
        submission.assignedVerifier = verifier;
        emit VerifierAssigned(campaignId, milestoneIndex, version, previousVerifier, verifier);
    }

    function verifySubmission(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash
    ) external nonReentrant onlyRole(VERIFIER_ROLE) {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(msg.sender == submission.assignedVerifier, "not assigned verifier");
        require(evidenceHash == submission.evidenceHash, "evidence mismatch");
        submission.status = SubmissionState.ACCEPTED;
        submission.verifiedBy = msg.sender;
        submission.verifiedAt = block.timestamp;
        uint256 reviewEnd = block.timestamp + REVIEW_WINDOW;
        milestoneEvidence[campaignId][milestoneIndex].reviewEnd = reviewEnd;
        milestones[campaignId][milestoneIndex].state = MilestoneState.REVIEWING;
        campaignState[campaignId] = CampaignState.IN_REVIEW;
        emit SubmissionVerified(
            campaignId, milestoneIndex, version, msg.sender, evidenceHash, reviewEnd
        );
    }

    function rejectSubmission(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash,
        bytes32 reasonHash
    ) external nonReentrant onlyRole(VERIFIER_ROLE) {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(msg.sender == submission.assignedVerifier, "not assigned verifier");
        require(evidenceHash == submission.evidenceHash, "evidence mismatch");
        require(reasonHash != bytes32(0), "reason required");
        submission.status = SubmissionState.REJECTED;
        submission.verifiedBy = msg.sender;
        submission.verifiedAt = block.timestamp;
        submission.reasonHash = reasonHash;
        milestones[campaignId][milestoneIndex].state = MilestoneState.ACTIVE;
        campaignState[campaignId] = CampaignState.MILESTONE_ACTIVE;
        emit SubmissionRejected(campaignId, milestoneIndex, version, msg.sender, reasonHash);
    }

    function _pendingSubmission(uint256 campaignId, uint256 milestoneIndex, uint256 version)
        internal
        view
        returns (EvidenceSubmission storage submission)
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(campaignState[campaignId] == CampaignState.EVIDENCE_PENDING, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(
            version > 0 && version == submissionVersion[campaignId][milestoneIndex],
            "not current submission"
        );
        submission = evidenceSubmissions[campaignId][milestoneIndex][version];
        require(submission.status == SubmissionState.SUBMITTED, "submission not pending");
    }

    function openChallenge(uint256 campaignId, uint256 milestoneIndex, bytes32 reasonHash)
        external
        nonReentrant
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(campaignState[campaignId] == CampaignState.IN_REVIEW, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(contributions[campaignId][msg.sender] > 0, "no contribution");
        require(reasonHash != bytes32(0), "reason required");
        require(
            block.timestamp < milestoneEvidence[campaignId][milestoneIndex].reviewEnd,
            "review ended"
        );
        milestones[campaignId][milestoneIndex].state = MilestoneState.CHALLENGED;
        campaignState[campaignId] = CampaignState.CHALLENGED;
        emit ChallengeOpened(campaignId, milestoneIndex, msg.sender, reasonHash);
    }

    function settleMilestone(uint256 campaignId, uint256 milestoneIndex) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(campaignState[campaignId] == CampaignState.IN_REVIEW, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(
            block.timestamp >= milestoneEvidence[campaignId][milestoneIndex].reviewEnd,
            "review not ended"
        );
        Campaign storage campaign = campaigns[campaignId];
        Milestone storage milestone = milestones[campaignId][milestoneIndex];
        milestone.state = MilestoneState.SETTLED;
        totalReleased[campaignId] += milestone.budget;
        currentMilestoneIndex[campaignId] = milestoneIndex + 1;
        bool completed = milestoneIndex + 1 == milestones[campaignId].length;
        campaignState[campaignId] =
            completed ? CampaignState.COMPLETED : CampaignState.MILESTONE_SETTLED;
        IERC20(campaign.donationToken).safeTransfer(campaign.organizer, milestone.budget);
        emit MilestoneSettled(campaignId, milestoneIndex, milestone.budget);
        if (completed) {
            _returnBond(campaignId);
            emit CampaignCompleted(campaignId);
        }
    }

    function cancelCampaign(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");

        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        CampaignState state = campaignState[campaignId];
        require(
            state == CampaignState.DRAFT || state == CampaignState.APPROVED
                || state == CampaignState.FUNDING,
            "invalid state"
        );

        campaignState[campaignId] = CampaignState.CANCELLED;
        emit CampaignCancelled(campaignId, msg.sender);
        _snapshotRefundAndReturnBond(campaignId);
    }

    function finalizeFundingFailure(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        Campaign storage campaign = campaigns[campaignId];
        require(campaignState[campaignId] == CampaignState.FUNDING, "invalid state");
        require(block.timestamp >= fundingDeadlines[campaignId], "deadline not reached");
        require(campaign.totalContributed < campaign.goal, "goal reached");

        campaignState[campaignId] = CampaignState.FUNDING_FAILED;
        emit FundingFinalized(campaignId, CampaignState.FUNDING_FAILED);
        _snapshotRefundAndReturnBond(campaignId);
    }

    function claimRefund(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(refundSnapshotted[campaignId], "refund unavailable");
        require(!claimedRefund[campaignId][msg.sender], "refund already claimed");

        uint256 amount = contributions[campaignId][msg.sender];
        require(amount > 0, "no contribution");
        claimedRefund[campaignId][msg.sender] = true;
        IERC20(campaigns[campaignId].donationToken).safeTransfer(msg.sender, amount);
        emit RefundClaimed(campaignId, msg.sender, amount);
    }

    function _snapshotRefundAndReturnBond(uint256 campaignId) internal {
        Campaign storage campaign = campaigns[campaignId];
        // Pre-funded termination refunds accepted contributions exactly, excluding bond and unsolicited tokens.
        refundPool[campaignId] = campaign.totalContributed;
        refundSnapshotted[campaignId] = true;
        emit RefundPoolSnapshotted(campaignId, campaign.totalContributed);
        _returnBond(campaignId);
    }

    function _returnBond(uint256 campaignId) internal {
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
