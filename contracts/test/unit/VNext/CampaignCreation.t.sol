// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";

contract VNextCampaignCreationTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("vnext-campaign-creator");
    address private payout = makeAddr("vnext-campaign-payout");

    function setUp() public {
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 2 days
        );
    }

    function test_anyWalletCreatesFrozenCampaignWithMilestones() public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 40e6;
        budgets[1] = 60e6;
        bytes32[] memory criteria = new bytes32[](2);
        criteria[0] = keccak256("draft");
        criteria[1] = keccak256("final");

        bytes32 publicationEvidence = keccak256("publication-evidence");
        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(
            payout, 100e6, block.timestamp + 7 days, budgets, criteria, publicationEvidence
        );

        assertEq(escrow.campaignCreator(campaignId), creator);
        assertEq(escrow.campaignPayoutWallet(campaignId), payout);
        assertEq(escrow.campaignGoal(campaignId), 100e6);
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.CREATED));
        assertEq(escrow.publicationEvidenceHash(campaignId), publicationEvidence);
        assertTrue(escrow.publicationReviewCase(campaignId) != bytes32(0));
        assertEq(escrow.milestoneBudget(campaignId, 0), 40e6);
        assertEq(escrow.milestoneBudget(campaignId, 1), 60e6);
        assertTrue(escrow.campaignTermsHash(campaignId) != bytes32(0));
    }

    function test_rejectsInvalidFrozenTerms() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 101e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("over-budget");

        vm.prank(creator);
        vm.expectRevert(CampaignEscrowVNext.InvalidTerms.selector);
        escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
    }

    function test_publicationPassOpensPermissionlessFunding() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("final");

        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(
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

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDING));
        assertEq(
            uint8(escrow.publicationOutcome(campaignId)), uint8(VNextTypes.ReviewOutcome.FINAL_PASS)
        );
    }
}
