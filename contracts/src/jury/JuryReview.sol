// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IVNextEvents } from "../interfaces/IVNextEvents.sol";
import { VNextTypes } from "../campaigns/VNextTypes.sol";
import { JuryRegistry } from "./JuryRegistry.sol";
import { JuryTypes } from "./JuryTypes.sol";

interface IVNextRandomness {
    function randomSeed(bytes32 reviewCaseId) external view returns (bytes32);
}

interface IVNextCampaignContext {
    function contributionOf(uint256 campaignId, address backer) external view returns (uint256);
}

/// @notice VNext review engine for deterministic three-Judge courts.
/// @dev Court assignment, multi-court aggregation, commit–reveal, appeal
/// rounds and finality are permissionless after immutable case creation. Judge
/// reward/slash settlement remains a separately parameterized ledger gate.
contract JuryReview is ReentrancyGuard, IVNextEvents {
    using SafeERC20 for IERC20;

    uint256 public immutable protocolVersion;
    uint256 public constant MINIMUM_STAKE_FLOOR = 10e6;
    uint256 public constant RISK_MULTIPLIER_BPS = 500;
    uint256 public immutable maxEligibleJudges;
    JuryRegistry public immutable registry;
    address public campaignEscrow;
    address public immutable bootstrapper;
    bool public campaignEscrowLocked;
    IVNextRandomness public immutable randomnessProvider;
    uint64 public immutable enrollmentDuration;
    uint64 public immutable commitDuration;
    uint64 public immutable revealDuration;
    uint64 public immutable appealWindowDuration;
    uint64 public immutable randomnessTimeout;
    uint256 public immutable appealBond;
    uint256 public immutable maximumAppealRounds;
    uint256 public immutable minoritySlashBps;
    uint256 public constant MAXIMUM_RETRIES_PER_REVIEW_LEVEL = 2;
    uint256 public constant MAX_COURTS_PER_REVIEW_CASE = 5;
    uint256 public constant MAX_SETTLEMENT_BATCH_SIZE = 32;

    uint256 public reviewCaseCount;
    mapping(bytes32 => ReviewCase) private reviewCases;
    mapping(bytes32 => address[]) private enrolledJudges;
    mapping(bytes32 => mapping(address => bool)) public enrolled;
    mapping(bytes32 => mapping(uint256 => address[3])) private courtJudges;
    mapping(bytes32 => mapping(uint256 => bool)) public courtAssigned;
    mapping(bytes32 => mapping(uint256 => bool)) public courtFinalized;
    mapping(bytes32 => mapping(uint256 => JuryTypes.CourtResult)) public courtResult;
    mapping(bytes32 => mapping(uint256 => uint8)) public courtPassVotes;
    mapping(bytes32 => mapping(uint256 => uint8)) public courtFailVotes;
    mapping(bytes32 => mapping(address => uint256)) public assignedCourtId;
    mapping(bytes32 => mapping(address => bool)) public assignedJudge;
    mapping(bytes32 => mapping(uint256 => mapping(address => bytes32))) public commitments;
    mapping(bytes32 => mapping(uint256 => mapping(address => bool))) public revealed;
    mapping(bytes32 => mapping(uint256 => mapping(address => JuryTypes.Vote))) public votes;
    mapping(bytes32 => uint256) public caseNumber;
    mapping(bytes32 => uint256) public enrollmentDeadline;
    mapping(bytes32 => uint256) public randomnessDeadline;
    mapping(bytes32 => uint256) public commitDeadline;
    mapping(bytes32 => uint256) public revealDeadline;
    mapping(bytes32 => VNextTypes.ReviewOutcome) public finalOutcome;
    mapping(bytes32 => mapping(address => bool)) public participatedInRoot;
    mapping(bytes32 => bytes32) public latestCase;
    mapping(bytes32 => bytes32[]) private appealCases;
    mapping(bytes32 => bytes32[]) private retryCases;
    mapping(bytes32 => uint256) public appealRoundCount;
    mapping(bytes32 => address) public appealRequester;
    mapping(bytes32 => uint256) public appealBondForCase;
    mapping(bytes32 => uint256) public retryCount;
    mapping(bytes32 => bool) public reviewCaseSettled;
    mapping(bytes32 => VNextTypes.ReviewOutcome) public settlementOutcome;
    mapping(bytes32 => uint256) public settlementPhase;
    mapping(bytes32 => uint256) public settlementCursor;
    mapping(bytes32 => uint256) public settlementTotalSlash;
    mapping(bytes32 => uint256) public settlementWinners;
    mapping(bytes32 => uint256) public settlementRewardPerWinner;
    mapping(bytes32 => uint256) public settlementRewardDust;
    mapping(bytes32 => uint256) public settlementWinnerIndex;
    mapping(bytes32 => uint256) public finalSettlementCursor;
    mapping(bytes32 => uint256) public riskValue;
    mapping(bytes32 => uint256) public requiredCaseStake;
    mapping(bytes32 => JuryTypes.RoundStatus) public roundStatus;
    mapping(bytes32 => address[]) private frozenJudges;

    struct ReviewCase {
        address creator;
        uint256 campaignId;
        uint256 milestoneId;
        uint256 evidenceRevision;
        bytes32 seed;
        bytes32 randomnessRequestId;
        bytes32 rootCaseId;
        uint256 roundId;
        uint256 enrolledCount;
        uint8 passVotes;
        uint8 failVotes;
        bool snapshotFinalized;
        bool courtAssigned;
        bool courtFinalized;
        uint256 totalCourts;
        uint256 finalizedCourts;
        uint256 passCourts;
        uint256 failCourts;
        uint256 invalidCourts;
        JuryTypes.CourtResult result;
    }

    error InvalidAddress();
    error InvalidAmount();
    error NotCampaignEscrow();
    error UnknownCase();
    error CreatorConflict();
    error EnrollmentClosed();
    error EnrollmentOpen();
    error InsufficientJudges();
    error SnapshotAlreadyFinalized();
    error RandomnessUnavailable();
    error CourtAlreadyAssigned();
    error CourtNotAssigned();
    error CourtAlreadyFinalized();
    error NotAssignedJudge();
    error CommitPhaseClosed();
    error RevealPhaseClosed();
    error CommitmentAlreadySubmitted();
    error CommitmentMismatch();
    error VoteAlreadyRevealed();
    error InvalidVote();
    error AppealWindowOpen();
    error FinalRulingAlreadyEstablished();
    error JudgeAlreadyParticipated();
    error AppealNotAllowed();
    error AppealRoundsExhausted();
    error AppealAlreadyOpened();
    error ProtocolFailureNotReady();
    error RetryNotReady();
    error RetriesExhausted();
    error SettlementNotPrepared();
    error SettlementPending();
    error InvalidSettlementBatch();
    error InvalidSettlementOutcome();
    error EscrowAlreadyLocked();
    error NotBootstrapper();

    event CampaignEscrowConfigured(address indexed escrow);

    constructor(
        address registry_,
        address campaignEscrow_,
        address randomnessProvider_,
        uint64 enrollmentDuration_,
        uint64 commitDuration_,
        uint64 revealDuration_,
        uint64 appealWindowDuration_,
        uint256 protocolVersion_,
        uint256 maxEligibleJudges_,
        uint256 appealBond_,
        uint256 maximumAppealRounds_,
        uint256 minoritySlashBps_
    ) {
        if (registry_ == address(0) || randomnessProvider_ == address(0)) revert InvalidAddress();
        if (
            enrollmentDuration_ == 0 || commitDuration_ == 0 || revealDuration_ == 0
                || appealWindowDuration_ == 0 || maxEligibleJudges_ < 3 || maximumAppealRounds_ == 0
                || minoritySlashBps_ > 10_000
        ) revert InvalidAmount();

        registry = JuryRegistry(registry_);
        campaignEscrow = campaignEscrow_;
        bootstrapper = msg.sender;
        campaignEscrowLocked = campaignEscrow_ != address(0);
        randomnessProvider = IVNextRandomness(randomnessProvider_);
        enrollmentDuration = enrollmentDuration_;
        commitDuration = commitDuration_;
        revealDuration = revealDuration_;
        appealWindowDuration = appealWindowDuration_;
        randomnessTimeout = appealWindowDuration_;
        appealBond = appealBond_;
        maximumAppealRounds = maximumAppealRounds_;
        minoritySlashBps = minoritySlashBps_;
        protocolVersion = protocolVersion_;
        maxEligibleJudges = maxEligibleJudges_;
    }

    /// @notice One-time deployment wiring for the campaign escrow. It is
    /// intentionally unavailable after locking and is not a review authority.
    function configureCampaignEscrow(address escrow) external {
        if (msg.sender != bootstrapper) revert NotBootstrapper();
        if (campaignEscrowLocked) revert EscrowAlreadyLocked();
        if (escrow == address(0) || escrow.code.length == 0) revert InvalidAddress();
        campaignEscrow = escrow;
        campaignEscrowLocked = true;
        emit CampaignEscrowConfigured(escrow);
    }

    function createReviewCase(
        address creator,
        uint256 campaignId,
        uint256 milestoneId,
        uint256 evidenceRevision,
        uint256 riskValue_
    ) external returns (bytes32 reviewCaseId) {
        if (msg.sender != campaignEscrow) revert NotCampaignEscrow();
        if (creator == address(0) || riskValue_ == 0) revert InvalidAddress();

        uint256 sequence = reviewCaseCount++;
        reviewCaseId = VNextTypes.reviewKey(
            campaignId, milestoneId, evidenceRevision, sequence, 0, 0, protocolVersion
        );
        ReviewCase storage reviewCase = reviewCases[reviewCaseId];
        reviewCase.creator = creator;
        reviewCase.campaignId = campaignId;
        reviewCase.milestoneId = milestoneId;
        reviewCase.evidenceRevision = evidenceRevision;
        reviewCase.rootCaseId = reviewCaseId;
        reviewCase.roundId = 0;
        caseNumber[reviewCaseId] = sequence;
        latestCase[reviewCaseId] = reviewCaseId;
        enrollmentDeadline[reviewCaseId] = block.timestamp + enrollmentDuration;
        randomnessDeadline[reviewCaseId] = enrollmentDeadline[reviewCaseId] + randomnessTimeout;
        commitDeadline[reviewCaseId] = enrollmentDeadline[reviewCaseId] + commitDuration;
        revealDeadline[reviewCaseId] = commitDeadline[reviewCaseId] + revealDuration;
        riskValue[reviewCaseId] = riskValue_;
        requiredCaseStake[reviewCaseId] =
            VNextTypes.requiredCaseStake(MINIMUM_STAKE_FLOOR, RISK_MULTIPLIER_BPS, riskValue_);
        roundStatus[reviewCaseId] = JuryTypes.RoundStatus.ENROLLMENT_OPEN;
        registry.registerCase(
            reviewCaseId,
            enrollmentDeadline[reviewCaseId],
            requiredCaseStake[reviewCaseId],
            _poolId(reviewCaseId, bytes32("BASE"))
        );

        emit ReviewCaseCreated(
            reviewCaseId,
            campaignId,
            milestoneId,
            evidenceRevision,
            creator,
            riskValue_,
            requiredCaseStake[reviewCaseId]
        );
    }

    function enroll(bytes32 reviewCaseId) external {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (block.timestamp >= enrollmentDeadline[reviewCaseId]) revert EnrollmentClosed();
        if (reviewCase.snapshotFinalized) revert SnapshotAlreadyFinalized();
        if (msg.sender == reviewCase.creator) revert CreatorConflict();
        if (
            IVNextCampaignContext(campaignEscrow).contributionOf(reviewCase.campaignId, msg.sender)
                != 0
        ) revert CreatorConflict();
        if (enrolled[reviewCaseId][msg.sender]) revert CommitmentAlreadySubmitted();
        if (participatedInRoot[reviewCase.rootCaseId][msg.sender]) {
            revert JudgeAlreadyParticipated();
        }
        if (enrolledJudges[reviewCaseId].length >= maxEligibleJudges) revert InsufficientJudges();
        if (registry.caseStake(reviewCaseId, msg.sender) < requiredCaseStake[reviewCaseId]) {
            revert InsufficientJudges();
        }

        registry.markCaseEnrollment(reviewCaseId, msg.sender);
        enrolled[reviewCaseId][msg.sender] = true;
        participatedInRoot[reviewCase.rootCaseId][msg.sender] = true;
        enrolledJudges[reviewCaseId].push(msg.sender);
        reviewCase.enrolledCount++;
        emit JudgeEnrolled(
            reviewCaseId,
            msg.sender,
            reviewCase.roundId == 0 ? bytes32("BASE") : bytes32("APPEAL"),
            registry.caseStake(reviewCaseId, msg.sender)
        );
    }

    function finalizeSnapshot(bytes32 reviewCaseId) external {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (block.timestamp < enrollmentDeadline[reviewCaseId]) revert EnrollmentOpen();
        if (reviewCase.snapshotFinalized) revert SnapshotAlreadyFinalized();
        if (reviewCase.enrolledCount < 3) revert InsufficientJudges();

        bytes32 seed = randomnessProvider.randomSeed(reviewCaseId);
        if (seed == bytes32(0)) revert RandomnessUnavailable();

        reviewCase.seed = seed;
        reviewCase.randomnessRequestId = keccak256(abi.encode(reviewCaseId, seed));
        uint256 eligibleCourtCount = reviewCase.enrolledCount / 3;
        reviewCase.totalCourts = eligibleCourtCount > MAX_COURTS_PER_REVIEW_CASE
            ? MAX_COURTS_PER_REVIEW_CASE
            : eligibleCourtCount;
        _freezePermutation(reviewCaseId, seed);
        reviewCase.snapshotFinalized = true;
        roundStatus[reviewCaseId] = JuryTypes.RoundStatus.ASSIGNMENT_PENDING;
        emit JurySnapshotFinalized(
            reviewCaseId, block.number, reviewCase.enrolledCount, reviewCase.randomnessRequestId
        );
    }

    function assignCourt(bytes32 reviewCaseId, uint256 courtId) external {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (!reviewCase.snapshotFinalized) revert CourtNotAssigned();
        if (courtId >= reviewCase.totalCourts || courtAssigned[reviewCaseId][courtId]) {
            revert CourtAlreadyAssigned();
        }

        _materializeCourt(reviewCaseId, courtId);
        reviewCase.courtAssigned = true;
        courtAssigned[reviewCaseId][courtId] = true;
        roundStatus[reviewCaseId] = JuryTypes.RoundStatus.VOTING;
        emit CourtAssigned(
            reviewCaseId,
            reviewCase.roundId,
            courtId,
            courtJudges[reviewCaseId][courtId][0],
            courtJudges[reviewCaseId][courtId][1],
            courtJudges[reviewCaseId][courtId][2]
        );
    }

    function commitVote(bytes32 reviewCaseId, uint256 courtId, bytes32 commitment) external {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (!reviewCase.courtAssigned) revert CourtNotAssigned();
        if (
            block.timestamp < enrollmentDeadline[reviewCaseId]
                || block.timestamp >= commitDeadline[reviewCaseId]
        ) {
            revert CommitPhaseClosed();
        }
        if (!_isJudgeInCourt(reviewCaseId, courtId, msg.sender)) revert NotAssignedJudge();
        if (commitment == bytes32(0)) revert InvalidAmount();
        if (commitments[reviewCaseId][courtId][msg.sender] != bytes32(0)) {
            revert CommitmentAlreadySubmitted();
        }

        commitments[reviewCaseId][courtId][msg.sender] = commitment;
        emit VoteCommitted(reviewCaseId, reviewCase.roundId, courtId, msg.sender, commitment);
    }

    function revealVote(bytes32 reviewCaseId, uint256 courtId, JuryTypes.Vote vote, bytes32 salt)
        external
    {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (!reviewCase.courtAssigned) revert CourtNotAssigned();
        if (
            block.timestamp < commitDeadline[reviewCaseId]
                || block.timestamp >= revealDeadline[reviewCaseId]
        ) {
            revert RevealPhaseClosed();
        }
        if (!_isJudgeInCourt(reviewCaseId, courtId, msg.sender)) revert NotAssignedJudge();
        if (revealed[reviewCaseId][courtId][msg.sender]) revert VoteAlreadyRevealed();
        if (vote != JuryTypes.Vote.PASS && vote != JuryTypes.Vote.FAIL) revert InvalidVote();

        bytes32 expected = JuryTypes.voteCommitment(
            block.chainid,
            protocolVersion,
            reviewCase.campaignId,
            reviewCase.milestoneId,
            reviewCase.evidenceRevision,
            caseNumber[reviewCaseId],
            reviewCase.roundId,
            courtId,
            msg.sender,
            vote,
            salt
        );
        if (expected != commitments[reviewCaseId][courtId][msg.sender]) {
            revert CommitmentMismatch();
        }

        revealed[reviewCaseId][courtId][msg.sender] = true;
        votes[reviewCaseId][courtId][msg.sender] = vote;
        if (vote == JuryTypes.Vote.PASS) {
            reviewCase.passVotes++;
            courtPassVotes[reviewCaseId][courtId]++;
        }
        if (vote == JuryTypes.Vote.FAIL) {
            reviewCase.failVotes++;
            courtFailVotes[reviewCaseId][courtId]++;
        }
        emit VoteRevealed(reviewCaseId, reviewCase.roundId, courtId, msg.sender, uint8(vote));
    }

    function finalizeCourt(bytes32 reviewCaseId, uint256 courtId)
        external
        returns (JuryTypes.CourtResult result)
    {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (!courtAssigned[reviewCaseId][courtId]) revert CourtNotAssigned();
        if (courtFinalized[reviewCaseId][courtId]) revert CourtAlreadyFinalized();
        if (block.timestamp < revealDeadline[reviewCaseId]) revert RevealPhaseClosed();

        result = !_allRevealed(reviewCaseId, courtId)
            ? JuryTypes.CourtResult.INVALID
            : courtPassVotes[reviewCaseId][courtId] >= 2
                ? JuryTypes.CourtResult.PASS
                : JuryTypes.CourtResult.FAIL;
        courtResult[reviewCaseId][courtId] = result;
        courtFinalized[reviewCaseId][courtId] = true;
        _recordCourtResult(reviewCaseId, reviewCase, result);
        emit CourtFinalized(reviewCaseId, reviewCase.roundId, courtId, uint8(result));
        if (reviewCase.courtFinalized) {
            emit ReviewRoundFinalized(
                reviewCaseId,
                reviewCase.roundId,
                uint8(reviewCase.result),
                reviewCase.passCourts,
                reviewCase.failCourts
            );
        }
    }

    /// @notice Opens a fresh review round without reusing Judges from the root
    /// case. The Campaign contract remains the only case creator boundary;
    /// requester eligibility is checked by that contract before this call.
    function openAppeal(bytes32 reviewCaseId, address requester)
        external
        nonReentrant
        returns (bytes32 appealCaseId)
    {
        if (msg.sender != campaignEscrow) revert NotCampaignEscrow();
        if (requester == address(0)) revert AppealNotAllowed();

        ReviewCase storage previous = _case(reviewCaseId);
        bytes32 rootCaseId = previous.rootCaseId;
        if (latestCase[rootCaseId] != reviewCaseId) revert AppealAlreadyOpened();
        if (finalOutcome[rootCaseId] != VNextTypes.ReviewOutcome.NONE) {
            revert FinalRulingAlreadyEstablished();
        }
        if (
            !previous.courtFinalized
                || (previous.result != JuryTypes.CourtResult.PASS
                    && previous.result != JuryTypes.CourtResult.FAIL)
        ) {
            revert AppealNotAllowed();
        }
        if (block.timestamp >= revealDeadline[reviewCaseId] + appealWindowDuration) {
            revert AppealWindowOpen();
        }
        roundStatus[reviewCaseId] = JuryTypes.RoundStatus.APPEAL_WINDOW;
        uint256 roundId = appealRoundCount[rootCaseId] + 1;
        if (roundId > maximumAppealRounds) revert AppealRoundsExhausted();

        IERC20 stakeToken = IERC20(address(registry.stakeToken()));
        if (appealBond > 0) stakeToken.safeTransferFrom(requester, address(this), appealBond);

        uint256 sequence = reviewCaseCount++;
        appealCaseId = VNextTypes.reviewKey(
            previous.campaignId,
            previous.milestoneId,
            previous.evidenceRevision,
            sequence,
            roundId,
            0,
            protocolVersion
        );
        ReviewCase storage appealCase = reviewCases[appealCaseId];
        appealCase.creator = previous.creator;
        appealCase.campaignId = previous.campaignId;
        appealCase.milestoneId = previous.milestoneId;
        appealCase.evidenceRevision = previous.evidenceRevision;
        appealCase.rootCaseId = rootCaseId;
        appealCase.roundId = roundId;
        caseNumber[appealCaseId] = sequence;
        enrollmentDeadline[appealCaseId] = block.timestamp + enrollmentDuration;
        randomnessDeadline[appealCaseId] = enrollmentDeadline[appealCaseId] + randomnessTimeout;
        commitDeadline[appealCaseId] = enrollmentDeadline[appealCaseId] + commitDuration;
        revealDeadline[appealCaseId] = commitDeadline[appealCaseId] + revealDuration;
        riskValue[appealCaseId] = riskValue[rootCaseId];
        requiredCaseStake[appealCaseId] =
            VNextTypes.requiredCaseStake(
                MINIMUM_STAKE_FLOOR, RISK_MULTIPLIER_BPS, riskValue[appealCaseId]
            );
        roundStatus[appealCaseId] = JuryTypes.RoundStatus.ENROLLMENT_OPEN;
        registry.registerCase(
            appealCaseId,
            enrollmentDeadline[appealCaseId],
            requiredCaseStake[appealCaseId],
            _poolId(appealCaseId, bytes32("APPEAL"))
        );

        latestCase[rootCaseId] = appealCaseId;
        appealRoundCount[rootCaseId] = roundId;
        appealCases[rootCaseId].push(appealCaseId);
        appealRequester[appealCaseId] = requester;
        appealBondForCase[appealCaseId] = appealBond;
        emit AppealOpened(rootCaseId, appealCaseId, roundId, requester, appealBond);
    }

    /// @notice Opens the next bounded review attempt after a no-quorum,
    /// randomness, invalid-court or tied-round failure. The previous case is
    /// settled as protocol failure before its Judge locks can be reused.
    function openRetry(bytes32 reviewCaseId) external nonReentrant returns (bytes32 retryCaseId) {
        if (msg.sender != campaignEscrow) revert NotCampaignEscrow();

        ReviewCase storage previous = _case(reviewCaseId);
        bytes32 rootCaseId = previous.rootCaseId;
        if (latestCase[rootCaseId] != reviewCaseId) revert RetryNotReady();
        if (finalOutcome[rootCaseId] != VNextTypes.ReviewOutcome.NONE) {
            revert FinalRulingAlreadyEstablished();
        }
        if (retryCount[rootCaseId] >= MAXIMUM_RETRIES_PER_REVIEW_LEVEL) {
            revert RetriesExhausted();
        }
        if (roundStatus[reviewCaseId] != JuryTypes.RoundStatus.RETRY_ELIGIBLE) {
            if (_retryReady(previous, reviewCaseId)) {
                roundStatus[reviewCaseId] = JuryTypes.RoundStatus.RETRY_ELIGIBLE;
            }
        }
        if (roundStatus[reviewCaseId] != JuryTypes.RoundStatus.RETRY_ELIGIBLE) {
            revert RetryNotReady();
        }

        if (!reviewCaseSettled[reviewCaseId]) revert SettlementPending();
        uint256 retryRoundId = previous.roundId + 1;
        uint256 sequence = reviewCaseCount++;
        retryCaseId = VNextTypes.reviewKey(
            previous.campaignId,
            previous.milestoneId,
            previous.evidenceRevision,
            sequence,
            retryRoundId,
            0,
            protocolVersion
        );
        ReviewCase storage retryCase = reviewCases[retryCaseId];
        retryCase.creator = previous.creator;
        retryCase.campaignId = previous.campaignId;
        retryCase.milestoneId = previous.milestoneId;
        retryCase.evidenceRevision = previous.evidenceRevision;
        retryCase.rootCaseId = rootCaseId;
        retryCase.roundId = retryRoundId;
        caseNumber[retryCaseId] = sequence;
        latestCase[rootCaseId] = retryCaseId;
        retryCount[rootCaseId]++;
        retryCases[rootCaseId].push(retryCaseId);
        enrollmentDeadline[retryCaseId] = block.timestamp + enrollmentDuration;
        randomnessDeadline[retryCaseId] = enrollmentDeadline[retryCaseId] + randomnessTimeout;
        commitDeadline[retryCaseId] = enrollmentDeadline[retryCaseId] + commitDuration;
        revealDeadline[retryCaseId] = commitDeadline[retryCaseId] + revealDuration;
        riskValue[retryCaseId] = riskValue[rootCaseId];
        requiredCaseStake[retryCaseId] =
            VNextTypes.requiredCaseStake(
                MINIMUM_STAKE_FLOOR, RISK_MULTIPLIER_BPS, riskValue[retryCaseId]
            );
        roundStatus[retryCaseId] = JuryTypes.RoundStatus.ENROLLMENT_OPEN;
        registry.registerCase(
            retryCaseId,
            enrollmentDeadline[retryCaseId],
            requiredCaseStake[retryCaseId],
            _poolId(retryCaseId, bytes32("RETRY"))
        );
        emit ReviewRetryOpened(rootCaseId, retryRoundId, retryCaseId);
    }

    /// @notice Prepares an eligible retry round for bounded protocol-failure
    /// settlement. The retry cannot open until callers have processed every
    /// enrolled Judge through settleCaseBatch.
    function prepareRetrySettlement(bytes32 reviewCaseId) external {
        ReviewCase storage previous = _case(reviewCaseId);
        bytes32 rootCaseId = previous.rootCaseId;
        if (latestCase[rootCaseId] != reviewCaseId) revert RetryNotReady();
        if (finalOutcome[rootCaseId] != VNextTypes.ReviewOutcome.NONE) {
            revert FinalRulingAlreadyEstablished();
        }
        if (retryCount[rootCaseId] >= MAXIMUM_RETRIES_PER_REVIEW_LEVEL) {
            revert RetriesExhausted();
        }
        if (roundStatus[reviewCaseId] != JuryTypes.RoundStatus.RETRY_ELIGIBLE) {
            if (_retryReady(previous, reviewCaseId)) {
                roundStatus[reviewCaseId] = JuryTypes.RoundStatus.RETRY_ELIGIBLE;
            }
        }
        if (roundStatus[reviewCaseId] != JuryTypes.RoundStatus.RETRY_ELIGIBLE) {
            revert RetryNotReady();
        }
        _beginSettlement(reviewCaseId, VNextTypes.ReviewOutcome.PROTOCOL_FAIL);
        _emitSettlementProgress(reviewCaseId);
    }

    /// @notice Settles one review case in a bounded number of Judge steps.
    /// The call is permissionless and can be repeated until the case emits
    /// ReviewCaseSettled.
    function settleCaseBatch(bytes32 reviewCaseId, uint256 maxJudges) external nonReentrant {
        if (maxJudges == 0) revert InvalidSettlementBatch();
        _settleCaseBatch(reviewCaseId, _boundedBatch(maxJudges));
        _emitSettlementProgress(reviewCaseId);
    }

    /// @notice Converts the latest completed review round into a payout-
    /// consumable result only after its permissionless appeal window expires.
    function finalizeNoAppeal(bytes32 reviewCaseId)
        external
        nonReentrant
        returns (VNextTypes.ReviewOutcome outcome)
    {
        ReviewCase storage rootCase = _case(reviewCaseId);
        bytes32 rootCaseId = rootCase.rootCaseId;
        if (finalOutcome[rootCaseId] != VNextTypes.ReviewOutcome.NONE) {
            revert FinalRulingAlreadyEstablished();
        }

        bytes32 latestCaseId = latestCase[rootCaseId];
        ReviewCase storage latest = _case(latestCaseId);
        if (!latest.courtFinalized) revert CourtNotAssigned();
        if (block.timestamp < revealDeadline[latestCaseId] + appealWindowDuration) {
            revert AppealWindowOpen();
        }
        if (
            (latest.result == JuryTypes.CourtResult.INVALID
                    || latest.result == JuryTypes.CourtResult.TIED)
                && retryCount[rootCaseId] < MAXIMUM_RETRIES_PER_REVIEW_LEVEL
        ) revert ProtocolFailureNotReady();

        outcome = latest.result == JuryTypes.CourtResult.PASS
            ? VNextTypes.ReviewOutcome.FINAL_PASS
            : latest.result == JuryTypes.CourtResult.FAIL
                ? VNextTypes.ReviewOutcome.VERDICT_FAIL
                : VNextTypes.ReviewOutcome.PROTOCOL_FAIL;
        finalOutcome[rootCaseId] = outcome;
        finalOutcome[latestCaseId] = outcome;
        _prepareFinalSettlement(rootCaseId, outcome);
        _refundAppealBonds(rootCaseId);
        emit FinalRulingEstablished(rootCaseId, uint8(outcome));
        if (latest.roundId > 0) {
            emit AppealRoundFinalized(rootCaseId, latest.roundId, uint8(outcome));
        }
    }

    /// @notice Terminalizes a case that cannot form a valid court after its
    /// frozen enrollment or randomness deadline. This is permissionless and
    /// never creates a substantive PASS or FAIL.
    function finalizeProtocolFailure(bytes32 reviewCaseId)
        external
        nonReentrant
        returns (VNextTypes.ReviewOutcome outcome)
    {
        ReviewCase storage requested = _case(reviewCaseId);
        bytes32 rootCaseId = requested.rootCaseId;
        if (finalOutcome[rootCaseId] != VNextTypes.ReviewOutcome.NONE) {
            revert FinalRulingAlreadyEstablished();
        }
        bytes32 latestCaseId = latestCase[rootCaseId];
        ReviewCase storage latest = _case(latestCaseId);
        bool noQuorum =
            latest.enrolledCount < 3 && block.timestamp >= enrollmentDeadline[latestCaseId];
        bool randomnessExpired = !latest.snapshotFinalized && latest.enrolledCount >= 3
            && block.timestamp >= randomnessDeadline[latestCaseId];
        bool invalidOrTied = latest.courtFinalized
            && (latest.result == JuryTypes.CourtResult.INVALID
                || latest.result == JuryTypes.CourtResult.TIED)
            && block.timestamp >= revealDeadline[latestCaseId];
        bool retryExhausted = retryCount[rootCaseId] >= MAXIMUM_RETRIES_PER_REVIEW_LEVEL;
        if ((!noQuorum && !randomnessExpired && !invalidOrTied) || !retryExhausted) {
            revert ProtocolFailureNotReady();
        }

        outcome = VNextTypes.ReviewOutcome.PROTOCOL_FAIL;
        finalOutcome[rootCaseId] = outcome;
        finalOutcome[latestCaseId] = outcome;
        _prepareFinalSettlement(rootCaseId, outcome);
        _refundAppealBonds(rootCaseId);
        emit FinalRulingEstablished(rootCaseId, uint8(outcome));
    }

    function courtJudge(bytes32 reviewCaseId, uint256 courtId, uint256 slot)
        external
        view
        returns (address)
    {
        if (slot >= 3) revert InvalidAmount();
        return courtJudges[reviewCaseId][courtId][slot];
    }

    function courtCount(bytes32 reviewCaseId) external view returns (uint256) {
        return _case(reviewCaseId).totalCourts;
    }

    function frozenJudge(bytes32 reviewCaseId, uint256 index) external view returns (address) {
        return frozenJudges[reviewCaseId][index];
    }

    function reviewRound(bytes32 reviewCaseId) external view returns (uint256) {
        return _case(reviewCaseId).roundId;
    }

    /// @notice Settles every prepared round for a final ruling, consuming at
    /// most maxJudges work units. A work unit is one Judge settlement or one
    /// Judge reward credit, so no call loops over an unbounded pool.
    function settleFinalRuling(bytes32 reviewCaseId, uint256 maxJudges) external nonReentrant {
        if (maxJudges == 0) revert InvalidSettlementBatch();
        ReviewCase storage requested = _case(reviewCaseId);
        bytes32 rootCaseId = requested.rootCaseId;
        if (finalOutcome[rootCaseId] == VNextTypes.ReviewOutcome.NONE) {
            revert SettlementNotPrepared();
        }

        uint256 remaining = _boundedBatch(maxJudges);
        uint256 cursor = finalSettlementCursor[rootCaseId];
        uint256 count = _settlementCaseCount(rootCaseId);
        while (cursor < count && remaining > 0) {
            bytes32 currentCaseId = _settlementCaseAt(rootCaseId, cursor);
            if (!reviewCaseSettled[currentCaseId]) {
                uint256 consumed = _settleCaseBatch(currentCaseId, remaining);
                remaining -= consumed;
            }
            if (!reviewCaseSettled[currentCaseId]) break;
            cursor++;
        }
        finalSettlementCursor[rootCaseId] = cursor;
        _emitSettlementProgress(reviewCaseId);
    }

    function settlementComplete(bytes32 reviewCaseId) external view returns (bool) {
        ReviewCase storage requested = _case(reviewCaseId);
        bytes32 rootCaseId = requested.rootCaseId;
        if (finalOutcome[rootCaseId] == VNextTypes.ReviewOutcome.NONE) return false;
        uint256 count = _settlementCaseCount(rootCaseId);
        for (uint256 i = 0; i < count; i++) {
            if (!reviewCaseSettled[_settlementCaseAt(rootCaseId, i)]) return false;
        }
        return true;
    }

    function reviewResult(bytes32 reviewCaseId) external view returns (JuryTypes.CourtResult) {
        return _case(reviewCaseId).result;
    }

    function _case(bytes32 reviewCaseId) private view returns (ReviewCase storage reviewCase) {
        reviewCase = reviewCases[reviewCaseId];
        if (reviewCase.creator == address(0)) revert UnknownCase();
    }

    function _freezePermutation(bytes32 reviewCaseId, bytes32 seed) private {
        address[] storage permutation = frozenJudges[reviewCaseId];
        delete frozenJudges[reviewCaseId];
        uint256 length = enrolledJudges[reviewCaseId].length;
        for (uint256 i = 0; i < length; i++) {
            permutation.push(enrolledJudges[reviewCaseId][i]);
        }

        for (uint256 remaining = length; remaining > 1; remaining--) {
            uint256 swapIndex =
                uint256(keccak256(abi.encode(seed, reviewCaseId, remaining))) % remaining;
            address current = permutation[remaining - 1];
            permutation[remaining - 1] = permutation[swapIndex];
            permutation[swapIndex] = current;
        }
    }

    function _materializeCourt(bytes32 reviewCaseId, uint256 courtId) private {
        for (uint256 slot = 0; slot < 3; slot++) {
            address judge = frozenJudges[reviewCaseId][courtId * 3 + slot];
            courtJudges[reviewCaseId][courtId][slot] = judge;
            assignedJudge[reviewCaseId][judge] = true;
            assignedCourtId[reviewCaseId][judge] = courtId;
        }
    }

    function _isJudgeInCourt(bytes32 reviewCaseId, uint256 courtId, address judge)
        private
        view
        returns (bool)
    {
        for (uint256 slot = 0; slot < 3; slot++) {
            if (courtJudges[reviewCaseId][courtId][slot] == judge) return true;
        }
        return false;
    }

    function _allRevealed(bytes32 reviewCaseId, uint256 courtId) private view returns (bool) {
        for (uint256 slot = 0; slot < 3; slot++) {
            if (!revealed[reviewCaseId][courtId][courtJudges[reviewCaseId][courtId][slot]]) {
                return false;
            }
        }
        return true;
    }

    function _recordCourtResult(
        bytes32 reviewCaseId,
        ReviewCase storage reviewCase,
        JuryTypes.CourtResult result
    ) private {
        reviewCase.finalizedCourts++;
        if (result == JuryTypes.CourtResult.PASS) reviewCase.passCourts++;
        if (result == JuryTypes.CourtResult.FAIL) reviewCase.failCourts++;
        if (result == JuryTypes.CourtResult.INVALID) reviewCase.invalidCourts++;
        if (reviewCase.finalizedCourts != reviewCase.totalCourts) return;

        reviewCase.result = reviewCase.invalidCourts > 0
            ? JuryTypes.CourtResult.INVALID
            : reviewCase.passCourts > reviewCase.totalCourts / 2
                ? JuryTypes.CourtResult.PASS
                : reviewCase.failCourts > reviewCase.totalCourts / 2
                    ? JuryTypes.CourtResult.FAIL
                    : JuryTypes.CourtResult.TIED;
        reviewCase.courtFinalized = true;
        roundStatus[reviewCaseId] =
            reviewCase.result == JuryTypes.CourtResult.PASS
                ? JuryTypes.RoundStatus.PROVISIONAL_PASS
                : reviewCase.result == JuryTypes.CourtResult.FAIL
                    ? JuryTypes.RoundStatus.PROVISIONAL_FAIL
                    : JuryTypes.RoundStatus.RETRY_ELIGIBLE;
    }

    function _refundAppealBonds(bytes32 rootCaseId) private {
        IERC20 stakeToken = IERC20(address(registry.stakeToken()));
        bytes32[] storage rounds = appealCases[rootCaseId];
        for (uint256 i = 0; i < rounds.length; i++) {
            bytes32 appealCaseId = rounds[i];
            uint256 bond = appealBondForCase[appealCaseId];
            if (bond == 0) continue;
            appealBondForCase[appealCaseId] = 0;
            stakeToken.safeTransfer(appealRequester[appealCaseId], bond);
        }
    }

    function _prepareFinalSettlement(bytes32 rootCaseId, VNextTypes.ReviewOutcome outcome)
        private
    {
        _beginSettlement(rootCaseId, outcome);
        bytes32[] storage rounds = appealCases[rootCaseId];
        for (uint256 i = 0; i < rounds.length; i++) {
            _beginSettlement(rounds[i], outcome);
        }
        bytes32[] storage retries = retryCases[rootCaseId];
        for (uint256 i = 0; i < retries.length; i++) {
            _beginSettlement(retries[i], outcome);
        }
        finalSettlementCursor[rootCaseId] = 0;
    }

    function _beginSettlement(bytes32 reviewCaseId, VNextTypes.ReviewOutcome outcome) private {
        if (outcome == VNextTypes.ReviewOutcome.NONE) revert InvalidSettlementOutcome();
        if (reviewCaseSettled[reviewCaseId]) return;
        VNextTypes.ReviewOutcome configured = settlementOutcome[reviewCaseId];
        if (configured != VNextTypes.ReviewOutcome.NONE && configured != outcome) {
            revert InvalidSettlementOutcome();
        }
        if (configured == VNextTypes.ReviewOutcome.NONE) {
            settlementOutcome[reviewCaseId] = outcome;
            settlementPhase[reviewCaseId] = 1;
        }
    }

    function _retryReady(ReviewCase storage reviewCase, bytes32 reviewCaseId)
        private
        view
        returns (bool)
    {
        if (reviewCase.enrolledCount < 3) {
            return block.timestamp >= enrollmentDeadline[reviewCaseId];
        }
        if (!reviewCase.snapshotFinalized) {
            return block.timestamp >= randomnessDeadline[reviewCaseId];
        }
        if (!reviewCase.courtFinalized) {
            return block.timestamp >= revealDeadline[reviewCaseId]
                && reviewCase.finalizedCourts < reviewCase.totalCourts;
        }
        return block.timestamp >= revealDeadline[reviewCaseId]
            && (reviewCase.result == JuryTypes.CourtResult.INVALID
                || reviewCase.result == JuryTypes.CourtResult.TIED);
    }

    function _settleCaseBatch(bytes32 reviewCaseId, uint256 maxJudges)
        private
        returns (uint256 consumed)
    {
        if (reviewCaseSettled[reviewCaseId]) return 0;
        VNextTypes.ReviewOutcome outcome = settlementOutcome[reviewCaseId];
        if (outcome == VNextTypes.ReviewOutcome.NONE) revert SettlementNotPrepared();

        uint256 length = enrolledJudges[reviewCaseId].length;
        uint256 cursor = settlementCursor[reviewCaseId];
        uint256 end = cursor + maxJudges;
        if (end > length) end = length;

        if (settlementPhase[reviewCaseId] == 1) {
            for (; cursor < end; cursor++) {
                address judge = enrolledJudges[reviewCaseId][cursor];
                uint256 slash;
                if (VNextTypes.isSubstantive(outcome) && assignedJudge[reviewCaseId][judge]) {
                    JuryTypes.Vote vote = votes[reviewCaseId][assignedCourtId[reviewCaseId][judge]][judge];
                    bool winner = _isWinner(outcome, vote);
                    if (winner) {
                        settlementWinners[reviewCaseId]++;
                    } else if (vote != JuryTypes.Vote.NONE) {
                        uint256 locked = registry.caseStake(reviewCaseId, judge);
                        slash = locked * minoritySlashBps / 10_000;
                        settlementTotalSlash[reviewCaseId] += slash;
                        if (slash > 0) emit JudgeSlashed(reviewCaseId, judge, slash);
                    }
                }
                registry.settleCaseStake(reviewCaseId, judge, slash);
                consumed++;
            }
            settlementCursor[reviewCaseId] = cursor;
            if (cursor < length) return consumed;

            uint256 winners = settlementWinners[reviewCaseId];
            if (winners == 0) {
                _finishSettlement(reviewCaseId, outcome);
                return consumed;
            }
            settlementRewardPerWinner[reviewCaseId] =
                settlementTotalSlash[reviewCaseId] / winners;
            settlementRewardDust[reviewCaseId] =
                settlementTotalSlash[reviewCaseId] % winners;
            settlementWinnerIndex[reviewCaseId] = 0;
            settlementCursor[reviewCaseId] = 0;
            settlementPhase[reviewCaseId] = 2;
        }

        if (settlementPhase[reviewCaseId] == 2 && consumed < maxJudges) {
            cursor = settlementCursor[reviewCaseId];
            end = cursor + (maxJudges - consumed);
            if (end > length) end = length;
            for (; cursor < end; cursor++) {
                consumed++;
                address judge = enrolledJudges[reviewCaseId][cursor];
                if (!assignedJudge[reviewCaseId][judge]) continue;
                JuryTypes.Vote vote = votes[reviewCaseId][assignedCourtId[reviewCaseId][judge]][judge];
                if (!_isWinner(outcome, vote)) continue;
                uint256 winnerIndex = settlementWinnerIndex[reviewCaseId]++;
                uint256 reward = settlementRewardPerWinner[reviewCaseId]
                    + (winnerIndex < settlementRewardDust[reviewCaseId] ? 1 : 0);
                if (reward > 0) registry.creditReward(reviewCaseId, judge, reward);
            }
            settlementCursor[reviewCaseId] = cursor;
            if (cursor == length) _finishSettlement(reviewCaseId, outcome);
        }
    }

    function _finishSettlement(bytes32 reviewCaseId, VNextTypes.ReviewOutcome outcome) private {
        reviewCaseSettled[reviewCaseId] = true;
        settlementPhase[reviewCaseId] = 3;
        roundStatus[reviewCaseId] = JuryTypes.RoundStatus.SETTLED;
        emit ReviewCaseSettled(
            reviewCaseId,
            uint8(outcome),
            settlementTotalSlash[reviewCaseId],
            settlementWinners[reviewCaseId]
        );
    }

    function _emitSettlementProgress(bytes32 reviewCaseId) private {
        emit ReviewSettlementProgress(
            reviewCaseId,
            uint8(settlementOutcome[reviewCaseId]),
            settlementPhase[reviewCaseId],
            settlementCursor[reviewCaseId],
            enrolledJudges[reviewCaseId].length,
            reviewCaseSettled[reviewCaseId]
        );
    }

    function _isWinner(VNextTypes.ReviewOutcome outcome, JuryTypes.Vote vote)
        private
        pure
        returns (bool)
    {
        return (outcome == VNextTypes.ReviewOutcome.FINAL_PASS && vote == JuryTypes.Vote.PASS)
            || (outcome == VNextTypes.ReviewOutcome.VERDICT_FAIL && vote == JuryTypes.Vote.FAIL);
    }

    function _boundedBatch(uint256 requested) private pure returns (uint256) {
        return requested > MAX_SETTLEMENT_BATCH_SIZE ? MAX_SETTLEMENT_BATCH_SIZE : requested;
    }

    function _settlementCaseCount(bytes32 rootCaseId) private view returns (uint256) {
        return 1 + appealCases[rootCaseId].length + retryCases[rootCaseId].length;
    }

    function _settlementCaseAt(bytes32 rootCaseId, uint256 index)
        private
        view
        returns (bytes32)
    {
        if (index == 0) return rootCaseId;
        uint256 appealCount = appealCases[rootCaseId].length;
        if (index <= appealCount) return appealCases[rootCaseId][index - 1];
        return retryCases[rootCaseId][index - appealCount - 1];
    }

    function _poolId(bytes32 reviewCaseId, bytes32 kind) private pure returns (bytes32) {
        return keccak256(abi.encode(reviewCaseId, kind));
    }
}
