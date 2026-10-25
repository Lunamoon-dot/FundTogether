pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
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
    using SafeERC20 for IERC20;

    bytes32 public constant ACCOUNTING_DEPLOYMENT_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10_000;
    uint256 public constant REFERENCE_COURT_SIZE = 3;
    uint256 public constant MAX_VALID_COURTS = 2;

    bytes32 public immutable accountingDeploymentIdentity;
    IV2FinalOutcomeSource public immutable outcomeSource;
    uint256 public accountingTransitionSequence;

    mapping(uint256 => mapping(uint256 => bool)) public settlementProcessed;
    mapping(uint256 => mapping(uint256 => bytes32)) public settledCaseId;
    mapping(uint256 => mapping(uint256 => V2FinancialAccountingTypes.FinalOutcome)) public
        finalOutcome;
    mapping(uint256 => mapping(uint256 => uint256)) public judgePaid;
    mapping(uint256 => mapping(uint256 => uint256)) public judgeRewardClaimed;
    mapping(bytes32 => mapping(address => uint256)) public judgeRewardEntitlement;
    mapping(bytes32 => mapping(address => bool)) public judgeRewardWasClaimed;
    mapping(bytes32 => bool) public caseSettlementProcessed;
    mapping(uint256 => mapping(uint256 => uint256)) public creatorClaimable;
    mapping(uint256 => mapping(uint256 => uint256)) public creatorPaid;
    mapping(uint256 => mapping(uint256 => uint256)) public refundPool;
    mapping(uint256 => mapping(uint256 => uint256)) public settlementRefunded;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public
        settlementRefundWasClaimed;
    mapping(uint256 => mapping(uint256 => address[])) private milestoneContributors;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) private contributorSeen;

    error InvalidFinancialTerms();
    error InvalidFixtureIdentity();
    error InvalidOutcomeTranscript();
    error SettlementAlreadyProcessed();
    error SettlementNotProcessed();
    error NoClaimAvailable();
    error ClaimAlreadyProcessed();
    error UnauthorizedClaim();

    event JudgeRewardAccrued(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        uint256 indexed milestoneId,
        uint256 campaignId,
        bytes32 courtId,
        uint256 attemptIndex,
        address judge,
        uint256 amount,
        uint256 reserveRemaining,
        uint256 transitionSequence
    );

    event JudgeRewardClaimed(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        address indexed judge,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 amount,
        uint256 transitionSequence
    );

    event MilestoneReserveRefunded(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 caseId,
        uint256 amount,
        uint256 transitionSequence
    );

    event MilestonePaid(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 caseId,
        address creator,
        uint256 amount,
        uint256 transitionSequence
    );

    event MilestoneRefundsOpened(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 caseId,
        uint256 pool,
        uint256 snapshot,
        uint256 transitionSequence
    );

    event BackerRefundClaimed(
        bytes32 indexed deploymentIdentity,
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bytes32 caseId,
        address backer,
        uint256 amount,
        uint256 transitionSequence
    );

    constructor(
        IERC20 token_,
        bytes32 accountingDeploymentIdentity_,
        IV2FinalOutcomeSource outcomeSource_
    ) V2FundingFixture(token_, keccak256("fundtogether-vnext-v2-pr1-funding-fixture")) {
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
        uint256 creatorAmount = transcript.finalOutcome
            == V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
            ? milestone.creatorPayoutBudget
            : 0;
        creatorClaimable[campaignId][milestoneId] = creatorAmount;
        refundPool[campaignId][milestoneId] =
            raised[campaignId][milestoneId] - rewardTotal - creatorAmount;

        uint256 reserveRemaining = milestone.maxReviewReserve;
        if (transcript.court1.valid) {
            reserveRemaining = _accrueCourt(
                transcript.caseId,
                campaignId,
                milestoneId,
                transcript.court1,
                milestone.judgeRewardUnit,
                reserveRemaining
            );
        }
        if (transcript.court2.valid) {
            reserveRemaining = _accrueCourt(
                transcript.caseId,
                campaignId,
                milestoneId,
                transcript.court2,
                milestone.judgeRewardUnit,
                reserveRemaining
            );
        }

        _emitSettlementRefundEvents(campaignId, milestoneId, transcript.caseId, reserveRemaining);
    }

    function _emitSettlementRefundEvents(
        uint256 campaignId,
        uint256 milestoneId,
        bytes32 caseId,
        uint256 reserveRemaining
    ) internal {
        if (reserveRemaining != 0) {
            emit MilestoneReserveRefunded(
                accountingDeploymentIdentity,
                campaignId,
                milestoneId,
                caseId,
                reserveRemaining,
                _nextAccountingTransitionSequence()
            );
        }
        uint256 milestoneRefundPool = refundPool[campaignId][milestoneId];
        if (milestoneRefundPool != 0) {
            emit MilestoneRefundsOpened(
                accountingDeploymentIdentity,
                campaignId,
                milestoneId,
                caseId,
                milestoneRefundPool,
                raised[campaignId][milestoneId],
                _nextAccountingTransitionSequence()
            );
        }
    }

    function claimJudgeReward(uint256 campaignId, uint256 milestoneId) external nonReentrant {
        if (!settlementProcessed[campaignId][milestoneId]) revert SettlementNotProcessed();
        bytes32 caseId = settledCaseId[campaignId][milestoneId];
        if (judgeRewardWasClaimed[caseId][msg.sender]) revert ClaimAlreadyProcessed();
        uint256 amount = judgeRewardEntitlement[caseId][msg.sender];
        if (amount == 0) revert NoClaimAvailable();

        judgeRewardWasClaimed[caseId][msg.sender] = true;
        judgeRewardClaimed[campaignId][milestoneId] += amount;
        _transferExact(msg.sender, amount);
        emit JudgeRewardClaimed(
            accountingDeploymentIdentity,
            caseId,
            msg.sender,
            campaignId,
            milestoneId,
            amount,
            _nextAccountingTransitionSequence()
        );
    }

    function claimCreatorPayout(uint256 campaignId, uint256 milestoneId) external nonReentrant {
        if (!settlementProcessed[campaignId][milestoneId]) revert SettlementNotProcessed();
        Campaign storage campaign = _campaign(campaignId);
        if (msg.sender != campaign.payoutWallet) revert UnauthorizedClaim();
        if (creatorPaid[campaignId][milestoneId] != 0) revert ClaimAlreadyProcessed();
        uint256 amount = creatorClaimable[campaignId][milestoneId];
        if (amount == 0) revert NoClaimAvailable();

        creatorClaimable[campaignId][milestoneId] = 0;
        creatorPaid[campaignId][milestoneId] = amount;
        _milestone(campaignId, milestoneId).state = V2FundingTypes.MilestoneState.PAID;
        _transferExact(campaign.payoutWallet, amount);
        emit MilestonePaid(
            accountingDeploymentIdentity,
            campaignId,
            milestoneId,
            settledCaseId[campaignId][milestoneId],
            campaign.payoutWallet,
            amount,
            _nextAccountingTransitionSequence()
        );
    }

    function claimSettlementRefund(uint256 campaignId, uint256 milestoneId) external nonReentrant {
        if (!settlementProcessed[campaignId][milestoneId]) revert SettlementNotProcessed();
        if (settlementRefundWasClaimed[campaignId][milestoneId][msg.sender]) {
            revert ClaimAlreadyProcessed();
        }
        uint256 amount = settlementRefundEntitlement(campaignId, milestoneId, msg.sender);
        if (amount == 0) revert NoClaimAvailable();

        settlementRefundWasClaimed[campaignId][milestoneId][msg.sender] = true;
        settlementRefunded[campaignId][milestoneId] += amount;
        _transferExact(msg.sender, amount);
        emit BackerRefundClaimed(
            accountingDeploymentIdentity,
            campaignId,
            milestoneId,
            settledCaseId[campaignId][milestoneId],
            msg.sender,
            amount,
            _nextAccountingTransitionSequence()
        );
    }

    function settlementRefundEntitlement(uint256 campaignId, uint256 milestoneId, address backer)
        public
        view
        returns (uint256)
    {
        if (!settlementProcessed[campaignId][milestoneId]) return 0;
        uint256 contribution = contributionOf[campaignId][milestoneId][backer];
        uint256 pool = refundPool[campaignId][milestoneId];
        if (contribution == 0 || pool == 0) return 0;

        uint256 total = raised[campaignId][milestoneId];
        uint256 entitlement = Math.mulDiv(contribution, pool, total);
        (uint256 dust, uint256 rank) =
            _refundDustAndRank(campaignId, milestoneId, pool, total, backer);
        if (rank < dust) entitlement += 1;
        return entitlement;
    }

    function judgeRewardUnclaimed(uint256 campaignId, uint256 milestoneId)
        public
        view
        returns (uint256)
    {
        return judgePaid[campaignId][milestoneId] - judgeRewardClaimed[campaignId][milestoneId];
    }

    function escrowRemaining(uint256 campaignId, uint256 milestoneId)
        public
        view
        returns (uint256)
    {
        return raised[campaignId][milestoneId] - creatorPaid[campaignId][milestoneId]
            - judgePaid[campaignId][milestoneId] - refunded[campaignId][milestoneId]
            - settlementRefunded[campaignId][milestoneId];
    }

    function physicalCustody(uint256 campaignId, uint256 milestoneId)
        public
        view
        returns (uint256)
    {
        return raised[campaignId][milestoneId] - creatorPaid[campaignId][milestoneId]
            - judgeRewardClaimed[campaignId][milestoneId] - refunded[campaignId][milestoneId]
            - settlementRefunded[campaignId][milestoneId];
    }

    function fundedLiabilities(uint256 campaignId, uint256 milestoneId)
        public
        view
        returns (uint256)
    {
        if (settlementProcessed[campaignId][milestoneId]) {
            return creatorClaimable[campaignId][milestoneId]
                + judgeRewardUnclaimed(campaignId, milestoneId)
                + refundPool[campaignId][milestoneId] - settlementRefunded[campaignId][milestoneId];
        }
        uint256 snapshot = refundSnapshot[campaignId][milestoneId];
        return snapshot == 0 ? 0 : snapshot - refunded[campaignId][milestoneId];
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
        if (court.present != expectedPresent) {
            revert InvalidOutcomeTranscript();
        }
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
                    || court.judges[0] == court.judges[2] || court.judges[1] == court.judges[2]
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
        uint256 campaignId,
        uint256 milestoneId,
        V2FinancialAccountingTypes.CourtTranscript memory court,
        uint256 rewardUnit,
        uint256 reserveRemaining
    ) internal returns (uint256) {
        for (uint256 i = 0; i < REFERENCE_COURT_SIZE; i++) {
            address judge = court.judges[i];
            if (judgeRewardEntitlement[caseId][judge] != 0) {
                revert SettlementAlreadyProcessed();
            }
            judgeRewardEntitlement[caseId][judge] = rewardUnit;
            reserveRemaining -= rewardUnit;
            emit JudgeRewardAccrued(
                accountingDeploymentIdentity,
                caseId,
                milestoneId,
                campaignId,
                court.courtId,
                court.attemptIndex,
                judge,
                rewardUnit,
                reserveRemaining,
                _nextAccountingTransitionSequence()
            );
        }
        return reserveRemaining;
    }

    function _nextAccountingTransitionSequence() internal returns (uint256) {
        return ++accountingTransitionSequence;
    }

    function _afterContribution(uint256 campaignId, uint256 milestoneId, address backer)
        internal
        override
    {
        if (contributorSeen[campaignId][milestoneId][backer]) return;
        contributorSeen[campaignId][milestoneId][backer] = true;

        address[] storage contributors = milestoneContributors[campaignId][milestoneId];
        contributors.push(backer);
        uint256 index = contributors.length - 1;
        while (index > 0 && uint160(contributors[index - 1]) > uint160(backer)) {
            contributors[index] = contributors[index - 1];
            index--;
        }
        contributors[index] = backer;
    }

    function _refundDustAndRank(
        uint256 campaignId,
        uint256 milestoneId,
        uint256 pool,
        uint256 total,
        address backer
    ) internal view returns (uint256 dust, uint256 rank) {
        address[] storage contributors = milestoneContributors[campaignId][milestoneId];
        uint256 allocated;
        rank = type(uint256).max;
        for (uint256 i = 0; i < contributors.length; i++) {
            address contributor = contributors[i];
            allocated += Math.mulDiv(
                contributionOf[campaignId][milestoneId][contributor], pool, total
            );
            if (contributor == backer) rank = i;
        }
        dust = pool - allocated;
    }

    function _transferExact(address recipient, uint256 amount) internal {
        uint256 custodyBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 custodyAfter = token.balanceOf(address(this));
        uint256 recipientAfter = token.balanceOf(recipient);
        if (
            custodyAfter > custodyBefore || custodyBefore - custodyAfter != amount
                || recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount
        ) revert UnsupportedTokenTransfer();
    }
}
