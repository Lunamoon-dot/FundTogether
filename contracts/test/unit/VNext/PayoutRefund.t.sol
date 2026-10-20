// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";

contract VNextPayoutRefundTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("vnext-payout-creator");
    address private payout = makeAddr("vnext-payout-wallet");
    address private backer = makeAddr("vnext-payout-backer");
    address private secondBacker = makeAddr("vnext-payout-second-backer");
    uint256 private campaignId;

    function setUp() public {
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 2 days, 7 days, 7 days
        );

        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 60e6;
        budgets[1] = 40e6;
        bytes32[] memory criteria = new bytes32[](2);
        criteria[0] = keccak256("milestone-one");
        criteria[1] = keccak256("milestone-two");
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

        token.mint(backer, 100e6);
        vm.startPrank(backer);
        token.approve(address(escrow), 100e6);
        escrow.contribute(campaignId, 100e6);
        vm.stopPrank();
        escrow.finalizeFunding(campaignId);
    }

    function test_payoutRequiresFinalPassAndClosedChallengeWindow() public {
        bytes32 reviewCaseId = _submitEvidence(0, keccak256("evidence-one"));
        review.setFinalOutcome(reviewCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);

        vm.expectRevert(CampaignEscrowVNext.ChallengeWindowOpen.selector);
        escrow.payMilestone(campaignId, 0);

        vm.warp(block.timestamp + 2 days);
        escrow.payMilestone(campaignId, 0);

        assertEq(token.balanceOf(payout), 60e6);
        assertEq(uint8(escrow.milestoneState(campaignId, 0)), uint8(VNextTypes.MilestoneState.PAID));
    }

    function test_duplicatePayoutCannotSpendEscrowTwice() public {
        bytes32 reviewCaseId = _submitEvidence(0, keccak256("evidence-one"));
        review.setFinalOutcome(reviewCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);
        vm.warp(block.timestamp + 2 days);
        escrow.payMilestone(campaignId, 0);

        vm.expectRevert(CampaignEscrowVNext.MilestoneAlreadyPaid.selector);
        escrow.payMilestone(campaignId, 0);
    }

    function test_terminalFailureRefundsRemainingPoolProRata() public {
        bytes32 firstCase = _submitEvidence(0, keccak256("evidence-one"));
        review.setFinalOutcome(firstCase, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);
        vm.warp(block.timestamp + 2 days);
        escrow.payMilestone(campaignId, 0);

        bytes32 secondCase = _submitEvidence(1, keccak256("evidence-two"));
        review.setFinalOutcome(secondCase, VNextTypes.ReviewOutcome.PROTOCOL_FAIL);
        escrow.syncFinalRuling(campaignId, 1);
        escrow.freezeRefundAllocations(campaignId, 10);

        vm.prank(backer);
        escrow.claimRefund(campaignId);
        assertEq(token.balanceOf(backer), 40e6);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_activeChallengeBlocksPayoutUntilCanonicalResolution() public {
        bytes32 reviewCaseId = _submitEvidence(0, keccak256("evidence-one"));
        review.setFinalOutcome(reviewCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);

        vm.prank(backer);
        bytes32 challengeCaseId =
            escrow.openChallenge(campaignId, 0, keccak256("challenge-evidence"));

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(CampaignEscrowVNext.ChallengeActive.selector);
        escrow.payMilestone(campaignId, 0);

        review.setFinalOutcome(challengeCaseId, VNextTypes.ReviewOutcome.VERDICT_FAIL);
        escrow.resolveChallenge(campaignId, 0);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.REFUNDING));
    }

    function test_EnforceRefundAllocationBeforeClaim() public {
        uint256 smallCampaign = _createPartialRefundCampaign();

        vm.prank(backer);
        vm.expectRevert(CampaignEscrowVNext.RefundAllocationIncomplete.selector);
        escrow.claimRefund(smallCampaign);

        escrow.freezeRefundAllocations(smallCampaign, 1);
        vm.prank(backer);
        vm.expectRevert(CampaignEscrowVNext.RefundAllocationIncomplete.selector);
        escrow.claimRefund(smallCampaign);

        escrow.freezeRefundAllocations(smallCampaign, 10);
        vm.prank(backer);
        escrow.claimRefund(smallCampaign);
        vm.prank(secondBacker);
        escrow.claimRefund(smallCampaign);
        assertEq(
            escrow.campaignRefunded(smallCampaign), escrow.campaignRefundPool(smallCampaign)
        );
    }

    function test_AllRefundClaimsConsumeSnapshotPool() public {
        uint256 smallCampaign = _createPartialRefundCampaign();
        escrow.freezeRefundAllocations(smallCampaign, 10);

        vm.prank(secondBacker);
        escrow.claimRefund(smallCampaign);
        vm.prank(backer);
        escrow.claimRefund(smallCampaign);

        assertEq(
            escrow.campaignRefunded(smallCampaign), escrow.campaignRefundPool(smallCampaign)
        );
        assertEq(token.balanceOf(address(escrow)), 100e6);
    }

    function test_RefundEntitlementIsIndependentOfClaimOrder() public {
        uint256 smallCampaign = _createPartialRefundCampaign();
        escrow.freezeRefundAllocations(smallCampaign, 10);

        assertEq(escrow.refundEntitlement(smallCampaign, backer), 0);
        assertEq(escrow.refundEntitlement(smallCampaign, secondBacker), 1);

        vm.prank(secondBacker);
        escrow.claimRefund(smallCampaign);
        vm.prank(backer);
        escrow.claimRefund(smallCampaign);

        assertTrue(escrow.refundClaimed(smallCampaign, backer));
        assertTrue(escrow.refundClaimed(smallCampaign, secondBacker));
        assertEq(token.balanceOf(backer), 0);
        assertEq(token.balanceOf(secondBacker), 1);
    }

    function _submitEvidence(uint256 milestoneId, bytes32 evidenceHash)
        private
        returns (bytes32 reviewCaseId)
    {
        vm.prank(creator);
        reviewCaseId = escrow.submitMilestoneEvidence(campaignId, milestoneId, evidenceHash);
    }

    function _createPartialRefundCampaign() private returns (uint256 smallCampaign) {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 2;
        budgets[1] = 1;
        bytes32[] memory criteria = new bytes32[](2);
        criteria[0] = keccak256("small-one");
        criteria[1] = keccak256("small-two");
        vm.prank(creator);
        smallCampaign = escrow.createCampaign(
            payout,
            3,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("small-publication")
        );
        review.setFinalOutcome(
            escrow.publicationReviewCase(smallCampaign), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        escrow.finalizePublication(smallCampaign);

        token.mint(backer, 1);
        token.mint(secondBacker, 2);
        vm.startPrank(backer);
        token.approve(address(escrow), 1);
        escrow.contribute(smallCampaign, 1);
        vm.stopPrank();
        vm.startPrank(secondBacker);
        token.approve(address(escrow), 2);
        escrow.contribute(smallCampaign, 2);
        vm.stopPrank();
        escrow.finalizeFunding(smallCampaign);

        bytes32 firstCase = _submitEvidenceFor(smallCampaign, 0, keccak256("small-evidence"));
        review.setFinalOutcome(firstCase, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(smallCampaign, 0);
        vm.warp(block.timestamp + 2 days);
        escrow.payMilestone(smallCampaign, 0);

        vm.warp(block.timestamp + 7 days);
        escrow.expireMilestoneSubmission(smallCampaign, 1);
    }

    function _submitEvidenceFor(uint256 id, uint256 milestoneId, bytes32 evidenceHash)
        private
        returns (bytes32 reviewCaseId)
    {
        vm.prank(creator);
        reviewCaseId = escrow.submitMilestoneEvidence(id, milestoneId, evidenceHash);
    }
}
