pragma solidity 0.8.24;

import { FundTogetherConfigured } from "./FundTogetherConfigured.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev New deployment only. A trusted resolver handles admission and finite disputes.
/// Separate verifier actors, appeals, fees and misconduct slashing are post-MVP.
contract FundTogetherMvp is FundTogetherConfigured {
    using SafeERC20 for IERC20;
    uint256 public constant RESPONSE_WINDOW = 7 days;
    uint256 public constant RESOLUTION_WINDOW = 7 days;
    bytes32 public constant MILESTONE_POLICY = keccak256("FundTogether.MVP.milestone.no-slash.v1");
    bytes32 public constant RECOVERY_POLICY =
        keccak256("FundTogether.MVP.pull-bond.retained-dust.v1");
    // Public deployment nonce, not a secret. Fresh deployments must use a fresh ID.
    bytes32 public immutable deploymentId;
    mapping(uint256 => uint256) public claimableBond;
    mapping(uint256 => uint256) public refundPaid;
    mapping(uint256 => uint256) public refundClaimedContribution;

    event BondReturnCredited(uint256 indexed campaignId, address indexed organizer, uint256 amount);

    enum Resolution {
        NONE,
        CONTINUE,
        RESUBMIT,
        STOP,
        TIMEOUT
    }

    struct ChallengeCase {
        address challenger;
        bytes32 evidenceHash;
        bytes32 reasonHash;
        bytes32 responseHash;
        uint256 responseDeadline;
        uint256 resolutionDeadline;
        Resolution resolution;
        bytes32 resolutionReasonHash;
    }

    mapping(uint256 => mapping(uint256 => mapping(uint256 => ChallengeCase))) public challengeCases;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool)))) public
        challengeMaterial;

    event EvidenceAdmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address reviewer,
        bytes32 evidenceHash,
        bytes32 reasonHash,
        uint256 reviewEnd
    );
    event ChallengeCaseOpened(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        bytes32 evidenceHash,
        uint256 responseDeadline,
        uint256 resolutionDeadline
    );
    event ChallengeMaterialAdded(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address donor,
        bytes32 materialHash
    );
    event ChallengeResponseSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        bytes32 responseHash
    );
    event ChallengeResolved(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address caller,
        Resolution resolution,
        bytes32 evidenceHash,
        bytes32 reasonHash
    );

    constructor(address token, bytes32 instanceId) FundTogetherConfigured(token) {
        require(instanceId != bytes32(0), "deployment ID required");
        deploymentId = instanceId;
    }

    // Terminal transitions create a bond obligation without calling the token.
    // A failed bond payout cannot roll back a donor refund snapshot.
    function _returnBond(uint256 campaignId) internal override {
        Campaign storage campaign = campaigns[campaignId];
        uint256 amount = campaign.bondAmount;
        campaign.bondAmount = 0;
        campaign.bondLocked = false;
        if (amount > 0) {
            claimableBond[campaignId] += amount;
            emit BondReturnCredited(campaignId, campaign.organizer, amount);
        }
    }

    function claimBond(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        uint256 amount = claimableBond[campaignId];
        require(amount > 0, "no claimable bond");
        claimableBond[campaignId] = 0;
        // Revert restores credit on false/revert; no recipient substitution.
        IERC20(campaign.donationToken).safeTransfer(campaign.organizer, amount);
        emit BondReturned(campaignId, campaign.organizer, amount);
    }

    function _recordRefundClaim(uint256 campaignId, uint256 contribution, uint256 amount)
        internal
        override
    {
        // All claim accounting precedes the parent's external token transfer;
        // a false return/revert rolls back rights and counters together.
        refundClaimedContribution[campaignId] += contribution;
        refundPaid[campaignId] += amount;
        require(refundPaid[campaignId] <= refundPool[campaignId], "refund pool exceeded");
    }

    function refundAccounting(uint256 campaignId)
        external
        view
        returns (uint256 paid, uint256 remaining, bool allClaimed, uint256 finalDust)
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(refundSnapshotted[campaignId], "refund unavailable");
        paid = refundPaid[campaignId];
        remaining = refundPool[campaignId] - paid;
        allClaimed = refundClaimedContribution[campaignId] == campaigns[campaignId].totalContributed;
        // Before all rights are consumed, remaining includes unclaimed obligations.
        finalDust = allClaimed ? remaining : 0;
    }

    function _requireReviewer(uint256 campaignId) internal view {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == resolver, "only resolver");
        require(msg.sender != campaigns[campaignId].organizer, "organizer cannot review");
        require(contributions[campaignId][msg.sender] == 0, "contributor cannot review");
    }

    // Legacy admission cannot bypass the MVP reviewer or case policy, even after role grants.
    function assignVerifier(uint256, uint256, uint256, address) external pure override {
        revert("separate verifier is post-MVP");
    }

    function verifySubmission(uint256, uint256, uint256, bytes32) external pure override {
        revert("use MVP evidence admission");
    }

    function rejectSubmission(uint256, uint256, uint256, bytes32, bytes32) external pure override {
        revert("use MVP evidence rejection");
    }

    function admitEvidence(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash,
        bytes32 reasonHash
    ) external nonReentrant {
        _requireReviewer(campaignId);
        require(reasonHash != bytes32(0), "reason required");
        _acceptSubmission(campaignId, milestoneIndex, version, evidenceHash);
        emit EvidenceAdmitted(
            campaignId,
            milestoneIndex,
            version,
            msg.sender,
            evidenceHash,
            reasonHash,
            milestoneEvidence[campaignId][milestoneIndex].reviewEnd
        );
    }

    function rejectEvidence(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash,
        bytes32 reasonHash
    ) external nonReentrant {
        _requireReviewer(campaignId);
        _rejectSubmission(campaignId, milestoneIndex, version, evidenceHash, reasonHash);
    }

    // These entrypoints bind wallet confirmation to the dossier the caller saw.
    function submitEvidenceForVersion(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 nextVersion,
        bytes32 evidenceHash
    ) external nonReentrant {
        require(
            nextVersion == submissionVersion[campaignId][milestoneIndex] + 1,
            "evidence version changed"
        );
        _submitEvidence(campaignId, milestoneIndex, evidenceHash);
    }

    function _requireEvidenceVersion(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash
    ) internal view {
        require(
            version > 0 && version == submissionVersion[campaignId][milestoneIndex],
            "evidence version changed"
        );
        require(
            evidenceHash == milestoneEvidence[campaignId][milestoneIndex].evidenceHash,
            "evidence hash changed"
        );
    }

    function challengeEvidenceForVersion(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash,
        bytes32 reasonHash
    ) external nonReentrant {
        _requireEvidenceVersion(campaignId, milestoneIndex, version, evidenceHash);
        _openMvpChallenge(campaignId, milestoneIndex, reasonHash);
    }

    function settleMilestoneForVersion(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash
    ) external nonReentrant {
        _requireEvidenceVersion(campaignId, milestoneIndex, version, evidenceHash);
        _settleMilestone(campaignId, milestoneIndex);
    }

    function openChallenge(uint256 campaignId, uint256 milestoneIndex, bytes32 reasonHash)
        external
        override
        nonReentrant
    {
        _openMvpChallenge(campaignId, milestoneIndex, reasonHash);
    }

    function _openMvpChallenge(uint256 campaignId, uint256 milestoneIndex, bytes32 reasonHash)
        internal
    {
        uint256 version = submissionVersion[campaignId][milestoneIndex];
        ChallengeCase storage dispute = challengeCases[campaignId][milestoneIndex][version];
        require(dispute.responseDeadline == 0, "version case already opened");
        _openChallenge(campaignId, milestoneIndex, reasonHash);
        uint256 responseDeadline = block.timestamp + RESPONSE_WINDOW;
        dispute.challenger = msg.sender;
        dispute.evidenceHash = milestoneEvidence[campaignId][milestoneIndex].evidenceHash;
        dispute.reasonHash = reasonHash;
        dispute.responseDeadline = responseDeadline;
        dispute.resolutionDeadline = responseDeadline + RESOLUTION_WINDOW;
        challengeMaterial[campaignId][milestoneIndex][version][reasonHash] = true;
        emit ChallengeCaseOpened(
            campaignId,
            milestoneIndex,
            version,
            dispute.evidenceHash,
            responseDeadline,
            dispute.resolutionDeadline
        );
    }

    function _pendingCase(uint256 campaignId, uint256 milestoneIndex, uint256 version)
        internal
        view
        returns (ChallengeCase storage dispute)
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(campaignState[campaignId] == CampaignState.CHALLENGED, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(
            version > 0 && version == submissionVersion[campaignId][milestoneIndex],
            "not current submission"
        );
        dispute = challengeCases[campaignId][milestoneIndex][version];
        require(
            dispute.responseDeadline != 0 && dispute.resolution == Resolution.NONE,
            "case not pending"
        );
        require(
            dispute.evidenceHash == milestoneEvidence[campaignId][milestoneIndex].evidenceHash,
            "case evidence mismatch"
        );
    }

    function addChallengeMaterial(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 materialHash
    ) external nonReentrant {
        ChallengeCase storage dispute = _pendingCase(campaignId, milestoneIndex, version);
        require(contributions[campaignId][msg.sender] > 0, "no contribution");
        require(block.timestamp < dispute.responseDeadline, "response deadline passed");
        require(materialHash != bytes32(0), "material required");
        require(
            !challengeMaterial[campaignId][milestoneIndex][version][materialHash],
            "duplicate material"
        );
        challengeMaterial[campaignId][milestoneIndex][version][materialHash] = true;
        emit ChallengeMaterialAdded(campaignId, milestoneIndex, version, msg.sender, materialHash);
    }

    function submitChallengeResponse(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 responseHash
    ) external nonReentrant {
        ChallengeCase storage dispute = _pendingCase(campaignId, milestoneIndex, version);
        require(msg.sender == campaigns[campaignId].organizer, "only organizer");
        require(block.timestamp < dispute.responseDeadline, "response deadline passed");
        require(responseHash != bytes32(0), "response required");
        require(dispute.responseHash == bytes32(0), "response already submitted");
        dispute.responseHash = responseHash;
        emit ChallengeResponseSubmitted(campaignId, milestoneIndex, version, responseHash);
    }

    function resolveChallenge(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash,
        Resolution resolution,
        bytes32 reasonHash
    ) external nonReentrant {
        _requireReviewer(campaignId);
        ChallengeCase storage dispute = _pendingCase(campaignId, milestoneIndex, version);
        require(block.timestamp >= dispute.responseDeadline, "response window open");
        require(block.timestamp < dispute.resolutionDeadline, "resolution deadline passed");
        require(evidenceHash == dispute.evidenceHash, "evidence mismatch");
        require(reasonHash != bytes32(0), "reason required");
        require(
            resolution == Resolution.CONTINUE || resolution == Resolution.RESUBMIT
                || resolution == Resolution.STOP,
            "invalid resolution"
        );
        if (resolution == Resolution.RESUBMIT) {
            require(version < MAX_SUBMISSIONS, "submission limit reached");
        }
        dispute.resolution = resolution;
        dispute.resolutionReasonHash = reasonHash;
        emit ChallengeResolved(
            campaignId, milestoneIndex, version, msg.sender, resolution, evidenceHash, reasonHash
        );
        if (resolution == Resolution.CONTINUE) {
            milestones[campaignId][milestoneIndex].state = MilestoneState.REVIEWING;
            campaignState[campaignId] = CampaignState.IN_REVIEW;
            // Preserve the original reviewEnd. The final case decision cannot be reopened.
        } else if (resolution == Resolution.RESUBMIT) {
            milestones[campaignId][milestoneIndex].state = MilestoneState.ACTIVE;
            campaignState[campaignId] = CampaignState.MILESTONE_ACTIVE;
            milestoneEvidence[campaignId][milestoneIndex].reviewEnd = 0;
            _setEvidenceDeadline(campaignId, milestoneIndex, RESUBMISSION_WINDOW);
        } else {
            _failCampaign(campaignId, milestoneIndex, FailureReason.DISPUTE_STOP);
        }
    }

    function finalizeChallengeTimeout(uint256 campaignId, uint256 milestoneIndex, uint256 version)
        external
        nonReentrant
    {
        ChallengeCase storage dispute = _pendingCase(campaignId, milestoneIndex, version);
        require(block.timestamp >= dispute.resolutionDeadline, "resolution deadline not reached");
        dispute.resolution = Resolution.TIMEOUT;
        // Timeout is not a resolver verdict or fabricated misconduct finding.
        emit ChallengeResolved(
            campaignId,
            milestoneIndex,
            version,
            msg.sender,
            Resolution.TIMEOUT,
            dispute.evidenceHash,
            bytes32(0)
        );
        _failCampaign(campaignId, milestoneIndex, FailureReason.DISPUTE_TIMEOUT);
    }
}
