pragma solidity 0.8.24;

library AdvanceTypes {
    enum CampaignState {
        DRAFT, APPROVED, FUNDING, FIRST_REVIEW, ADVANCE_AVAILABLE,
        EXECUTING, EVIDENCE_REVIEW, SUPPLEMENT_DUE, CHALLENGE_WINDOW,
        CASE_OPEN, COMPLETED, STOPPED
    }

    enum StageState {
        PENDING, ADVANCED, EVIDENCE_REVIEW, SUPPLEMENT_DUE,
        CHALLENGE_WINDOW, CASE_OPEN, FINALIZED, STOPPED
    }

    enum StopReason {
        CANCELLED, FUNDING_TIMEOUT, FIRST_REVIEW_TIMEOUT, CLAIM_TIMEOUT,
        EVIDENCE_TIMEOUT, REVIEW_TIMEOUT, VERSION_LIMIT, CASE_STOP,
        CASE_TIMEOUT, FINALIZATION_TIMEOUT, HARD_STOP, REVIEW_REJECTED,
        RESOLVER_STOP
    }

    enum ReviewOutcome { MET, NEEDS_INFORMATION, NOT_MET, INCONCLUSIVE }
    enum Resolution { PENDING, CONTINUE, RESUBMIT, STOP, TIMEOUT }

    struct CaseView {
        address opener;
        bytes32 reasonHash;
        bytes32 responseHash;
        uint256 responseEnd;
        uint256 resolutionEnd;
        Resolution resolution;
        bytes32 resolutionReasonHash;
        bool caseUsed;
    }

    struct EvidenceRef {
        uint256 campaignId;
        uint256 stage;
        uint256 version;
        bytes32 evidenceHash;
    }

    struct SubmissionView {
        uint256 version;
        bytes32 evidenceHash;
        uint256 parentVersion;
        uint256 submittedAt;
        bool reviewed;
        ReviewOutcome outcome;
        bytes32 reportHash;
        bytes32 publicHash;
    }

    struct CampaignView {
        address organizer;
        bytes32 planHash;
        uint256 goal;
        uint256 fundingDuration;
        CampaignState state;
        uint256 currentStage;
        uint256 fundingEnd;
        uint256 firstReviewEnd;
        uint256 claimEnd;
        uint256 contributed;
        uint256 advanced;
        uint256 returned;
        uint256 refunded;
        uint256 custody;
        bool refundSnapshotted;
        uint256 basePool;
        uint256 supplementPool;
    }

    struct StageView {
        uint256 budget;
        bytes32 criteriaHash;
        StageState state;
        uint256 advanced;
        uint256 returned;
        uint256 latestVersion;
        uint256 hardStop;
        uint256 submissionEnd;
        uint256 reviewEnd;
        uint256 challengeEnd;
        uint256 finalizeEnd;
        uint256 acceptedCampaignSpent;
        uint256 declaredUnused;
        bytes32 publicHash;
        bytes32 reportHash;
    }
}
