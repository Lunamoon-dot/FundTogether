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

/// @notice VNext review engine for deterministic three-Judge courts.
/// @dev Court assignment, multi-court aggregation, commit–reveal, appeal
/// rounds and finality are permissionless after immutable case creation. Judge
/// reward/slash settlement remains a separately parameterized ledger gate.
contract JuryReview is ReentrancyGuard, IVNextEvents {
    using SafeERC20 for IERC20;

    uint256 public immutable protocolVersion;
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
        uint256 evidenceRevision
    ) external returns (bytes32 reviewCaseId) {
        if (msg.sender != campaignEscrow) revert NotCampaignEscrow();
        if (creator == address(0)) revert InvalidAddress();

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

        emit ReviewCaseCreated(reviewCaseId, campaignId, milestoneId, evidenceRevision, creator);
    }

    function enroll(bytes32 reviewCaseId) external {
        ReviewCase storage reviewCase = _case(reviewCaseId);
        if (block.timestamp >= enrollmentDeadline[reviewCaseId]) revert EnrollmentClosed();
        if (reviewCase.snapshotFinalized) revert SnapshotAlreadyFinalized();
        if (msg.sender == reviewCase.creator) revert CreatorConflict();
        if (enrolled[reviewCaseId][msg.sender]) revert CommitmentAlreadySubmitted();
        if (participatedInRoot[reviewCase.rootCaseId][msg.sender]) {
            revert JudgeAlreadyParticipated();
        }
        if (enrolledJudges[reviewCaseId].length >= maxEligibleJudges) revert InsufficientJudges();
        if (registry.caseStake(reviewCaseId, msg.sender) == 0) revert InsufficientJudges();

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
        reviewCase.totalCourts = reviewCase.enrolledCount / 3;
        reviewCase.snapshotFinalized = true;
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

        _selectCourt(reviewCaseId, courtId, reviewCase.seed);
        reviewCase.courtAssigned = true;
        courtAssigned[reviewCaseId][courtId] = true;
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
        _recordCourtResult(reviewCase, result);
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
        if (!_retryReady(previous, reviewCaseId)) revert RetryNotReady();

        _settleCase(reviewCaseId, VNextTypes.ReviewOutcome.PROTOCOL_FAIL);
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
        emit ReviewRetryOpened(rootCaseId, retryRoundId, retryCaseId);
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
        _settleAllRounds(rootCaseId, outcome);
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
        _settleAllRounds(rootCaseId, outcome);
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

    function reviewRound(bytes32 reviewCaseId) external view returns (uint256) {
        return _case(reviewCaseId).roundId;
    }

    function reviewResult(bytes32 reviewCaseId) external view returns (JuryTypes.CourtResult) {
        return _case(reviewCaseId).result;
    }

    function _case(bytes32 reviewCaseId) private view returns (ReviewCase storage reviewCase) {
        reviewCase = reviewCases[reviewCaseId];
        if (reviewCase.creator == address(0)) revert UnknownCase();
    }

    function _findUniqueIndex(
        bytes32 reviewCaseId,
        uint256 baseIndex,
        address[3] memory selected,
        uint256 selectedCount
    ) private view returns (uint256) {
        uint256 length = enrolledJudges[reviewCaseId].length;
        for (uint256 offset = 0; offset < length; offset++) {
            uint256 index = (baseIndex + offset) % length;
            address candidate = enrolledJudges[reviewCaseId][index];
            if (assignedJudge[reviewCaseId][candidate]) continue;
            bool duplicate;
            for (uint256 selectedIndex = 0; selectedIndex < selectedCount; selectedIndex++) {
                if (selected[selectedIndex] == candidate) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) return index;
        }
        revert InsufficientJudges();
    }

    function _selectCourt(bytes32 reviewCaseId, uint256 courtId, bytes32 seed) private {
        address[3] memory selected;
        uint256 enrolledCount = enrolledJudges[reviewCaseId].length;
        for (uint256 slot = 0; slot < 3; slot++) {
            uint256 baseIndex =
                uint256(keccak256(abi.encode(seed, reviewCaseId, courtId, slot))) % enrolledCount;
            uint256 index = _findUniqueIndex(reviewCaseId, baseIndex, selected, slot);
            selected[slot] = enrolledJudges[reviewCaseId][index];
            courtJudges[reviewCaseId][courtId][slot] = selected[slot];
            assignedJudge[reviewCaseId][selected[slot]] = true;
            assignedCourtId[reviewCaseId][selected[slot]] = courtId;
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

    function _recordCourtResult(ReviewCase storage reviewCase, JuryTypes.CourtResult result)
        private
    {
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

    function _settleAllRounds(bytes32 rootCaseId, VNextTypes.ReviewOutcome outcome) private {
        _settleCase(rootCaseId, outcome);
        bytes32[] storage rounds = appealCases[rootCaseId];
        for (uint256 i = 0; i < rounds.length; i++) {
            _settleCase(rounds[i], outcome);
        }
        bytes32[] storage retries = retryCases[rootCaseId];
        for (uint256 i = 0; i < retries.length; i++) {
            _settleCase(retries[i], outcome);
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
        return block.timestamp >= revealDeadline[reviewCaseId]
            && (reviewCase.courtFinalized || reviewCase.finalizedCourts < reviewCase.totalCourts);
    }

    function _settleCase(bytes32 reviewCaseId, VNextTypes.ReviewOutcome outcome) private {
        if (reviewCaseSettled[reviewCaseId]) return;
        uint256 totalSlash;
        uint256 winners;
        for (uint256 i = 0; i < enrolledJudges[reviewCaseId].length; i++) {
            address judge = enrolledJudges[reviewCaseId][i];
            uint256 slash;
            bool winner;
            if (VNextTypes.isSubstantive(outcome) && assignedJudge[reviewCaseId][judge]) {
                JuryTypes.Vote vote =
                    votes[reviewCaseId][assignedCourtId[reviewCaseId][judge]][judge];
                winner =
                    (outcome == VNextTypes.ReviewOutcome.FINAL_PASS && vote == JuryTypes.Vote.PASS)
                        || (outcome == VNextTypes.ReviewOutcome.VERDICT_FAIL
                            && vote == JuryTypes.Vote.FAIL);
                if (!winner && vote != JuryTypes.Vote.NONE) {
                    uint256 locked = registry.caseStake(reviewCaseId, judge);
                    slash = locked * minoritySlashBps / 10_000;
                    totalSlash += slash;
                    if (slash > 0) emit JudgeSlashed(reviewCaseId, judge, slash);
                }
                if (winner) winners++;
            }
            registry.settleCaseStake(reviewCaseId, judge, slash);
        }

        if (totalSlash == 0 || winners == 0) return;
        uint256 reward = totalSlash / winners;
        if (reward == 0) return;
        for (uint256 i = 0; i < enrolledJudges[reviewCaseId].length; i++) {
            address judge = enrolledJudges[reviewCaseId][i];
            if (!assignedJudge[reviewCaseId][judge]) continue;
            JuryTypes.Vote vote = votes[reviewCaseId][assignedCourtId[reviewCaseId][judge]][judge];
            bool winner =
                (outcome == VNextTypes.ReviewOutcome.FINAL_PASS && vote == JuryTypes.Vote.PASS)
                    || (outcome == VNextTypes.ReviewOutcome.VERDICT_FAIL
                        && vote == JuryTypes.Vote.FAIL);
            if (winner) registry.creditReward(reviewCaseId, judge, reward);
        }
        reviewCaseSettled[reviewCaseId] = true;
    }
}
