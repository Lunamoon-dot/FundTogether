pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AdvanceTypes as T } from "./advance/AdvanceTypes.sol";

/// @dev Standalone local-pilot B escrow. A deployments and obligations are separate.
contract FundTogetherAdvance is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidInput();
    error WrongCaller();
    error WrongState();
    error WrongPlan();
    error Expired();
    error InvalidReference();
    error NonExactTransfer();
    error NoEntitlement();

    IERC20 public immutable supportedToken;
    address public immutable resolver;
    bytes32 public immutable deploymentId;
    bytes32 public constant WORKFLOW_POLICY = keccak256("FundTogether.advance.no-bond.v1");
    uint256 public constant MIN_FUNDING_DURATION = 1 days;
    uint256 public constant MAX_FUNDING_DURATION = 30 days;
    uint256 public constant FIRST_REVIEW_WINDOW = 3 days;
    uint256 public constant CLAIM_WINDOW = 7 days;
    uint256 public constant INITIAL_EVIDENCE_WINDOW = 30 days;
    uint256 public constant STAGE_HARD_LIMIT = 60 days;
    uint256 public constant REVIEW_WINDOW = 3 days;
    uint256 public constant SUPPLEMENT_WINDOW = 7 days;
    uint256 public constant CHALLENGE_WINDOW = 3 days;
    uint256 public constant FINALIZATION_WINDOW = 7 days;
    uint256 public constant MAX_VERSIONS = 3;
    uint256 public constant CASE_RESPONSE_WINDOW = 3 days;
    uint256 public constant CASE_RESOLUTION_WINDOW = 3 days;
    uint256 public nextCampaignId;

    mapping(uint256 => T.CampaignView) private _campaigns;
    mapping(uint256 => T.StageView[]) private _stages;
    mapping(address => mapping(bytes32 => uint256)) public campaignForDraft;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => T.SubmissionView))) private _submissions;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => T.CaseView))) private _cases;
    mapping(uint256 => mapping(address => bool)) private _baseConsumed;
    mapping(uint256 => mapping(address => uint256)) private _supplementPaid;

    event CampaignSubmitted(uint256 indexed campaignId, address indexed organizer,
        bytes32 indexed draftKey, bytes32 planHash, uint256 goal, uint256 fundingDuration);
    event StageConfigured(uint256 indexed campaignId, uint256 indexed stage,
        uint256 budget, bytes32 criteriaHash);
    event CampaignApproved(uint256 indexed campaignId, address resolver,
        bytes32 planHash, bytes32 verificationHash, bytes32 reasonHash);
    event CampaignPublished(uint256 indexed campaignId, uint256 fundingEnd);
    event DonationReceived(uint256 indexed campaignId, address indexed donor,
        uint256 amount, uint256 contributed, uint256 custody);
    event CampaignFunded(uint256 indexed campaignId, uint256 firstReviewEnd);
    event AdvanceAvailable(uint256 indexed campaignId, uint256 indexed stage,
        uint256 claimEnd, bytes32 verificationHash, bytes32 reasonHash);
    event AdvanceClaimed(uint256 indexed campaignId, uint256 indexed stage,
        address organizer, uint256 budget, uint256 advanced, uint256 custody,
        uint256 submissionEnd, uint256 hardStop);
    event RefundSnapshotted(uint256 indexed campaignId, uint256 basePool,
        uint256 contributed, uint256 custody);
    event CampaignStopped(uint256 indexed campaignId, uint256 stage,
        T.StopReason stopReason, bytes32 reasonHash);
    event EvidenceSubmitted(uint256 indexed campaignId, uint256 indexed stage,
        uint256 indexed version, bytes32 evidenceHash, uint256 parentVersion, uint256 reviewEnd);
    event EvidenceReviewed(uint256 indexed campaignId, uint256 indexed stage,
        uint256 indexed version, T.ReviewOutcome outcome, bytes32 evidenceHash,
        bytes32 publicHash, bytes32 reportHash, uint256 campaignSpent, uint256 unused,
        uint256 submissionEnd, uint256 challengeEnd, uint256 finalizeEnd);
    event StageFinalized(uint256 indexed campaignId, uint256 indexed stage,
        uint256 indexed version, bytes32 evidenceHash, bytes32 reportHash);
    event CampaignCompleted(uint256 indexed campaignId, uint256 finalStage);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor,
        uint256 baseAmount, uint256 supplementAmount, bool baseConsumed,
        uint256 supplementPaid, uint256 refunded, uint256 custody);
    event CaseOpened(uint256 indexed campaignId, uint256 indexed stage, uint256 indexed version,
        address opener, bytes32 evidenceHash, bytes32 reasonHash, uint256 responseEnd, uint256 resolutionEnd);
    event CaseMaterialAdded(uint256 indexed campaignId, uint256 indexed stage,
        uint256 indexed version, address actor, bytes32 materialHash);
    event CaseResponseSubmitted(uint256 indexed campaignId, uint256 indexed stage,
        uint256 indexed version, address actor, bytes32 responseHash);
    event CaseResolved(uint256 indexed campaignId, uint256 indexed stage, uint256 indexed version,
        address actor, T.Resolution resolution, bytes32 reasonHash,
        uint256 submissionEnd, uint256 challengeEnd, uint256 finalizeEnd);
    event FundsReturned(uint256 indexed campaignId, uint256 indexed stage, address organizer,
        uint256 amount, bool afterSnapshot, uint256 returnedStage, uint256 returned,
        uint256 supplementPool, uint256 custody);

    constructor(address token, address resolver_, bytes32 instanceId) {
        if (token.code.length == 0 || resolver_ == address(0) || instanceId == bytes32(0)) {
            revert InvalidInput();
        }
        if (IERC20Metadata(token).decimals() != 6) revert InvalidInput();
        supportedToken = IERC20(token);
        resolver = resolver_;
        deploymentId = instanceId;
    }

    function campaign(uint256 id) external view returns (T.CampaignView memory) {
        return _campaign(id);
    }

    function stage(uint256 id, uint256 index) external view returns (T.StageView memory) {
        _campaign(id);
        if (index >= _stages[id].length) revert InvalidReference();
        return _stages[id][index];
    }

    function stageCount(uint256 id) external view returns (uint256) {
        _campaign(id);
        return _stages[id].length;
    }

    function submission(uint256 id, uint256 index, uint256 version)
        external view returns (T.SubmissionView memory) {
        _campaign(id);
        if (index >= _stages[id].length || _submissions[id][index][version].evidenceHash == bytes32(0)) {
            revert InvalidReference();
        }
        return _submissions[id][index][version];
    }

    function challengeCase(uint256 id, uint256 index, uint256 version)
        external view returns (T.CaseView memory) {
        _campaign(id);
        if (index >= _stages[id].length || _submissions[id][index][version].evidenceHash == bytes32(0)) {
            revert InvalidReference();
        }
        return _cases[id][index][version];
    }

    function refundClaimable(uint256 id, address donor) external view
        returns (uint256 base, uint256 supplement, bool baseConsumed, uint256 supplementPaid) {
        T.CampaignView storage c = _campaign(id);
        baseConsumed = _baseConsumed[id][donor];
        supplementPaid = _supplementPaid[id][donor];
        if (!c.refundSnapshotted || c.contributed == 0) return (0, 0, baseConsumed, supplementPaid);
        (base, supplement,) = _refundAmounts(id, donor, c);
    }

    function claimRefund(uint256 id) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        if (!c.refundSnapshotted) revert WrongState();
        if (contributions[id][msg.sender] == 0) revert WrongCaller();
        (uint256 base, uint256 supplement, uint256 cumulativeSupplement) = _refundAmounts(id, msg.sender, c);
        uint256 amount = base + supplement;
        if (_baseConsumed[id][msg.sender] && amount == 0) revert NoEntitlement();
        _baseConsumed[id][msg.sender] = true;
        _supplementPaid[id][msg.sender] = cumulativeSupplement;
        c.refunded += amount;
        c.custody -= amount;
        if (amount != 0) _sendExact(msg.sender, amount);
        emit RefundClaimed(id, msg.sender, base, supplement, true, cumulativeSupplement, c.refunded, c.custody);
    }

    function submitCampaignForDraft(bytes32 draftKey, bytes32 planHash, uint256 fundingDuration,
        uint256[] calldata budgets, bytes32[] calldata criteriaHashes)
        external nonReentrant returns (uint256 id) {
        if (msg.sender == resolver) revert WrongCaller();
        if (draftKey == bytes32(0) || planHash == bytes32(0) || budgets.length == 0
            || budgets.length != criteriaHashes.length
            || fundingDuration < MIN_FUNDING_DURATION || fundingDuration > MAX_FUNDING_DURATION
            || campaignForDraft[msg.sender][draftKey] != 0) revert InvalidInput();
        uint256 goal;
        for (uint256 i; i < budgets.length; ++i) {
            if (budgets[i] == 0 || criteriaHashes[i] == bytes32(0)) revert InvalidInput();
            goal += budgets[i];
        }
        id = nextCampaignId++;
        T.CampaignView storage c = _campaigns[id];
        c.organizer = msg.sender;
        c.planHash = planHash;
        c.goal = goal;
        c.fundingDuration = fundingDuration;
        campaignForDraft[msg.sender][draftKey] = id + 1;
        emit CampaignSubmitted(id, msg.sender, draftKey, planHash, goal, fundingDuration);
        for (uint256 i; i < budgets.length; ++i) {
            _stages[id].push();
            T.StageView storage s = _stages[id][i];
            s.budget = budgets[i];
            s.criteriaHash = criteriaHashes[i];
            emit StageConfigured(id, i, budgets[i], criteriaHashes[i]);
        }
    }

    function approveCampaign(uint256 id, bytes32 expectedPlanHash,
        bytes32 verificationHash, bytes32 reasonHash) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyResolver();
        _checkPlan(c, expectedPlanHash);
        if (c.state != T.CampaignState.DRAFT) revert WrongState();
        if (verificationHash == bytes32(0) || reasonHash == bytes32(0)) revert InvalidInput();
        c.state = T.CampaignState.APPROVED;
        emit CampaignApproved(id, msg.sender, c.planHash, verificationHash, reasonHash);
    }

    function publishCampaign(uint256 id, bytes32 expectedPlanHash) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyOrganizer(c);
        _checkPlan(c, expectedPlanHash);
        if (c.state != T.CampaignState.APPROVED) revert WrongState();
        c.fundingEnd = block.timestamp + c.fundingDuration;
        c.state = T.CampaignState.FUNDING;
        emit CampaignPublished(id, c.fundingEnd);
    }

    function cancelCampaign(uint256 id, bytes32 expectedPlanHash) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyOrganizer(c);
        _checkPlan(c, expectedPlanHash);
        if (c.refundSnapshotted || c.advanced != 0) revert WrongState();
        _stop(id, c, T.StopReason.CANCELLED, bytes32(0));
    }

    function donate(uint256 id, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        if (msg.sender == resolver) revert WrongCaller();
        if (c.state != T.CampaignState.FUNDING) revert WrongState();
        if (block.timestamp >= c.fundingEnd) revert Expired();
        if (amount == 0 || amount > c.goal - c.contributed) revert InvalidInput();
        c.contributed += amount;
        c.custody += amount;
        contributions[id][msg.sender] += amount;
        _receiveExact(msg.sender, amount);
        emit DonationReceived(id, msg.sender, amount, c.contributed, c.custody);
        if (c.contributed == c.goal) {
            c.state = T.CampaignState.FIRST_REVIEW;
            c.firstReviewEnd = block.timestamp + FIRST_REVIEW_WINDOW;
            emit CampaignFunded(id, c.firstReviewEnd);
        }
    }

    function confirmFirstAdvance(uint256 id, bytes32 expectedPlanHash,
        bytes32 verificationHash, bytes32 reasonHash) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyResolver();
        _checkPlan(c, expectedPlanHash);
        if (c.state != T.CampaignState.FIRST_REVIEW) revert WrongState();
        if (block.timestamp >= c.firstReviewEnd) revert Expired();
        if (verificationHash == bytes32(0) || reasonHash == bytes32(0)) revert InvalidInput();
        c.state = T.CampaignState.ADVANCE_AVAILABLE;
        c.claimEnd = block.timestamp + CLAIM_WINDOW;
        emit AdvanceAvailable(id, 0, c.claimEnd, verificationHash, reasonHash);
    }

    function claimAdvance(uint256 id, uint256 index, bytes32 expectedPlanHash) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyOrganizer(c);
        _checkPlan(c, expectedPlanHash);
        if (c.state != T.CampaignState.ADVANCE_AVAILABLE) revert WrongState();
        if (block.timestamp >= c.claimEnd) revert Expired();
        if (index != c.currentStage || index >= _stages[id].length) revert InvalidReference();
        T.StageView storage s = _stages[id][index];
        if (s.state != T.StageState.PENDING || s.advanced != 0 || c.custody < s.budget) {
            revert WrongState();
        }
        if (index > 0) {
            T.StageView storage previous = _stages[id][index - 1];
            if (previous.state != T.StageState.FINALIZED || previous.returned < previous.declaredUnused) {
                revert WrongState();
            }
        }
        c.advanced += s.budget;
        c.custody -= s.budget;
        c.state = T.CampaignState.EXECUTING;
        s.state = T.StageState.ADVANCED;
        s.advanced = s.budget;
        s.submissionEnd = block.timestamp + INITIAL_EVIDENCE_WINDOW;
        s.hardStop = block.timestamp + STAGE_HARD_LIMIT;
        _sendExact(c.organizer, s.budget);
        emit AdvanceClaimed(id, index, c.organizer, s.budget, c.advanced,
            c.custody, s.submissionEnd, s.hardStop);
    }

    function stopCampaign(uint256 id, bytes32 expectedPlanHash, bytes32 reasonHash) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyResolver();
        _checkPlan(c, expectedPlanHash);
        if (c.refundSnapshotted) revert WrongState();
        if (reasonHash == bytes32(0)) revert InvalidInput();
        _stop(id, c, T.StopReason.RESOLVER_STOP, reasonHash);
    }

    function submitEvidence(uint256 id, uint256 index, uint256 nextVersion, bytes32 evidenceHash)
        external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyOrganizer(c);
        if (c.state != T.CampaignState.EXECUTING && c.state != T.CampaignState.SUPPLEMENT_DUE) {
            revert WrongState();
        }
        if (index != c.currentStage || index >= _stages[id].length) revert InvalidReference();
        T.StageView storage s = _stages[id][index];
        if (block.timestamp >= s.submissionEnd || block.timestamp >= s.hardStop) revert Expired();
        if (nextVersion != s.latestVersion + 1 || nextVersion > MAX_VERSIONS) revert InvalidReference();
        if (evidenceHash == bytes32(0)) revert InvalidInput();
        T.SubmissionView storage v = _submissions[id][index][nextVersion];
        v.version = nextVersion;
        v.evidenceHash = evidenceHash;
        v.parentVersion = s.latestVersion;
        v.submittedAt = block.timestamp;
        s.latestVersion = nextVersion;
        s.reviewEnd = _cap(block.timestamp + REVIEW_WINDOW, s.hardStop);
        s.acceptedCampaignSpent = 0;
        s.declaredUnused = 0;
        s.publicHash = bytes32(0);
        s.reportHash = bytes32(0);
        s.challengeEnd = 0;
        s.finalizeEnd = 0;
        s.state = T.StageState.EVIDENCE_REVIEW;
        c.state = T.CampaignState.EVIDENCE_REVIEW;
        emit EvidenceSubmitted(id, index, nextVersion, evidenceHash, v.parentVersion, s.reviewEnd);
    }

    function approveEvidence(T.EvidenceRef calldata ref, bytes32 publicHash,
        bytes32 reportHash, uint256 campaignSpent) external nonReentrant {
        (T.CampaignView storage c, T.StageView storage s, T.SubmissionView storage v) = _reviewable(ref);
        if (publicHash == bytes32(0) || reportHash == bytes32(0) || campaignSpent > s.budget) {
            revert InvalidInput();
        }
        _startChallenge(c, s);
        s.acceptedCampaignSpent = campaignSpent;
        s.declaredUnused = s.budget - campaignSpent;
        s.publicHash = publicHash;
        s.reportHash = reportHash;
        v.reviewed = true;
        v.outcome = T.ReviewOutcome.MET;
        v.reportHash = reportHash;
        v.publicHash = publicHash;
        _emitReview(ref, s, v.outcome);
    }

    function requestSupplement(T.EvidenceRef calldata ref, T.ReviewOutcome outcome, bytes32 reportHash)
        external nonReentrant {
        (T.CampaignView storage c, T.StageView storage s, T.SubmissionView storage v) = _reviewable(ref);
        if ((outcome != T.ReviewOutcome.NEEDS_INFORMATION && outcome != T.ReviewOutcome.INCONCLUSIVE)
            || reportHash == bytes32(0)) revert InvalidInput();
        v.reviewed = true;
        v.outcome = outcome;
        v.reportHash = reportHash;
        s.reportHash = reportHash;
        if (s.latestVersion < MAX_VERSIONS) {
            s.submissionEnd = _cap(block.timestamp + SUPPLEMENT_WINDOW, s.hardStop);
            s.state = T.StageState.SUPPLEMENT_DUE;
            c.state = T.CampaignState.SUPPLEMENT_DUE;
        }
        _emitReview(ref, s, outcome);
        if (s.latestVersion == MAX_VERSIONS) _stop(ref.campaignId, c, T.StopReason.VERSION_LIMIT, reportHash);
    }

    function rejectEvidence(T.EvidenceRef calldata ref, bytes32 reportHash) external nonReentrant {
        (T.CampaignView storage c, T.StageView storage s, T.SubmissionView storage v) = _reviewable(ref);
        if (reportHash == bytes32(0)) revert InvalidInput();
        v.reviewed = true;
        v.outcome = T.ReviewOutcome.NOT_MET;
        v.reportHash = reportHash;
        s.reportHash = reportHash;
        _emitReview(ref, s, v.outcome);
        _stop(ref.campaignId, c, T.StopReason.REVIEW_REJECTED, reportHash);
    }

    function finalizeStage(T.EvidenceRef calldata ref) external nonReentrant {
        (T.CampaignView storage c, T.StageView storage s, T.SubmissionView storage v) = _currentEvidence(ref);
        if (c.state != T.CampaignState.CHALLENGE_WINDOW || !v.reviewed || v.outcome != T.ReviewOutcome.MET) {
            revert WrongState();
        }
        T.CaseView storage cs = _cases[ref.campaignId][ref.stage][ref.version];
        if (cs.caseUsed && cs.resolution != T.Resolution.CONTINUE) revert WrongState();
        if (block.timestamp >= s.finalizeEnd || block.timestamp >= s.hardStop) revert Expired();
        if (block.timestamp < s.challengeEnd || s.returned < s.declaredUnused) revert WrongState();
        s.state = T.StageState.FINALIZED;
        emit StageFinalized(ref.campaignId, ref.stage, ref.version, ref.evidenceHash, v.reportHash);
        if (ref.stage + 1 == _stages[ref.campaignId].length) {
            c.state = T.CampaignState.COMPLETED;
            emit CampaignCompleted(ref.campaignId, ref.stage);
            _snapshot(ref.campaignId, c);
        } else {
            ++c.currentStage;
            c.state = T.CampaignState.ADVANCE_AVAILABLE;
            c.claimEnd = block.timestamp + CLAIM_WINDOW;
            emit AdvanceAvailable(ref.campaignId, c.currentStage, c.claimEnd, bytes32(0), bytes32(0));
        }
    }

    function returnFunds(uint256 id, uint256 index, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        _onlyOrganizer(c);
        if (index >= _stages[id].length) revert InvalidReference();
        T.StageView storage s = _stages[id][index];
        if (amount == 0 || amount > s.advanced - s.returned) revert InvalidInput();
        s.returned += amount;
        c.returned += amount;
        c.custody += amount;
        if (c.refundSnapshotted) c.supplementPool += amount;
        _receiveExact(msg.sender, amount);
        emit FundsReturned(id, index, c.organizer, amount, c.refundSnapshotted,
            s.returned, c.returned, c.supplementPool, c.custody);
    }

    function openCase(T.EvidenceRef calldata ref, bytes32 reasonHash) external nonReentrant {
        (T.CampaignView storage c, T.StageView storage s,) = _currentEvidence(ref);
        if (c.state != T.CampaignState.CHALLENGE_WINDOW) revert WrongState();
        if (block.timestamp >= s.challengeEnd || block.timestamp >= s.hardStop) revert Expired();
        if (msg.sender != resolver && contributions[ref.campaignId][msg.sender] == 0) revert WrongCaller();
        if (reasonHash == bytes32(0)) revert InvalidInput();
        T.CaseView storage cs = _cases[ref.campaignId][ref.stage][ref.version];
        if (cs.caseUsed) revert WrongState();
        cs.caseUsed = true;
        cs.opener = msg.sender;
        cs.reasonHash = reasonHash;
        cs.responseEnd = _cap(block.timestamp + CASE_RESPONSE_WINDOW, s.hardStop);
        cs.resolutionEnd = _cap(cs.responseEnd + CASE_RESOLUTION_WINDOW, s.hardStop);
        c.state = T.CampaignState.CASE_OPEN;
        s.state = T.StageState.CASE_OPEN;
        emit CaseOpened(ref.campaignId, ref.stage, ref.version, msg.sender, ref.evidenceHash,
            reasonHash, cs.responseEnd, cs.resolutionEnd);
    }

    function addCaseMaterial(T.EvidenceRef calldata ref, bytes32 materialHash) external nonReentrant {
        (, T.StageView storage s, T.CaseView storage cs) = _caseOpen(ref);
        if (block.timestamp >= cs.responseEnd || block.timestamp >= s.hardStop) revert Expired();
        if (contributions[ref.campaignId][msg.sender] == 0) revert WrongCaller();
        if (materialHash == bytes32(0)) revert InvalidInput();
        emit CaseMaterialAdded(ref.campaignId, ref.stage, ref.version, msg.sender, materialHash);
    }

    function submitCaseResponse(T.EvidenceRef calldata ref, bytes32 responseHash) external nonReentrant {
        (T.CampaignView storage c, T.StageView storage s, T.CaseView storage cs) = _caseOpen(ref);
        _onlyOrganizer(c);
        if (block.timestamp >= cs.responseEnd || block.timestamp >= s.hardStop) revert Expired();
        if (cs.responseHash != bytes32(0)) revert WrongState();
        if (responseHash == bytes32(0)) revert InvalidInput();
        cs.responseHash = responseHash;
        emit CaseResponseSubmitted(ref.campaignId, ref.stage, ref.version, msg.sender, responseHash);
    }

    function resolveCase(T.EvidenceRef calldata ref, T.Resolution outcome, bytes32 reasonHash)
        external nonReentrant {
        _onlyResolver();
        (T.CampaignView storage c, T.StageView storage s, T.CaseView storage cs) = _caseOpen(ref);
        if (block.timestamp >= cs.resolutionEnd || block.timestamp >= s.hardStop) revert Expired();
        if (block.timestamp < cs.responseEnd) revert WrongState();
        if (reasonHash == bytes32(0) || (outcome != T.Resolution.CONTINUE
            && outcome != T.Resolution.RESUBMIT && outcome != T.Resolution.STOP)) revert InvalidInput();
        cs.resolution = outcome;
        cs.resolutionReasonHash = reasonHash;
        if (outcome == T.Resolution.CONTINUE) {
            _startChallenge(c, s);
        } else if (outcome == T.Resolution.RESUBMIT && s.latestVersion < MAX_VERSIONS) {
            s.submissionEnd = _cap(block.timestamp + SUPPLEMENT_WINDOW, s.hardStop);
            c.state = T.CampaignState.SUPPLEMENT_DUE;
            s.state = T.StageState.SUPPLEMENT_DUE;
        }
        _emitCaseResolution(ref.campaignId, ref.stage, ref.version, cs, s);
        if (outcome == T.Resolution.STOP || (outcome == T.Resolution.RESUBMIT && s.latestVersion == MAX_VERSIONS)) {
            _stop(ref.campaignId, c,
                outcome == T.Resolution.STOP ? T.StopReason.CASE_STOP : T.StopReason.VERSION_LIMIT, reasonHash);
        }
    }

    function finalizeTimeout(uint256 id) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        uint256 deadline;
        T.StopReason reason;
        if (c.state == T.CampaignState.FUNDING) {
            deadline = c.fundingEnd;
            reason = T.StopReason.FUNDING_TIMEOUT;
        } else if (c.state == T.CampaignState.FIRST_REVIEW) {
            deadline = c.firstReviewEnd;
            reason = T.StopReason.FIRST_REVIEW_TIMEOUT;
        } else if (c.state == T.CampaignState.ADVANCE_AVAILABLE) {
            deadline = c.claimEnd;
            reason = T.StopReason.CLAIM_TIMEOUT;
        } else {
            T.StageView storage s = _stages[id][c.currentStage];
            if (c.state == T.CampaignState.EXECUTING || c.state == T.CampaignState.SUPPLEMENT_DUE) {
                deadline = s.submissionEnd;
                reason = T.StopReason.EVIDENCE_TIMEOUT;
            } else if (c.state == T.CampaignState.EVIDENCE_REVIEW) {
                deadline = s.reviewEnd;
                reason = T.StopReason.REVIEW_TIMEOUT;
            } else if (c.state == T.CampaignState.CHALLENGE_WINDOW) {
                deadline = s.finalizeEnd;
                reason = T.StopReason.FINALIZATION_TIMEOUT;
            } else if (c.state == T.CampaignState.CASE_OPEN) {
                deadline = _cases[id][c.currentStage][s.latestVersion].resolutionEnd;
                reason = T.StopReason.CASE_TIMEOUT;
            } else revert WrongState();
            if (block.timestamp >= s.hardStop) reason = T.StopReason.HARD_STOP;
        }
        if (block.timestamp < deadline) revert WrongState();
        _stop(id, c, reason, bytes32(0));
    }

    function _campaign(uint256 id) private view returns (T.CampaignView storage c) {
        if (id >= nextCampaignId) revert InvalidReference();
        c = _campaigns[id];
    }

    function _onlyResolver() private view {
        if (msg.sender != resolver) revert WrongCaller();
    }

    function _onlyOrganizer(T.CampaignView storage c) private view {
        if (msg.sender != c.organizer) revert WrongCaller();
    }

    function _checkPlan(T.CampaignView storage c, bytes32 expectedPlanHash) private view {
        if (c.planHash != expectedPlanHash) revert WrongPlan();
    }

    function _stop(uint256 id, T.CampaignView storage c, T.StopReason reason, bytes32 reasonHash) private {
        if (c.state == T.CampaignState.CASE_OPEN) {
            T.StageView storage s = _stages[id][c.currentStage];
            T.CaseView storage cs = _cases[id][c.currentStage][s.latestVersion];
            if (cs.resolution == T.Resolution.PENDING) {
                cs.resolution = reason == T.StopReason.CASE_TIMEOUT || reason == T.StopReason.HARD_STOP
                    ? T.Resolution.TIMEOUT : T.Resolution.STOP;
                cs.resolutionReasonHash = reasonHash;
                _emitCaseResolution(id, c.currentStage, s.latestVersion, cs, s);
            }
        }
        c.state = T.CampaignState.STOPPED;
        _stages[id][c.currentStage].state = T.StageState.STOPPED;
        emit CampaignStopped(id, c.currentStage, reason, reasonHash);
        _snapshot(id, c);
    }

    function _snapshot(uint256 id, T.CampaignView storage c) private {
        if (c.refundSnapshotted) revert WrongState();
        c.refundSnapshotted = true;
        c.basePool = c.custody;
        emit RefundSnapshotted(id, c.basePool, c.contributed, c.custody);
    }

    function _currentEvidence(T.EvidenceRef calldata ref) private view
        returns (T.CampaignView storage c, T.StageView storage s, T.SubmissionView storage v) {
        c = _campaign(ref.campaignId);
        if (ref.stage != c.currentStage || ref.stage >= _stages[ref.campaignId].length) {
            revert InvalidReference();
        }
        s = _stages[ref.campaignId][ref.stage];
        if (ref.version == 0 || ref.version != s.latestVersion || ref.evidenceHash == bytes32(0)) {
            revert InvalidReference();
        }
        v = _submissions[ref.campaignId][ref.stage][ref.version];
        if (v.evidenceHash != ref.evidenceHash) revert InvalidReference();
    }

    function _reviewable(T.EvidenceRef calldata ref) private view
        returns (T.CampaignView storage c, T.StageView storage s, T.SubmissionView storage v) {
        _onlyResolver();
        (c, s, v) = _currentEvidence(ref);
        if (c.state != T.CampaignState.EVIDENCE_REVIEW) revert WrongState();
        if (block.timestamp >= s.reviewEnd || block.timestamp >= s.hardStop) revert Expired();
    }

    function _startChallenge(T.CampaignView storage c, T.StageView storage s) private {
        uint256 end = block.timestamp + CHALLENGE_WINDOW;
        if (end >= s.hardStop) revert WrongState();
        s.challengeEnd = end;
        s.finalizeEnd = _cap(end + FINALIZATION_WINDOW, s.hardStop);
        s.state = T.StageState.CHALLENGE_WINDOW;
        c.state = T.CampaignState.CHALLENGE_WINDOW;
    }

    function _caseOpen(T.EvidenceRef calldata ref) private view
        returns (T.CampaignView storage c, T.StageView storage s, T.CaseView storage cs) {
        (c, s,) = _currentEvidence(ref);
        cs = _cases[ref.campaignId][ref.stage][ref.version];
        if (c.state != T.CampaignState.CASE_OPEN || !cs.caseUsed || cs.resolution != T.Resolution.PENDING) {
            revert WrongState();
        }
    }

    function _emitCaseResolution(uint256 id, uint256 index, uint256 version,
        T.CaseView storage cs, T.StageView storage s) private {
        emit CaseResolved(id, index, version, msg.sender, cs.resolution, cs.resolutionReasonHash,
            s.submissionEnd, s.challengeEnd, s.finalizeEnd);
    }

    function _emitReview(T.EvidenceRef calldata ref, T.StageView storage s, T.ReviewOutcome outcome) private {
        emit EvidenceReviewed(ref.campaignId, ref.stage, ref.version, outcome, ref.evidenceHash,
            s.publicHash, s.reportHash, s.acceptedCampaignSpent, s.declaredUnused,
            s.submissionEnd, s.challengeEnd, s.finalizeEnd);
    }

    function _cap(uint256 deadline, uint256 hardStop) private pure returns (uint256) {
        return deadline < hardStop ? deadline : hardStop;
    }

    function _refundAmounts(uint256 id, address donor, T.CampaignView storage c) private view
        returns (uint256 base, uint256 supplement, uint256 cumulativeSupplement) {
        uint256 weight = contributions[id][donor];
        if (!_baseConsumed[id][donor]) base = Math.mulDiv(weight, c.basePool, c.contributed);
        cumulativeSupplement = Math.mulDiv(weight, c.supplementPool, c.contributed);
        supplement = cumulativeSupplement - _supplementPaid[id][donor];
    }

    function _receiveExact(address sender, uint256 amount) private {
        uint256 beforeCustody = supportedToken.balanceOf(address(this));
        uint256 beforeSender = supportedToken.balanceOf(sender);
        supportedToken.safeTransferFrom(sender, address(this), amount);
        if (supportedToken.balanceOf(address(this)) != beforeCustody + amount
            || supportedToken.balanceOf(sender) + amount != beforeSender) revert NonExactTransfer();
    }

    function _sendExact(address recipient, uint256 amount) private {
        uint256 beforeCustody = supportedToken.balanceOf(address(this));
        uint256 beforeRecipient = supportedToken.balanceOf(recipient);
        supportedToken.safeTransfer(recipient, amount);
        if (supportedToken.balanceOf(address(this)) + amount != beforeCustody
            || supportedToken.balanceOf(recipient) != beforeRecipient + amount) revert NonExactTransfer();
    }
}
