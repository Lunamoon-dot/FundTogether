pragma solidity 0.8.24;

import { FundTogetherBase } from "./FundTogetherBase.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Campaign setup, admission, funding, bond locking and donor refunds.
abstract contract FundTogetherFunding is FundTogetherBase {
    using SafeERC20 for IERC20;

    function createCampaign(
        string calldata name,
        address donationToken,
        uint256 fundingDeadline,
        uint256[] calldata milestoneBudgets
    ) public virtual returns (uint256 campaignId) {
        require(bytes(name).length > 0, "name required");
        require(donationToken != address(0), "token required");
        require(fundingDeadline > block.timestamp, "deadline required");
        require(milestoneBudgets.length > 0, "milestones required");

        campaignId = nextCampaignId;
        uint256 goal = 0;
        uint256 requiredBond = 0;
        for (uint256 i; i < milestoneBudgets.length; ++i) {
            uint256 budget = milestoneBudgets[i];
            require(budget > 0, "budget required");
            goal += budget;
            if (budget > requiredBond) requiredBond = budget;
            milestones[campaignId].push(
                Milestone({ budget: budget, state: MilestoneState.PENDING })
            );
        }

        nextCampaignId++;
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
        for (uint256 i; i < milestoneBudgets.length; ++i) {
            emit MilestoneConfigured(campaignId, i, milestoneBudgets[i]);
        }
    }

    function configureMilestoneCriteria(
        uint256 campaignId,
        uint256 milestoneIndex,
        bytes32 criteriaHash
    ) public {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == campaigns[campaignId].organizer, "only organizer");
        require(campaignState[campaignId] == CampaignState.DRAFT, "invalid state");
        require(milestoneIndex < milestones[campaignId].length, "unknown milestone");
        require(criteriaHash != bytes32(0), "criteria required");
        milestoneCriteria[campaignId][milestoneIndex] = criteriaHash;
        emit MilestoneCriteriaConfigured(campaignId, milestoneIndex, criteriaHash);
    }

    function approveCampaign(uint256 campaignId) external {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(msg.sender == resolver, "only resolver");
        require(campaignState[campaignId] == CampaignState.DRAFT, "invalid state");
        for (uint256 i; i < milestones[campaignId].length; ++i) {
            require(milestoneCriteria[campaignId][i] != bytes32(0), "criteria not configured");
        }

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

    function lockBond(uint256 campaignId) public nonReentrant {
        _lockBond(campaignId);
    }

    function _lockBond(uint256 campaignId) internal {
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
            _setActivationDeadline(campaignId, 0);
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

        uint256 contribution = contributions[campaignId][msg.sender];
        require(contribution > 0, "no contribution");
        uint256 amount = Math.mulDiv(
            contribution, refundPool[campaignId], campaigns[campaignId].totalContributed
        );
        claimedRefund[campaignId][msg.sender] = true;
        _recordRefundClaim(campaignId, contribution, amount);
        emit RefundClaimed(campaignId, msg.sender, amount);
        if (amount > 0) {
            IERC20(campaigns[campaignId].donationToken).safeTransfer(msg.sender, amount);
        }
    }

    function _recordRefundClaim(uint256, uint256, uint256) internal virtual { }
}
