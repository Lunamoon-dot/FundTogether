pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { DisbursementTypes as T } from "./disbursement/DisbursementTypes.sol";

contract FundTogetherDisbursement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRIMARY_REVIEW_WINDOW = 3 days;
    uint256 public constant CHALLENGE_WINDOW = 3 days;
    uint256 public constant EXECUTION_HORIZON = 180 days;

    error InvalidInput();
    error WrongCaller();
    error WrongState();
    error Expired();
    error InvalidReference();
    error NonExactTransfer();

    IERC20 public immutable supportedToken;
    address public immutable resolver;
    address public immutable backupResolver;
    bytes32 public immutable policyHash;
    uint256 public nextCampaignId;
    mapping(uint256 => T.CampaignView) private _campaigns;
    mapping(uint256 => mapping(uint256 => T.RequestView)) private _requests;
    mapping(uint256 => mapping(uint256 => T.ActivityView)) private _activities;
    mapping(uint256 => uint256) public requestCount;
    mapping(uint256 => uint256) public activityCount;
    mapping(uint256 => bool) public hasOpenRequest;
    mapping(uint256 => bool) public eligibilityTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public requestApprovalTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public expenditureReviewTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public outcomeReviewTakenOver;
    mapping(uint256 => bool) public hasOpenActivity;
    mapping(uint256 => mapping(uint256 => bool)) public expenditureCaseOpen;
    mapping(uint256 => mapping(uint256 => bool)) public expenditureCaseUsed;
    mapping(uint256 => mapping(uint256 => uint256)) public expenditureCaseOpenedAt;
    mapping(uint256 => mapping(uint256 => bool)) public expenditureCaseTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public outcomeCaseOpen;
    mapping(uint256 => mapping(uint256 => bool)) public outcomeCaseUsed;
    mapping(uint256 => mapping(uint256 => uint256)) public outcomeCaseOpenedAt;
    mapping(uint256 => mapping(uint256 => bool)) public outcomeCaseTakenOver;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(address => bool)) private _refundClaimed;
    mapping(uint256 => mapping(address => uint256)) private _supplementClaimed;

    event CampaignCreated(uint256 indexed campaignId, address indexed organizer, bytes32 commitmentHash, uint256 goal, uint256 fundingEnd);
    event Donated(uint256 indexed campaignId, address indexed donor, uint256 amount, uint256 contributed);
    event CampaignActivated(uint256 indexed campaignId, bytes32 eligibilityHash);
    event EligibilityTakenOver(uint256 indexed campaignId, bytes32 reasonHash);
    event RequestSubmitted(uint256 indexed campaignId, uint256 indexed requestId, bytes32 requestHash, address indexed recipient, uint256 amount);
    event RequestCancelled(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event ActivityCreated(uint256 indexed campaignId, uint256 indexed activityId, bytes32 commitmentHash, uint256 ceiling);
    event OutcomeCandidate(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reportHash, uint256 challengeEnd);
    event OutcomeVerified(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reportHash);
    event OutcomeCaseOpened(uint256 indexed campaignId, uint256 indexed activityId, address indexed donor, bytes32 reasonHash);
    event OutcomeCaseUpheld(uint256 indexed campaignId, uint256 indexed activityId, bytes32 decisionHash, uint256 challengeEnd);
    event RequestApprovedAndDisbursed(uint256 indexed campaignId, uint256 indexed requestId, address indexed recipient, uint256 amount, uint256 available);
    event RequestApprovalTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event ExpenditureReviewTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event OutcomeReviewTakenOver(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reasonHash);
    event ExpenditureCandidate(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedExpenditure, bytes32 reportHash);
    event ExpenditureSettled(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedExpenditure);
    event ExpenditureCaseOpened(uint256 indexed campaignId, uint256 indexed requestId, address indexed donor, bytes32 reasonHash);
    event ExpenditureCaseUpheld(uint256 indexed campaignId, uint256 indexed requestId, bytes32 decisionHash, uint256 challengeEnd);
    event ExpenditureCaseTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event OutcomeCaseTakenOver(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reasonHash);
    event FundingFailed(uint256 indexed campaignId, uint256 basePool);
    event WindDownStarted(uint256 indexed campaignId, uint256 basePool);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 baseAmount, uint256 supplementAmount);
    event FundsReturned(uint256 indexed campaignId, uint256 indexed requestId, address indexed sender, uint256 amount);
    event ExpenditureAuthorizationInvalidated(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);

    constructor(address token, address resolver_, address backupResolver_, bytes32 policyHash_) {
        if (token == address(0) || resolver_ == address(0) || backupResolver_ == address(0) || resolver_ == backupResolver_ || policyHash_ == bytes32(0)) revert InvalidInput();
        supportedToken = IERC20(token);
        resolver = resolver_;
        backupResolver = backupResolver_;
        policyHash = policyHash_;
    }

    function campaign(uint256 id) external view returns (T.CampaignView memory) { return _campaign(id); }
    function request(uint256 campaignId, uint256 requestId) external view returns (T.RequestView memory) {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        return _requests[campaignId][requestId];
    }
    function activity(uint256 campaignId, uint256 activityId) external view returns (T.ActivityView memory) {
        if (activityId >= activityCount[campaignId]) revert InvalidReference();
        return _activities[campaignId][activityId];
    }

    function createCampaign(bytes32 commitmentHash, uint256 goal, uint256 fundingDuration) external returns (uint256 id) {
        if (commitmentHash == bytes32(0) || goal == 0 || fundingDuration < 1 days || fundingDuration > 30 days) revert InvalidInput();
        id = nextCampaignId++;
        T.CampaignView storage c = _campaigns[id];
        c.organizer = msg.sender;
        c.commitmentHash = commitmentHash;
        c.goal = goal;
        c.fundingEnd = block.timestamp + fundingDuration;
        c.state = T.CampaignState.FUNDING;
        emit CampaignCreated(id, msg.sender, commitmentHash, goal, c.fundingEnd);
    }

    function donate(uint256 id, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        if (c.state != T.CampaignState.FUNDING) revert WrongState();
        if (block.timestamp >= c.fundingEnd) revert Expired();
        if (amount == 0 || amount > c.goal - c.contributed) revert InvalidInput();
        contributions[id][msg.sender] += amount;
        c.contributed += amount;
        c.available += amount;
        if (c.contributed == c.goal) c.fullyFundedAt = block.timestamp;
        emit Donated(id, msg.sender, amount, c.contributed);
        _receiveExact(msg.sender, amount);
    }

    function activateCampaign(uint256 id, bytes32 eligibilityHash) external {
        T.CampaignView storage c = _campaign(id);
        if ((msg.sender != resolver || eligibilityTakenOver[id]) && (msg.sender != backupResolver || !eligibilityTakenOver[id])) revert WrongCaller();
        if (c.state != T.CampaignState.FUNDING || c.contributed != c.goal) revert WrongState();
        if (eligibilityHash == bytes32(0)) revert InvalidInput();
        c.state = T.CampaignState.ACTIVE;
        c.activeAt = block.timestamp;
        c.executionEnd = block.timestamp + EXECUTION_HORIZON;
        emit CampaignActivated(id, eligibilityHash);
    }

    function takeOverEligibility(uint256 id, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(id);
        if (msg.sender != backupResolver) revert WrongCaller();
        if (c.state != T.CampaignState.FUNDING || c.contributed != c.goal || eligibilityTakenOver[id]
            || block.timestamp < c.fullyFundedAt + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        eligibilityTakenOver[id] = true;
        emit EligibilityTakenOver(id, reasonHash);
    }

    function finalizeFundingFailure(uint256 id) external {
        T.CampaignView storage c = _campaign(id);
        if (c.state != T.CampaignState.FUNDING || block.timestamp < c.fundingEnd || c.contributed == c.goal) revert WrongState();
        c.state = T.CampaignState.STOPPED;
        c.basePool = c.available;
        c.available = 0;
        c.refundSnapshotted = true;
        emit FundingFailed(id, c.basePool);
    }

    function claimRefund(uint256 id) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        if (!c.refundSnapshotted || contributions[id][msg.sender] == 0) revert WrongState();
        uint256 baseAmount;
        if (!_refundClaimed[id][msg.sender]) {
            _refundClaimed[id][msg.sender] = true;
            baseAmount = Math.mulDiv(contributions[id][msg.sender], c.basePool, c.contributed);
        }
        uint256 supplementEntitlement = Math.mulDiv(contributions[id][msg.sender], c.supplementPool, c.contributed);
        uint256 supplementAmount = supplementEntitlement - _supplementClaimed[id][msg.sender];
        if (baseAmount == 0 && supplementAmount == 0) revert WrongState();
        _supplementClaimed[id][msg.sender] += supplementAmount;
        uint256 amount = baseAmount + supplementAmount;
        c.refunded += amount;
        emit RefundClaimed(id, msg.sender, baseAmount, supplementAmount);
        if (amount != 0) _sendExact(msg.sender, amount);
    }

    function startWindDown(uint256 id) external {
        T.CampaignView storage c = _campaign(id);
        if (c.state != T.CampaignState.ACTIVE || hasOpenRequest[id] || block.timestamp < c.executionEnd) revert WrongState();
        c.state = T.CampaignState.STOPPED;
        c.basePool = c.available;
        c.available = 0;
        c.refundSnapshotted = true;
        emit WindDownStarted(id, c.basePool);
    }

    function createActivity(uint256 campaignId, bytes32 commitmentHash, uint256 ceiling) external returns (uint256 activityId) {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.organizer) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || hasOpenActivity[campaignId]) revert WrongState();
        if (commitmentHash == bytes32(0) || ceiling == 0 || ceiling > c.goal / 2) revert InvalidInput();
        activityId = activityCount[campaignId]++;
        _activities[campaignId][activityId] = T.ActivityView(commitmentHash, bytes32(0), ceiling, 0, block.timestamp, 0, T.ActivityState.OPEN);
        hasOpenActivity[campaignId] = true;
        emit ActivityCreated(campaignId, activityId, commitmentHash, ceiling);
    }

    function returnFunds(uint256 campaignId, uint256 requestId, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (msg.sender != r.recipient) revert WrongCaller();
        if (amount == 0 || amount > r.grossPaid - r.returned) revert InvalidInput();
        if (r.state == T.RequestState.EXPENDITURE_CANDIDATE && expenditureCaseOpen[campaignId][requestId]) revert WrongState();
        r.returned += amount;
        if (c.refundSnapshotted) c.supplementPool += amount;
        else c.available += amount;
        emit FundsReturned(campaignId, requestId, msg.sender, amount);
        if (r.state == T.RequestState.EXPENDITURE_CANDIDATE) {
            r.acceptedExpenditure = 0;
            r.challengeEnd = 0;
            r.state = T.RequestState.APPROVED_DISBURSED;
            emit ExpenditureAuthorizationInvalidated(campaignId, requestId, keccak256("RETURN_AFTER_CANDIDATE"));
        }
        _receiveExact(msg.sender, amount);
    }

    function cancelRequest(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.organizer) revert WrongCaller();
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.SUBMITTED || reasonHash == bytes32(0)) revert WrongState();
        r.state = T.RequestState.CANCELLED;
        hasOpenRequest[campaignId] = false;
        emit RequestCancelled(campaignId, requestId, reasonHash);
    }

    function submitRequest(uint256 campaignId, uint256 activityId, bytes32 requestHash, address recipient, uint256 amount) external returns (uint256 requestId) {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.organizer) revert WrongCaller();
        if (recipient == address(0) || recipient != c.organizer) revert InvalidInput();
        if (c.state != T.CampaignState.ACTIVE || requestHash == bytes32(0) || amount == 0 || amount > c.goal / 4) revert InvalidInput();
        if (hasOpenRequest[campaignId]) revert WrongState();
        if (activityId >= activityCount[campaignId]) revert InvalidReference();
        if (_activities[campaignId][activityId].state != T.ActivityState.OPEN) revert WrongState();
        requestId = requestCount[campaignId]++;
        hasOpenRequest[campaignId] = true;
        _requests[campaignId][requestId] = T.RequestView(activityId, requestHash, recipient, bytes32(0), amount, 0, 0, 0, bytes32(0), 0, 0, block.timestamp, T.RequestState.SUBMITTED);
        emit RequestSubmitted(campaignId, requestId, requestHash, recipient, amount);
    }

    function approveAndDisburse(uint256 campaignId, uint256 requestId, bytes32 expectedRequestHash) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (c.state != T.CampaignState.ACTIVE || requestId >= requestCount[campaignId]) revert WrongState();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || requestApprovalTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !requestApprovalTakenOver[campaignId][requestId])) revert WrongCaller();
        T.ActivityView storage a = _activities[campaignId][r.activityId];
        if (r.state != T.RequestState.SUBMITTED || r.requestHash != expectedRequestHash || r.approvedAmount > c.available || r.approvedAmount > a.ceiling - a.approved) revert InvalidInput();
        c.available -= r.approvedAmount;
        c.grossPaid += r.approvedAmount;
        a.approved += r.approvedAmount;
        r.grossPaid = r.approvedAmount;
        r.approvedAt = block.timestamp;
        r.state = T.RequestState.APPROVED_DISBURSED;
        emit RequestApprovedAndDisbursed(campaignId, requestId, r.recipient, r.approvedAmount, c.available);
        _sendExact(r.recipient, r.approvedAmount);
    }

    function takeOverRequestApproval(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || requestId >= requestCount[campaignId]) revert WrongCaller();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.SUBMITTED || requestApprovalTakenOver[campaignId][requestId]
            || block.timestamp < r.submittedAt + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        requestApprovalTakenOver[campaignId][requestId] = true;
        emit RequestApprovalTakenOver(campaignId, requestId, reasonHash);
    }

    function candidateExpenditure(uint256 campaignId, uint256 requestId, uint256 acceptedSpent, bytes32 reportHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || expenditureReviewTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !expenditureReviewTakenOver[campaignId][requestId])) revert WrongCaller();
        if (r.state != T.RequestState.APPROVED_DISBURSED || acceptedSpent > r.approvedAmount || reportHash == bytes32(0)) revert InvalidInput();
        r.acceptedExpenditure = acceptedSpent;
        r.expenditureReportHash = reportHash;
        r.challengeEnd = block.timestamp + CHALLENGE_WINDOW;
        r.state = T.RequestState.EXPENDITURE_CANDIDATE;
        emit ExpenditureCandidate(campaignId, requestId, acceptedSpent, reportHash);
    }

    function takeOverExpenditureReview(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || requestId >= requestCount[campaignId]) revert WrongCaller();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.APPROVED_DISBURSED || expenditureReviewTakenOver[campaignId][requestId]
            || block.timestamp < r.approvedAt + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        expenditureReviewTakenOver[campaignId][requestId] = true;
        emit ExpenditureReviewTakenOver(campaignId, requestId, reasonHash);
    }

    function finalizeExpenditure(uint256 campaignId, uint256 requestId) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.EXPENDITURE_CANDIDATE || block.timestamp < r.challengeEnd || expenditureCaseOpen[campaignId][requestId]) revert WrongState();
        r.state = T.RequestState.FINANCIALLY_SETTLED;
        hasOpenRequest[campaignId] = false;
        emit ExpenditureSettled(campaignId, requestId, r.acceptedExpenditure);
    }

    function openExpenditureCase(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.EXPENDITURE_CANDIDATE || block.timestamp >= r.challengeEnd || contributions[campaignId][msg.sender] == 0 || reasonHash == bytes32(0)
            || expenditureCaseOpen[campaignId][requestId] || expenditureCaseUsed[campaignId][requestId]) revert WrongState();
        expenditureCaseOpen[campaignId][requestId] = true;
        expenditureCaseUsed[campaignId][requestId] = true;
        expenditureCaseOpenedAt[campaignId][requestId] = block.timestamp;
        emit ExpenditureCaseOpened(campaignId, requestId, msg.sender, reasonHash);
    }

    function upholdExpenditureCase(uint256 campaignId, uint256 requestId, bytes32 decisionHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || expenditureCaseTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !expenditureCaseTakenOver[campaignId][requestId])) revert WrongCaller();
        if (r.state != T.RequestState.EXPENDITURE_CANDIDATE || !expenditureCaseOpen[campaignId][requestId] || decisionHash == bytes32(0)) revert WrongState();
        expenditureCaseOpen[campaignId][requestId] = false;
        r.challengeEnd = block.timestamp + CHALLENGE_WINDOW;
        emit ExpenditureCaseUpheld(campaignId, requestId, decisionHash, r.challengeEnd);
    }

    function takeOverExpenditureCase(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || requestId >= requestCount[campaignId]) revert WrongCaller();
        if (!expenditureCaseOpen[campaignId][requestId] || expenditureCaseTakenOver[campaignId][requestId]
            || block.timestamp < expenditureCaseOpenedAt[campaignId][requestId] + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        expenditureCaseTakenOver[campaignId][requestId] = true;
        emit ExpenditureCaseTakenOver(campaignId, requestId, reasonHash);
    }

    function candidateOutcome(uint256 campaignId, uint256 activityId, bytes32 reportHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (activityId >= activityCount[campaignId] || hasOpenRequest[campaignId] || reportHash == bytes32(0)) revert WrongState();
        T.ActivityView storage a = _activities[campaignId][activityId];
        if ((msg.sender != resolver || outcomeReviewTakenOver[campaignId][activityId])
            && (msg.sender != backupResolver || !outcomeReviewTakenOver[campaignId][activityId])) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || a.state != T.ActivityState.OPEN) revert WrongState();
        a.outcomeReportHash = reportHash;
        a.challengeEnd = block.timestamp + CHALLENGE_WINDOW;
        a.state = T.ActivityState.OUTCOME_CANDIDATE;
        emit OutcomeCandidate(campaignId, activityId, reportHash, a.challengeEnd);
    }

    function takeOverOutcomeReview(uint256 campaignId, uint256 activityId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || activityId >= activityCount[campaignId]) revert WrongCaller();
        T.ActivityView storage a = _activities[campaignId][activityId];
        if (a.state != T.ActivityState.OPEN || outcomeReviewTakenOver[campaignId][activityId]
            || block.timestamp < a.createdAt + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        outcomeReviewTakenOver[campaignId][activityId] = true;
        emit OutcomeReviewTakenOver(campaignId, activityId, reasonHash);
    }

    function verifyOutcome(uint256 campaignId, uint256 activityId, bytes32 reportHash) external {
        if (msg.sender != resolver) revert WrongCaller();
        if (activityId >= activityCount[campaignId] || reportHash == bytes32(0)) revert InvalidReference();
        T.ActivityView storage a = _activities[campaignId][activityId];
        if (a.state != T.ActivityState.OUTCOME_CANDIDATE || block.timestamp < a.challengeEnd || outcomeCaseOpen[campaignId][activityId] || a.outcomeReportHash != reportHash) revert WrongState();
        a.state = T.ActivityState.VERIFIED;
        hasOpenActivity[campaignId] = false;
        emit OutcomeVerified(campaignId, activityId, reportHash);
    }

    function openOutcomeCase(uint256 campaignId, uint256 activityId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (activityId >= activityCount[campaignId]) revert InvalidReference();
        T.ActivityView storage a = _activities[campaignId][activityId];
        if (a.state != T.ActivityState.OUTCOME_CANDIDATE || block.timestamp >= a.challengeEnd || contributions[campaignId][msg.sender] == 0
            || reasonHash == bytes32(0) || outcomeCaseOpen[campaignId][activityId] || outcomeCaseUsed[campaignId][activityId]) revert WrongState();
        outcomeCaseOpen[campaignId][activityId] = true;
        outcomeCaseUsed[campaignId][activityId] = true;
        outcomeCaseOpenedAt[campaignId][activityId] = block.timestamp;
        emit OutcomeCaseOpened(campaignId, activityId, msg.sender, reasonHash);
    }

    function upholdOutcomeCase(uint256 campaignId, uint256 activityId, bytes32 decisionHash) external {
        if (activityId >= activityCount[campaignId]) revert InvalidReference();
        T.ActivityView storage a = _activities[campaignId][activityId];
        if ((msg.sender != resolver || outcomeCaseTakenOver[campaignId][activityId])
            && (msg.sender != backupResolver || !outcomeCaseTakenOver[campaignId][activityId])) revert WrongCaller();
        if (a.state != T.ActivityState.OUTCOME_CANDIDATE || !outcomeCaseOpen[campaignId][activityId] || decisionHash == bytes32(0)) revert WrongState();
        outcomeCaseOpen[campaignId][activityId] = false;
        a.challengeEnd = block.timestamp + CHALLENGE_WINDOW;
        emit OutcomeCaseUpheld(campaignId, activityId, decisionHash, a.challengeEnd);
    }

    function takeOverOutcomeCase(uint256 campaignId, uint256 activityId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || activityId >= activityCount[campaignId]) revert WrongCaller();
        if (!outcomeCaseOpen[campaignId][activityId] || outcomeCaseTakenOver[campaignId][activityId]
            || block.timestamp < outcomeCaseOpenedAt[campaignId][activityId] + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        outcomeCaseTakenOver[campaignId][activityId] = true;
        emit OutcomeCaseTakenOver(campaignId, activityId, reasonHash);
    }

    function _campaign(uint256 id) private view returns (T.CampaignView storage c) {
        if (id >= nextCampaignId) revert InvalidReference();
        c = _campaigns[id];
    }

    function _receiveExact(address sender, uint256 amount) private {
        uint256 beforeBalance = supportedToken.balanceOf(address(this));
        supportedToken.safeTransferFrom(sender, address(this), amount);
        if (supportedToken.balanceOf(address(this)) != beforeBalance + amount) revert NonExactTransfer();
    }

    function _sendExact(address recipient, uint256 amount) private {
        uint256 beforeBalance = supportedToken.balanceOf(address(this));
        supportedToken.safeTransfer(recipient, amount);
        if (supportedToken.balanceOf(address(this)) + amount != beforeBalance) revert NonExactTransfer();
    }
}
