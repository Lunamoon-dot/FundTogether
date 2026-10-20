// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../src/campaigns/VNextTypes.sol";

contract VNextCampaignHandler is Test {
    MockUSDC public immutable token;
    MockReviewFinality public immutable review;
    CampaignEscrowVNext public immutable escrow;
    uint256 public immutable campaignId;
    uint256 public immutable fundingDeadline;
    address public immutable creator;
    address public immutable payout;
    address public immutable backerOne;
    address public immutable backerTwo;

    constructor() {
        creator = makeAddr("campaign-invariant-creator");
        payout = makeAddr("campaign-invariant-payout");
        backerOne = makeAddr("campaign-invariant-backer-one");
        backerTwo = makeAddr("campaign-invariant-backer-two");
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 1 days, 7 days, 7 days
        );

        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("campaign-invariant-criteria");
        vm.prank(creator);
        campaignId = escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 1 days,
            budgets,
            criteria,
            keccak256("campaign-invariant-publication")
        );
        review.setFinalOutcome(
            escrow.publicationReviewCase(campaignId), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        escrow.finalizePublication(campaignId);
        fundingDeadline = block.timestamp + 1 days;
    }

    function contribute(uint96 rawAmount, uint8 actorIndex) external {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.FUNDING) return;

        uint256 raised = escrow.campaignRaised(campaignId);
        uint256 remaining = escrow.campaignGoal(campaignId) - raised;
        if (remaining == 0) return;

        address backer = actorIndex % 2 == 0 ? backerOne : backerTwo;
        uint256 amount = bound(uint256(rawAmount), 1, remaining);
        token.mint(backer, amount);
        vm.prank(backer);
        token.approve(address(escrow), amount);
        vm.prank(backer);
        escrow.contribute(campaignId, amount);
    }

    function finalizeFunding() external {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.FUNDING) return;
        vm.warp(fundingDeadline + 1);
        escrow.finalizeFunding(campaignId);
    }

    function submitFinalPass() external {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.MILESTONES_RUNNING) return;
        if (escrow.milestoneState(campaignId, 0) != VNextTypes.MilestoneState.PENDING) return;

        vm.prank(creator);
        bytes32 reviewCaseId = escrow.submitMilestoneEvidence(
            campaignId, 0, keccak256("campaign-invariant-evidence")
        );
        review.setFinalOutcome(reviewCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);
    }

    function payAfterChallengeWindow() external {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.MILESTONES_RUNNING) return;
        if (escrow.milestoneState(campaignId, 0) != VNextTypes.MilestoneState.CHALLENGE_WINDOW) {
            return;
        }

        vm.warp(block.timestamp + 7 days + 1);
        try escrow.payMilestone(campaignId, 0) { } catch { }
    }

    function expireMilestone() external {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.MILESTONES_RUNNING) return;
        if (escrow.milestoneState(campaignId, 0) != VNextTypes.MilestoneState.PENDING) return;

        vm.warp(escrow.milestoneSubmissionDeadline(campaignId, 0) + 1);
        escrow.expireMilestoneSubmission(campaignId, 0);
    }

    function allocateAndClaimRefunds() external {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.REFUNDING) return;

        escrow.freezeRefundAllocations(campaignId, 2);
        vm.prank(backerOne);
        try escrow.claimRefund(campaignId) { } catch { }
        vm.prank(backerTwo);
        try escrow.claimRefund(campaignId) { } catch { }
    }
}

contract VNextCampaignInvariantTest is StdInvariant, Test {
    VNextCampaignHandler private handler;

    function setUp() public {
        handler = new VNextCampaignHandler();
        targetContract(address(handler));
    }

    function invariant_contributionConservation() public view {
        uint256 raised = handler.escrow().campaignRaised(handler.campaignId());
        uint256 paidOut = handler.escrow().campaignPaidOut(handler.campaignId());
        uint256 refunded = handler.escrow().campaignRefunded(handler.campaignId());
        uint256 held = handler.token().balanceOf(address(handler.escrow()));

        assertEq(raised, paidOut + refunded + held);
    }

    function invariant_payoutNeverExceedsGoal() public view {
        assertLe(
            handler.escrow().campaignPaidOut(handler.campaignId()),
            handler.escrow().campaignGoal(handler.campaignId())
        );
    }
}
