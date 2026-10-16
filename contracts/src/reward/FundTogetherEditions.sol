// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Local MockUSDC-only Editions pilot. Existing Reward deployments are independent.
/// @dev No advances, fees, inventory, quantities, transfer of entitlements or physical fulfilment.
contract FundTogetherEditions is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant REVIEW_TAKEOVER = 7 days;
    uint256 public constant CHALLENGE_WINDOW = 7 days;
    uint256 public constant RELEASE_GRACE = 7 days;
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    bytes32 public constant policyHash = keccak256("editions-local-escrow-v1");
    IERC20 public immutable supportedToken;
    address public immutable resolver;
    address public immutable backupResolver;

    enum State {
        FUNDING,
        ACTIVE,
        RELEASE_REVIEW,
        RELEASED,
        REFUNDING,
        COMPLETED
    }

    struct Campaign {
        address creator;
        bytes32 commitmentHash;
        uint256 goal;
        uint256 price;
        uint256 fundingDeadline;
        uint256 releaseDeadline;
        uint256 raised;
        uint256 escrowed;
        State state;
        bytes32 productionHash;
        bool productionApproved;
        bytes32 pdfHash;
        bytes32 releaseEvidenceHash;
        uint256 reviewRequestedAt;
        uint256 challengeDeadline;
        uint256 disputeDeadline;
        uint256 openDisputes;
    }

    struct Dispute {
        bytes32 evidenceHash;
        uint256 openedAt;
        bool resolved;
    }
    uint256 public campaignCount;
    mapping(uint256 => Campaign) private campaigns;
    mapping(bytes32 => bool) public approvedTerms;
    mapping(address => mapping(bytes32 => bool)) public usedCommitments;
    mapping(uint256 => mapping(address => bool)) public pledged;
    mapping(uint256 => mapping(address => bool)) public refunded;
    mapping(uint256 => mapping(address => Dispute)) public disputes;

    error LocalOnly();
    error InvalidInput();
    error Unauthorized();
    error NotApproved();
    error WrongState();
    error TooEarly();
    error Expired();
    error AlreadyPledged();
    error AlreadyChallenged();
    error OpenDisputes();
    error NoRefund();
    error InexactTransfer();

    event CampaignApproved(
        address indexed creator, bytes32 indexed commitmentHash, bytes32 termsHash
    );
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        bytes32 commitmentHash,
        uint256 goal,
        uint256 price,
        uint256 fundingDeadline,
        uint256 releaseDeadline
    );
    event Pledged(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event FundingFinalized(uint256 indexed campaignId, bool success);
    event ProductionSubmitted(uint256 indexed campaignId, bytes32 evidenceHash);
    event ProductionReviewed(
        uint256 indexed campaignId, bytes32 evidenceHash, bool accepted, address reviewer
    );
    event ReleaseSubmitted(uint256 indexed campaignId, bytes32 pdfHash, bytes32 evidenceHash);
    event ReleaseReviewed(
        uint256 indexed campaignId,
        bytes32 pdfHash,
        bytes32 evidenceHash,
        bool accepted,
        address reviewer,
        uint256 challengeDeadline
    );
    event ReleaseChallenged(
        uint256 indexed campaignId,
        address indexed backer,
        bytes32 evidenceHash,
        uint256 disputeDeadline
    );
    event ChallengeResolved(
        uint256 indexed campaignId,
        address indexed backer,
        bool upheld,
        bytes32 decisionHash,
        address reviewer
    );
    event RefundsOpened(uint256 indexed campaignId, bytes32 reason);
    event Refunded(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event PaidOut(uint256 indexed campaignId, address indexed creator, uint256 amount);

    constructor(address token, address primary, address backup) {
        if (block.chainid != 31339) revert LocalOnly();
        if (
            token == address(0) || token.code.length == 0 || primary == address(0)
                || backup == address(0) || primary == backup
        ) revert InvalidInput();
        supportedToken = IERC20(token);
        resolver = primary;
        backupResolver = backup;
    }

    function campaign(uint256 id) external view returns (Campaign memory) {
        return _campaign(id);
    }

    function termsHash(
        address creator,
        bytes32 commitment,
        uint256 goal,
        uint256 price,
        uint256 duration,
        uint256 releaseDeadline
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(policyHash, creator, commitment, goal, price, duration, releaseDeadline)
        );
    }

    function approveCampaign(
        address creator,
        bytes32 commitment,
        uint256 goal,
        uint256 price,
        uint256 duration,
        uint256 releaseDeadline
    ) external {
        if (msg.sender != resolver) revert Unauthorized();
        _validateTerms(creator, commitment, goal, price, duration, releaseDeadline);
        if (usedCommitments[creator][commitment]) revert NotApproved();
        bytes32 hash = termsHash(creator, commitment, goal, price, duration, releaseDeadline);
        approvedTerms[hash] = true;
        emit CampaignApproved(creator, commitment, hash);
    }

    function createCampaign(
        bytes32 commitment,
        uint256 goal,
        uint256 price,
        uint256 duration,
        uint256 releaseDeadline
    ) external returns (uint256 id) {
        _validateTerms(msg.sender, commitment, goal, price, duration, releaseDeadline);
        bytes32 hash = termsHash(msg.sender, commitment, goal, price, duration, releaseDeadline);
        if (!approvedTerms[hash] || usedCommitments[msg.sender][commitment]) revert NotApproved();
        delete approvedTerms[hash];
        usedCommitments[msg.sender][commitment] = true;
        id = campaignCount++;
        Campaign storage c = campaigns[id];
        c.creator = msg.sender;
        c.commitmentHash = commitment;
        c.goal = goal;
        c.price = price;
        c.fundingDeadline = block.timestamp + duration;
        c.releaseDeadline = releaseDeadline;
        emit CampaignCreated(
            id, msg.sender, commitment, goal, price, c.fundingDeadline, releaseDeadline
        );
    }

    function pledge(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.state != State.FUNDING) revert WrongState();
        if (block.timestamp >= c.fundingDeadline) revert Expired();
        if (pledged[id][msg.sender]) revert AlreadyPledged();
        pledged[id][msg.sender] = true;
        c.raised += c.price;
        c.escrowed += c.price;
        uint256 beforeBalance = supportedToken.balanceOf(address(this));
        supportedToken.safeTransferFrom(msg.sender, address(this), c.price);
        if (supportedToken.balanceOf(address(this)) - beforeBalance != c.price) {
            revert InexactTransfer();
        }
        emit Pledged(id, msg.sender, c.price);
    }

    function finalizeFunding(uint256 id) external {
        Campaign storage c = _campaign(id);
        if (c.state != State.FUNDING) revert WrongState();
        if (block.timestamp < c.fundingDeadline) revert TooEarly();
        bool success = c.raised >= c.goal;
        if (success) c.state = State.ACTIVE;
        else _refunds(id, c, keccak256("FUNDING_FAILED"));
        emit FundingFinalized(id, success);
    }

    function submitProduction(uint256 id, bytes32 evidenceHash) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        _beforeReleaseExpiry(c);
        if (c.state != State.ACTIVE || c.productionApproved || c.productionHash != bytes32(0)) {
            revert WrongState();
        }
        if (evidenceHash == bytes32(0)) revert InvalidInput();
        c.productionHash = evidenceHash;
        c.reviewRequestedAt = block.timestamp;
        emit ProductionSubmitted(id, evidenceHash);
    }

    function reviewProduction(uint256 id, bytes32 expectedHash, bool accepted) external {
        Campaign storage c = _campaign(id);
        _beforeReleaseExpiry(c);
        if (
            c.state != State.ACTIVE || c.productionApproved || c.productionHash == bytes32(0)
                || expectedHash != c.productionHash
        ) revert WrongState();
        _reviewer(c.reviewRequestedAt);
        if (accepted) c.productionApproved = true;
        else c.productionHash = bytes32(0);
        emit ProductionReviewed(id, expectedHash, accepted, msg.sender);
    }

    function submitRelease(uint256 id, bytes32 pdfHash, bytes32 evidenceHash) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        _beforeReleaseExpiry(c);
        if (c.state != State.ACTIVE || !c.productionApproved) revert WrongState();
        if (pdfHash == bytes32(0) || evidenceHash == bytes32(0)) revert InvalidInput();
        c.pdfHash = pdfHash;
        c.releaseEvidenceHash = evidenceHash;
        c.reviewRequestedAt = block.timestamp;
        c.state = State.RELEASE_REVIEW;
        emit ReleaseSubmitted(id, pdfHash, evidenceHash);
    }

    function reviewRelease(
        uint256 id,
        bytes32 expectedPdfHash,
        bytes32 expectedEvidenceHash,
        bool accepted
    ) external {
        Campaign storage c = _campaign(id);
        _beforeReleaseExpiry(c);
        if (
            c.state != State.RELEASE_REVIEW || expectedPdfHash != c.pdfHash
                || expectedEvidenceHash != c.releaseEvidenceHash
        ) revert WrongState();
        _reviewer(c.reviewRequestedAt);
        c.state = accepted ? State.RELEASED : State.ACTIVE;
        if (accepted) {
            c.challengeDeadline = block.timestamp + CHALLENGE_WINDOW;
        } else {
            c.pdfHash = bytes32(0);
            c.releaseEvidenceHash = bytes32(0);
        }
        emit ReleaseReviewed(
            id, expectedPdfHash, expectedEvidenceHash, accepted, msg.sender, c.challengeDeadline
        );
    }

    function challengeRelease(uint256 id, bytes32 evidenceHash) external {
        Campaign storage c = _campaign(id);
        if (c.state != State.RELEASED) revert WrongState();
        if (block.timestamp >= c.challengeDeadline) revert Expired();
        if (!pledged[id][msg.sender]) revert Unauthorized();
        if (disputes[id][msg.sender].evidenceHash != bytes32(0)) revert AlreadyChallenged();
        if (evidenceHash == bytes32(0)) revert InvalidInput();
        disputes[id][msg.sender] = Dispute(evidenceHash, block.timestamp, false);
        c.openDisputes++;
        // An immutable deadline from the first challenge prevents repeated delay.
        if (c.disputeDeadline == 0) c.disputeDeadline = block.timestamp + DISPUTE_TIMEOUT;
        emit ReleaseChallenged(id, msg.sender, evidenceHash, c.disputeDeadline);
    }

    function resolveChallenge(uint256 id, address backer, bool upheld, bytes32 decisionHash)
        external
    {
        Campaign storage c = _campaign(id);
        if (c.state != State.RELEASED) revert WrongState();
        if (block.timestamp >= c.disputeDeadline) revert Expired();
        Dispute storage dispute = disputes[id][backer];
        if (dispute.evidenceHash == bytes32(0) || dispute.resolved || decisionHash == bytes32(0)) {
            revert InvalidInput();
        }
        _reviewer(dispute.openedAt);
        dispute.resolved = true;
        c.openDisputes--;
        if (upheld) _refunds(id, c, keccak256("RELEASE_CHALLENGE_UPHELD"));
        emit ChallengeResolved(id, backer, upheld, decisionHash, msg.sender);
    }

    function cancelCampaign(uint256 id) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        if (c.state == State.REFUNDING || c.state == State.COMPLETED) revert WrongState();
        _refunds(id, c, keccak256("CREATOR_CANCELLED"));
    }

    function startRefunds(uint256 id) external {
        Campaign storage c = _campaign(id);
        if (c.state == State.REFUNDING || c.state == State.COMPLETED) revert WrongState();
        bool failedFunding =
            c.state == State.FUNDING && block.timestamp >= c.fundingDeadline && c.raised < c.goal;
        bool missingRelease =
            c.state != State.RELEASED && block.timestamp >= c.releaseDeadline + RELEASE_GRACE;
        bool disputeTimedOut =
            c.state == State.RELEASED && c.openDisputes > 0 && block.timestamp >= c.disputeDeadline;
        if (!failedFunding && !missingRelease && !disputeTimedOut) revert TooEarly();
        _refunds(id, c, keccak256("DEADLINE_EXPIRED"));
    }

    function claimRefund(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.state != State.REFUNDING) revert WrongState();
        if (!pledged[id][msg.sender] || refunded[id][msg.sender]) revert NoRefund();
        refunded[id][msg.sender] = true;
        c.escrowed -= c.price;
        _transfer(msg.sender, c.price);
        emit Refunded(id, msg.sender, c.price);
    }

    function payout(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.state != State.RELEASED) revert WrongState();
        if (block.timestamp < c.challengeDeadline) revert TooEarly();
        if (c.openDisputes != 0) revert OpenDisputes();
        uint256 amount = c.escrowed;
        c.escrowed = 0;
        c.state = State.COMPLETED;
        _transfer(c.creator, amount);
        emit PaidOut(id, c.creator, amount);
    }

    function _campaign(uint256 id) private view returns (Campaign storage c) {
        if (id >= campaignCount) revert InvalidInput();
        return campaigns[id];
    }

    function _validateTerms(
        address creator,
        bytes32 commitment,
        uint256 goal,
        uint256 price,
        uint256 duration,
        uint256 releaseDeadline
    ) private view {
        if (
            creator == address(0) || creator == resolver || creator == backupResolver
                || creator == address(this) || commitment == bytes32(0) || price == 0
                || price > goal || duration < 1 days || duration > 60 days
                || releaseDeadline <= block.timestamp + duration
                || releaseDeadline > type(uint256).max - RELEASE_GRACE
        ) revert InvalidInput();
    }

    function _creator(Campaign storage c) private view {
        if (msg.sender != c.creator) revert Unauthorized();
    }

    function _beforeReleaseExpiry(Campaign storage c) private view {
        if (block.timestamp >= c.releaseDeadline + RELEASE_GRACE) revert Expired();
    }

    function _reviewer(uint256 requestedAt) private view {
        if (
            msg.sender != resolver
                && !(msg.sender == backupResolver
                    && block.timestamp >= requestedAt + REVIEW_TAKEOVER)
        ) revert Unauthorized();
    }

    function _refunds(uint256 id, Campaign storage c, bytes32 reason) private {
        c.state = State.REFUNDING;
        emit RefundsOpened(id, reason);
    }

    function _transfer(address recipient, uint256 amount) private {
        uint256 beforeEscrow = supportedToken.balanceOf(address(this));
        uint256 beforeRecipient = supportedToken.balanceOf(recipient);
        supportedToken.safeTransfer(recipient, amount);
        if (
            beforeEscrow - supportedToken.balanceOf(address(this)) != amount
                || supportedToken.balanceOf(recipient) - beforeRecipient != amount
        ) revert InexactTransfer();
    }
}
