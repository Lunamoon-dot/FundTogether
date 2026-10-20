// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IVNextEvents } from "../interfaces/IVNextEvents.sol";

/// @notice Stake ledger for VNext Judge participation.
/// @dev The review controller is configured once during deployment wiring and
/// cannot be changed after locking. This contract does not select Judges or
/// decide outcomes.
contract JuryRegistry is ReentrancyGuard, IVNextEvents {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakeToken;
    address public reviewController;
    address public immutable bootstrapper;
    bool public controllerLocked;

    mapping(address => uint256) public depositedStake;
    mapping(address => uint256) public availableStake;
    mapping(address => uint256) public lockedStake;
    mapping(bytes32 => bool) public caseRegistered;
    mapping(bytes32 => uint256) public caseEnrollmentDeadline;
    mapping(bytes32 => uint256) public requiredCaseStake;
    mapping(bytes32 => bytes32) public casePoolId;
    mapping(bytes32 => mapping(address => bool)) public caseEnrolled;
    mapping(bytes32 => mapping(address => uint256)) public caseStake;
    mapping(bytes32 => mapping(address => bool)) public caseSettled;
    mapping(bytes32 => uint256) public caseRewardPool;
    mapping(bytes32 => uint256) public caseRewardCredited;
    mapping(bytes32 => mapping(address => uint256)) public pendingReward;
    mapping(bytes32 => mapping(address => bool)) public rewardClaimed;

    error InvalidAddress();
    error InvalidAmount();
    error UnknownCase();
    error CaseEnrollmentClosed();
    error InsufficientCaseStake();
    error CaseAlreadyRegistered();
    error CaseAlreadyReserved();
    error CaseAlreadyEnrolled();
    error NoCaseStake();
    error InsufficientAvailableStake();
    error NotReviewController();
    error CaseAlreadySettled();
    error InvalidSlash();
    error ControllerAlreadyLocked();
    error NotBootstrapper();
    error RewardExceedsPool();
    error RewardAlreadyClaimed();

    event StakeWithdrawn(address indexed judge, uint256 amount, uint256 remainingDeposited);
    event CaseStakeReserved(bytes32 indexed reviewCaseId, address indexed judge, uint256 amount);
    event CaseStakeSettled(
        bytes32 indexed reviewCaseId,
        address indexed judge,
        uint256 unlockedAmount,
        uint256 slashedAmount
    );
    event ReviewControllerConfigured(address indexed controller);
    event JudgeRewardAccrued(
        bytes32 indexed reviewCaseId,
        address indexed judge,
        uint256 amount,
        uint256 remainingPool
    );
    constructor(address stakeToken_, address reviewController_) {
        if (stakeToken_ == address(0) || stakeToken_.code.length == 0) revert InvalidAddress();
        stakeToken = IERC20(stakeToken_);
        bootstrapper = msg.sender;
        reviewController = reviewController_;
        controllerLocked = reviewController_ != address(0);
    }

    /// @notice One-time deployment wiring for the review contract. It is not a
    /// runtime authority: once locked, no account can replace the controller.
    function configureReviewController(address controller) external {
        if (msg.sender != bootstrapper) revert NotBootstrapper();
        if (controllerLocked) revert ControllerAlreadyLocked();
        if (controller == address(0)) revert InvalidAddress();
        reviewController = controller;
        controllerLocked = true;
        emit ReviewControllerConfigured(controller);
    }

    function depositStake(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        depositedStake[msg.sender] += amount;
        availableStake[msg.sender] += amount;

        emit JudgeStakeDeposited(msg.sender, amount, depositedStake[msg.sender]);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        if (amount == 0 || amount > availableStake[msg.sender]) {
            revert InsufficientAvailableStake();
        }

        availableStake[msg.sender] -= amount;
        depositedStake[msg.sender] -= amount;
        stakeToken.safeTransfer(msg.sender, amount);

        emit StakeWithdrawn(msg.sender, amount, depositedStake[msg.sender]);
    }

    function registerCase(
        bytes32 reviewCaseId,
        uint256 enrollmentDeadline_,
        uint256 requiredCaseStake_,
        bytes32 poolId
    ) external {
        if (msg.sender != reviewController) revert NotReviewController();
        if (
            reviewCaseId == bytes32(0) || poolId == bytes32(0) || enrollmentDeadline_ <= block.timestamp
                || requiredCaseStake_ == 0
        ) revert InvalidAmount();
        if (caseRegistered[reviewCaseId]) revert CaseAlreadyRegistered();

        caseRegistered[reviewCaseId] = true;
        caseEnrollmentDeadline[reviewCaseId] = enrollmentDeadline_;
        requiredCaseStake[reviewCaseId] = requiredCaseStake_;
        casePoolId[reviewCaseId] = poolId;
        emit CaseRegistered(reviewCaseId, poolId, enrollmentDeadline_, requiredCaseStake_);
    }

    function reserveCaseStake(bytes32 reviewCaseId, uint256 amount) external {
        if (reviewCaseId == bytes32(0) || amount == 0) revert InvalidAmount();
        if (!caseRegistered[reviewCaseId]) revert UnknownCase();
        if (block.timestamp >= caseEnrollmentDeadline[reviewCaseId]) {
            revert CaseEnrollmentClosed();
        }
        if (amount < requiredCaseStake[reviewCaseId]) revert InsufficientCaseStake();
        if (caseStake[reviewCaseId][msg.sender] != 0) revert CaseAlreadyReserved();
        if (amount > availableStake[msg.sender]) revert InsufficientAvailableStake();

        availableStake[msg.sender] -= amount;
        lockedStake[msg.sender] += amount;
        caseStake[reviewCaseId][msg.sender] += amount;

        emit CaseStakeReserved(reviewCaseId, msg.sender, amount);
    }

    function markCaseEnrollment(bytes32 reviewCaseId, address judge) external {
        if (msg.sender != reviewController) revert NotReviewController();
        if (!caseRegistered[reviewCaseId]) revert UnknownCase();
        if (caseEnrolled[reviewCaseId][judge]) revert CaseAlreadyEnrolled();
        if (caseStake[reviewCaseId][judge] < requiredCaseStake[reviewCaseId]) {
            revert InsufficientCaseStake();
        }
        caseEnrolled[reviewCaseId][judge] = true;
    }

    function releaseUnenrolledCaseStake(bytes32 reviewCaseId, address judge) external {
        if (!caseRegistered[reviewCaseId]) revert UnknownCase();
        if (caseEnrolled[reviewCaseId][judge]) revert CaseAlreadyEnrolled();
        if (block.timestamp < caseEnrollmentDeadline[reviewCaseId]) {
            revert CaseEnrollmentClosed();
        }

        uint256 amount = caseStake[reviewCaseId][judge];
        if (amount == 0) revert NoCaseStake();

        caseStake[reviewCaseId][judge] = 0;
        lockedStake[judge] -= amount;
        availableStake[judge] += amount;
        emit UnenrolledCaseStakeReleased(reviewCaseId, judge, amount);
    }

    function settleCaseStake(bytes32 reviewCaseId, address judge, uint256 slashedAmount) external {
        if (msg.sender != reviewController) revert NotReviewController();
        if (caseSettled[reviewCaseId][judge]) revert CaseAlreadySettled();

        uint256 lockedForCase = caseStake[reviewCaseId][judge];
        if (slashedAmount > lockedForCase) revert InvalidSlash();

        caseSettled[reviewCaseId][judge] = true;
        caseStake[reviewCaseId][judge] = 0;
        lockedStake[judge] -= lockedForCase;
        availableStake[judge] += lockedForCase - slashedAmount;
        depositedStake[judge] -= slashedAmount;
        caseRewardPool[reviewCaseId] += slashedAmount;

        emit CaseStakeSettled(reviewCaseId, judge, lockedForCase - slashedAmount, slashedAmount);
    }

    function creditReward(bytes32 reviewCaseId, address judge, uint256 amount) external {
        if (msg.sender != reviewController) revert NotReviewController();
        if (amount == 0) revert InvalidAmount();
        uint256 nextCredited = caseRewardCredited[reviewCaseId] + amount;
        if (nextCredited > caseRewardPool[reviewCaseId]) revert RewardExceedsPool();
        caseRewardCredited[reviewCaseId] = nextCredited;
        pendingReward[reviewCaseId][judge] += amount;
        emit JudgeRewardAccrued(
            reviewCaseId,
            judge,
            amount,
            caseRewardPool[reviewCaseId] - nextCredited
        );
    }

    function claimReward(bytes32 reviewCaseId) external nonReentrant {
        if (rewardClaimed[reviewCaseId][msg.sender]) revert RewardAlreadyClaimed();
        uint256 amount = pendingReward[reviewCaseId][msg.sender];
        if (amount == 0) revert InvalidAmount();
        rewardClaimed[reviewCaseId][msg.sender] = true;
        pendingReward[reviewCaseId][msg.sender] = 0;
        stakeToken.safeTransfer(msg.sender, amount);
        emit JudgeRewardClaimed(reviewCaseId, msg.sender, amount);
    }
}
