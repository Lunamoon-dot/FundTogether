pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { RewardTypes as T } from "./RewardTypes.sol";

contract FundTogetherReward is ReentrancyGuard {
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
    error TierSoldOut();

    IERC20 public immutable supportedToken;
    address public immutable resolver;
    address public immutable backupResolver;
    bytes32 public immutable policyHash;
    uint256 public nextCampaignId;

    mapping(uint256 => T.CampaignView) private _campaigns;
    mapping(uint256 => mapping(uint256 => T.TierView)) private _tiers;
    mapping(uint256 => uint256) public tierCount;
    mapping(uint256 => mapping(uint256 => T.RequestView)) private _requests;
    mapping(uint256 => uint256) public requestCount;
    mapping(uint256 => bool) public hasOpenRequest;

    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public tierPledges;
    mapping(uint256 => mapping(address => bool)) private _refundClaimed;
    mapping(uint256 => mapping(address => uint256)) private _supplementClaimed;

    mapping(uint256 => bool) public eligibilityTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public requestApprovalTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public expenditureReviewTakenOver;
    mapping(uint256 => mapping(uint256 => bool)) public disputeCaseOpen;
    mapping(uint256 => mapping(uint256 => bool)) public disputeCaseUsed;
    mapping(uint256 => mapping(uint256 => uint256)) public disputeCaseOpenedAt;
    mapping(uint256 => mapping(uint256 => bool)) public disputeCaseTakenOver;

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, bytes32 commitmentHash, uint256 goal, uint256 fundingEnd, uint256 tierCount);
    event RewardPledged(uint256 indexed campaignId, address indexed backer, uint256 indexed tierId, uint256 quantity, uint256 amount);
    event CampaignActivated(uint256 indexed campaignId, bytes32 eligibilityHash);
    event EligibilityTakenOver(uint256 indexed campaignId, bytes32 reasonHash);
    event FundingFailed(uint256 indexed campaignId, uint256 basePool);
    event DisbursementRequestSubmitted(uint256 indexed campaignId, uint256 indexed requestId, bytes32 requestHash, address indexed recipient, uint256 amount);
    event RequestApprovedAndDisbursed(uint256 indexed campaignId, uint256 indexed requestId, address indexed recipient, uint256 amount, uint256 remainingAvailable);
    event RequestApprovalTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event RequestCancelled(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event ExpenditureCandidate(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedSpent, bytes32 reportHash);
    event ExpenditureReviewTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event ExpenditureSettled(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedExpenditure);
    event DisputeCaseOpened(uint256 indexed campaignId, uint256 indexed requestId, address indexed backer, bytes32 reasonHash);
    event DisputeCaseUpheld(uint256 indexed campaignId, uint256 indexed requestId, bytes32 decisionHash, uint256 challengeEnd);
    event DisputeCaseTakenOver(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);
    event ProductionVerified(uint256 indexed campaignId, bytes32 reportHash);
    event FulfillmentComplete(uint256 indexed campaignId, bytes32 fulfillmentReportHash);
    event CampaignCompleted(uint256 indexed campaignId);
    event WindDownStarted(uint256 indexed campaignId, uint256 basePool);
    event RefundClaimed(uint256 indexed campaignId, address indexed backer, uint256 baseAmount, uint256 supplementAmount);
    event FundsReturned(uint256 indexed campaignId, uint256 indexed requestId, address indexed sender, uint256 amount);
    event ExpenditureAuthorizationInvalidated(uint256 indexed campaignId, uint256 indexed requestId, bytes32 reasonHash);

    constructor(address token, address resolver_, address backupResolver_, bytes32 policyHash_) {
        if (token == address(0) || resolver_ == address(0) || backupResolver_ == address(0) || resolver_ == backupResolver_ || policyHash_ == bytes32(0)) {
            revert InvalidInput();
        }
        supportedToken = IERC20(token);
        resolver = resolver_;
        backupResolver = backupResolver_;
        policyHash = policyHash_;
    }

    function campaign(uint256 id) external view returns (T.CampaignView memory) {
        return _campaign(id);
    }

    function tier(uint256 campaignId, uint256 tierId) external view returns (T.TierView memory) {
        if (tierId >= tierCount[campaignId]) revert InvalidReference();
        return _tiers[campaignId][tierId];
    }

    function request(uint256 campaignId, uint256 requestId) external view returns (T.RequestView memory) {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        return _requests[campaignId][requestId];
    }

    function createCampaign(
        bytes32 commitmentHash,
        uint256 goal,
        uint256 fundingDuration,
        T.TierView[] calldata tiers_
    ) external returns (uint256 id) {
        if (commitmentHash == bytes32(0) || goal == 0 || fundingDuration < 1 days || fundingDuration > 60 days || tiers_.length == 0) {
            revert InvalidInput();
        }
        id = nextCampaignId++;
        T.CampaignView storage c = _campaigns[id];
        c.creator = msg.sender;
        c.commitmentHash = commitmentHash;
        c.goal = goal;
        c.fundingEnd = block.timestamp + fundingDuration;
        c.state = T.CampaignState.FUNDING;

        tierCount[id] = tiers_.length;
        for (uint256 i = 0; i < tiers_.length; i++) {
            if (tiers_[i].price == 0 || tiers_[i].maxQuantity == 0) revert InvalidInput();
            _tiers[id][i] = T.TierView({
                price: tiers_[i].price,
                maxQuantity: tiers_[i].maxQuantity,
                pledgedQuantity: 0,
                isDigital: tiers_[i].isDigital
            });
        }
        emit CampaignCreated(id, msg.sender, commitmentHash, goal, c.fundingEnd, tiers_.length);
    }

    function pledge(uint256 id, uint256 tierId, uint256 quantity) external nonReentrant {
        T.CampaignView storage c = _campaign(id);
        if (c.state != T.CampaignState.FUNDING) revert WrongState();
        if (block.timestamp >= c.fundingEnd) revert Expired();
        if (tierId >= tierCount[id] || quantity == 0) revert InvalidInput();

        T.TierView storage t = _tiers[id][tierId];
        if (t.pledgedQuantity + quantity > t.maxQuantity) revert TierSoldOut();

        uint256 amount = t.price * quantity;
        t.pledgedQuantity += quantity;
        contributions[id][msg.sender] += amount;
        tierPledges[id][tierId][msg.sender] += quantity;

        c.contributed += amount;
        c.available += amount;
        if (c.contributed >= c.goal && c.fullyFundedAt == 0) {
            c.fullyFundedAt = block.timestamp;
        }

        emit RewardPledged(id, msg.sender, tierId, quantity, amount);
        _receiveExact(msg.sender, amount);
    }

    function activateCampaign(uint256 id, bytes32 eligibilityHash) external {
        T.CampaignView storage c = _campaign(id);
        if ((msg.sender != resolver || eligibilityTakenOver[id]) && (msg.sender != backupResolver || !eligibilityTakenOver[id])) {
            revert WrongCaller();
        }
        if (c.state != T.CampaignState.FUNDING || c.contributed < c.goal) revert WrongState();
        if (eligibilityHash == bytes32(0)) revert InvalidInput();

        c.state = T.CampaignState.ACTIVE;
        c.activeAt = block.timestamp;
        c.executionEnd = block.timestamp + EXECUTION_HORIZON;
        emit CampaignActivated(id, eligibilityHash);
    }

    function takeOverEligibility(uint256 id, bytes32 reasonHash) external {
        T.CampaignView storage c = _campaign(id);
        if (msg.sender != backupResolver) revert WrongCaller();
        if (c.state != T.CampaignState.FUNDING || c.contributed < c.goal || eligibilityTakenOver[id]
            || block.timestamp < c.fullyFundedAt + PRIMARY_REVIEW_WINDOW || reasonHash == bytes32(0)) {
            revert WrongState();
        }
        eligibilityTakenOver[id] = true;
        emit EligibilityTakenOver(id, reasonHash);
    }

    function finalizeFundingFailure(uint256 id) external {
        T.CampaignView storage c = _campaign(id);
        if (c.state != T.CampaignState.FUNDING || block.timestamp < c.fundingEnd || c.contributed >= c.goal) {
            revert WrongState();
        }
        c.state = T.CampaignState.STOPPED;
        c.basePool = c.available;
        c.available = 0;
        c.refundSnapshotted = true;
        emit FundingFailed(id, c.basePool);
    }

    function submitDisbursementRequest(
        uint256 campaignId,
        bytes32 requestHash,
        address recipient,
        uint256 amount
    ) external returns (uint256 requestId) {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.creator) revert WrongCaller();
        if (recipient == address(0) || recipient != c.creator) revert InvalidInput();
        if (c.state != T.CampaignState.ACTIVE || requestHash == bytes32(0) || amount == 0 || amount > c.goal / 2) {
            revert InvalidInput();
        }
        if (hasOpenRequest[campaignId]) revert WrongState();

        requestId = requestCount[campaignId]++;
        hasOpenRequest[campaignId] = true;
        _requests[campaignId][requestId] = T.RequestView({
            requestHash: requestHash,
            recipient: recipient,
            approvedAmount: amount,
            grossPaid: 0,
            returned: 0,
            acceptedExpenditure: 0,
            expenditureReportHash: bytes32(0),
            submittedAt: block.timestamp,
            approvedAt: 0,
            challengeEnd: 0,
            state: T.RequestState.SUBMITTED
        });
        emit DisbursementRequestSubmitted(campaignId, requestId, requestHash, recipient, amount);
    }

    function approveAndDisburse(uint256 campaignId, uint256 requestId, bytes32 expectedRequestHash) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (c.state != T.CampaignState.ACTIVE || requestId >= requestCount[campaignId]) revert WrongState();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || requestApprovalTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !requestApprovalTakenOver[campaignId][requestId])) {
            revert WrongCaller();
        }
        if (r.state != T.RequestState.SUBMITTED || r.requestHash != expectedRequestHash || r.approvedAmount > c.available) {
            revert InvalidInput();
        }

        c.available -= r.approvedAmount;
        c.grossPaid += r.approvedAmount;
        r.grossPaid = r.approvedAmount;
        r.approvedAt = block.timestamp;
        r.state = T.RequestState.APPROVED_DISBURSED;

        emit RequestApprovedAndDisbursed(campaignId, requestId, r.recipient, r.approvedAmount, c.available);
        _sendExact(r.recipient, r.approvedAmount);
    }

    function candidateExpenditure(
        uint256 campaignId,
        uint256 requestId,
        uint256 acceptedSpent,
        bytes32 reportHash
    ) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || expenditureReviewTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !expenditureReviewTakenOver[campaignId][requestId])) {
            revert WrongCaller();
        }
        if (r.state != T.RequestState.APPROVED_DISBURSED || acceptedSpent > r.approvedAmount || reportHash == bytes32(0)) {
            revert InvalidInput();
        }

        r.acceptedExpenditure = acceptedSpent;
        r.expenditureReportHash = reportHash;
        r.challengeEnd = block.timestamp + CHALLENGE_WINDOW;
        r.state = T.RequestState.EXPENDITURE_CANDIDATE;
        emit ExpenditureCandidate(campaignId, requestId, acceptedSpent, reportHash);
    }

    function finalizeExpenditure(uint256 campaignId, uint256 requestId) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.EXPENDITURE_CANDIDATE || block.timestamp < r.challengeEnd || disputeCaseOpen[campaignId][requestId]) {
            revert WrongState();
        }
        r.state = T.RequestState.FINANCIALLY_SETTLED;
        hasOpenRequest[campaignId] = false;
        emit ExpenditureSettled(campaignId, requestId, r.acceptedExpenditure);
    }

    function returnFunds(uint256 campaignId, uint256 requestId, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (msg.sender != r.recipient) revert WrongCaller();
        if (amount == 0 || amount > r.grossPaid - r.returned) revert InvalidInput();
        if (r.state == T.RequestState.EXPENDITURE_CANDIDATE && disputeCaseOpen[campaignId][requestId]) revert WrongState();

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

    function openDisputeCase(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.EXPENDITURE_CANDIDATE || block.timestamp >= r.challengeEnd || contributions[campaignId][msg.sender] == 0
            || reasonHash == bytes32(0) || disputeCaseOpen[campaignId][requestId] || disputeCaseUsed[campaignId][requestId]) {
            revert WrongState();
        }
        disputeCaseOpen[campaignId][requestId] = true;
        disputeCaseUsed[campaignId][requestId] = true;
        disputeCaseOpenedAt[campaignId][requestId] = block.timestamp;
        emit DisputeCaseOpened(campaignId, requestId, msg.sender, reasonHash);
    }

    function upholdDisputeCase(uint256 campaignId, uint256 requestId, bytes32 decisionHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if ((msg.sender != resolver || disputeCaseTakenOver[campaignId][requestId])
            && (msg.sender != backupResolver || !disputeCaseTakenOver[campaignId][requestId])) {
            revert WrongCaller();
        }
        if (r.state != T.RequestState.EXPENDITURE_CANDIDATE || !disputeCaseOpen[campaignId][requestId] || decisionHash == bytes32(0)) {
            revert WrongState();
        }
        disputeCaseOpen[campaignId][requestId] = false;
        r.challengeEnd = block.timestamp + CHALLENGE_WINDOW;
        emit DisputeCaseUpheld(campaignId, requestId, decisionHash, r.challengeEnd);
    }

    function recordProductionVerified(uint256 campaignId, bytes32 reportHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != resolver) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || hasOpenRequest[campaignId] || reportHash == bytes32(0)) {
            revert WrongState();
        }
        c.state = T.CampaignState.PRODUCTION_VERIFIED;
        c.productionReportHash = reportHash;
        emit ProductionVerified(campaignId, reportHash);
    }

    function recordFulfillmentComplete(uint256 campaignId, bytes32 fulfillmentReportHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != resolver) revert WrongCaller();
        if (c.state != T.CampaignState.PRODUCTION_VERIFIED || hasOpenRequest[campaignId] || fulfillmentReportHash == bytes32(0)) {
            revert WrongState();
        }
        c.state = T.CampaignState.FULFILLMENT_COMPLETE;
        c.fulfillmentReportHash = fulfillmentReportHash;
        emit FulfillmentComplete(campaignId, fulfillmentReportHash);
    }

    function completeCampaign(uint256 campaignId) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.creator && msg.sender != resolver) revert WrongCaller();
        if (c.state != T.CampaignState.FULFILLMENT_COMPLETE) revert WrongState();
        c.state = T.CampaignState.COMPLETED;
        emit CampaignCompleted(campaignId);
    }

    function startWindDown(uint256 id) external {
        T.CampaignView storage c = _campaign(id);
        if ((c.state != T.CampaignState.ACTIVE && c.state != T.CampaignState.PRODUCTION_VERIFIED && c.state != T.CampaignState.FULFILLMENT_COMPLETE)
            || hasOpenRequest[id] || block.timestamp < c.executionEnd) {
            revert WrongState();
        }
        c.state = T.CampaignState.STOPPED;
        c.basePool = c.available;
        c.available = 0;
        c.refundSnapshotted = true;
        emit WindDownStarted(id, c.basePool);
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
