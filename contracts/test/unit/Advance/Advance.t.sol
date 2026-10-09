pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";
import { AdvanceCallbackToken as FaultToken } from "../../mocks/AdvanceCallbackToken.sol";

contract AdvanceClaimTest is AdvanceFixtures {
    function test_FirstEligibilityOpensBoundedClaimWithoutTransfer() public {
        uint256 id = _funded(1);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        T.CampaignView memory c = advance.campaign(id);
        assertEq(uint256(c.state), uint256(T.CampaignState.ADVANCE_AVAILABLE));
        assertEq(c.claimEnd, block.timestamp + 7 days);
        assertEq(c.custody, 2_200e6);
        assertEq(c.advanced, 0);
        assertEq(token.balanceOf(organizer), 0);
    }

    function test_EligibilityRequiresResolverCurrentPlanAndNonzeroRecords() public {
        uint256 id = _funded(1);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        vm.expectRevert(IAdvanceFunding.WrongPlan.selector);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, REASON, VERIFICATION, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, bytes32(0), REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, bytes32(0));
        _confirm(id);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
    }

    function test_FirstEligibilityAtExpiryRejectsAndTimeoutPreservesFullPool() public {
        uint256 id = _funded(1);
        uint256 deadline = advance.campaign(id).firstReviewEnd;
        vm.warp(deadline - 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
        vm.warp(deadline);
        vm.expectRevert(IAdvanceFunding.Expired.selector);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        advance.finalizeTimeout(id);
        assertEq(advance.campaign(id).basePool, 2_200e6);
        assertEq(advance.campaign(id).custody, 2_200e6);
        assertEq(token.balanceOf(organizer), 0);
    }

    function test_G1ClaimsFullBudgetExactlyOnce() public {
        uint256 id = _funded(1);
        _confirm(id);
        _claim(id);
        T.CampaignView memory c = advance.campaign(id);
        T.StageView memory s = advance.stage(id, 0);
        assertEq(c.advanced, 2_200e6);
        assertEq(c.custody, 0);
        assertEq(uint256(c.state), uint256(T.CampaignState.EXECUTING));
        assertEq(s.advanced, 2_200e6);
        assertEq(s.submissionEnd, block.timestamp + 30 days);
        assertEq(s.hardStop, block.timestamp + 60 days);
        assertEq(uint256(s.state), uint256(T.StageState.ADVANCED));
        assertEq(token.balanceOf(organizer), 2_200e6);
        assertEq(token.balanceOf(address(advance)), 0);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
        assertEq(advance.campaign(id).advanced, 2_200e6);
    }

    function test_G2OnlyClaimsStageZeroAndRetains2200() public {
        uint256 id = _funded(3);
        _confirm(id);
        _claim(id);
        assertEq(advance.campaign(id).advanced, 1_100e6);
        assertEq(advance.campaign(id).custody, 2_200e6);
        assertEq(token.balanceOf(organizer), 1_100e6);
        assertEq(token.balanceOf(address(advance)), 2_200e6);
        assertEq(advance.stage(id, 1).advanced, 0);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 1, PLAN);
    }

    function test_ClaimRequiresEligibilityOrganizerPlanAndCurrentStage() public {
        uint256 id = _funded(3);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
        _confirm(id);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.claimAdvance(id, 0, PLAN);
        vm.expectRevert(IAdvanceFunding.WrongPlan.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 1, PLAN);
        assertEq(advance.campaign(id).custody, 3_300e6);
    }

    function test_ClaimOneSecondBeforeDeadlineSucceeds() public {
        uint256 id = _funded(1);
        _confirm(id);
        vm.warp(advance.campaign(id).claimEnd - 1);
        _claim(id);
        assertEq(advance.campaign(id).advanced, 2_200e6);
    }

    function test_ClaimAtAndAfterExpiryRejectsAndTimeoutSnapshots() public {
        for (uint256 offset; offset < 2; ++offset) {
            uint256 id = _funded(1);
            _confirm(id);
            vm.warp(advance.campaign(id).claimEnd + offset);
            vm.expectRevert(IAdvanceFunding.Expired.selector);
            vm.prank(organizer);
            advance.claimAdvance(id, 0, PLAN);
            advance.finalizeTimeout(id);
            assertEq(advance.campaign(id).basePool, 2_200e6);
            assertEq(advance.campaign(id).advanced, 0);
        }
    }

    function test_ResolverStopAndClaimRaceFollowsTransactionOrder() public {
        uint256 stopped = _funded(1);
        _confirm(stopped);
        vm.prank(resolver);
        advance.stopCampaign(stopped, PLAN, REASON);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(stopped, 0, PLAN);
        assertEq(advance.campaign(stopped).basePool, 2_200e6);
        uint256 claimed = _funded(1);
        _confirm(claimed);
        _claim(claimed);
        vm.prank(resolver);
        advance.stopCampaign(claimed, PLAN, REASON);
        assertEq(advance.campaign(claimed).basePool, 0);
        assertEq(advance.campaign(claimed).advanced, 2_200e6);
    }

    function test_StopAndCancelEnforceAuthorityAfterEligibility() public {
        uint256 id = _funded(1);
        _confirm(id);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.stopCampaign(id, PLAN, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, bytes32(0));
        vm.prank(organizer);
        advance.cancelCampaign(id, PLAN);
        assertEq(advance.campaign(id).basePool, 2_200e6);
        id = _funded(1);
        _confirm(id);
        _claim(id);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.cancelCampaign(id, PLAN);
    }

    function test_FailedAndFeeAdvanceRollBackRightsBalancesAndCanRetry() public {
        FaultToken fault = _faultToken();
        uint256 id = _funded(3);
        _confirm(id);
        for (uint256 mode = 1; mode <= 4; ++mode) {
            fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode(mode));
            vm.expectRevert();
            vm.prank(organizer);
            advance.claimAdvance(id, 0, PLAN);
            assertEq(advance.campaign(id).advanced, 0);
            assertEq(advance.campaign(id).custody, 3_300e6);
            assertEq(advance.stage(id, 0).advanced, 0);
            assertEq(uint256(advance.campaign(id).state), uint256(T.CampaignState.ADVANCE_AVAILABLE));
            assertEq(token.balanceOf(organizer), 0);
            assertEq(token.balanceOf(address(advance)), 3_300e6);
        }
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.NORMAL);
        _claim(id);
        assertEq(token.balanceOf(organizer), 1_100e6);
        assertEq(advance.campaign(id).custody, 2_200e6);
    }

    function test_IncomingFalseRevertAndFeesDoNotCreateContribution() public {
        FaultToken fault = _faultToken();
        uint256 id = create(1, 2_200e6);
        publish(id);
        for (uint256 mode = 1; mode <= 4; ++mode) {
            fault.configure(FaultToken.Mode(mode), FaultToken.Mode.NORMAL);
            vm.expectRevert();
            vm.prank(donorA);
            advance.donate(id, 1_320e6);
            assertEq(advance.contributions(id, donorA), 0);
            assertEq(advance.campaign(id).custody, 0);
            assertEq(token.balanceOf(address(advance)), 0);
            assertEq(token.balanceOf(donorA), 10_000e6);
        }
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.NORMAL);
        fund(id, 1_320e6, 880e6);
        assertEq(advance.campaign(id).custody, 2_200e6);
    }

    function test_CallbackCannotConsumeAdvanceTwice() public {
        FaultToken fault = _faultToken();
        uint256 id = _funded(1);
        _confirm(id);
        fault.arm(address(advance), abi.encodeCall(IAdvanceFunding.claimAdvance, (id, 0, PLAN)));
        _claim(id);
        assertTrue(fault.attempted());
        assertFalse(fault.nestedSucceeded());
        assertEq(fault.nestedError(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        assertEq(advance.campaign(id).advanced, 2_200e6);
        assertEq(token.balanceOf(organizer), 2_200e6);
    }

    function _funded(uint256 count) private returns (uint256 id) {
        id = create(count, count == 1 ? 2_200e6 : 1_100e6);
        publish(id);
        if (count == 1) fund(id, 1_320e6, 880e6);
        else fund(id, 1_980e6, 1_320e6);
    }

    function _confirm(uint256 id) private {
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
    }

    function _claim(uint256 id) private {
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
    }

    function _faultToken() private returns (FaultToken fault) {
        fault = new FaultToken();
        token = fault;
        advance = IAdvanceFunding(deployCode("FundTogetherAdvance.sol:FundTogetherAdvance",
            abi.encode(address(token), resolver, keccak256("B fault fixture"))));
        token.mint(donorA, 10_000e6);
        token.mint(donorB, 10_000e6);
        vm.prank(donorA);
        token.approve(address(advance), type(uint256).max);
        vm.prank(donorB);
        token.approve(address(advance), type(uint256).max);
    }
}
