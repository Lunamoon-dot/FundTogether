pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { DisbursementTypes as T } from "./disbursement/DisbursementTypes.sol";

contract FundTogetherDisbursement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_DEPOSIT_BPS = 2_000;
    uint256 public constant MAX_CAMPAIGN_DEPOSIT_BPS = 1_000;
    uint256 public constant PRIMARY_REVIEW_WINDOW = 3 days;
    uint256 public constant VENDOR_ACK_WINDOW = 3 days;
    uint256 public constant DEPOSIT_WINDOW = 3 days;
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
    mapping(uint256 => mapping(uint256 => bool)) public deliveryReviewTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public outcomeReviewTakenOver;
    mapping(uint256 => bool) public hasOpenActivity;
    mapping(uint256 => mapping(uint256 => bool)) public deliveryCaseOpen;
    mapping(uint256 => mapping(uint256 => bool)) public deliveryCaseUsed;
    mapping(uint256 => mapping(uint256 => uint256)) public deliveryCaseOpenedAt;
    mapping(uint256 => mapping(uint256 => bool)) public deliveryCaseTakenOver;
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
    event RequestSubmitted(uint256 indexed campaignId, uint256 indexed requestId, bytes32 requestHash, uint256 amount, uint256 deposit);
    event ActivityCreated(uint256 indexed campaignId, uint256 indexed activityId, bytes32 commitmentHash, uint256 ceiling);
    event OutcomeCandidate(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reportHash, uint256 challengeEnd);
    event OutcomeVerified(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reportHash);
    event OutcomeCaseOpened(uint256 indexed campaignId, uint256 indexed activityId, address indexed donor, bytes32 reasonHash);
    event OutcomeCaseUpheld(uint256 indexed campaignId, uint256 indexed activityId, bytes32 decisionHash, uint256 challengeEnd);
    event RequestReserved(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, uint256 available, uint256 reserved);
    event RequestApprovalTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event DeliveryReviewTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event OutcomeReviewTakenOver(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reasonHash);
    event VendorAcknowledged(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, bytes32 termsHash);
    event DepositPaid(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, uint256 amount);
    event DeliveryCandidate(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedValue, bytes32 reportHash);
    event FinalPaid(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, uint256 amount);
    event ResidualReleased(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, bytes32 reasonHash);
    event DeliveryCaseOpened(uint256 indexed campaignId, uint256 indexed requestId, address indexed donor, bytes32 reasonHash);
    event DeliveryCaseUpheld(uint256 indexed campaignId, uint256 indexed requestId, bytes32 decisionHash, uint256 challengeEnd);
    event DeliveryCaseTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event OutcomeCaseTakenOver(uint256 indexed campaignId, uint256 indexed activityId, bytes32 reasonHash);
    event FundingFailed(uint256 indexed campaignId, uint256 basePool);
    event WindDownStarted(uint256 indexed campaignId, uint256 basePool);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 baseAmount, uint256 supplementAmount);
    event FundsReturned(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, uint256 amount);
    event DeliveryAuthorizationInvalidated(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event UncommittedRequestCancelled(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, bytes32 reasonHash);
    event RequestExpired(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);

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
        _activities[campaignId][activityId] = T.ActivityView(commitmentHash, ceiling, 0, block.timestamp, 0, T.ActivityState.OPEN);
        hasOpenActivity[campaignId] = true;
        emit ActivityCreated(campaignId, activityId, commitmentHash, ceiling);
    }

    function returnFunds(uint256 campaignId, uint256 requestId, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (msg.sender != r.vendor) revert WrongCaller();
        if (amount == 0 || amount > r.grossPaid - r.returned) revert InvalidInput();
        if (r.state == T.RequestState.DELIVERY_CANDIDATE && deliveryCaseOpen[campaignId][requestId]) revert WrongState();
        r.returned += amount;
        if (c.refundSnapshotted) c.supplementPool += amount;
        else c.available += amount;
        emit FundsReturned(campaignId, requestId, msg.sender, amount);
        if (r.state == T.RequestState.DELIVERY_CANDIDATE) {
            r.acceptedDeliveryValue = 0;
            r.challengeEnd = 0;
            r.state = T.RequestState.VENDOR_COMMITTED;
            emit DeliveryAuthorizationInvalidated(campaignId, requestId, keccak256("RETURN_AFTER_CANDIDATE"));
        }
        _receiveExact(msg.sender, amount);
    }

    function cancelUncommittedRequest(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.organizer) revert WrongCaller();
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.APPROVED_RESERVED || reasonHash == bytes32(0)) revert WrongState();
        c.reserved -= r.approvedAmount;
        c.available += r.approvedAmount;
        r.state = T.RequestState.CANCELLED;
        hasOpenRequest[campaignId] = false;
        emit UncommittedRequestCancelled(campaignId, requestId, r.approvedAmount, reasonHash);
    }

    function submitRequest(uint256 campaignId, uint256 activityId, bytes32 requestHash, address vendor, uint256 amount, uint256 deposit) external returns (uint256 requestId) {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.organizer) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || requestHash == bytes32(0) || vendor == address(0) || amount == 0 || deposit > amount) revert InvalidInput();
        if (hasOpenRequest[campaignId]) revert WrongState();
        if (activityId >= activityCount[campaignId]) revert InvalidReference();
        if (_activities[campaignId][activityId].state != T.ActivityState.OPEN) revert WrongState();
        requestId = requestCount[campaignId]++;
        hasOpenRequest[campaignId] = true;
        _requests[campaignId][requestId] = T.RequestView(activityId, requestHash, vendor, bytes32(0), amount, deposit, 0, 0, 0, 0, 0, 0, block.timestamp, T.RequestState.SUBMITTED);
        emit RequestSubmitted(campaignId, requestId, requestHash, amount, deposit);
    }

    function approveRequest(uint256 campaignId, uint256 requestId, bytes32 expectedRequestHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (c.state != T.CampaignState.ACTIVE || requestId >= requestCount[campaignId]) revert WrongState();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || requestApprovalTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !requestApprovalTakenOver[campaignId][requestId])) revert WrongCaller();
        T.ActivityView storage a = _activities[campaignId][r.activityId];
        if (r.state != T.RequestState.SUBMITTED || r.requestHash != expectedRequestHash || r.approvedAmount > c.available || r.approvedAmount > a.ceiling - a.approved
            || r.depositAmount > r.approvedAmount * MAX_DEPOSIT_BPS / 10_000 || r.depositAmount > c.goal * MAX_CAMPAIGN_DEPOSIT_BPS / 10_000) revert InvalidInput();
        c.available -= r.approvedAmount;
        c.reserved += r.approvedAmount;
        a.approved += r.approvedAmount;
        r.approvedAt = block.timestamp;
        r.state = T.RequestState.APPROVED_RESERVED;
        emit RequestReserved(campaignId, requestId, r.approvedAmount, c.available, c.reserved);
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

    function acknowledgeVendor(uint256 campaignId, uint256 requestId, bytes32 termsHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (msg.sender != r.vendor) revert WrongCaller();
        if (r.state != T.RequestState.APPROVED_RESERVED || block.timestamp >= r.approvedAt + VENDOR_ACK_WINDOW || termsHash == bytes32(0)) revert WrongState();
        // The vendor's transaction acknowledges this immutable request; do not let a caller
        // substitute a second off-chain terms commitment after reserve approval.
        r.termsHash = r.requestHash;
        r.committedAt = block.timestamp;
        r.state = T.RequestState.VENDOR_COMMITTED;
        emit VendorAcknowledged(campaignId, requestId, msg.sender, r.requestHash);
    }

    function payDeposit(uint256 campaignId, uint256 requestId) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (c.state != T.CampaignState.ACTIVE || r.state != T.RequestState.VENDOR_COMMITTED || block.timestamp >= r.committedAt + DEPOSIT_WINDOW || r.grossPaid != 0 || r.depositAmount == 0) revert WrongState();
        c.reserved -= r.depositAmount;
        c.grossPaid += r.depositAmount;
        r.grossPaid = r.depositAmount;
        emit DepositPaid(campaignId, requestId, r.vendor, r.depositAmount);
        _sendExact(r.vendor, r.depositAmount);
    }

    function candidateDelivery(uint256 campaignId, uint256 requestId, uint256 acceptedValue, bytes32 reportHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || deliveryReviewTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !deliveryReviewTakenOver[campaignId][requestId])) revert WrongCaller();
        if (r.state != T.RequestState.VENDOR_COMMITTED || acceptedValue > r.approvedAmount || reportHash == bytes32(0)) revert InvalidInput();
        r.acceptedDeliveryValue = acceptedValue;
        r.challengeEnd = block.timestamp + 3 days;
        r.state = T.RequestState.DELIVERY_CANDIDATE;
        emit DeliveryCandidate(campaignId, requestId, acceptedValue, reportHash);
    }

    function takeOverDeliveryReview(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || requestId >= requestCount[campaignId]) revert WrongCaller();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.VENDOR_COMMITTED || deliveryReviewTakenOver[campaignId][requestId]
            || block.timestamp < r.committedAt + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        deliveryReviewTakenOver[campaignId][requestId] = true;
        emit DeliveryReviewTakenOver(campaignId, requestId, reasonHash);
    }

    function executeFinal(uint256 campaignId, uint256 requestId) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || block.timestamp < r.challengeEnd || deliveryCaseOpen[campaignId][requestId]) revert WrongState();
        uint256 netPaid = r.grossPaid - r.returned;
        uint256 due = r.acceptedDeliveryValue > netPaid ? r.acceptedDeliveryValue - netPaid : 0;
        uint256 payout = due < c.reserved ? due : c.reserved;
        if (payout != 0) {
            c.reserved -= payout;
            c.grossPaid += payout;
            r.grossPaid += payout;
        }
        if (c.reserved == 0) {
            r.state = T.RequestState.FINANCIALLY_SETTLED;
            hasOpenRequest[campaignId] = false;
        }
        emit FinalPaid(campaignId, requestId, r.vendor, payout);
        if (payout != 0) _sendExact(r.vendor, payout);
    }

    function openDeliveryCase(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || block.timestamp >= r.challengeEnd || contributions[campaignId][msg.sender] == 0 || reasonHash == bytes32(0)
            || deliveryCaseOpen[campaignId][requestId] || deliveryCaseUsed[campaignId][requestId]) revert WrongState();
        deliveryCaseOpen[campaignId][requestId] = true;
        deliveryCaseUsed[campaignId][requestId] = true;
        deliveryCaseOpenedAt[campaignId][requestId] = block.timestamp;
        emit DeliveryCaseOpened(campaignId, requestId, msg.sender, reasonHash);
    }

    function upholdDeliveryCase(uint256 campaignId, uint256 requestId, bytes32 decisionHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || deliveryCaseTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !deliveryCaseTakenOver[campaignId][requestId])) revert WrongCaller();
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || !deliveryCaseOpen[campaignId][requestId] || decisionHash == bytes32(0)) revert WrongState();
        deliveryCaseOpen[campaignId][requestId] = false;
        r.challengeEnd = block.timestamp + 3 days;
        emit DeliveryCaseUpheld(campaignId, requestId, decisionHash, r.challengeEnd);
    }

    function takeOverDeliveryCase(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        _campaign(campaignId);
        if (msg.sender != backupResolver || requestId >= requestCount[campaignId]) revert WrongCaller();
        if (!deliveryCaseOpen[campaignId][requestId] || deliveryCaseTakenOver[campaignId][requestId]
            || block.timestamp < deliveryCaseOpenedAt[campaignId][requestId] + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        deliveryCaseTakenOver[campaignId][requestId] = true;
        emit DeliveryCaseTakenOver(campaignId, requestId, reasonHash);
    }

    function releaseResidual(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != resolver) revert WrongCaller();
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || deliveryCaseOpen[campaignId][requestId] || reasonHash == bytes32(0)) revert WrongState();
        uint256 residual = r.approvedAmount - r.grossPaid;
        if (residual == 0 || residual > c.reserved) revert WrongState();
        c.reserved -= residual;
        c.available += residual;
        r.state = T.RequestState.FINANCIALLY_SETTLED;
        hasOpenRequest[campaignId] = false;
        emit ResidualReleased(campaignId, requestId, residual, reasonHash);
    }

    function expireUncommittedRequest(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.APPROVED_RESERVED || block.timestamp < r.approvedAt + VENDOR_ACK_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        c.reserved -= r.approvedAmount;
        c.available += r.approvedAmount;
        r.state = T.RequestState.CANCELLED;
        hasOpenRequest[campaignId] = false;
        emit RequestExpired(campaignId, requestId, reasonHash);
    }

    function expireUnpaidDeposit(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.VENDOR_COMMITTED || r.depositAmount == 0 || r.grossPaid != 0
            || block.timestamp < r.committedAt + DEPOSIT_WINDOW || reasonHash == bytes32(0)) revert WrongState();
        c.reserved -= r.approvedAmount;
        c.available += r.approvedAmount;
        r.state = T.RequestState.CANCELLED;
        hasOpenRequest[campaignId] = false;
        emit RequestExpired(campaignId, requestId, reasonHash);
    }

    function candidateOutcome(uint256 campaignId, uint256 activityId, bytes32 reportHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (activityId >= activityCount[campaignId] || hasOpenRequest[campaignId] || reportHash == bytes32(0)) revert WrongState();
        T.ActivityView storage a = _activities[campaignId][activityId];
        if ((msg.sender != resolver || outcomeReviewTakenOver[campaignId][activityId])
            && (msg.sender != backupResolver || !outcomeReviewTakenOver[campaignId][activityId])) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || a.state != T.ActivityState.OPEN) revert WrongState();
        a.challengeEnd = block.timestamp + 3 days;
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
        if (a.state != T.ActivityState.OUTCOME_CANDIDATE || block.timestamp < a.challengeEnd || outcomeCaseOpen[campaignId][activityId]) revert WrongState();
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
        a.challengeEnd = block.timestamp + 3 days;
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
