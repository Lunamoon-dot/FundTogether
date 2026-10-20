// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../../src/campaigns/CampaignEscrowVNext.sol";
import { IVNextEvents } from "../../../src/interfaces/IVNextEvents.sol";
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

    function test_payoutEmitsCanonicalStateForPaidAndNextMilestone() public {
        bytes32 reviewCaseId = _submitEvidence(0, keccak256("evidence-payout-state"));
        review.setFinalOutcome(reviewCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);
        vm.warp(block.timestamp + 2 days);

        vm.recordLogs();
        escrow.payMilestone(campaignId, 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 signature = keccak256(
            "MilestoneStateChanged(uint256,uint256,uint256,bytes32,bytes32,uint8,uint8,uint256,uint256,uint256,bool)"
        );
        uint256 stateEvents;
        bool sawPaid;
        bool sawNext;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != signature) continue;
            stateEvents++;
            if (uint256(logs[i].topics[2]) == 0) sawPaid = true;
            if (uint256(logs[i].topics[2]) == 1) sawNext = true;
        }
        assertEq(stateEvents, 2);
        assertTrue(sawPaid);
        assertTrue(sawNext);
    }

    function test_createCampaignEmitsConfigurationForEveryMilestone() public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 30e6;
        budgets[1] = 70e6;
        bytes32[] memory criteria = new bytes32[](2);
        criteria[0] = keccak256("configured-one");
        criteria[1] = keccak256("configured-two");

        vm.recordLogs();
        vm.prank(creator);
        uint256 configuredCampaignId = escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("configured-publication")
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 signature = keccak256(
            "MilestoneConfigured(uint256,uint256,uint256,bytes32)"
        );
        uint256 configured;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != signature) continue;
            configured++;
            assertEq(uint256(logs[i].topics[1]), configuredCampaignId);
            uint256 milestoneId = uint256(logs[i].topics[2]);
            (uint256 budget, bytes32 criteriaHash) = abi.decode(logs[i].data, (uint256, bytes32));
            assertEq(budget, budgets[milestoneId]);
            assertEq(criteriaHash, criteria[milestoneId]);
        }
        assertEq(configured, 2);
    }

    function test_CannotExpireInactiveFutureMilestone() public {
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDED));
        assertEq(uint8(escrow.milestoneState(campaignId, 1)), uint8(VNextTypes.MilestoneState.PENDING));
        assertEq(escrow.milestoneSubmissionDeadline(campaignId, 1), 0);

        vm.expectRevert(CampaignEscrowVNext.MilestoneDeadlineExpired.selector);
        escrow.expireMilestoneSubmission(campaignId, 1);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDED));
        assertEq(uint8(escrow.milestoneState(campaignId, 1)), uint8(VNextTypes.MilestoneState.PENDING));
    }

    function test_CannotExpireActiveMilestoneEarly() public {
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDED));
        assertGt(escrow.milestoneSubmissionDeadline(campaignId, 0), block.timestamp);

        vm.expectRevert(CampaignEscrowVNext.MilestoneDeadlineExpired.selector);
        escrow.expireMilestoneSubmission(campaignId, 0);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDED));
        assertEq(uint8(escrow.milestoneState(campaignId, 0)), uint8(VNextTypes.MilestoneState.PENDING));
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

    function test_successfulChallengeResolutionEmitsCanonicalMilestoneState() public {
        bytes32 reviewCaseId = _submitEvidence(0, keccak256("evidence-challenge-pass"));
        review.setFinalOutcome(reviewCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);

        vm.prank(backer);
        bytes32 challengeCaseId =
            escrow.openChallenge(campaignId, 0, keccak256("challenge-pass-evidence"));
        review.setFinalOutcome(challengeCaseId, VNextTypes.ReviewOutcome.FINAL_PASS);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit IVNextEvents.MilestoneStateChanged(
            campaignId,
            0,
            1,
            keccak256("evidence-challenge-pass"),
            reviewCaseId,
            uint8(VNextTypes.ReviewOutcome.FINAL_PASS),
            uint8(VNextTypes.MilestoneState.CHALLENGE_WINDOW),
            0,
            0,
            block.timestamp,
            false
        );
        escrow.resolveChallenge(campaignId, 0);
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
