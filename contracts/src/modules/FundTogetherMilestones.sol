pragma solidity 0.8.24;

import { FundTogetherBase } from "./FundTogetherBase.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Sequential activation, donor challenges and unchallenged settlement.
abstract contract FundTogetherMilestones is FundTogetherBase {
    using SafeERC20 for IERC20;

    function milestoneCount(uint256 campaignId) external view returns (uint256) {
        require(campaignId < nextCampaignId, "unknown campaign");
        return milestones[campaignId].length;
    }

    function activateMilestone(uint256 campaignId, uint256 milestoneIndex) external nonReentrant {
        require(campaignId < nextCampaignId, "unknown campaign");
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.organizer, "only organizer");
        require(
            campaignState[campaignId] == CampaignState.FUNDED
                || campaignState[campaignId] == CampaignState.MILESTONE_SETTLED,
            "invalid state"
        );
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not next milestone");
        require(block.timestamp < activationDeadlines[campaignId], "activation deadline passed");

        Milestone storage milestone = milestones[campaignId][milestoneIndex];
        require(
            campaign.bondLocked && campaign.bondAmount >= milestone.budget, "bond coverage required"
        );
        milestone.state = MilestoneState.ACTIVE;
        campaignState[campaignId] = CampaignState.MILESTONE_ACTIVE;
        activationDeadlines[campaignId] = 0;
        _setEvidenceDeadline(campaignId, milestoneIndex, EVIDENCE_WINDOW);
        emit MilestoneActivated(campaignId, milestoneIndex, milestone.budget);
    }

    function openChallenge(uint256 campaignId, uint256 milestoneIndex, bytes32 reasonHash)
        external
        virtual
        nonReentrant
    {
        _openChallenge(campaignId, milestoneIndex, reasonHash);
    }

    function _openChallenge(uint256 campaignId, uint256 milestoneIndex, bytes32 reasonHash)
        internal
    {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(campaignState[campaignId] == CampaignState.IN_REVIEW, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(contributions[campaignId][msg.sender] > 0, "no contribution");
        require(reasonHash != bytes32(0), "reason required");
        require(
            block.timestamp < milestoneEvidence[campaignId][milestoneIndex].reviewEnd,
            "review ended"
        );
        milestones[campaignId][milestoneIndex].state = MilestoneState.CHALLENGED;
        campaignState[campaignId] = CampaignState.CHALLENGED;
        emit ChallengeOpened(campaignId, milestoneIndex, msg.sender, reasonHash);
    }

    function settleMilestone(uint256 campaignId, uint256 milestoneIndex) external nonReentrant {
        _settleMilestone(campaignId, milestoneIndex);
    }

    function _settleMilestone(uint256 campaignId, uint256 milestoneIndex) internal {
        require(campaignId < nextCampaignId, "unknown campaign");
        require(campaignState[campaignId] == CampaignState.IN_REVIEW, "invalid state");
        require(milestoneIndex == currentMilestoneIndex[campaignId], "not current milestone");
        require(
            block.timestamp >= milestoneEvidence[campaignId][milestoneIndex].reviewEnd,
            "review not ended"
        );
        Campaign storage campaign = campaigns[campaignId];
        Milestone storage milestone = milestones[campaignId][milestoneIndex];
        milestone.state = MilestoneState.SETTLED;
        totalReleased[campaignId] += milestone.budget;
        currentMilestoneIndex[campaignId] = milestoneIndex + 1;
        bool completed = milestoneIndex + 1 == milestones[campaignId].length;
        campaignState[campaignId] =
            completed ? CampaignState.COMPLETED : CampaignState.MILESTONE_SETTLED;
        if (!completed) _setActivationDeadline(campaignId, milestoneIndex + 1);
        IERC20(campaign.donationToken).safeTransfer(campaign.organizer, milestone.budget);
        emit MilestoneSettled(campaignId, milestoneIndex, milestone.budget);
        if (completed) {
            _returnBond(campaignId);
            emit CampaignCompleted(campaignId);
        }
    }
}
