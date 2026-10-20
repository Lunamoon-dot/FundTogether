// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";

contract VNextFundingEscrowTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("vnext-funding-creator");
    address private payout = makeAddr("vnext-funding-payout");
    address private backerOne = makeAddr("vnext-backer-one");
    address private backerTwo = makeAddr("vnext-backer-two");
    uint256 private campaignId;

    function setUp() public {
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 2 days, 7 days, 7 days
        );

        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("milestone");
        vm.prank(creator);
        campaignId = escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
        review.setFinalOutcome(
            escrow.publicationReviewCase(campaignId), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        escrow.finalizePublication(campaignId);
    }

    function test_contributionsAreHeldInEscrowAndSuccessDoesNotPayout() public {
        _fund(backerOne, 60e6);
        _fund(backerTwo, 40e6);

        escrow.finalizeFunding(campaignId);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDED));
        assertEq(token.balanceOf(address(escrow)), 100e6);
        assertEq(token.balanceOf(payout), 0);
        assertEq(escrow.contributionOf(campaignId, backerOne), 60e6);
        assertEq(escrow.contributionOf(campaignId, backerTwo), 40e6);
    }

    function test_fundingFinalizationIsIdempotent() public {
        _fund(backerOne, 100e6);

        escrow.finalizeFunding(campaignId);
        escrow.finalizeFunding(campaignId);

        assertEq(token.balanceOf(address(escrow)), 100e6);
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDED));
    }

    function test_failedFundingOpensFullRefund() public {
        _fund(backerOne, 25e6);
        _fund(backerTwo, 15e6);
        vm.warp(block.timestamp + 7 days);

        escrow.finalizeFunding(campaignId);
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.REFUNDING));
        escrow.freezeRefundAllocations(campaignId, 10);

        vm.prank(backerOne);
        escrow.claimRefund(campaignId);
        vm.prank(backerTwo);
        escrow.claimRefund(campaignId);

        assertEq(token.balanceOf(backerOne), 25e6);
        assertEq(token.balanceOf(backerTwo), 15e6);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_CreatorInactiveOpensRefundAfterSubmissionDeadline() public {
        _fund(backerOne, 25e6);
        vm.warp(block.timestamp + 7 days);
        escrow.finalizeFunding(campaignId);

        vm.warp(block.timestamp + 7 days);
        escrow.expireMilestoneSubmission(campaignId, 0);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.REFUNDING));
        escrow.freezeRefundAllocations(campaignId, 10);
        vm.prank(backerOne);
        escrow.claimRefund(campaignId);
        assertEq(token.balanceOf(backerOne), 25e6);
    }

    function test_TimeoutIsPermissionless() public {
        _fund(backerOne, 25e6);
        vm.warp(block.timestamp + 7 days);
        escrow.finalizeFunding(campaignId);
        vm.warp(block.timestamp + 7 days);

        vm.prank(makeAddr("unrelated-timeout-caller"));
        escrow.expireMilestoneSubmission(campaignId, 0);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.REFUNDING));
    }

    function _fund(address backer, uint256 amount) private {
        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(escrow), amount);
        escrow.contribute(campaignId, amount);
        vm.stopPrank();
    }
}
