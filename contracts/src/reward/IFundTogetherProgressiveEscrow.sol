// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IEscrowV2Types} from "./IEscrowV2Types.sol";

/// @title IFundTogetherProgressiveEscrow
/// @notice Main campaign escrow interface for Core V2 Progressive Funding
interface IFundTogetherProgressiveEscrow is IEscrowV2Types {
    // --- Audit & Canonical Events ---
    event CampaignInitialized(
        uint256 indexed campaignId, address indexed creator, uint256 goalAmount, bytes32 termsHash
    );
    event Pledged(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event FundingFinalized(uint256 indexed campaignId, bool success, uint256 totalRaised);

    // Request Pipeline Events
    event RequestSubmitted(uint256 indexed campaignId, uint256 indexed requestId, bytes32 requestHash, uint256 amount);
    event RequestApproved(uint256 indexed campaignId, uint256 indexed requestId, uint256 approvedAmount);
    event RequestReserved(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount);
    event RequestDisbursed(
        uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, address indexed recipient
    );
    event ReconciliationSubmitted(uint256 indexed campaignId, uint256 indexed requestId, bytes32 evidenceHash);
    event ExpenseSettled(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedExpense);
    event UnusedReturned(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, address indexed sender);

    // Continuous Challenge Events
    event ChallengeSubmitted(
        uint256 indexed campaignId,
        uint256 indexed caseId,
        ChallengeTargetType targetType,
        uint256 targetId,
        address indexed challenger
    );
    event ChallengeAdmitted(
        uint256 indexed campaignId, uint256 indexed caseId, ChallengeTargetType targetType, uint256 targetId
    );
    event ChallengeUpheld(uint256 indexed campaignId, uint256 indexed caseId, bytes32 resolutionHash);
    event ChallengeDismissed(uint256 indexed campaignId, uint256 indexed caseId, bytes32 resolutionHash);

    // Deliverable Verification Events
    event DeliverableVerified(uint256 indexed campaignId, uint256 indexed deliverableId, bytes32 deliverableHash);

    // Settlement & Refund Events
    event WindDownInitiated(uint256 indexed campaignId, uint256 escrowSnapshot);
    event RefundClaimed(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event EscrowSweptToVault(
        uint256 indexed campaignId, uint256 amount, address indexed vaultAddress, bytes32 indexed campaignKey
    );
    event CampaignFinanciallyCompleted(uint256 indexed campaignId, uint256 creatorRemainderPayout);

    // --- Campaign Lifecycle ---
    function initializeCampaign(CampaignTerms calldata terms, CampaignFinancialConfig calldata config)
        external
        returns (uint256 campaignId);
    function pledge(uint256 campaignId) external;
    function finalizeFunding(uint256 campaignId) external;

    // --- FundingRequest Pipeline (1 Slot) ---
    function submitFundingRequest(uint256 campaignId, bytes32 requestHash, uint256 amount)
        external
        returns (uint256 requestId);
    function reviewFundingRequest(uint256 campaignId, uint256 requestId, uint256 approvedAmount, bool approve) external;
    function reserveFunds(uint256 campaignId, uint256 requestId) external;
    function disburseFunds(uint256 campaignId, uint256 requestId) external;

    // --- Reconciliation & Return ---
    function returnUnused(uint256 campaignId, uint256 requestId, uint256 amount) external;
    function submitReconciliation(uint256 campaignId, uint256 requestId, bytes32 evidenceHash) external;
    function reviewReconciliation(uint256 campaignId, uint256 requestId, uint256 acceptedExpense, bool approve) external;

    // --- Deliverable Verification ---
    function verifyDeliverable(uint256 campaignId, uint256 deliverableId, bytes32 deliverableHash) external;

    // --- Continuous Challenge Engine ---
    function submitChallenge(uint256 campaignId, ChallengeTargetType targetType, uint256 targetId, bytes32 evidenceHash)
        external
        returns (uint256 caseId);
    function admitChallenge(uint256 campaignId, uint256 caseId) external;
    function resolveChallenge(uint256 campaignId, uint256 caseId, bool uphold, bytes32 resolutionHash) external;

    // --- Wind-Down & Main Refund ---
    function startWindDown(uint256 campaignId) external;
    function claimRefund(uint256 campaignId) external;
    function sweepToVault(uint256 campaignId) external;

    // --- Final Completion ---
    function claimFinalPayout(uint256 campaignId) external;

    // --- View Functions for Audit & Invariant Verification ---
    function getCampaignLedger(uint256 campaignId) external view returns (LedgerView memory);
    function getRefundSweepData(uint256 campaignId) external view returns (RefundSweepData memory);
    function getTargetKey(uint256 campaignId, ChallengeTargetType targetType, uint256 targetId)
        external
        pure
        returns (bytes32);
    function isTargetFrozen(uint256 campaignId, ChallengeTargetType targetType, uint256 targetId)
        external
        view
        returns (bool);
    function getUnreconciledExposure(uint256 campaignId) external view returns (uint256);
    function getUnverifiedExpense(uint256 campaignId) external view returns (uint256);
    function getRiskExposure(uint256 campaignId) external view returns (uint256);
    function getContribution(uint256 campaignId, address backer) external view returns (uint256);
    function hasClaimedMainRefund(uint256 campaignId, address backer) external view returns (bool);
}
