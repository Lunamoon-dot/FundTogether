pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { V2FundingFixture, V2FundingTypes } from "./V2FundingFixture.sol";

library V2FinancialAccountingTypes {
    enum FinalOutcome {
        NONE,
        FINAL_PASS,
        VERDICT_FAIL,
        PROTOCOL_FAIL
    }

    struct CourtTranscript {
        bool present;
        bool valid;
        bool pass;
        bytes32 courtId;
        uint256 attemptIndex;
        address[3] judges;
    }

    struct FinalizedTranscript {
        bytes32 deploymentIdentity;
        bytes32 caseId;
        uint256 campaignId;
        uint256 milestoneId;
        bool finalized;
        FinalOutcome finalOutcome;
        bool appealed;
        CourtTranscript court1;
        CourtTranscript court2;
    }
}

interface IV2FinalOutcomeSource {
    function finalizedTranscript()
        external
        view
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory);
}

/// @notice Constructor-frozen outcome data for Foundry accounting scenarios only.
contract ImmutableV2FinalOutcomeSource is IV2FinalOutcomeSource {
    V2FinancialAccountingTypes.FinalizedTranscript private transcript;

    constructor(V2FinancialAccountingTypes.FinalizedTranscript memory transcript_) {
        transcript = transcript_;
    }

    function finalizedTranscript()
        external
        view
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory)
    {
        return transcript;
    }
}

/// @notice Isolated, test-only PR2 accounting fixture. It is not deployment code.
contract V2FinancialAccountingFixture is V2FundingFixture {
    bytes32 public constant ACCOUNTING_DEPLOYMENT_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10_000;
    uint256 public constant REFERENCE_COURT_SIZE = 3;
    uint256 public constant MAX_VALID_COURTS = 2;

    bytes32 public immutable accountingDeploymentIdentity;
    IV2FinalOutcomeSource public immutable outcomeSource;

    mapping(uint256 => mapping(uint256 => bool)) public settlementProcessed;
    mapping(uint256 => mapping(uint256 => bytes32)) public settledCaseId;
    mapping(uint256 => mapping(uint256 => V2FinancialAccountingTypes.FinalOutcome))
        public finalOutcome;
    mapping(uint256 => mapping(uint256 => uint256)) public judgePaid;
    mapping(uint256 => mapping(uint256 => uint256)) public judgeRewardClaimed;
    mapping(bytes32 => mapping(address => uint256)) public judgeRewardEntitlement;
    mapping(bytes32 => mapping(address => bool)) public judgeRewardWasClaimed;
    mapping(bytes32 => bool) public caseSettlementProcessed;

    error InvalidFinancialTerms();
    error InvalidFixtureIdentity();
    error InvalidOutcomeTranscript();
    error SettlementAlreadyProcessed();

    constructor(
        IERC20 token_,
        bytes32 accountingDeploymentIdentity_,
        IV2FinalOutcomeSource outcomeSource_
    )
        V2FundingFixture(token_, keccak256("fundtogether-vnext-v2-pr1-funding-fixture"))
    {
        if (
            accountingDeploymentIdentity_ != ACCOUNTING_DEPLOYMENT_IDENTITY
                || address(outcomeSource_) == address(0)
                || address(outcomeSource_).codehash
                    != keccak256(type(ImmutableV2FinalOutcomeSource).runtimeCode)
        ) revert InvalidFixtureIdentity();

        accountingDeploymentIdentity = accountingDeploymentIdentity_;
        outcomeSource = outcomeSource_;
    }

    function validatedOutcome(uint256 campaignId, uint256 milestoneId)
        external
        view
        returns (
            bytes32 caseId,
            V2FinancialAccountingTypes.FinalOutcome resolvedOutcome,
            uint256 validCourtCount
        )
    {
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestone.state != V2FundingTypes.MilestoneState.FUNDED) {
            revert InvalidOutcomeTranscript();
        }

        V2FinancialAccountingTypes.FinalizedTranscript memory transcript =
            outcomeSource.finalizedTranscript();
        validCourtCount = _validateTranscript(transcript, campaignId, milestoneId);
        return (transcript.caseId, transcript.finalOutcome, validCourtCount);
    }

    function settleMilestone(uint256 campaignId, uint256 milestoneId) external {
        Milestone storage milestone = _milestone(campaignId, milestoneId);
        if (milestone.state != V2FundingTypes.MilestoneState.FUNDED) {
            revert InvalidOutcomeTranscript();
        }
        if (settlementProcessed[campaignId][milestoneId]) {
            revert SettlementAlreadyProcessed();
        }

        V2FinancialAccountingTypes.FinalizedTranscript memory transcript =
            outcomeSource.finalizedTranscript();
        uint256 validCourtCount = _validateTranscript(transcript, campaignId, milestoneId);
        if (caseSettlementProcessed[transcript.caseId]) revert SettlementAlreadyProcessed();

        uint256 rewardTotal = milestone.judgeRewardUnit * REFERENCE_COURT_SIZE * validCourtCount;
        if (rewardTotal > milestone.maxReviewReserve) revert InvalidFinancialTerms();

        settlementProcessed[campaignId][milestoneId] = true;
        caseSettlementProcessed[transcript.caseId] = true;
        settledCaseId[campaignId][milestoneId] = transcript.caseId;
        finalOutcome[campaignId][milestoneId] = transcript.finalOutcome;
        judgePaid[campaignId][milestoneId] = rewardTotal;

        if (transcript.court1.valid) {
            _accrueCourt(transcript.caseId, transcript.court1, milestone.judgeRewardUnit);
        }
        if (transcript.court2.valid) {
            _accrueCourt(transcript.caseId, transcript.court2, milestone.judgeRewardUnit);
        }
    }

    function deriveFinancialTerms(uint256 fundingTarget, uint256 rewardRateBps)
        public
        pure
        returns (uint256 rewardUnit, uint256 maxReviewReserve, uint256 creatorPayoutBudget)
    {
        if (
            fundingTarget == 0 || rewardRateBps == 0
                || fundingTarget > type(uint256).max / rewardRateBps
        ) revert InvalidFinancialTerms();

        rewardUnit = fundingTarget * rewardRateBps / BASIS_POINTS_DENOMINATOR;
        if (rewardUnit == 0 || rewardUnit > type(uint256).max / REFERENCE_COURT_SIZE) {
            revert InvalidFinancialTerms();
        }

        maxReviewReserve = rewardUnit * REFERENCE_COURT_SIZE;
        if (maxReviewReserve > type(uint256).max / MAX_VALID_COURTS) {
            revert InvalidFinancialTerms();
        }
        maxReviewReserve *= MAX_VALID_COURTS;

        if (maxReviewReserve >= fundingTarget) revert InvalidFinancialTerms();
        creatorPayoutBudget = fundingTarget - maxReviewReserve;
        if (creatorPayoutBudget == 0) revert InvalidFinancialTerms();
    }

    function _validateTranscript(
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript,
        uint256 campaignId,
        uint256 milestoneId
    ) internal view returns (uint256 validCourtCount) {
        if (
            transcript.deploymentIdentity != accountingDeploymentIdentity
                || transcript.caseId == bytes32(0) || transcript.campaignId != campaignId
                || transcript.milestoneId != milestoneId || !transcript.finalized
                || transcript.finalOutcome == V2FinancialAccountingTypes.FinalOutcome.NONE
                || !transcript.court1.present
        ) revert InvalidOutcomeTranscript();

        _validateCourt(transcript.court1, true);
        if (transcript.court1.valid) validCourtCount = 1;

        V2FinancialAccountingTypes.FinalOutcome expectedOutcome;
        if (transcript.appealed) {
            if (!transcript.court1.valid || !transcript.court2.present) {
                revert InvalidOutcomeTranscript();
            }
            _validateCourt(transcript.court2, true);
            if (transcript.court2.valid) {
                _validateNoCourtOverlap(transcript.court1, transcript.court2);
                validCourtCount = 2;
                expectedOutcome = transcript.court2.pass
                    ? V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
                    : V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
            } else {
                expectedOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
            }
        } else {
            _validateCourt(transcript.court2, false);
            if (transcript.court1.valid) {
                expectedOutcome = transcript.court1.pass
                    ? V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
                    : V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
            } else {
                expectedOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
            }
        }

        if (transcript.finalOutcome != expectedOutcome) revert InvalidOutcomeTranscript();
    }

    function _validateCourt(
        V2FinancialAccountingTypes.CourtTranscript memory court,
        bool expectedPresent
    ) internal pure {
        if (court.present != expectedPresent) revert InvalidOutcomeTranscript();
        if (!expectedPresent) {
            if (
                court.valid || court.pass || court.courtId != bytes32(0) || court.attemptIndex != 0
                    || court.judges[0] != address(0) || court.judges[1] != address(0)
                    || court.judges[2] != address(0)
            ) revert InvalidOutcomeTranscript();
            return;
        }

        if (court.courtId == bytes32(0)) revert InvalidOutcomeTranscript();
        if (court.valid) {
            if (
                court.judges[0] == address(0) || court.judges[1] == address(0)
                    || court.judges[2] == address(0) || court.judges[0] == court.judges[1]
                    || court.judges[0] == court.judges[2]
                    || court.judges[1] == court.judges[2]
            ) revert InvalidOutcomeTranscript();
        }
    }

    function _validateNoCourtOverlap(
        V2FinancialAccountingTypes.CourtTranscript memory court1,
        V2FinancialAccountingTypes.CourtTranscript memory court2
    ) internal pure {
        for (uint256 i = 0; i < REFERENCE_COURT_SIZE; i++) {
            for (uint256 j = 0; j < REFERENCE_COURT_SIZE; j++) {
                if (court1.judges[i] == court2.judges[j]) revert InvalidOutcomeTranscript();
            }
        }
    }

    function _accrueCourt(
        bytes32 caseId,
        V2FinancialAccountingTypes.CourtTranscript memory court,
        uint256 rewardUnit
    ) internal {
        for (uint256 i = 0; i < REFERENCE_COURT_SIZE; i++) {
            address judge = court.judges[i];
            if (judgeRewardEntitlement[caseId][judge] != 0) {
                revert SettlementAlreadyProcessed();
            }
            judgeRewardEntitlement[caseId][judge] = rewardUnit;
        }
    }
}
