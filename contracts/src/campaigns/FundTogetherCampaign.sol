// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Local MockUSDC-only Campaign pilot. Existing FundTogether deployments are independent.
/// @dev Creator disbursements are Resolver-approved advances against the frozen goal.
contract FundTogetherCampaign is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant REVIEW_TAKEOVER = 7 days;
    uint256 public constant CHALLENGE_WINDOW = 7 days;
    uint256 public constant PRODUCTION_GRACE = 30 days;
    uint256 public constant RELEASE_GRACE = 7 days;
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    bytes32 public constant policyHash = keccak256("campaigns-local-escrow-v6");
    IERC20 public immutable supportedToken;
    address public immutable resolver;
    address public immutable backupResolver;

    enum State {
        FUNDING,
        ACTIVE,
        RELEASE_REVIEW,
        RELEASED,
        REFUNDING,
        COMPLETION_REQUESTED,
        COMPLETED
    }

    enum SurplusChoice {
        REFUND_TO_BACKER,
        DONATE_TO_CREATOR
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
        bytes32 payoutRequestHash;
        uint256 payoutAmount;
        uint256 payoutRequestedAt;
        bytes32 payoutDecisionHash;
        uint256 creatorPaid;
        bytes32 completionRequestHash;
        uint256 completionRequestedAt;
        bytes32 completionDecisionHash;
        uint256 completionRaised;
        uint256 surplusPool;
        uint256 surplusClaimed;
        uint256 backerCount;
        uint256 surplusClaimantCount;
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
    mapping(uint256 => mapping(address => uint256)) public pledged;
    mapping(uint256 => mapping(address => bool)) public refunded;
    mapping(uint256 => mapping(address => bool)) public claimedSurplus;
    mapping(uint256 => mapping(address => Dispute)) public disputes;

    error LocalOnly();
    error InvalidInput();
    error Unauthorized();
    error NotApproved();
    error WrongState();
    error TooEarly();
    error Expired();
    error AlreadyChallenged();
    error OpenDisputes();
    error NoRefund();
    error InexactTransfer();
    error CompletionRequestMismatch();
    error PayoutRequestMismatch();
    error NoSurplus();

    event CampaignApproved(
        address indexed creator, bytes32 indexed commitmentHash, bytes32 termsHash
    );
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        bytes32 commitmentHash,
        uint256 goal,
        uint256 price,
        uint256 fundingDeadline
    );
    event Pledged(
        uint256 indexed campaignId,
        address indexed backer,
        uint256 quantity,
        uint256 amount
    );
    event FundingFinalized(uint256 indexed campaignId, bool success);
    event ProductionSubmitted(uint256 indexed campaignId, bytes32 evidenceHash);
    event ProductionReviewed(
        uint256 indexed campaignId,
        bytes32 evidenceHash,
        bool accepted,
        address reviewer
    );
    event CampaignCompletionConfirmed(
        uint256 indexed campaignId,
        uint256 releaseDeadline,
        address indexed creator
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
    event DisbursementRequested(
        uint256 indexed campaignId, bytes32 indexed requestHash, address indexed creator, uint256 amount
    );
    event DisbursementApproved(
        uint256 indexed campaignId,
        bytes32 indexed requestHash,
        bytes32 decisionHash,
        address indexed reviewer,
        uint256 amount,
        uint256 remainingEscrow
    );
    event DisbursementRejected(
        uint256 indexed campaignId,
        bytes32 indexed requestHash,
        bytes32 decisionHash,
        address indexed reviewer
    );
    event CompletionRequested(
        uint256 indexed campaignId, bytes32 indexed requestHash, address indexed creator
    );
    event CompletionApproved(
        uint256 indexed campaignId,
        bytes32 indexed requestHash,
        bytes32 decisionHash,
        address indexed reviewer,
        uint256 goalAmount,
        uint256 raised,
        uint256 surplusPool
    );
    event CompletionRejected(
        uint256 indexed campaignId, bytes32 indexed requestHash, bytes32 decisionHash, address indexed reviewer
    );
    event SurplusClaimed(
        uint256 indexed campaignId,
        address indexed backer,
        SurplusChoice choice,
        address indexed recipient,
        uint256 amount
    );

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
        uint256 duration
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(policyHash, creator, commitment, goal, price, duration));
    }

    function approveCampaign(
        address creator,
        bytes32 commitment,
        uint256 goal,
        uint256 price,
        uint256 duration
    ) external {
        if (msg.sender != resolver) revert Unauthorized();
        _validateTerms(creator, commitment, goal, price, duration);
        if (usedCommitments[creator][commitment]) revert NotApproved();
        bytes32 hash = termsHash(creator, commitment, goal, price, duration);
        approvedTerms[hash] = true;
        emit CampaignApproved(creator, commitment, hash);
    }

    function createCampaign(
        bytes32 commitment,
        uint256 goal,
        uint256 price,
        uint256 duration
    ) external returns (uint256 id) {
        _validateTerms(msg.sender, commitment, goal, price, duration);
        bytes32 hash = termsHash(msg.sender, commitment, goal, price, duration);
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
        emit CampaignCreated(id, msg.sender, commitment, goal, price, c.fundingDeadline);
    }

    function pledge(uint256 id, uint256 quantity) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.state != State.FUNDING) revert WrongState();
        if (block.timestamp >= c.fundingDeadline) revert Expired();
        if (quantity == 0) revert InvalidInput();
        uint256 amount = c.price * quantity;
        if (pledged[id][msg.sender] == 0) c.backerCount++;
        pledged[id][msg.sender] += quantity;
        c.raised += amount;
        c.escrowed += amount;
        uint256 beforeBalance = supportedToken.balanceOf(address(this));
        supportedToken.safeTransferFrom(msg.sender, address(this), amount);
        if (supportedToken.balanceOf(address(this)) - beforeBalance != amount) {
            revert InexactTransfer();
        }
        emit Pledged(id, msg.sender, quantity, amount);
    }

    function finalizeFunding(uint256 id) external {
        _resolverOrBackup();
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
        _beforeProductionDeadline(c);
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
        _beforeProductionDeadline(c);
        if (
            c.state != State.ACTIVE || c.productionApproved || c.productionHash == bytes32(0)
                || expectedHash != c.productionHash
        ) revert WrongState();
        _reviewer(c.reviewRequestedAt);
        if (accepted) {
            c.productionApproved = true;
        } else {
            c.productionHash = bytes32(0);
        }
        emit ProductionReviewed(id, expectedHash, accepted, msg.sender);
    }

    /// @notice Creator confirms the campaign is complete and commits its release deadline.
    /// @dev Resolver approval of production evidence is a prerequisite, but does not set policy.
    function confirmCampaignCompletion(uint256 id, uint256 releaseDeadline) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        _beforeProductionDeadline(c);
        if (c.state != State.ACTIVE || !c.productionApproved || c.releaseDeadline != 0) revert WrongState();
        if (releaseDeadline <= block.timestamp || releaseDeadline > type(uint256).max - RELEASE_GRACE) {
            revert InvalidInput();
        }
        c.releaseDeadline = releaseDeadline;
        emit CampaignCompletionConfirmed(id, releaseDeadline, msg.sender);
    }

    function submitRelease(uint256 id, bytes32 pdfHash, bytes32 evidenceHash) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        _beforeReleaseExpiry(c);
        if (c.state != State.ACTIVE || !c.productionApproved || c.releaseDeadline == 0) revert WrongState();
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
        if (pledged[id][msg.sender] == 0) revert Unauthorized();
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
        if (c.state == State.REFUNDING || c.state == State.COMPLETION_REQUESTED || c.state == State.COMPLETED || c.payoutRequestHash != bytes32(0)) {
            revert WrongState();
        }
        _refunds(id, c, keccak256("CREATOR_CANCELLED"));
    }

    function startRefunds(uint256 id) external {
        Campaign storage c = _campaign(id);
        if (c.state == State.REFUNDING || c.state == State.COMPLETION_REQUESTED || c.state == State.COMPLETED || c.payoutRequestHash != bytes32(0)) {
            revert WrongState();
        }
        bool failedFunding =
            c.state == State.FUNDING && block.timestamp >= c.fundingDeadline && c.raised < c.goal;
        bool missingProduction =
            c.state == State.ACTIVE && !c.productionApproved && block.timestamp >= c.fundingDeadline + PRODUCTION_GRACE;
        bool missingCompletion =
            c.state == State.ACTIVE && c.productionApproved && c.releaseDeadline == 0
                && block.timestamp >= c.fundingDeadline + PRODUCTION_GRACE;
        bool missingRelease =
            c.releaseDeadline != 0 && c.state != State.RELEASED && block.timestamp >= c.releaseDeadline + RELEASE_GRACE;
        bool disputeTimedOut =
            c.state == State.RELEASED && c.openDisputes > 0 && block.timestamp >= c.disputeDeadline;
        if (!failedFunding && !missingProduction && !missingCompletion && !missingRelease && !disputeTimedOut) revert TooEarly();
        _refunds(id, c, keccak256("DEADLINE_EXPIRED"));
    }

    function claimRefund(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.state != State.REFUNDING) revert WrongState();
        if (pledged[id][msg.sender] == 0 || refunded[id][msg.sender]) revert NoRefund();
        uint256 amount = c.price * pledged[id][msg.sender];
        refunded[id][msg.sender] = true;
        c.escrowed -= amount;
        _transfer(msg.sender, amount);
        emit Refunded(id, msg.sender, amount);
    }

    /// @notice Creator asks for an advance against the frozen goal.
    /// @dev The request is only metadata on-chain; its hash binds the reviewed dossier.
    ///      The first request has no evidence-file prerequisite.
    function requestDisbursement(uint256 id, bytes32 requestHash, uint256 amount) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        if (c.state != State.ACTIVE || requestHash == bytes32(0) || amount == 0) revert WrongState();
        if (c.payoutRequestHash != bytes32(0)) revert WrongState();
        if (amount > c.escrowed || amount > c.goal - c.creatorPaid) revert InvalidInput();
        c.payoutRequestHash = requestHash;
        c.payoutAmount = amount;
        c.payoutRequestedAt = block.timestamp;
        c.payoutDecisionHash = bytes32(0);
        emit DisbursementRequested(id, requestHash, c.creator, amount);
    }

    function approveDisbursement(uint256 id, bytes32 requestHash, bytes32 decisionHash)
        external
        nonReentrant
    {
        Campaign storage c = _campaign(id);
        if (c.state != State.ACTIVE || c.payoutRequestHash != requestHash) revert PayoutRequestMismatch();
        if (decisionHash == bytes32(0)) revert InvalidInput();
        _resolverOrBackup();
        uint256 amount = c.payoutAmount;
        if (amount == 0 || amount > c.escrowed || amount > c.goal - c.creatorPaid) revert InvalidInput();
        c.creatorPaid += amount;
        c.escrowed -= amount;
        c.payoutDecisionHash = decisionHash;
        c.payoutRequestHash = bytes32(0);
        c.payoutAmount = 0;
        emit DisbursementApproved(id, requestHash, decisionHash, msg.sender, amount, c.escrowed);
        _transfer(c.creator, amount);
    }

    function rejectDisbursement(uint256 id, bytes32 requestHash, bytes32 decisionHash) external {
        Campaign storage c = _campaign(id);
        if (c.state != State.ACTIVE || c.payoutRequestHash != requestHash) revert PayoutRequestMismatch();
        if (decisionHash == bytes32(0)) revert InvalidInput();
        _resolverOrBackup();
        c.payoutDecisionHash = decisionHash;
        c.payoutRequestHash = bytes32(0);
        c.payoutAmount = 0;
        emit DisbursementRejected(id, requestHash, decisionHash, msg.sender);
    }

    function requestCompletion(uint256 id, bytes32 dossierHash) external {
        Campaign storage c = _campaign(id);
        _creator(c);
        if (c.state != State.RELEASED) revert WrongState();
        if (block.timestamp < c.challengeDeadline) revert TooEarly();
        if (c.openDisputes != 0) revert OpenDisputes();
        if (dossierHash == bytes32(0)) revert InvalidInput();
        c.completionRequestHash = dossierHash;
        c.completionRequestedAt = block.timestamp;
        c.completionDecisionHash = bytes32(0);
        c.state = State.COMPLETION_REQUESTED;
        emit CompletionRequested(id, dossierHash, c.creator);
    }

    function approveCompletion(uint256 id, bytes32 dossierHash, bytes32 decisionHash)
        external
        nonReentrant
    {
        Campaign storage c = _campaign(id);
        if (c.state != State.COMPLETION_REQUESTED) revert WrongState();
        if (dossierHash != c.completionRequestHash) revert CompletionRequestMismatch();
        if (decisionHash == bytes32(0)) revert InvalidInput();
        if (c.openDisputes != 0) revert OpenDisputes();
        _resolverOrBackup();

        uint256 raised = c.raised;
        uint256 surplus = raised > c.goal ? raised - c.goal : 0;
        uint256 creatorRemainder = c.goal - c.creatorPaid;
        c.completionRaised = raised;
        c.surplusPool = surplus;
        c.surplusClaimed = 0;
        c.surplusClaimantCount = 0;
        c.escrowed = surplus;
        c.creatorPaid += creatorRemainder;
        c.completionDecisionHash = decisionHash;
        c.state = State.COMPLETED;
        emit CompletionApproved(id, dossierHash, decisionHash, msg.sender, creatorRemainder, raised, surplus);
        if (creatorRemainder > 0) _transfer(c.creator, creatorRemainder);
    }

    function rejectCompletion(uint256 id, bytes32 dossierHash, bytes32 decisionHash) external {
        Campaign storage c = _campaign(id);
        if (c.state != State.COMPLETION_REQUESTED) revert WrongState();
        if (dossierHash != c.completionRequestHash) revert CompletionRequestMismatch();
        if (decisionHash == bytes32(0)) revert InvalidInput();
        if (c.openDisputes != 0) revert OpenDisputes();
        _resolverOrBackup();
        c.completionDecisionHash = decisionHash;
        c.state = State.RELEASED;
        emit CompletionRejected(id, dossierHash, decisionHash, msg.sender);
    }

    function claimableSurplus(uint256 id, address backer) public view returns (uint256) {
        Campaign storage c = _campaign(id);
        if (c.state != State.COMPLETED || claimedSurplus[id][backer]) return 0;
        uint256 contribution = c.price * pledged[id][backer];
        if (contribution == 0 || c.completionRaised == 0 || c.surplusClaimed >= c.surplusPool) return 0;
        if (c.surplusClaimantCount + 1 == c.backerCount) {
            return c.surplusPool - c.surplusClaimed;
        }
        return (c.surplusPool * contribution) / c.completionRaised;
    }

    function claimSurplus(uint256 id, SurplusChoice choice) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (c.state != State.COMPLETED) revert WrongState();
        if (choice != SurplusChoice.REFUND_TO_BACKER && choice != SurplusChoice.DONATE_TO_CREATOR) {
            revert InvalidInput();
        }
        if (pledged[id][msg.sender] == 0 || claimedSurplus[id][msg.sender]) revert NoRefund();
        uint256 amount = claimableSurplus(id, msg.sender);
        if (amount == 0) revert NoSurplus();
        address recipient = choice == SurplusChoice.REFUND_TO_BACKER ? msg.sender : c.creator;
        claimedSurplus[id][msg.sender] = true;
        c.surplusClaimantCount++;
        c.surplusClaimed += amount;
        c.escrowed -= amount;
        _transfer(recipient, amount);
        emit SurplusClaimed(id, msg.sender, choice, recipient, amount);
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
        uint256 duration
    ) private view {
        if (
            creator == address(0) || creator == resolver || creator == backupResolver
                || creator == address(this) || commitment == bytes32(0) || price == 0
                || price > goal || duration < 1 days || duration > 60 days
        ) revert InvalidInput();
    }

    function _creator(Campaign storage c) private view {
        if (msg.sender != c.creator) revert Unauthorized();
    }

    function _resolverOrBackup() private view {
        if (msg.sender != resolver && msg.sender != backupResolver) revert Unauthorized();
    }

    function _beforeReleaseExpiry(Campaign storage c) private view {
        if (c.releaseDeadline != 0 && block.timestamp >= c.releaseDeadline + RELEASE_GRACE) revert Expired();
    }

    function _beforeProductionDeadline(Campaign storage c) private view {
        if (c.releaseDeadline == 0 && block.timestamp >= c.fundingDeadline + PRODUCTION_GRACE) revert Expired();
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
