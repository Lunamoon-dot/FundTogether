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

    function setUp() public {
        token = new MockUSDC();
        disbursement = new FundTogetherDisbursement(address(token), resolver, backupResolver, keccak256("hed-mvp-1"));
        token.mint(donor, 4_000e6);
        vm.prank(donor);
        token.approve(address(disbursement), type(uint256).max);
    }

    function test_fullFundingDisbursesExactAmountToOrganizerUponResolverApproval() public {
        vm.prank(organizer);
        uint256 campaignId = disbursement.createCampaign(keccak256("campaign"), 2_000e6, 1 days);
        vm.prank(donor);
        disbursement.donate(campaignId, 2_000e6);
        vm.prank(resolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.prank(organizer);
        disbursement.createActivity(campaignId, keccak256("activity"), 1_000e6);
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 1_000e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        T.RequestView memory request = disbursement.request(campaignId, requestId);
        assertEq(campaign.available, 1_000e6);
        assertEq(campaign.grossPaid, 1_000e6);
        assertEq(request.grossPaid, 1_000e6);
        assertEq(token.balanceOf(organizer), 1_000e6);
        assertEq(token.balanceOf(address(disbursement)), 1_000e6);
    }

    function testFuzz_disbursementKeepsExactCustody(uint96 rawGoal, uint96 rawRequest) public {
        uint256 goal = bound(uint256(rawGoal), 2e6, 2_000e6);
        uint256 requestAmount = bound(uint256(rawRequest), 1, goal / 2);
        token.mint(donor, goal);
        vm.prank(organizer);
        uint256 campaignId = disbursement.createCampaign(keccak256("fuzz-campaign"), goal, 1 days);
        vm.prank(donor);
        disbursement.donate(campaignId, goal);
        vm.prank(resolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.prank(organizer);
        disbursement.createActivity(campaignId, keccak256("activity"), goal / 2);
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, requestAmount);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));

        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        assertEq(campaign.available, goal - requestAmount);
        assertEq(campaign.grossPaid, requestAmount);
        assertEq(token.balanceOf(organizer), requestAmount);
        assertEq(token.balanceOf(address(disbursement)), goal - requestAmount);
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
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(backupResolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.prank(backupResolver);
        disbursement.takeOverEligibility(campaignId, keccak256("takeover"));
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(resolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        vm.prank(backupResolver);
        disbursement.activateCampaign(campaignId, keccak256("eligibility"));
        assertEq(uint256(disbursement.campaign(campaignId).state), uint256(T.CampaignState.ACTIVE));
    }

    function test_backupRequestTakeoverIsScopedAndBlocksLatePrimaryApproval() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 500e6);
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(backupResolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.warp(block.timestamp + 3 days);
        vm.prank(backupResolver);
        disbursement.takeOverRequestApproval(campaignId, requestId, keccak256("takeover"));
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.prank(backupResolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        assertEq(token.balanceOf(organizer), 500e6);
    }

    function test_backupExpenditureTakeoverCannotRunBeforeWindowOrAlongsidePrimary() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 500e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(backupResolver);
        disbursement.takeOverExpenditureReview(campaignId, requestId, keccak256("takeover"));
        vm.warp(block.timestamp + 3 days);
        vm.prank(backupResolver);
        disbursement.takeOverExpenditureReview(campaignId, requestId, keccak256("takeover"));
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 500e6, keccak256("expenditure"));
        vm.prank(backupResolver);
        disbursement.candidateExpenditure(campaignId, requestId, 500e6, keccak256("expenditure"));
    }

    function test_backupOutcomeTakeoverIsBoundToTheOpenActivity() public {
        uint256 campaignId = _activeCampaign();
        vm.warp(block.timestamp + 3 days);
        vm.prank(backupResolver);
        disbursement.takeOverOutcomeReview(campaignId, 0, keccak256("takeover"));
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(resolver);
        disbursement.candidateOutcome(campaignId, 0, keccak256("outcome"));
        vm.prank(backupResolver);
        disbursement.candidateOutcome(campaignId, 0, keccak256("outcome"));
    }

    function test_candidateExpenditurePersistsTheSelectedReportHash() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 500e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        bytes32 reportHash = keccak256("expenditure-report");
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 500e6, reportHash);
        assertEq(disbursement.request(campaignId, requestId).expenditureReportHash, reportHash);
    }

    function test_backupCanUpholdStuckExpenditureCaseOnlyAfterItsReviewWindow() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 500e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 500e6, keccak256("expenditure"));
        vm.prank(donor);
        disbursement.openExpenditureCase(campaignId, requestId, keccak256("case"));
        vm.warp(block.timestamp + 3 days);
        vm.prank(backupResolver);
        disbursement.takeOverExpenditureCase(campaignId, requestId, keccak256("takeover"));
        vm.expectRevert(FundTogetherDisbursement.WrongCaller.selector);
        vm.prank(resolver);
        disbursement.upholdExpenditureCase(campaignId, requestId, keccak256("decision"));
        vm.prank(backupResolver);
        disbursement.upholdExpenditureCase(campaignId, requestId, keccak256("decision"));
    }

    function test_secondRequestCannotBypassTheSingleOpenFinancialSlot() public {
        uint256 campaignId = _activeCampaign();
        vm.startPrank(organizer);
        disbursement.submitRequest(campaignId, 0, keccak256("first"), organizer, 1_000e6);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.submitRequest(campaignId, 0, keccak256("second"), organizer, 500e6);
        vm.stopPrank();
    }

    function test_purchaseThenTransportStaysInOneActivityUntilOutcomeVerification() public {
        uint256 campaignId = _activeCampaign();
        uint256 first = _settleRequest(campaignId, 800e6, keccak256("purchase"));
        assertEq(uint256(disbursement.request(campaignId, first).state), uint256(T.RequestState.FINANCIALLY_SETTLED));
        vm.prank(organizer);
        uint256 second = disbursement.submitRequest(campaignId, 0, keccak256("transport"), organizer, 200e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, second, keccak256("transport"));
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, second, 200e6, keccak256("transport-expenditure"));
        vm.warp(block.timestamp + 3 days);
        disbursement.finalizeExpenditure(campaignId, second);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(organizer);
        disbursement.createActivity(campaignId, keccak256("next"), 1_000e6);
        vm.prank(resolver);
        disbursement.candidateOutcome(campaignId, 0, keccak256("outcome"));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(resolver);
        disbursement.verifyOutcome(campaignId, 0, keccak256("other-outcome"));
        vm.prank(resolver);
        disbursement.verifyOutcome(campaignId, 0, keccak256("outcome"));
        vm.prank(organizer);
        disbursement.createActivity(campaignId, keccak256("next"), 1_000e6);
    }

    function test_donorOutcomeCaseBlocksVerificationUntilResolverReopensChallenge() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(resolver);
        disbursement.candidateOutcome(campaignId, 0, keccak256("outcome"));
        vm.prank(donor);
        disbursement.openOutcomeCase(campaignId, 0, keccak256("missing-proof"));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(resolver);
        disbursement.verifyOutcome(campaignId, 0, keccak256("outcome"));
        vm.prank(resolver);
        disbursement.upholdOutcomeCase(campaignId, 0, keccak256("decision"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(donor);
        disbursement.openOutcomeCase(campaignId, 0, keccak256("replay"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(resolver);
        disbursement.verifyOutcome(campaignId, 0, keccak256("outcome"));
        vm.warp(block.timestamp + 3 days);
        vm.prank(resolver);
        disbursement.verifyOutcome(campaignId, 0, keccak256("outcome"));
    }

    function test_donorCaseOpenedDuringChallengeBlocksFinalSettlement() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 1_000e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 1_000e6, keccak256("expenditure"));
        vm.prank(donor);
        disbursement.openExpenditureCase(campaignId, requestId, keccak256("conflict"));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.finalizeExpenditure(campaignId, requestId);
    }

    function test_resolverUpholdReopensChallengeBeforeFinalSettlement() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 1_000e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 1_000e6, keccak256("expenditure"));
        vm.prank(donor);
        disbursement.openExpenditureCase(campaignId, requestId, keccak256("conflict"));
        vm.prank(resolver);
        disbursement.upholdExpenditureCase(campaignId, requestId, keccak256("decision"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        vm.prank(donor);
        disbursement.openExpenditureCase(campaignId, requestId, keccak256("replay"));
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.finalizeExpenditure(campaignId, requestId);
        vm.warp(block.timestamp + 3 days);
        disbursement.finalizeExpenditure(campaignId, requestId);
        assertEq(uint256(disbursement.request(campaignId, requestId).state), uint256(T.RequestState.FINANCIALLY_SETTLED));
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

    function test_executionHorizonWindDownRefundsOnlyFreeCustodyAfterRequestsClose() public {
        uint256 campaignId = _activeCampaign();
        vm.warp(block.timestamp + 180 days);
        disbursement.startWindDown(campaignId);
        T.CampaignView memory campaign = disbursement.campaign(campaignId);
        assertEq(uint256(campaign.state), uint256(T.CampaignState.STOPPED));
        assertEq(campaign.basePool, 2_000e6);
        uint256 before = token.balanceOf(donor);
        vm.prank(donor);
        disbursement.claimRefund(campaignId);
        assertEq(token.balanceOf(donor), before + 2_000e6);
    }

    function test_lateOrganizerReturnAfterWindDownBecomesClaimableSupplementWithoutReopeningCampaign() public {
        uint256 campaignId = _activeCampaign();
        uint256 requestId = _settleRequest(campaignId, 1_000e6, keccak256("purchase"));
        vm.warp(block.timestamp + 180 days);
        disbursement.startWindDown(campaignId);
        vm.prank(organizer);
        token.approve(address(disbursement), 200e6);
        vm.prank(organizer);
        disbursement.returnFunds(campaignId, requestId, 200e6);
        T.CampaignView memory beforeClaim = disbursement.campaign(campaignId);
        assertEq(beforeClaim.basePool, 1_000e6);
        assertEq(beforeClaim.supplementPool, 200e6);
        uint256 before = token.balanceOf(donor);
        vm.prank(donor);
        disbursement.claimRefund(campaignId);
        assertEq(token.balanceOf(donor), before + 1_200e6);
        assertEq(uint256(disbursement.campaign(campaignId).state), uint256(T.CampaignState.STOPPED));
    }

    function test_organizerReturnRequiresActualTokenInflowAndCannotExceedGrossPaid() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 1_000e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.prank(organizer);
        token.approve(address(disbursement), 100e6);
        vm.prank(organizer);
        disbursement.returnFunds(campaignId, requestId, 100e6);
        T.RequestView memory request = disbursement.request(campaignId, requestId);
        assertEq(request.grossPaid, 1_000e6);
        assertEq(request.returned, 100e6);
        vm.expectRevert(FundTogetherDisbursement.InvalidInput.selector);
        vm.prank(organizer);
        disbursement.returnFunds(campaignId, requestId, 901e6);
    }

    function test_returnAfterCandidateInvalidatesExpenditureDecision() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 1_000e6);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, keccak256("request"));
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 700e6, keccak256("expenditure-one"));
        vm.prank(organizer);
        token.approve(address(disbursement), 100e6);
        vm.prank(organizer);
        disbursement.returnFunds(campaignId, requestId, 100e6);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(FundTogetherDisbursement.WrongState.selector);
        disbursement.finalizeExpenditure(campaignId, requestId);
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, 700e6, keccak256("expenditure-two"));
        vm.warp(block.timestamp + 3 days);
        disbursement.finalizeExpenditure(campaignId, requestId);
        assertEq(uint256(disbursement.request(campaignId, requestId).state), uint256(T.RequestState.FINANCIALLY_SETTLED));
    }

    function test_organizerCanCancelSubmittedRequest() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 requestId = disbursement.submitRequest(campaignId, 0, keccak256("request"), organizer, 1_000e6);
        vm.prank(organizer);
        disbursement.cancelRequest(campaignId, requestId, keccak256("cancel"));
        assertFalse(disbursement.hasOpenRequest(campaignId));
        assertEq(uint256(disbursement.request(campaignId, requestId).state), uint256(T.RequestState.CANCELLED));
    }

    function test_requestAmountCannotExceedActivityCeiling() public {
        uint256 campaignId = _activeCampaign();
        vm.prank(organizer);
        uint256 overCap = disbursement.submitRequest(campaignId, 0, keccak256("over-cap"), organizer, 1_001e6);
        vm.expectRevert(FundTogetherDisbursement.InvalidInput.selector);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, overCap, keccak256("over-cap"));
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

    function _settleRequest(uint256 campaignId, uint256 amount, bytes32 requestHash) private returns (uint256 requestId) {
        vm.prank(organizer);
        requestId = disbursement.submitRequest(campaignId, 0, requestHash, organizer, amount);
        vm.prank(resolver);
        disbursement.approveAndDisburse(campaignId, requestId, requestHash);
        vm.prank(resolver);
        disbursement.candidateExpenditure(campaignId, requestId, amount, keccak256("expenditure"));
        vm.warp(block.timestamp + 3 days);
        disbursement.finalizeExpenditure(campaignId, requestId);
    }
}
