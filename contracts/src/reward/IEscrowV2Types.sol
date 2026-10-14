// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IEscrowV2Types
/// @notice Common enums, structs and errors for FundTogether Core V2 Progressive Escrow & Vault
interface IEscrowV2Types {
    enum CampaignState {
        INITIALIZED, // 0: Terms committed, awaiting on-chain start
        FUNDING, // 1: Accepting pledges from backers
        ACTIVE, // 2: Goal reached; progressive funding & continuous challenge active
        FINAL_REVIEW, // 3: Deliverable complete; release challenge period
        FINANCIALLY_COMPLETE, // 4: Obligations resolved; creator remainder payout is eligible
        WIND_DOWN, // 5: Stopped; preparing refund snapshot
        REFUNDING_BASE, // 6: 7-day main refund round
        REFUND_SWEPT, // 7: Unclaimed main round escrow swept to Refund Vault
        COMPLETED // 8: Fully finished
    }

    enum RequestState {
        NONE, // 0: Non-existent
        DRAFT, // 1: Proposed by Creator
        SUBMITTED, // 2: Frozen hash submitted for review
        APPROVED, // 3: Resolver approved amount & purpose
        RESERVED, // 4: Escrow amount locked in Q partition
        DISBURSED, // 5: Transferred to Creator (pipeline slot freed)
        RECON_SUBMITTED, // 6: Expense evidence submitted (12h Review Window active)
        FINANCIALLY_SETTLED, // 7: acceptedExpense + returned == disbursed
        CANCELLED // 8: Cancelled before disbursement
    }

    enum ChallengeTargetType {
        FUNDING_REQUEST, // Target is a specific request ID
        RECONCILIATION, // Target is expense verification/invoices
        DELIVERABLE, // Target is milestone/artwork output
        RELEASE // Target is final PDF release
    }

    enum ChallengeState {
        SUBMITTED, // Backer filed challenge. Informational only, NO freeze.
        ADMITTED, // Resolver admitted case. SCOPED FREEZE active on target.
        UPHELD, // Resolver determined violation. Remedial action applied.
        DISMISSED // Resolver dismissed case. Scoped freeze lifted.
    }

    struct CampaignTerms {
        address creator;
        address primaryResolver;
        address backupResolver;
        address paymentToken;
        uint256 goalAmount;
        uint256 pledgePrice;
        uint256 fundingDeadline;
        uint256 releaseDeadline;
        bytes32 termsHash;
    }

    struct CampaignFinancialConfig {
        address refundVault; // Trusted shared vault for this campaign's refund round
        uint256 perRequestCapBps; // e.g. 2500 for 25% (configurable)
        uint256 unreconciledCapBps; // e.g. 5000 for 50% (configurable)
        uint256 outcomeExposureCapBps; // 5000 for 50%
        uint256 reviewWindowDuration; // 12 hours (43200 seconds)
        uint256 mainRoundDuration; // 7 days (604800 seconds)
    }

    struct FundingRequest {
        uint256 requestId;
        bytes32 requestHash;
        uint256 requestedAmount;
        uint256 approvedAmount;
        uint256 disbursedAmount;
        uint256 returnedAmount;
        uint256 acceptedExpense;
        uint256 reservedAt;
        uint256 disbursedAt;
        uint256 reconSubmittedAt;
        RequestState state;
        bytes32 reconEvidenceHash;
    }

    struct ChallengeCase {
        uint256 caseId;
        ChallengeTargetType targetType;
        uint256 targetId;
        address challenger;
        bytes32 evidenceHash;
        uint256 filedAt;
        ChallengeState state;
        bytes32 resolutionHash;
    }

    struct LedgerView {
        uint256 totalRaised;
        uint256 grossDisbursed;
        uint256 returnedUnused;
        uint256 mainRefunded;
        uint256 currentEscrowBalance;
        uint256 reservedQ;
        uint256 unreconciledExposure;
        uint256 outcomeExposure;
        uint256 riskExposure;
    }

    struct RefundSweepData {
        address paymentToken;
        uint256 roundId;
        uint256 amountToSweep;
        uint256 totalRaisedSnapshot;
        uint256 mainRoundClaimedSnapshot;
        bool sweepable;
    }

    // --- Custom Errors ---
    error Unauthorized();
    error WrongState();
    error PipelineSlotOccupied();
    error TargetFrozen();
    error ExposureCapExceeded();
    error RequestCapExceeded();
    error ZeroAmount();
    error InexactTransfer();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error AlreadyClaimed();
    error InvalidHash();
    error SelfApprovalForbidden();
    error InvalidRegistration();
    error EscrowNotRegistered();
    error InvalidSweepData();
    error ExpenseExceedsUnreturned();
}
