pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IV2FinalOutcomeSource,
    V2FinancialAccountingFixture
} from "./V2FinancialAccountingFixture.sol";

/// @notice Separate test-only stake custody for CCPS-1. It never holds milestone escrow.
contract V2CourtResetStakePool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable controller;

    mapping(address => uint256) public depositedStake;
    mapping(address => uint256) public reservedStake;
    uint256 public totalClaimLiability;

    error UnauthorizedController();
    error ZeroAmount();
    error InsufficientAvailableStake();
    error InsufficientReservedStake();
    error InsufficientClaimLiability();
    error UnsupportedTokenTransfer();

    modifier onlyController() {
        if (msg.sender != controller) revert UnauthorizedController();
        _;
    }

    constructor(IERC20 token_, address controller_) {
        if (address(token_) == address(0) || controller_ == address(0)) {
            revert UnauthorizedController();
        }
        token = token_;
        controller = controller_;
    }

    function depositFrom(address judge, uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(judge, address(this), amount);
        uint256 afterBalance = token.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert UnsupportedTokenTransfer();
        }
        depositedStake[judge] += amount;
    }

    function availableStake(address judge) public view returns (uint256) {
        return depositedStake[judge] - reservedStake[judge];
    }

    function reserve(address judge, uint256 amount) external onlyController {
        if (availableStake(judge) < amount) revert InsufficientAvailableStake();
        reservedStake[judge] += amount;
    }

    function release(address judge, uint256 amount) external onlyController {
        if (reservedStake[judge] < amount) revert InsufficientReservedStake();
        reservedStake[judge] -= amount;
    }

    function slashReserved(address judge, uint256 amount) external onlyController {
        if (reservedStake[judge] < amount || depositedStake[judge] < amount) {
            revert InsufficientReservedStake();
        }
        reservedStake[judge] -= amount;
        depositedStake[judge] -= amount;
        totalClaimLiability += amount;
    }

    function withdraw(address judge, uint256 amount) external onlyController nonReentrant {
        if (amount == 0 || availableStake(judge) < amount) {
            revert InsufficientAvailableStake();
        }

        depositedStake[judge] -= amount;
        uint256 beforePool = token.balanceOf(address(this));
        uint256 beforeJudge = token.balanceOf(judge);
        token.safeTransfer(judge, amount);
        uint256 afterPool = token.balanceOf(address(this));
        uint256 afterJudge = token.balanceOf(judge);
        if (
            afterPool > beforePool || beforePool - afterPool != amount || afterJudge < beforeJudge
                || afterJudge - beforeJudge != amount
        ) revert UnsupportedTokenTransfer();
    }

    function payClaim(address recipient, uint256 amount) external onlyController nonReentrant {
        if (amount == 0 || totalClaimLiability < amount) revert InsufficientClaimLiability();

        uint256 beforePool = token.balanceOf(address(this));
        uint256 beforeRecipient = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 afterPool = token.balanceOf(address(this));
        uint256 afterRecipient = token.balanceOf(recipient);
        if (
            afterPool > beforePool || beforePool - afterPool != amount
                || afterRecipient < beforeRecipient || afterRecipient - beforeRecipient != amount
        ) revert UnsupportedTokenTransfer();
        totalClaimLiability -= amount;
    }
}

/// @notice Isolated, test-only PR3 Court Reset and CCPS-1 fixture.
/// @dev This fixture is not deployment code and never executes BackerDAO logic.
contract V2CourtResetFixture is V2FinancialAccountingFixture {
    bytes32 public constant RESET_DEPLOYMENT_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr3-court-reset-fixture");
    bytes32 public constant RESET_POLICY_VERSION = keccak256("CCPS-1");
    uint256 public constant MAX_RESETS_PER_COURT = 1;
    uint256 public constant MAX_RESETS_PER_CASE = 2;
    uint256 public constant COMMIT_WINDOW = 1 days;
    uint256 public constant REVEAL_WINDOW = 1 days;

    enum CourtLevel {
        COURT_1,
        COURT_2
    }

    struct CaseRecord {
        uint256 campaignId;
        uint256 milestoneId;
        bytes32 policyVersion;
        uint256 disruptionAllowance;
        uint256 finalizationAllowance;
        uint256 caseStakeRequirement;
        uint256 resetCostMax;
        uint256 requiredLockedStake;
        bytes32 activeCourtId;
        bytes32 pendingResetId;
        bool court1Valid;
        bool court2GateEnabled;
        bool court2Valid;
        bool protocolFailed;
        uint256 resetCount;
        uint256 invalidSettlementCount;
        uint256[2] levelResetCount;
        uint256[2] nextAttemptIndex;
    }

    struct CourtAttempt {
        bytes32 caseId;
        bytes32 courtId;
        bytes32 resetId;
        bytes32 settlementId;
        CourtLevel level;
        uint256 attemptIndex;
        address[3] judges;
        bytes32[3] commitments;
        bool[3] commitSubmitted;
        bool[3] revealValid;
        bool[3] passVote;
        uint256 commitDeadline;
        uint256 revealDeadline;
        bool valid;
        bool invalid;
        bool settled;
        bool terminal;
        uint256 offenderCount;
        uint256 compensationTotal;
    }

    V2CourtResetStakePool public immutable stakePool;
    bytes32 public immutable resetDeploymentIdentity;

    mapping(bytes32 => CaseRecord) private cases;
    mapping(bytes32 => CourtAttempt) private courts;
    mapping(bytes32 => bytes32[]) private _caseCourtHistory;
    mapping(bytes32 => bytes32[]) private _caseResetHistory;
    mapping(bytes32 => mapping(address => bool)) private caseJudgeAssigned;
    mapping(address => bool) public registeredJudge;
    address[] public judgePool;

    mapping(bytes32 => bool) public resetSettlementProcessed;
    mapping(bytes32 => uint256) public settlementCompensation;
    mapping(bytes32 => uint256) public settlementPaid;
    mapping(bytes32 => mapping(address => uint256)) public compensationEntitlement;
    mapping(bytes32 => mapping(address => bool)) public compensationClaimed;

    error InvalidPolicy();
    error CaseAlreadyExists();
    error CaseNotFound();
    error InvalidCaseId();
    error InvalidCourtId();
    error InvalidCourtLevel();
    error CourtAlreadyActive();
    error CourtNotActive();
    error CourtNotReady();
    error CourtAlreadySettled();
    error CourtStillValid();
    error MissingProceduralFailure();
    error InvalidJudgeSet();
    error JudgeAlreadyRegistered();
    error JudgeNotRegistered();
    error JudgeNotAssigned();
    error DuplicateVoteAction();
    error InvalidVoteReveal();
    error ReplacementUnavailable();
    error CourtTwoNotEnabled();
    error ProtocolFailed();
    error IncompleteAssignment();

    event CourtResetCaseCreated(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        uint256 campaignId,
        uint256 milestoneId,
        bytes32 policyVersion,
        uint256 disruptionAllowance,
        uint256 finalizationAllowance,
        uint256 resetCostMax,
        uint256 requiredLockedStake,
        string policyStatus
    );

    event JudgeStakeDeposited(
        bytes32 indexed deploymentIdentity, address indexed judge, uint256 amount, uint256 available
    );

    event Court2GateEnabledForTest(bytes32 indexed deploymentIdentity, bytes32 indexed caseId);

    event CourtAssigned(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        CourtLevel indexed level,
        bytes32 courtId,
        bytes32 resetId,
        uint256 attemptIndex,
        address[3] judges,
        uint256 requiredLockedStake,
        uint256 commitDeadline,
        uint256 revealDeadline
    );

    event VoteCommitted(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        bytes32 indexed courtId,
        address judge,
        bytes32 commitment
    );

    event VoteRevealed(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        bytes32 indexed courtId,
        address judge,
        bool pass
    );

    event CourtFinalized(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        CourtLevel indexed level,
        bytes32 courtId,
        bytes32 settlementId,
        bool pass
    );

    event CourtInvalidated(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        CourtLevel indexed level,
        bytes32 courtId,
        bytes32 settlementId,
        uint256 attemptIndex,
        uint256 offenderCount,
        uint256 compensationTotal,
        bool terminal
    );

    event JudgeProceduralPenalty(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        bytes32 indexed settlementId,
        address judge,
        uint256 amount
    );

    event ResetCompensationAccrued(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed settlementId,
        address indexed recipient,
        uint256 amount
    );

    event CourtReset(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        bytes32 resetId,
        bytes32 previousCourtId,
        bytes32 replacementCourtId,
        CourtLevel level
    );

    event CourtProtocolFailed(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed caseId,
        bytes32 indexed settlementId,
        CourtLevel level,
        bytes32 courtId
    );

    event CompensationClaimed(
        bytes32 indexed deploymentIdentity,
        bytes32 indexed settlementId,
        address indexed recipient,
        uint256 amount
    );

    constructor(
        IERC20 token_,
        bytes32 resetDeploymentIdentity_,
        IV2FinalOutcomeSource outcomeSource_,
        IERC20 stakeToken_
    ) V2FinancialAccountingFixture(token_, ACCOUNTING_DEPLOYMENT_IDENTITY, outcomeSource_) {
        if (
            resetDeploymentIdentity_ != RESET_DEPLOYMENT_IDENTITY
                || address(stakeToken_) == address(0)
        ) revert InvalidFixtureIdentity();
        resetDeploymentIdentity = resetDeploymentIdentity_;
        stakePool = new V2CourtResetStakePool(stakeToken_, address(this));
    }

    function policyStatus() external pure returns (string memory) {
        return "PROPOSED_PENDING_APPROVAL";
    }

    function isTestOnlyPolicy() external pure returns (bool) {
        return true;
    }

    function registerJudge(address judge) external {
        if (judge == address(0)) revert InvalidJudgeSet();
        if (registeredJudge[judge]) revert JudgeAlreadyRegistered();
        registeredJudge[judge] = true;
        judgePool.push(judge);
    }

    function depositStake(uint256 amount) external nonReentrant {
        if (!registeredJudge[msg.sender]) revert JudgeNotRegistered();
        stakePool.depositFrom(msg.sender, amount);
        emit JudgeStakeDeposited(
            resetDeploymentIdentity, msg.sender, amount, stakePool.availableStake(msg.sender)
        );
    }

    function withdrawAvailableStake(uint256 amount) external nonReentrant {
        if (!registeredJudge[msg.sender]) revert JudgeNotRegistered();
        stakePool.withdraw(msg.sender, amount);
    }

    function createCase(
        bytes32 caseId,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 caseStakeRequirement,
        uint256 disruptionAllowance,
        uint256 finalizationAllowance
    ) external {
        if (caseId == bytes32(0)) revert InvalidCaseId();
        if (cases[caseId].policyVersion != bytes32(0)) revert CaseAlreadyExists();
        if (finalizationAllowance < 3) revert InvalidPolicy();
        if (disruptionAllowance > (type(uint256).max - finalizationAllowance) / 2) {
            revert InvalidPolicy();
        }

        uint256 resetCostMax = disruptionAllowance * 2 + finalizationAllowance;
        uint256 requiredLockedStake =
            caseStakeRequirement > resetCostMax ? caseStakeRequirement : resetCostMax;
        cases[caseId] = CaseRecord({
            campaignId: campaignId,
            milestoneId: milestoneId,
            policyVersion: RESET_POLICY_VERSION,
            disruptionAllowance: disruptionAllowance,
            finalizationAllowance: finalizationAllowance,
            caseStakeRequirement: caseStakeRequirement,
            resetCostMax: resetCostMax,
            requiredLockedStake: requiredLockedStake,
            activeCourtId: bytes32(0),
            pendingResetId: bytes32(0),
            court1Valid: false,
            court2GateEnabled: false,
            court2Valid: false,
            protocolFailed: false,
            resetCount: 0,
            invalidSettlementCount: 0,
            levelResetCount: [uint256(0), uint256(0)],
            nextAttemptIndex: [uint256(0), uint256(0)]
        });

        emit CourtResetCaseCreated(
            resetDeploymentIdentity,
            caseId,
            campaignId,
            milestoneId,
            RESET_POLICY_VERSION,
            disruptionAllowance,
            finalizationAllowance,
            resetCostMax,
            requiredLockedStake,
            "PROPOSED_PENDING_APPROVAL"
        );
    }

    /// @dev This is an explicit test seam for PR4's already-finalized appeal.
    /// It records no ballots, weights or DAO state and has no financial authority.
    function enableCourt2ForTest(bytes32 caseId) external {
        CaseRecord storage reviewCase = _case(caseId);
        if (!reviewCase.court1Valid || reviewCase.protocolFailed) revert CourtTwoNotEnabled();
        reviewCase.court2GateEnabled = true;
        emit Court2GateEnabledForTest(resetDeploymentIdentity, caseId);
    }

    function assignCourt(bytes32 caseId, CourtLevel level, uint256 entropy)
        external
        returns (bytes32 courtId)
    {
        CaseRecord storage reviewCase = _case(caseId);
        if (reviewCase.protocolFailed) revert ProtocolFailed();
        if (reviewCase.activeCourtId != bytes32(0)) revert CourtAlreadyActive();
        if (level == CourtLevel.COURT_2) {
            if (!reviewCase.court2GateEnabled || !reviewCase.court1Valid) {
                revert CourtTwoNotEnabled();
            }
        } else if (level != CourtLevel.COURT_1) {
            revert InvalidCourtLevel();
        }

        uint256 levelIndex = uint256(level);
        uint256 attemptIndex = reviewCase.nextAttemptIndex[levelIndex];
        if (attemptIndex > MAX_RESETS_PER_COURT) revert ReplacementUnavailable();
        if (attemptIndex == 0 && reviewCase.pendingResetId != bytes32(0)) {
            revert ReplacementUnavailable();
        }
        if (attemptIndex > 0 && reviewCase.pendingResetId == bytes32(0)) {
            revert ReplacementUnavailable();
        }
        address[3] memory judges = _selectJudges(caseId, level, attemptIndex, entropy);
        for (uint256 i = 0; i < judges.length; i++) {
            stakePool.reserve(judges[i], reviewCase.requiredLockedStake);
            caseJudgeAssigned[caseId][judges[i]] = true;
        }

        bytes32 resetId = attemptIndex == 0 ? bytes32(0) : reviewCase.pendingResetId;
        courtId = keccak256(
            abi.encode(
                reviewCase.policyVersion,
                caseId,
                level,
                attemptIndex,
                entropy,
                judges[0],
                judges[1],
                judges[2]
            )
        );
        if (courtId == bytes32(0)) revert InvalidCourtId();

        CourtAttempt storage court = courts[courtId];
        court.caseId = caseId;
        court.courtId = courtId;
        court.resetId = resetId;
        court.level = level;
        court.attemptIndex = attemptIndex;
        court.judges = judges;
        court.commitDeadline = block.timestamp + COMMIT_WINDOW;
        court.revealDeadline = court.commitDeadline + REVEAL_WINDOW;
        reviewCase.activeCourtId = courtId;
        reviewCase.nextAttemptIndex[levelIndex] = attemptIndex + 1;
        if (attemptIndex > 0) {
            reviewCase.pendingResetId = bytes32(0);
            _caseResetHistory[caseId].push(resetId);
            bytes32 previousCourtId =
                _caseCourtHistory[caseId][_caseCourtHistory[caseId].length - 1];
            emit CourtReset(
                resetDeploymentIdentity, caseId, resetId, previousCourtId, courtId, level
            );
        }
        _caseCourtHistory[caseId].push(courtId);

        emit CourtAssigned(
            resetDeploymentIdentity,
            caseId,
            level,
            courtId,
            resetId,
            attemptIndex,
            judges,
            reviewCase.requiredLockedStake,
            court.commitDeadline,
            court.revealDeadline
        );
    }

    function commitVote(bytes32 caseId, bytes32 courtId, bytes32 commitment) external {
        CourtAttempt storage court = _activeCourt(caseId, courtId);
        if (block.timestamp >= court.commitDeadline || commitment == bytes32(0)) {
            revert CourtNotReady();
        }
        uint256 seat = _seatOf(court, msg.sender);
        if (court.commitSubmitted[seat]) revert DuplicateVoteAction();
        court.commitments[seat] = commitment;
        court.commitSubmitted[seat] = true;
        emit VoteCommitted(resetDeploymentIdentity, caseId, courtId, msg.sender, commitment);
    }

    function revealVote(bytes32 caseId, bytes32 courtId, bool pass, bytes32 salt) external {
        CourtAttempt storage court = _activeCourt(caseId, courtId);
        if (block.timestamp < court.commitDeadline || block.timestamp >= court.revealDeadline) {
            revert CourtNotReady();
        }
        uint256 seat = _seatOf(court, msg.sender);
        if (!court.commitSubmitted[seat] || court.revealValid[seat]) {
            revert DuplicateVoteAction();
        }
        CaseRecord storage reviewCase = _case(caseId);
        bytes32 expected = _commitmentHash(reviewCase, court, msg.sender, pass, salt);
        if (expected != court.commitments[seat]) revert InvalidVoteReveal();
        court.passVote[seat] = pass;
        court.revealValid[seat] = true;
        emit VoteRevealed(resetDeploymentIdentity, caseId, courtId, msg.sender, pass);
    }

    function finalizeValidCourt(bytes32 caseId, bytes32 courtId) external {
        CourtAttempt storage court = _activeCourt(caseId, courtId);
        if (court.settled) revert CourtAlreadySettled();
        if (!_allDutiesComplete(court)) revert CourtNotReady();

        CaseRecord storage reviewCase = _case(caseId);
        for (uint256 i = 0; i < court.judges.length; i++) {
            stakePool.release(court.judges[i], reviewCase.requiredLockedStake);
        }
        court.valid = true;
        court.settled = true;
        court.settlementId = _settlementId(reviewCase, court);
        resetSettlementProcessed[court.settlementId] = true;
        reviewCase.activeCourtId = bytes32(0);
        bool pass = court.passVote[0] && court.passVote[1] || court.passVote[0] && court.passVote[2]
            || court.passVote[1] && court.passVote[2];
        if (court.level == CourtLevel.COURT_1) {
            reviewCase.court1Valid = true;
        } else {
            reviewCase.court2Valid = true;
        }
        emit CourtFinalized(
            resetDeploymentIdentity, caseId, court.level, courtId, court.settlementId, pass
        );
    }

    function settleInvalidCourt(bytes32 caseId, bytes32 courtId) external {
        CourtAttempt storage settledCourt = courts[courtId];
        if (settledCourt.caseId == caseId && settledCourt.settled) {
            revert CourtAlreadySettled();
        }
        CourtAttempt storage court = _activeCourt(caseId, courtId);
        if (court.settled) revert CourtAlreadySettled();
        if (block.timestamp < court.revealDeadline) revert CourtNotReady();
        if (_allDutiesComplete(court)) revert CourtStillValid();

        CaseRecord storage reviewCase = _case(caseId);
        bytes32 settlementId = _settlementId(reviewCase, court);
        if (resetSettlementProcessed[settlementId]) revert CourtAlreadySettled();

        address[3] memory offenders;
        uint256 offenderCount;
        for (uint256 i = 0; i < court.judges.length; i++) {
            if (!court.commitSubmitted[i] || !court.revealValid[i]) {
                offenders[offenderCount++] = court.judges[i];
            }
        }
        if (offenderCount == 0) revert MissingProceduralFailure();
        _sort(offenders, offenderCount);

        uint256 compensation =
            (3 - offenderCount) * reviewCase.disruptionAllowance + reviewCase.finalizationAllowance;
        uint256 equalShare = compensation / offenderCount;
        uint256 remainder = compensation % offenderCount;
        for (uint256 i = 0; i < court.judges.length; i++) {
            uint256 offenderRank = _offenderRank(offenders, offenderCount, court.judges[i]);
            uint256 penalty = offenderRank == type(uint256).max
                ? 0
                : equalShare + (offenderRank < remainder ? 1 : 0);
            stakePool.slashReserved(court.judges[i], penalty);
            stakePool.release(court.judges[i], reviewCase.requiredLockedStake - penalty);
            if (penalty != 0) {
                emit JudgeProceduralPenalty(
                    resetDeploymentIdentity, caseId, settlementId, court.judges[i], penalty
                );
            }
            if (offenderRank == type(uint256).max && reviewCase.disruptionAllowance != 0) {
                _creditClaim(settlementId, court.judges[i], reviewCase.disruptionAllowance);
            }
        }
        _creditClaim(settlementId, msg.sender, reviewCase.finalizationAllowance);
        if (stakePool.totalClaimLiability() < compensation) revert IncompleteAssignment();

        bool terminal = reviewCase.levelResetCount[uint256(court.level)] >= MAX_RESETS_PER_COURT
            || reviewCase.resetCount >= MAX_RESETS_PER_CASE;
        reviewCase.levelResetCount[uint256(court.level)] += 1;
        reviewCase.resetCount += 1;
        reviewCase.invalidSettlementCount += 1;
        reviewCase.activeCourtId = bytes32(0);
        court.invalid = true;
        court.settled = true;
        court.terminal = terminal;
        court.settlementId = settlementId;
        court.offenderCount = offenderCount;
        court.compensationTotal = compensation;
        resetSettlementProcessed[settlementId] = true;
        settlementCompensation[settlementId] = compensation;
        if (terminal) {
            reviewCase.protocolFailed = true;
            emit CourtProtocolFailed(
                resetDeploymentIdentity, caseId, settlementId, court.level, court.courtId
            );
        } else {
            reviewCase.pendingResetId = keccak256(abi.encode(settlementId, "replacement"));
        }

        emit CourtInvalidated(
            resetDeploymentIdentity,
            caseId,
            court.level,
            court.courtId,
            settlementId,
            court.attemptIndex,
            offenderCount,
            compensation,
            terminal
        );
    }

    function claimCompensation(bytes32 settlementId) external nonReentrant {
        if (!resetSettlementProcessed[settlementId]) revert NoClaimAvailable();
        if (compensationClaimed[settlementId][msg.sender]) revert ClaimAlreadyProcessed();
        uint256 amount = compensationEntitlement[settlementId][msg.sender];
        if (amount == 0) revert NoClaimAvailable();

        compensationClaimed[settlementId][msg.sender] = true;
        stakePool.payClaim(msg.sender, amount);
        settlementPaid[settlementId] += amount;
        emit CompensationClaimed(resetDeploymentIdentity, settlementId, msg.sender, amount);
    }

    function commitmentFor(bytes32 caseId, bytes32 courtId, address judge, bool pass, bytes32 salt)
        external
        view
        returns (bytes32)
    {
        CaseRecord storage reviewCase = _case(caseId);
        CourtAttempt storage court = courts[courtId];
        if (court.caseId != caseId) revert InvalidCourtId();
        return _commitmentHash(reviewCase, court, judge, pass, salt);
    }

    function caseTerms(bytes32 caseId) external view returns (CaseRecord memory) {
        CaseRecord storage reviewCase = _case(caseId);
        return reviewCase;
    }

    function courtInfo(bytes32 courtId) external view returns (CourtAttempt memory) {
        CourtAttempt storage court = courts[courtId];
        if (court.caseId == bytes32(0)) revert InvalidCourtId();
        return court;
    }

    function caseCourtHistory(bytes32 caseId) external view returns (bytes32[] memory) {
        _case(caseId);
        return _caseCourtHistory[caseId];
    }

    function caseResetHistory(bytes32 caseId) external view returns (bytes32[] memory) {
        _case(caseId);
        return _caseResetHistory[caseId];
    }

    function isCaseJudge(bytes32 caseId, address judge) external view returns (bool) {
        _case(caseId);
        return caseJudgeAssigned[caseId][judge];
    }

    function unclaimedCompensation(bytes32 settlementId) external view returns (uint256) {
        return settlementCompensation[settlementId] - settlementPaid[settlementId];
    }

    function _selectJudges(bytes32 caseId, CourtLevel level, uint256 attemptIndex, uint256 entropy)
        internal
        view
        returns (address[3] memory selected)
    {
        if (judgePool.length < 3) revert InvalidJudgeSet();
        uint256 start =
            uint256(keccak256(abi.encode(caseId, level, attemptIndex, entropy))) % judgePool.length;
        uint256 selectedCount;
        for (uint256 offset = 0; offset < judgePool.length && selectedCount < 3; offset++) {
            address candidate = judgePool[(start + offset) % judgePool.length];
            if (caseJudgeAssigned[caseId][candidate]) continue;
            selected[selectedCount++] = candidate;
        }
        if (selectedCount != 3) revert InvalidJudgeSet();
    }

    function _allDutiesComplete(CourtAttempt storage court) internal view returns (bool) {
        for (uint256 i = 0; i < court.judges.length; i++) {
            if (!court.commitSubmitted[i] || !court.revealValid[i]) return false;
        }
        return true;
    }

    function _creditClaim(bytes32 settlementId, address recipient, uint256 amount) internal {
        compensationEntitlement[settlementId][recipient] += amount;
        emit ResetCompensationAccrued(resetDeploymentIdentity, settlementId, recipient, amount);
    }

    function _sort(address[3] memory values, uint256 length) internal pure {
        for (uint256 i = 0; i < length; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (uint160(values[j]) < uint160(values[i])) {
                    address current = values[i];
                    values[i] = values[j];
                    values[j] = current;
                }
            }
        }
    }

    function _offenderRank(address[3] memory offenders, uint256 length, address judge)
        internal
        pure
        returns (uint256)
    {
        for (uint256 i = 0; i < length; i++) {
            if (offenders[i] == judge) return i;
        }
        return type(uint256).max;
    }

    function _settlementId(CaseRecord storage reviewCase, CourtAttempt storage court)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                reviewCase.policyVersion,
                court.caseId,
                court.level,
                court.courtId,
                court.attemptIndex
            )
        );
    }

    function _commitmentHash(
        CaseRecord storage reviewCase,
        CourtAttempt storage court,
        address judge,
        bool pass,
        bytes32 salt
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                resetDeploymentIdentity,
                reviewCase.policyVersion,
                reviewCase.campaignId,
                reviewCase.milestoneId,
                court.caseId,
                court.level,
                court.attemptIndex,
                court.resetId,
                court.courtId,
                judge,
                pass,
                salt
            )
        );
    }

    function _case(bytes32 caseId) internal view returns (CaseRecord storage reviewCase) {
        reviewCase = cases[caseId];
        if (reviewCase.policyVersion == bytes32(0)) revert CaseNotFound();
    }

    function _activeCourt(bytes32 caseId, bytes32 courtId)
        internal
        view
        returns (CourtAttempt storage court)
    {
        CaseRecord storage reviewCase = _case(caseId);
        if (reviewCase.activeCourtId != courtId || courtId == bytes32(0)) revert CourtNotActive();
        court = courts[courtId];
        if (court.caseId != caseId) revert CourtNotActive();
    }

    function _seatOf(CourtAttempt storage court, address judge) internal view returns (uint256) {
        for (uint256 i = 0; i < court.judges.length; i++) {
            if (court.judges[i] == judge) return i;
        }
        revert JudgeNotAssigned();
    }
}
