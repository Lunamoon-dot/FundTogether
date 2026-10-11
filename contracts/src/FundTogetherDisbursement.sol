pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { DisbursementTypes as T } from "./disbursement/DisbursementTypes.sol";

contract FundTogetherDisbursement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidInput();
    error WrongCaller();
    error WrongState();
    error Expired();
    error InvalidReference();
    error NonExactTransfer();

    IERC20 public immutable supportedToken;
    address public immutable resolver;
    bytes32 public immutable policyHash;
    uint256 public nextCampaignId;
    mapping(uint256 => T.CampaignView) private _campaigns;
    mapping(uint256 => mapping(uint256 => T.RequestView)) private _requests;
    mapping(uint256 => uint256) public requestCount;
    mapping(uint256 => bool) public hasOpenRequest;
    mapping(uint256 => mapping(uint256 => bool)) public deliveryCaseOpen;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(address => bool)) private _refundClaimed;

    event CampaignCreated(uint256 indexed campaignId, address indexed organizer, bytes32 commitmentHash, uint256 goal, uint256 fundingEnd);
    event Donated(uint256 indexed campaignId, address indexed donor, uint256 amount, uint256 contributed);
    event CampaignActivated(uint256 indexed campaignId, bytes32 eligibilityHash);
    event RequestSubmitted(uint256 indexed campaignId, uint256 indexed requestId, bytes32 requestHash, uint256 amount, uint256 deposit);
    event RequestReserved(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, uint256 available, uint256 reserved);
    event VendorAcknowledged(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, bytes32 termsHash);
    event DepositPaid(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, uint256 amount);
    event DeliveryCandidate(uint256 indexed campaignId, uint256 indexed requestId, uint256 acceptedValue, bytes32 reportHash);
    event FinalPaid(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, uint256 amount);
    event ResidualReleased(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, bytes32 reasonHash);
    event DeliveryCaseOpened(uint256 indexed campaignId, uint256 indexed requestId, address indexed donor, bytes32 reasonHash);
    event DeliveryCaseUpheld(uint256 indexed campaignId, uint256 indexed requestId, bytes32 decisionHash, uint256 challengeEnd);
    event FundingFailed(uint256 indexed campaignId, uint256 basePool);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event FundsReturned(uint256 indexed campaignId, uint256 indexed requestId, address indexed vendor, uint256 amount);

    constructor(address token, address resolver_, bytes32 policyHash_) {
        if (token == address(0) || resolver_ == address(0) || policyHash_ == bytes32(0)) revert InvalidInput();
        supportedToken = IERC20(token);
        resolver = resolver_;
        policyHash = policyHash_;
    }

    function campaign(uint256 id) external view returns (T.CampaignView memory) { return _campaign(id); }
    function request(uint256 campaignId, uint256 requestId) external view returns (T.RequestView memory) {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        return _requests[campaignId][requestId];
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
        _receiveExact(msg.sender, amount);
        contributions[id][msg.sender] += amount;
        c.contributed += amount;
        c.available += amount;
        emit Donated(id, msg.sender, amount, c.contributed);
    }

    function activateCampaign(uint256 id, bytes32 eligibilityHash) external {
        T.CampaignView storage c = _campaign(id);
        if (msg.sender != resolver) revert WrongCaller();
        if (c.state != T.CampaignState.FUNDING || c.contributed != c.goal) revert WrongState();
        if (eligibilityHash == bytes32(0)) revert InvalidInput();
        c.state = T.CampaignState.ACTIVE;
        emit CampaignActivated(id, eligibilityHash);
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
        if (!c.refundSnapshotted || _refundClaimed[id][msg.sender] || contributions[id][msg.sender] == 0) revert WrongState();
        _refundClaimed[id][msg.sender] = true;
        uint256 amount = Math.mulDiv(contributions[id][msg.sender], c.basePool, c.contributed);
        c.refunded += amount;
        if (amount != 0) _sendExact(msg.sender, amount);
        emit RefundClaimed(id, msg.sender, amount);
    }

    function returnFunds(uint256 campaignId, uint256 requestId, uint256 amount) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (msg.sender != r.vendor) revert WrongCaller();
        if (amount == 0 || amount > r.grossPaid - r.returned) revert InvalidInput();
        _receiveExact(msg.sender, amount);
        r.returned += amount;
        c.available += amount;
        emit FundsReturned(campaignId, requestId, msg.sender, amount);
    }

    function submitRequest(uint256 campaignId, bytes32 requestHash, address vendor, uint256 amount, uint256 deposit) external returns (uint256 requestId) {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != c.organizer) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || requestHash == bytes32(0) || vendor == address(0) || amount == 0 || deposit > amount) revert InvalidInput();
        if (hasOpenRequest[campaignId]) revert WrongState();
        requestId = requestCount[campaignId]++;
        hasOpenRequest[campaignId] = true;
        _requests[campaignId][requestId] = T.RequestView(requestHash, vendor, bytes32(0), amount, deposit, 0, 0, 0, 0, T.RequestState.SUBMITTED);
        emit RequestSubmitted(campaignId, requestId, requestHash, amount, deposit);
    }

    function approveRequest(uint256 campaignId, uint256 requestId, bytes32 expectedRequestHash) external {
        T.CampaignView storage c = _campaign(campaignId);
        if (msg.sender != resolver) revert WrongCaller();
        if (c.state != T.CampaignState.ACTIVE || requestId >= requestCount[campaignId]) revert WrongState();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.SUBMITTED || r.requestHash != expectedRequestHash || r.approvedAmount > c.available) revert InvalidInput();
        c.available -= r.approvedAmount;
        c.reserved += r.approvedAmount;
        r.state = T.RequestState.APPROVED_RESERVED;
        emit RequestReserved(campaignId, requestId, r.approvedAmount, c.available, c.reserved);
    }

    function acknowledgeVendor(uint256 campaignId, uint256 requestId, bytes32 termsHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (msg.sender != r.vendor) revert WrongCaller();
        if (r.state != T.RequestState.APPROVED_RESERVED || termsHash == bytes32(0)) revert WrongState();
        r.termsHash = termsHash;
        r.state = T.RequestState.VENDOR_COMMITTED;
        emit VendorAcknowledged(campaignId, requestId, msg.sender, termsHash);
    }

    function payDeposit(uint256 campaignId, uint256 requestId) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (c.state != T.CampaignState.ACTIVE || r.state != T.RequestState.VENDOR_COMMITTED || r.grossPaid != 0 || r.depositAmount == 0) revert WrongState();
        c.reserved -= r.depositAmount;
        c.grossPaid += r.depositAmount;
        r.grossPaid = r.depositAmount;
        _sendExact(r.vendor, r.depositAmount);
        emit DepositPaid(campaignId, requestId, r.vendor, r.depositAmount);
    }

    function candidateDelivery(uint256 campaignId, uint256 requestId, uint256 acceptedValue, bytes32 reportHash) external {
        if (msg.sender != resolver) revert WrongCaller();
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.VENDOR_COMMITTED || acceptedValue > r.approvedAmount || reportHash == bytes32(0)) revert InvalidInput();
        r.acceptedDeliveryValue = acceptedValue;
        r.challengeEnd = block.timestamp + 3 days;
        r.state = T.RequestState.DELIVERY_CANDIDATE;
        emit DeliveryCandidate(campaignId, requestId, acceptedValue, reportHash);
    }

    function executeFinal(uint256 campaignId, uint256 requestId) external nonReentrant {
        T.CampaignView storage c = _campaign(campaignId);
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || block.timestamp < r.challengeEnd || deliveryCaseOpen[campaignId][requestId]) revert WrongState();
        uint256 due = r.acceptedDeliveryValue > r.grossPaid ? r.acceptedDeliveryValue - r.grossPaid : 0;
        uint256 payout = due < c.reserved ? due : c.reserved;
        if (payout != 0) {
            c.reserved -= payout;
            c.grossPaid += payout;
            r.grossPaid += payout;
            _sendExact(r.vendor, payout);
        }
        if (c.reserved == 0) {
            r.state = T.RequestState.FINANCIALLY_SETTLED;
            hasOpenRequest[campaignId] = false;
        }
        emit FinalPaid(campaignId, requestId, r.vendor, payout);
    }

    function openDeliveryCase(uint256 campaignId, uint256 requestId, bytes32 reasonHash) external {
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || block.timestamp >= r.challengeEnd || contributions[campaignId][msg.sender] == 0 || reasonHash == bytes32(0) || deliveryCaseOpen[campaignId][requestId]) revert WrongState();
        deliveryCaseOpen[campaignId][requestId] = true;
        emit DeliveryCaseOpened(campaignId, requestId, msg.sender, reasonHash);
    }

    function upholdDeliveryCase(uint256 campaignId, uint256 requestId, bytes32 decisionHash) external {
        if (msg.sender != resolver) revert WrongCaller();
        if (requestId >= requestCount[campaignId]) revert InvalidReference();
        T.RequestView storage r = _requests[campaignId][requestId];
        if (r.state != T.RequestState.DELIVERY_CANDIDATE || !deliveryCaseOpen[campaignId][requestId] || decisionHash == bytes32(0)) revert WrongState();
        deliveryCaseOpen[campaignId][requestId] = false;
        r.challengeEnd = block.timestamp + 3 days;
        emit DeliveryCaseUpheld(campaignId, requestId, decisionHash, r.challengeEnd);
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
