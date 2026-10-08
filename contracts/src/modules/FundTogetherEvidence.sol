pragma solidity 0.8.24;

import { FundTogetherBase } from "./FundTogetherBase.sol";

/// @dev Versioned evidence admission, verifier decisions and bounded timeouts.
abstract contract FundTogetherEvidence is FundTogetherBase {
    function submitEvidence(uint256 campaignId, uint256 milestoneIndex, bytes32 evidenceHash)
        external
        nonReentrant
    {
        _submitEvidence(campaignId, milestoneIndex, evidenceHash);
    }

    function _submitEvidence(uint256 campaignId, uint256 milestoneIndex, bytes32 evidenceHash)
        internal
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == campaigns[campaignId].organizer, "only organizer");
        require(campaignState[campaignId] == CampaignState.MILESTONE_ACTIVE, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(evidenceHash != bytes32(0), "evidence required");
        require(
            block.timestamp < evidenceDeadlines[campaignId][milestoneIndex],
            "evidence deadline passed"
        );
        require(
            submissionVersion[campaignId][milestoneIndex] < MAX_SUBMISSIONS,
            "submission limit reached"
        );
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
        evidenceDeadlines[campaignId][milestoneIndex] = 0;
        uint256 deadline = block.timestamp + ADMISSION_WINDOW;
        admissionDeadlines[campaignId][milestoneIndex][version] = deadline;
        emit EvidenceSubmissionCreated(campaignId, milestoneIndex, version, evidenceHash);
        emit AdmissionDeadlineSet(campaignId, milestoneIndex, version, deadline);
    }

    function assignVerifier(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        address verifier
    ) external virtual nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            block.timestamp < admissionDeadlines[campaignId][milestoneIndex][version],
            "admission deadline passed"
        );
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
    ) external virtual nonReentrant onlyRole(VERIFIER_ROLE) {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            block.timestamp < admissionDeadlines[campaignId][milestoneIndex][version],
            "admission deadline passed"
        );
        require(msg.sender == submission.assignedVerifier, "not assigned verifier");
        _acceptSubmission(campaignId, milestoneIndex, version, evidenceHash);
    }

    function _acceptSubmission(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash
    ) internal {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            block.timestamp < admissionDeadlines[campaignId][milestoneIndex][version],
            "admission deadline passed"
        );
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
    ) external virtual nonReentrant onlyRole(VERIFIER_ROLE) {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            block.timestamp < admissionDeadlines[campaignId][milestoneIndex][version],
            "admission deadline passed"
        );
        require(msg.sender == submission.assignedVerifier, "not assigned verifier");
        _rejectSubmission(campaignId, milestoneIndex, version, evidenceHash, reasonHash);
    }

    function _rejectSubmission(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 version,
        bytes32 evidenceHash,
        bytes32 reasonHash
    ) internal {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            block.timestamp < admissionDeadlines[campaignId][milestoneIndex][version],
            "admission deadline passed"
        );
        require(evidenceHash == submission.evidenceHash, "evidence mismatch");
        require(reasonHash != bytes32(0), "reason required");
        submission.status = SubmissionState.REJECTED;
        submission.verifiedBy = msg.sender;
        submission.verifiedAt = block.timestamp;
        submission.reasonHash = reasonHash;
        emit SubmissionRejected(campaignId, milestoneIndex, version, msg.sender, reasonHash);
        _resumeOrFail(campaignId, milestoneIndex, FailureReason.REJECTIONS_EXHAUSTED);
    }

    function expireSubmission(uint256 campaignId, uint256 milestoneIndex, uint256 version)
        external
        nonReentrant
    {
        EvidenceSubmission storage submission =
            _pendingSubmission(campaignId, milestoneIndex, version);
        require(
            block.timestamp >= admissionDeadlines[campaignId][milestoneIndex][version],
            "admission deadline not reached"
        );
        submission.status = SubmissionState.EXPIRED;
        emit EvidenceSubmissionExpired(campaignId, milestoneIndex, version);
        _resumeOrFail(campaignId, milestoneIndex, FailureReason.ADMISSION_TIMEOUTS_EXHAUSTED);
    }

    function finalizeMilestoneTimeout(uint256 campaignId, uint256 milestoneIndex)
        external
        nonReentrant
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        CampaignState state = campaignState[campaignId];
        FailureReason reason;
        if (state == CampaignState.FUNDED || state == CampaignState.MILESTONE_SETTLED) {
            require(
                block.timestamp >= activationDeadlines[campaignId],
                "activation deadline not reached"
            );
            reason = FailureReason.ACTIVATION_TIMEOUT;
        } else {
            require(state == CampaignState.MILESTONE_ACTIVE, "invalid state");
            require(
                block.timestamp >= evidenceDeadlines[campaignId][milestoneIndex],
                "evidence deadline not reached"
            );
            reason = FailureReason.EVIDENCE_TIMEOUT;
        }
        _failCampaign(campaignId, milestoneIndex, reason);
    }

    function _resumeOrFail(uint256 campaignId, uint256 milestoneIndex, FailureReason reason)
        internal
    {
        if (submissionVersion[campaignId][milestoneIndex] == MAX_SUBMISSIONS) {
            _failCampaign(campaignId, milestoneIndex, reason);
        } else {
            milestones[campaignId][milestoneIndex].state = MilestoneState.ACTIVE;
            campaignState[campaignId] = CampaignState.MILESTONE_ACTIVE;
            _setEvidenceDeadline(campaignId, milestoneIndex, RESUBMISSION_WINDOW);
        }
    }

    function _failCampaign(uint256 campaignId, uint256 milestoneIndex, FailureReason reason)
        internal
    {
        campaignState[campaignId] = CampaignState.FAILED;
        milestones[campaignId][milestoneIndex].state = MilestoneState.FAILED;
        activationDeadlines[campaignId] = 0;
        evidenceDeadlines[campaignId][milestoneIndex] = 0;
        emit CampaignFailed(campaignId, milestoneIndex, reason);
        _snapshotRefundAndReturnBond(campaignId);
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
}
