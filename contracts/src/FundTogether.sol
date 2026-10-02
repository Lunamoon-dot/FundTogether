pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FundTogether is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum CampaignState {
        DRAFT,
        APPROVED,
        FUNDING,
        FUNDED,
        FUNDING_FAILED,
        CANCELLED
    }

    struct Campaign {
        string name;
        address donationToken;
        uint256 goal;
        uint256 requiredBond;
        address organizer;
        bool bondLocked;
        uint256 bondAmount;
        uint256 totalContributed;
    }

    uint256 public nextCampaignId;
    address public immutable resolver;
    mapping(uint256 campaignId => Campaign) public campaigns;
    mapping(uint256 campaignId => uint256) public fundingDeadlines;
    mapping(uint256 campaignId => CampaignState) public campaignState;
    mapping(uint256 campaignId => mapping(address donor => uint256)) public contributions;
    mapping(uint256 campaignId => mapping(address donor => bool)) public claimedRefund;
    mapping(uint256 campaignId => uint256) public refundPool;
    mapping(uint256 campaignId => bool) public refundSnapshotted;

    event CampaignCreated(
        uint256 indexed campaignId,
        string name,
        address donationToken,
        uint256 goal,
        uint256 requiredBond
    );
    event BondLocked(uint256 indexed campaignId, address indexed organizer, uint256 amount);
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event CampaignApproved(uint256 indexed campaignId, address indexed resolver);
    event CampaignPublished(uint256 indexed campaignId, uint256 fundingDeadline);
    event FundingFinalized(uint256 indexed campaignId, CampaignState state);
    event CampaignCancelled(uint256 indexed campaignId, address indexed organizer);
    event RefundPoolSnapshotted(uint256 indexed campaignId, uint256 amount);
    event BondReturned(uint256 indexed campaignId, address indexed organizer, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);

    constructor() {
        resolver = msg.sender;
    }

    function createCampaign(
        string calldata name,
        address donationToken,
        uint256 goal,
        uint256 requiredBond,
        uint256 fundingDeadline
    ) external returns (uint256 campaignId) {
        require(bytes(name).length > 0, "name required");
        require(donationToken != address(0), "token required");
        require(goal > 0, "goal required");
        require(requiredBond > 0, "bond required");
        require(fundingDeadline > block.timestamp, "deadline required");

        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            name: name,
            donationToken: donationToken,
            goal: goal,
            requiredBond: requiredBond,
            organizer: msg.sender,
            bondLocked: false,
            bondAmount: 0,
            totalContributed: 0
        });
        fundingDeadlines[campaignId] = fundingDeadline;
        campaignState[campaignId] = CampaignState.DRAFT;
        emit CampaignCreated(campaignId, name, donationToken, goal, requiredBond);
    }

    function approveCampaign(uint256 campaignId) external {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == resolver, "only resolver");
        require(campaignState[campaignId] == CampaignState.DRAFT, "invalid state");

        campaignState[campaignId] = CampaignState.APPROVED;
        emit CampaignApproved(campaignId, msg.sender);
    }

    function publishCampaign(uint256 campaignId) external {
        require(campaignId < nextCampaignId, "unknown campaign");

        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        require(campaignState[campaignId] == CampaignState.APPROVED, "invalid state");
        require(campaign.bondLocked, "bond not locked");
        require(fundingDeadlines[campaignId] > block.timestamp, "deadline passed");

        campaignState[campaignId] = CampaignState.FUNDING;
        emit CampaignPublished(campaignId, fundingDeadlines[campaignId]);
    }

    function lockBond(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");

        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        require(
            campaignState[campaignId] == CampaignState.DRAFT
                || campaignState[campaignId] == CampaignState.APPROVED,
            "invalid state"
        );
        require(!campaign.bondLocked, "bond already locked");

        IERC20(campaign.donationToken)
            .safeTransferFrom(msg.sender, address(this), campaign.requiredBond);
        campaign.bondLocked = true;
        campaign.bondAmount = campaign.requiredBond;
        emit BondLocked(campaignId, msg.sender, campaign.requiredBond);
    }

    function donate(uint256 campaignId, uint256 amount) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(amount > 0, "amount required");

        Campaign storage campaign = campaigns[campaignId];
        require(campaignState[campaignId] == CampaignState.FUNDING, "invalid state");
        require(block.timestamp < fundingDeadlines[campaignId], "deadline passed");
        require(campaign.totalContributed + amount <= campaign.goal, "exceeds goal");

        campaign.totalContributed += amount;
        contributions[campaignId][msg.sender] += amount;
        IERC20(campaign.donationToken).safeTransferFrom(msg.sender, address(this), amount);
        emit DonationReceived(campaignId, msg.sender, amount);

        if (campaign.totalContributed == campaign.goal) {
            campaignState[campaignId] = CampaignState.FUNDED;
            emit FundingFinalized(campaignId, CampaignState.FUNDED);
        }
    }

    function cancelCampaign(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");

        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        CampaignState state = campaignState[campaignId];
        require(
            state == CampaignState.DRAFT || state == CampaignState.APPROVED
                || state == CampaignState.FUNDING,
            "invalid state"
        );

        campaignState[campaignId] = CampaignState.CANCELLED;
        emit CampaignCancelled(campaignId, msg.sender);
        _snapshotRefundAndReturnBond(campaignId);
    }

    function finalizeFundingFailure(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        Campaign storage campaign = campaigns[campaignId];
        require(campaignState[campaignId] == CampaignState.FUNDING, "invalid state");
        require(block.timestamp >= fundingDeadlines[campaignId], "deadline not reached");
        require(campaign.totalContributed < campaign.goal, "goal reached");

        campaignState[campaignId] = CampaignState.FUNDING_FAILED;
        emit FundingFinalized(campaignId, CampaignState.FUNDING_FAILED);
        _snapshotRefundAndReturnBond(campaignId);
    }

    function claimRefund(uint256 campaignId) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(refundSnapshotted[campaignId], "refund unavailable");
        require(!claimedRefund[campaignId][msg.sender], "refund already claimed");

        uint256 amount = contributions[campaignId][msg.sender];
        require(amount > 0, "no contribution");
        claimedRefund[campaignId][msg.sender] = true;
        IERC20(campaigns[campaignId].donationToken).safeTransfer(msg.sender, amount);
        emit RefundClaimed(campaignId, msg.sender, amount);
    }

    function _snapshotRefundAndReturnBond(uint256 campaignId) internal {
        Campaign storage campaign = campaigns[campaignId];
        // Pre-funded termination refunds accepted contributions exactly, excluding bond and unsolicited tokens.
        refundPool[campaignId] = campaign.totalContributed;
        refundSnapshotted[campaignId] = true;
        emit RefundPoolSnapshotted(campaignId, campaign.totalContributed);

        uint256 amount = campaign.bondAmount;
        campaign.bondAmount = 0;
        campaign.bondLocked = false;
        if (amount > 0) {
            IERC20(campaign.donationToken).safeTransfer(campaign.organizer, amount);
            emit BondReturned(campaignId, campaign.organizer, amount);
        }
    }
}
