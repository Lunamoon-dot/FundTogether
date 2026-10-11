pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { FundTogetherDisbursement } from "../../../src/FundTogetherDisbursement.sol";
import { DisbursementTypes as T } from "../../../src/disbursement/DisbursementTypes.sol";

contract HedFundingAndReservationTest is Test {
    MockUSDC private token;
    FundTogetherDisbursement private disbursement;
    address private organizer = makeAddr("organizer");
    address private resolver = makeAddr("resolver");
    address private backupResolver = makeAddr("backup-resolver");
    address private donor = makeAddr("donor");
    address private vendor = makeAddr("vendor");

    function setUp() public {
        token = new MockUSDC();
        disbursement = new FundTogetherDisbursement(address(token), resolver, backupResolver, keccak256("hed-mvp-1"));
        token.mint(donor, 4_000e6);
        vm.prank(donor);
        token.approve(address(disbursement), type(uint256).max);
    }

    function test_fullFundingReservesWholeRequestAmountBeforeAnyVendorPayout() public {
        vm.prank(organizer);
        uint256 campaignId = disbursement.createCampaign(keccak256("campaign"), 2_000e6, 1 days);
        vm.prank(donor);
        disbursement.donate(campaignId, 2_000e6);
        vm.prank(resolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.prank(organizer);
        disbursement.createActivity(campaignId, keccak256("activity"), 1_000e6);
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 200e6);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        T.RequestView memory request = disbursement.request(campaignId, requestId);
        assertEq(campaign.available, 1_000e6);
        assertEq(campaign.reserved, 1_000e6);
        assertEq(request.grossPaid, 0);
        assertEq(token.balanceOf(address(disbursement)), 2_000e6);
    }

    function test_backupCanOnlyTakeOverEligibilityAfterPrimaryWindow() public {
        vm.prank(organizer);
        uint256 campaignId = disbursement.createCampaign(keccak256("campaign"), 2_000e6, 1 days);
        vm.prank(donor);
        disbursement.donate(campaignId, 2_000e6);
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(backupResolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.warp(block.timestamp + 3 days);
        vm.prank(backupResolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        assertEq(uint256(disbursement.campaign(campaignId).state), uint256(T.CampaignState.ACTIVE));
    }

    function test_vendorAcknowledgementLocksRecipientAndPaysOnlyExactDeposit() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 200e6);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        disbursement.payDeposit(campaignId, requestId);
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        T.RequestView memory request = disbursement.request(campaignId, requestId);
        assertEq(token.balanceOf(vendor), 200e6);
        assertEq(campaign.reserved, 800e6);
        assertEq(campaign.grossPaid, 200e6);
        assertEq(request.grossPaid, 200e6);
    }

    function test_secondRequestCannotBypassTheSingleOpenFinancialSlot() public {
        uint256 campaignId = _activeCampaign();
        vm.startPrank(organizer);
        disbursement.submitRequest(campaignId, 0, keccak256("first"), vendor, 1_000e6, 0);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.submitRequest(campaignId, 0, keccak256("second"), vendor, 500e6, 0);
        vm.stopPrank();
    }

    function test_approvalRejectsDepositAboveRequestOrCampaignPolicyCap() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 overRequestCap = disbursement.submitRequest(campaignId, 0, keccak256("request-cap"), vendor, 1_000e6, 201e6);
        vm.expectRevert(FundTogetherDisbursement.InvalidInput.selector);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, overRequestCap, keccak256("request-cap"));

        uint256 otherCampaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 overCampaignCap = disbursement.submitRequest(otherCampaignId, 0, keccak256("campaign-cap"), vendor, 900e6, 201e6);
        vm.expectRevert(FundTogetherDisbursement.InvalidInput.selector);
        vm.prank(resolver);
        disbursement.approveRequest(otherCampaignId, overCampaignCap, keccak256("campaign-cap"));
    }

    function test_partialFinalPaymentKeepsSlotUntilResidualIsResolved() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 200e6);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        disbursement.payDeposit(campaignId, requestId);
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 700e6, keccak256("delivery"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.executeFinal(campaignId, requestId);
        vm.warp(block.timestamp + 3 days);
        disbursement.executeFinal(campaignId, requestId);
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        assertEq(token.balanceOf(vendor), 700e6);
        assertEq(campaign.reserved, 300e6);
        assertTrue(disbursement.hasOpenRequest(campaignId));
    }

    function test_resolverCanReleasePartialResidualOnlyAfterFinalDecision() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 200e6);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        disbursement.payDeposit(campaignId, requestId);
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 700e6, keccak256("delivery"));
        vm.warp(block.timestamp + 3 days);
        disbursement.executeFinal(campaignId, requestId);
        vm.prank(resolver);
        disbursement.releaseResidual(campaignId, requestId, keccak256("partial-close"));
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        assertEq(campaign.available, 1_300e6);
        assertEq(campaign.reserved, 0);
        assertFalse(disbursement.hasOpenRequest(campaignId));
    }

    function test_donorCaseOpenedDuringChallengeBlocksFinalPayment() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 0);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 1_000e6, keccak256("delivery"));
        vm.prank(donor);
        disbursement.openDeliveryCase(campaignId, requestId, keccak256("conflict"));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.executeFinal(campaignId, requestId);
    }

    function test_openDeliveryCaseAlsoBlocksResidualRelease() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 0);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 700e6, keccak256("delivery"));
        vm.prank(donor);
        disbursement.openDeliveryCase(campaignId, requestId, keccak256("conflict"));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(resolver);
        disbursement.releaseResidual(campaignId, requestId, keccak256("partial-close"));
    }

    function test_resolverUpholdReopensChallengeBeforeFinalPayment() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 0);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 1_000e6, keccak256("delivery"));
        vm.prank(donor);
        disbursement.openDeliveryCase(campaignId, requestId, keccak256("conflict"));
        vm.prank(resolver);
        disbursement.upholdDeliveryCase(campaignId, requestId, keccak256("decision"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.executeFinal(campaignId, requestId);
        vm.warp(block.timestamp + 3 days);
        disbursement.executeFinal(campaignId, requestId);
        assertEq(token.balanceOf(vendor), 1_000e6);
    }

    function test_failedFundingSnapshotsCustodyForDonorRefund() public {
        vm.prank(organizer);
        uint256 campaignId = disbursement.createCampaign(keccak256("campaign"), 2_000e6, 1 days);
        vm.prank(donor);
        disbursement.donate(campaignId, 500e6);
        vm.warp(block.timestamp + 1 days);
        disbursement.finalizeFundingFailure(campaignId);
        uint256 before = token.balanceOf(donor);
        vm.prank(donor);
        disbursement.claimRefund(campaignId);
        assertEq(token.balanceOf(donor), before + 500e6);
    }

    function test_vendorReturnRequiresActualTokenInflowAndCannotExceedGrossPaid() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 200e6);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        disbursement.payDeposit(campaignId, requestId);
        vm.prank(vendor);
        token.approve(address(disbursement), 100e6);
        vm.prank(vendor);
        disbursement.returnFunds(campaignId, requestId, 100e6);
        T.RequestView memory request = disbursement.request(campaignId, requestId);
        assertEq(request.grossPaid, 200e6);
        assertEq(request.returned, 100e6);
        vm.expectRevert(FundTogetherDisbursement.InvalidInput.selector);
        vm.prank(vendor);
        disbursement.returnFunds(campaignId, requestId, 101e6);
    }

    function test_returnAfterCandidateInvalidatesDeliveryDecisionAndUsesNetPaidForReplacementFinal() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 200e6);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(vendor);
        disbursement.acknowledgeVendor(campaignId, requestId, keccak256("terms"));
        disbursement.payDeposit(campaignId, requestId);
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 700e6, keccak256("delivery-one"));
        vm.prank(vendor);
        token.approve(address(disbursement), 100e6);
        vm.prank(vendor);
        disbursement.returnFunds(campaignId, requestId, 100e6);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.executeFinal(campaignId, requestId);
        vm.prank(resolver);
        disbursement.candidateDelivery(campaignId, requestId, 700e6, keccak256("delivery-two"));
        vm.warp(block.timestamp + 3 days);
        disbursement.executeFinal(campaignId, requestId);
        assertEq(token.balanceOf(vendor), 700e6);
    }

    function test_organizerCanCancelOnlyAnUncommittedReservedRequest() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), vendor, 1_000e6, 0);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, requestId, keccak256("request"));
        vm.prank(organizer);
        disbursement.cancelUncommittedRequest(campaignId, requestId, keccak256("cancel"));
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        assertEq(campaign.available, 2_000e6);
        assertEq(campaign.reserved, 0);
        assertFalse(disbursement.hasOpenRequest(campaignId));
    }

    function test_cancelDoesNotReopenActivityGrossApprovalCeiling() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 first = disbursement.submitRequest(campaignId, 0, keccak256("first"), vendor, 800e6, 0);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, first, keccak256("first"));
        vm.prank(organizer);
        disbursement.cancelUncommittedRequest(campaignId, first, keccak256("cancel"));
        vm.prank(organizer);
        uint256 second = disbursement.submitRequest(campaignId, 0, keccak256("second"), vendor, 300e6, 0);
        vm.expectRevert(FundTogetherDisbursement.InvalidInput.selector);
        vm.prank(resolver);
        disbursement.approveRequest(campaignId, second, keccak256("second"));
    }

    function _activeCampaign() private returns (uint256 campaignId) {
        vm.prank(organizer);
        campaignId = disbursement.createCampaign(keccak256("campaign"), 2_000e6, 1 days);
        vm.prank(donor);
        disbursement.donate(campaignId, 2_000e6);
        vm.prank(resolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.prank(organizer);
        disbursement.createActivity(campaignId, keccak256("activity"), 1_000e6);
    }
}
