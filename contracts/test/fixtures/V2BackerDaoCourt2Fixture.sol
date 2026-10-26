pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingTypes
} from "./V2FinancialAccountingFixture.sol";
import { V2CourtResetFixture } from "./V2CourtResetFixture.sol";
import { V2FundingTypes } from "./V2FundingFixture.sol";

/// @notice Foundry-only PR4 adapter for CWQ-1, DAO-TEMPORAL-1 and one Court 2.
/// @dev Entropy is deterministic test input only. This fixture proves neither randomness quality nor
///      Sybil resistance, and is not deployment code.
contract V2BackerDaoCourt2Fixture is V2CourtResetFixture {
    bytes32 public constant DAO_POLICY_VERSION = keccak256("CWQ-1/DAO-TEMPORAL-1");
    uint256 public constant DAO_PARTICIPATION_THRESHOLD_BPS = 2_000;
    uint256 public constant DAO_BPS_DENOMINATOR = 10_000;
    uint256 public constant DAO_CONTRIBUTION_CAP = type(uint128).max;
    /// @dev Research-fixture policy only; no early-close policy is approved or implemented.
    uint256 public constant DAO_VOTING_DURATION = 1 days;
    uint256 public constant COURT2_ASSIGNMENT_TIMEOUT = 1 days;

    enum DaoChoice {
        NONE,
        ACCEPT,
        APPEAL
    }

    struct DaoCase {
        uint256 campaignId;
        uint256 milestoneId;
        uint256 openedAt;
        uint256 votingDeadline;
        uint256 eligibleWalletCount;
        uint256 totalWeight;
        uint256 acceptWeight;
        uint256 appealWeight;
        uint256 castWeight;
        uint256 finalizedAt;
        DaoChoice decision;
        bool opened;
        bool finalized;
    }

    struct ReviewMaterial {
        address creator;
        bytes32 evidenceRevision;
        bytes32 acceptanceCriteriaHash;
    }

    mapping(bytes32 => DaoCase) private daoCases;
    mapping(bytes32 => mapping(address => uint256)) public snapshotContribution;
    mapping(bytes32 => mapping(address => uint256)) public snapshotWeight;
    mapping(bytes32 => mapping(address => bool)) public daoEligible;
    mapping(bytes32 => mapping(address => bool)) public daoVoted;
    mapping(bytes32 => mapping(address => DaoChoice)) public daoBallot;
    mapping(uint256 => mapping(uint256 => bytes32)) public workflowCaseFor;
    mapping(bytes32 => ReviewMaterial) private workflowReviewMaterial;
    mapping(bytes32 => ReviewMaterial) private courtReviewMaterial;
    mapping(bytes32 => bytes32) public unassignedCourt2FailureId;

    error WorkflowCaseAlreadyBound();
    error WorkflowCaseNotBound();
    error DaoNotReady();
    error DaoAlreadyOpened();
    error DaoNotOpen();
    error DaoAlreadyFinalized();
    error DaoIneligibleVoter();
    error DaoDuplicateBallot();
    error DaoVotingWindowOpen();
    error DaoVotingWindowClosed();
    error InvalidDaoChoice();
    error SnapshotContributionCapExceeded();
    error Court2BypassDisabled();
    error Court2AssignmentWindowOpen();
    error Court2CandidatesAvailable();

    event DaoOpened(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        uint256 indexed campaignId,
        uint256 milestoneId,
        bytes32 policyVersion,
        uint256 openedAt,
        uint256 votingDeadline,
        uint256 eligibleWalletCount,
        uint256 totalWeight,
        string policyStatus
    );
    event DaoBallotCast(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        address indexed voter,
        DaoChoice choice,
        uint256 weight
    );
    event DaoFinalized(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        DaoChoice decision,
        uint256 acceptWeight,
        uint256 appealWeight,
        uint256 castWeight,
        uint256 totalWeight
    );
    event Court2AssignmentExhausted(
        bytes32 indexed deploymentIdentity, bytes32 indexed caseId, bytes32 indexed settlementId
    );

    constructor(IERC20 token_, IERC20 stakeToken_)
        V2CourtResetFixture(
            token_,
            RESET_DEPLOYMENT_IDENTITY,
            new ImmutableV2FinalOutcomeSource(_placeholderTranscript()),
            stakeToken_
        )
    { }

    function daoPolicyStatus() external pure returns (string memory) {
        return "PROPOSED_PENDING_APPROVAL";
    }

    function floorSqrt(uint256 contribution) external pure returns (uint256) {
        if (contribution > DAO_CONTRIBUTION_CAP) revert SnapshotContributionCapExceeded();
        return Math.sqrt(contribution);
    }

    /// @dev Deterministic vector seam for Q1-Q10; it has no case, ballot or financial authority.
    function evaluateDaoVector(uint256[] calldata contributions, DaoChoice[] calldata choices)
        external
        pure
        returns (
            DaoChoice decision,
            uint256 totalWeight,
            uint256 acceptWeight,
            uint256 appealWeight
        )
    {
        if (contributions.length != choices.length) {
            revert InvalidDaoChoice();
        }
        for (uint256 i = 0; i < contributions.length; i++) {
            if (contributions[i] > DAO_CONTRIBUTION_CAP) revert SnapshotContributionCapExceeded();
            if (choices[i] == DaoChoice.NONE) revert InvalidDaoChoice();
            uint256 weight = Math.sqrt(contributions[i]);
            totalWeight += weight;
            if (choices[i] == DaoChoice.ACCEPT) acceptWeight += weight;
            else appealWeight += weight;
        }
        decision = _daoDecision(totalWeight, acceptWeight, appealWeight);
    }

    /// @dev Arithmetic-boundary seam for Q9; it has no case or settlement authority.
    function evaluateDaoWeightsForTest(
        uint256 totalWeight,
        uint256 acceptWeight,
        uint256 appealWeight
    ) external pure returns (DaoChoice) {
        return _daoDecision(totalWeight, acceptWeight, appealWeight);
    }

    function createWorkflowCase(
        bytes32 caseId,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 caseStakeRequirement,
        uint256 disruptionAllowance,
        uint256 finalizationAllowance
    ) external {
        if (workflowCaseFor[campaignId][milestoneId] != bytes32(0)) {
            revert WorkflowCaseAlreadyBound();
        }
        (bytes32 evidenceRevision, bytes32 acceptanceCriteriaHash) =
            this.milestoneReviewTerms(campaignId, milestoneId);
        workflowCaseFor[campaignId][milestoneId] = caseId;
        workflowReviewMaterial[caseId] = ReviewMaterial({
            creator: this.campaignCreator(campaignId),
            evidenceRevision: evidenceRevision,
            acceptanceCriteriaHash: acceptanceCriteriaHash
        });
        this.createCase(
            caseId,
            campaignId,
            milestoneId,
            caseStakeRequirement,
            disruptionAllowance,
            finalizationAllowance
        );
    }

    function assignCourt(bytes32 caseId, CourtLevel level, uint256 entropy)
        public
        override
        returns (bytes32 courtId)
    {
        courtId = super.assignCourt(caseId, level, entropy);
        courtReviewMaterial[courtId] = workflowReviewMaterial[caseId];
    }

    function openDao(bytes32 caseId) external {
        CaseRecord memory reviewCase = this.caseTerms(caseId);
        DaoCase storage dao = daoCases[caseId];
        if (
            workflowCaseFor[reviewCase.campaignId][reviewCase.milestoneId] != caseId
                || !reviewCase.court1Valid || reviewCase.protocolFailed
                || this.milestoneState(reviewCase.campaignId, reviewCase.milestoneId)
                    != V2FundingTypes.MilestoneState.FUNDED
        ) revert DaoNotReady();
        if (dao.opened) revert DaoAlreadyOpened();

        dao.campaignId = reviewCase.campaignId;
        dao.milestoneId = reviewCase.milestoneId;
        dao.openedAt = block.timestamp;
        dao.votingDeadline = block.timestamp + DAO_VOTING_DURATION;
        dao.opened = true;

        address[] storage contributors =
            _milestoneContributors(reviewCase.campaignId, reviewCase.milestoneId);
        for (uint256 i = 0; i < contributors.length; i++) {
            address contributor = contributors[i];
            if (caseJudgeAssigned[caseId][contributor]) continue;

            uint256 contribution =
                contributionOf[reviewCase.campaignId][reviewCase.milestoneId][contributor];
            if (contribution > DAO_CONTRIBUTION_CAP) revert SnapshotContributionCapExceeded();
            uint256 weight = Math.sqrt(contribution);
            if (weight == 0) continue;

            daoEligible[caseId][contributor] = true;
            snapshotContribution[caseId][contributor] = contribution;
            snapshotWeight[caseId][contributor] = weight;
            dao.eligibleWalletCount += 1;
            dao.totalWeight += weight;
        }

        emit DaoOpened(
            resetDeploymentIdentity,
            caseId,
            dao.campaignId,
            dao.milestoneId,
            DAO_POLICY_VERSION,
            dao.openedAt,
            dao.votingDeadline,
            dao.eligibleWalletCount,
            dao.totalWeight,
            "PROPOSED_PENDING_APPROVAL"
        );
    }

    function castDaoBallot(bytes32 caseId, DaoChoice choice) external {
        DaoCase storage dao = daoCases[caseId];
        if (!dao.opened) revert DaoNotOpen();
        if (dao.finalized) revert DaoAlreadyFinalized();
        if (block.timestamp >= dao.votingDeadline) revert DaoVotingWindowClosed();
        if (choice == DaoChoice.NONE) revert InvalidDaoChoice();
        if (!daoEligible[caseId][msg.sender]) revert DaoIneligibleVoter();
        if (daoVoted[caseId][msg.sender]) revert DaoDuplicateBallot();

        uint256 weight = snapshotWeight[caseId][msg.sender];
        daoVoted[caseId][msg.sender] = true;
        daoBallot[caseId][msg.sender] = choice;
        dao.castWeight += weight;
        if (choice == DaoChoice.ACCEPT) {
            dao.acceptWeight += weight;
        } else {
            dao.appealWeight += weight;
        }

        emit DaoBallotCast(resetDeploymentIdentity, caseId, msg.sender, choice, weight);
    }

    function finalizeDao(bytes32 caseId) external {
        DaoCase storage dao = daoCases[caseId];
        if (!dao.opened) revert DaoNotOpen();
        if (dao.finalized) revert DaoAlreadyFinalized();
        if (block.timestamp < dao.votingDeadline) revert DaoVotingWindowOpen();

        DaoChoice decision = _daoDecision(dao.totalWeight, dao.acceptWeight, dao.appealWeight);

        dao.decision = decision;
        dao.finalized = true;
        dao.finalizedAt = block.timestamp;
        if (decision == DaoChoice.APPEAL) _enableCourt2Gate(caseId);

        emit DaoFinalized(
            resetDeploymentIdentity,
            caseId,
            decision,
            dao.acceptWeight,
            dao.appealWeight,
            dao.castWeight,
            dao.totalWeight
        );
    }

    /// @dev PR3's explicit seam is intentionally disabled in this integrated workflow.
    function enableCourt2ForTest(bytes32) external pure override {
        revert Court2BypassDisabled();
    }

    function finalizeCourt2AssignmentExhaustion(bytes32 caseId) external {
        DaoCase storage dao = daoCases[caseId];
        CaseRecord memory reviewCase = this.caseTerms(caseId);
        if (
            !dao.finalized || dao.decision != DaoChoice.APPEAL || reviewCase.protocolFailed
                || reviewCase.court2Valid || reviewCase.activeCourtId != bytes32(0)
        ) revert DaoNotReady();
        if (block.timestamp < dao.finalizedAt + COURT2_ASSIGNMENT_TIMEOUT) {
            revert Court2AssignmentWindowOpen();
        }
        if (_eligibleCourt2JudgeCount(caseId, reviewCase.requiredLockedStake) >= 3) {
            revert Court2CandidatesAvailable();
        }

        bytes32 settlementId =
            keccak256(abi.encode(DAO_POLICY_VERSION, caseId, "court2-assignment-exhaustion"));
        unassignedCourt2FailureId[caseId] = settlementId;
        _failUnassignedCourt2(caseId, settlementId);
        emit Court2AssignmentExhausted(resetDeploymentIdentity, caseId, settlementId);
    }

    function daoCaseInfo(bytes32 caseId) external view returns (DaoCase memory) {
        return daoCases[caseId];
    }

    function courtReviewMaterialFor(bytes32 courtId) external view returns (ReviewMaterial memory) {
        return courtReviewMaterial[courtId];
    }

    function workflowTranscript(bytes32 caseId)
        external
        view
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory)
    {
        return _workflowTranscript(caseId);
    }

    function validatedOutcome(uint256 campaignId, uint256 milestoneId)
        public
        view
        override
        returns (
            bytes32 caseId,
            V2FinancialAccountingTypes.FinalOutcome resolvedOutcome,
            uint256 validCourtCount
        )
    {
        caseId = workflowCaseFor[campaignId][milestoneId];
        if (caseId == bytes32(0)) revert WorkflowCaseNotBound();
        if (this.milestoneState(campaignId, milestoneId) != V2FundingTypes.MilestoneState.FUNDED) {
            revert InvalidOutcomeTranscript();
        }
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript =
            _workflowTranscript(caseId);
        validCourtCount = _validateTranscript(transcript, campaignId, milestoneId);
        return (caseId, transcript.finalOutcome, validCourtCount);
    }

    function settleMilestone(uint256 campaignId, uint256 milestoneId) public override {
        bytes32 caseId = workflowCaseFor[campaignId][milestoneId];
        if (caseId == bytes32(0)) revert WorkflowCaseNotBound();
        _settleMilestone(campaignId, milestoneId, _workflowTranscript(caseId));
    }

    function _selectJudges(
        bytes32 caseId,
        CourtLevel level,
        uint256 attemptIndex,
        uint256 entropy,
        uint256 requiredLockedStake
    ) internal view override returns (address[3] memory selected) {
        if (judgePool.length < 3) revert InvalidJudgeSet();
        uint256 start =
            uint256(keccak256(abi.encode(caseId, level, attemptIndex, entropy))) % judgePool.length;
        uint256 selectedCount;
        for (uint256 offset = 0; offset < judgePool.length && selectedCount < 3; offset++) {
            address candidate = judgePool[(start + offset) % judgePool.length];
            if (!_isEligibleWorkflowJudge(caseId, level, candidate, requiredLockedStake)) continue;
            selected[selectedCount++] = candidate;
        }
        if (selectedCount != 3) revert InvalidJudgeSet();
    }

    function _eligibleCourt2JudgeCount(bytes32 caseId, uint256 requiredLockedStake)
        internal
        view
        returns (uint256 count)
    {
        for (uint256 i = 0; i < judgePool.length; i++) {
            if (_isEligibleWorkflowJudge(
                    caseId, CourtLevel.COURT_2, judgePool[i], requiredLockedStake
                )) {
                count++;
            }
        }
    }

    function _isEligibleWorkflowJudge(
        bytes32 caseId,
        CourtLevel level,
        address candidate,
        uint256 requiredLockedStake
    ) internal view returns (bool) {
        return candidate != workflowReviewMaterial[caseId].creator
            && !caseJudgeAssigned[caseId][candidate]
            && (level != CourtLevel.COURT_2 || !daoVoted[caseId][candidate])
            && stakePool.availableStake(candidate) >= requiredLockedStake;
    }

    function _daoDecision(uint256 totalWeight, uint256 acceptWeight, uint256 appealWeight)
        internal
        pure
        returns (DaoChoice)
    {
        uint256 castWeight = acceptWeight + appealWeight;
        if (
            totalWeight == 0
                || castWeight * DAO_BPS_DENOMINATOR < totalWeight * DAO_PARTICIPATION_THRESHOLD_BPS
                || appealWeight <= acceptWeight
        ) return DaoChoice.ACCEPT;
        return DaoChoice.APPEAL;
    }

    function _workflowTranscript(bytes32 caseId)
        internal
        view
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript)
    {
        CaseRecord memory reviewCase = this.caseTerms(caseId);
        DaoCase storage dao = daoCases[caseId];
        transcript.deploymentIdentity = accountingDeploymentIdentity;
        transcript.caseId = caseId;
        transcript.campaignId = reviewCase.campaignId;
        transcript.milestoneId = reviewCase.milestoneId;
        transcript.court1 = _latestCourtTranscript(caseId, CourtLevel.COURT_1);

        if (reviewCase.protocolFailed) {
            transcript.finalized = true;
            transcript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
            transcript.appealed = dao.finalized && dao.decision == DaoChoice.APPEAL;
            if (transcript.appealed) {
                transcript.court2 = _latestCourtTranscript(caseId, CourtLevel.COURT_2);
                if (!transcript.court2.present) {
                    transcript.court2.present = true;
                    transcript.court2.courtId = unassignedCourt2FailureId[caseId];
                }
            }
            return transcript;
        }

        if (!dao.finalized) return transcript;
        if (dao.decision == DaoChoice.ACCEPT) {
            transcript.finalized = true;
            transcript.finalOutcome = transcript.court1.pass
                ? V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
                : V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
            return transcript;
        }

        transcript.appealed = true;
        transcript.court2 = _latestCourtTranscript(caseId, CourtLevel.COURT_2);
        if (!transcript.court2.valid) return transcript;
        transcript.finalized = true;
        transcript.finalOutcome = transcript.court2.pass
            ? V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
            : V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
    }

    function _latestCourtTranscript(bytes32 caseId, CourtLevel level)
        internal
        view
        returns (V2FinancialAccountingTypes.CourtTranscript memory transcript)
    {
        bytes32[] memory history = this.caseCourtHistory(caseId);
        for (uint256 i = history.length; i != 0; i--) {
            CourtAttempt memory court = this.courtInfo(history[i - 1]);
            if (court.level != level) continue;
            transcript.present = true;
            transcript.valid = court.valid;
            transcript.pass = court.passVote[0] && court.passVote[1] || court.passVote[0]
                && court.passVote[2] || court.passVote[1] && court.passVote[2];
            transcript.courtId = court.courtId;
            transcript.attemptIndex = court.attemptIndex;
            transcript.judges = court.judges;
            return transcript;
        }
    }

    function _placeholderTranscript()
        private
        pure
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript)
    {
        transcript.deploymentIdentity = ACCOUNTING_DEPLOYMENT_IDENTITY;
    }
}
