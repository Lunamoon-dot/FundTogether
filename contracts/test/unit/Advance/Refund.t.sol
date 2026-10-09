pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";
import { AdvanceCallbackToken as FaultToken } from "../../mocks/AdvanceCallbackToken.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";

contract AdvanceRefundTest is AdvanceFixtures {
    function test_G2StoppedAfterTwoAdvancesRefunds1100InEitherClaimOrder() public {
        for (uint256 order; order < 2; ++order) {
            uint256 id = _stoppedG2();
            _rights(id, donorA, 660e6, 0, false, 0);
            _rights(id, donorB, 440e6, 0, false, 0);
            uint256 beforeA = token.balanceOf(donorA);
            uint256 beforeB = token.balanceOf(donorB);
            _claim(id, order == 0 ? donorA : donorB);
            _claim(id, order == 0 ? donorB : donorA);
            assertEq(token.balanceOf(donorA) - beforeA, 660e6);
            assertEq(token.balanceOf(donorB) - beforeB, 440e6);
            assertEq(advance.campaign(id).refunded, 1_100e6);
            assertEq(advance.campaign(id).custody, 0);
            assertEq(advance.campaign(id).basePool, 1_100e6);
            _rights(id, donorA, 0, 0, true, 0);
            vm.expectRevert(IAdvanceFunding.NoEntitlement.selector);
            vm.prank(donorA);
            advance.claimRefund(id);
        }
    }

    function test_Return110AfterBaseClaimsKeepsPoolAndPays66And44Supplement() public {
        uint256 id = _stoppedG2();
        _claim(id, donorA);
        _claim(id, donorB);
        _return(id, 1, 110e6);
        assertEq(advance.campaign(id).basePool, 1_100e6);
        assertEq(advance.campaign(id).supplementPool, 110e6);
        _rights(id, donorA, 0, 66e6, true, 0);
        _rights(id, donorB, 0, 44e6, true, 0);
        uint256 beforeA = token.balanceOf(donorA);
        uint256 beforeB = token.balanceOf(donorB);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(token.balanceOf(donorA) - beforeA, 66e6);
        assertEq(token.balanceOf(donorB) - beforeB, 44e6);
        _rights(id, donorA, 0, 0, true, 66e6);
        assertEq(advance.campaign(id).refunded, 1_210e6);
        assertEq(advance.campaign(id).custody, 0);
    }

    function test_Return50BeforeSnapshotIsFixedBase30And20() public {
        uint256 id = executing(1);
        _return(id, 0, 50e6);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        assertEq(advance.campaign(id).basePool, 50e6);
        assertEq(advance.campaign(id).supplementPool, 0);
        _rights(id, donorA, 30e6, 0, false, 0);
        _rights(id, donorB, 20e6, 0, false, 0);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).custody, 0);
    }

    function test_G1ZeroBaseConsumesFlagWithoutZeroTokenTransferThenLateReturnPays() public {
        FaultToken fault = new FaultToken();
        _useToken(fault, true);
        uint256 id = executing(1);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.FALSE_RETURN);
        _claim(id, donorA);
        _rights(id, donorA, 0, 0, true, 0);
        assertEq(advance.campaign(id).refunded, 0);
        vm.expectRevert(IAdvanceFunding.NoEntitlement.selector);
        vm.prank(donorA);
        advance.claimRefund(id);
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.NORMAL);
        _return(id, 0, 50e6);
        _rights(id, donorA, 0, 30e6, true, 0);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).custody, 0);
        assertEq(advance.campaign(id).refunded, 50e6);
    }

    function test_COMPLETEDAllowsLateReturnWithoutReopeningExecutionOrBase() public {
        uint256 id = executing(1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 2_200e6);
        vm.warp(advance.stage(id, 0).challengeEnd);
        advance.finalizeStage(ref);
        _claim(id, donorA);
        _return(id, 0, 50e6);
        assertEq(uint256(advance.campaign(id).state), uint256(T.CampaignState.COMPLETED));
        assertEq(advance.campaign(id).basePool, 0);
        assertEq(advance.campaign(id).supplementPool, 50e6);
        _rights(id, donorA, 0, 30e6, true, 0);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).refunded, 50e6);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
    }

    function test_ReturnRequiresOrganizerExactAdvancedStageAndRemainingCap() public {
        uint256 id = executing(3);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.returnFunds(id, 0, 1);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        vm.prank(organizer);
        advance.returnFunds(id, 3, 1);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(organizer);
        advance.returnFunds(id, 1, 1);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(organizer);
        advance.returnFunds(id, 0, 0);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(organizer);
        advance.returnFunds(id, 0, 1_100e6 + 1);
        _return(id, 0, 1_100e6);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(organizer);
        advance.returnFunds(id, 0, 1);
        assertEq(advance.campaign(id).advanced, 1_100e6);
        assertEq(advance.campaign(id).custody, 3_300e6);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
    }

    function test_FailedOrFeeReturnPreservesCountersRightsAndRetry() public {
        FaultToken fault = new FaultToken();
        _useToken(fault, true);
        uint256 id = executing(1);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        vm.prank(organizer);
        token.approve(address(advance), 50e6);
        for (uint256 mode = 1; mode <= 4; ++mode) {
            fault.configure(FaultToken.Mode(mode), FaultToken.Mode.NORMAL);
            vm.expectRevert();
            vm.prank(organizer);
            advance.returnFunds(id, 0, 50e6);
            assertEq(advance.campaign(id).returned, 0);
            assertEq(advance.campaign(id).supplementPool, 0);
            assertEq(advance.campaign(id).custody, 0);
            assertEq(advance.stage(id, 0).returned, 0);
            assertEq(token.balanceOf(organizer), 2_200e6);
        }
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.NORMAL);
        _return(id, 0, 50e6);
        assertEq(advance.campaign(id).supplementPool, 50e6);
    }

    function test_FailedOrFeeRefundPreservesBaseFlagAndPaidThenRetries() public {
        FaultToken fault = new FaultToken();
        _useToken(fault, true);
        uint256 id = _stoppedG2();
        uint256 beforeDonor = token.balanceOf(donorA);
        for (uint256 mode = 1; mode <= 4; ++mode) {
            fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode(mode));
            vm.expectRevert();
            vm.prank(donorA);
            advance.claimRefund(id);
            _rights(id, donorA, 660e6, 0, false, 0);
            assertEq(advance.campaign(id).refunded, 0);
            assertEq(advance.campaign(id).custody, 1_100e6);
            assertEq(token.balanceOf(donorA), beforeDonor);
        }
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.NORMAL);
        _claim(id, donorA);
        assertEq(token.balanceOf(donorA) - beforeDonor, 660e6);
    }

    function test_TinySeparatePoolFloorsUnclaimedAndChangingDust() public {
        // Use a separate plan with total10, advances3 and7.
        uint256[] memory b = budgets(2, 3);
        b[1] = 7;
        bytes32[] memory c = criteria(2);
        vm.prank(organizer);
        uint256 id = advance.submitCampaignForDraft(keccak256("tiny"), PLAN, 1 days, b, c);
        publish(id);
        fund(id, 3, 7);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        _rights(id, donorA, 2, 0, false, 0);
        _rights(id, donorB, 4, 0, false, 0);
        _claim(id, donorB);
        _return(id, 0, 1);
        _rights(id, donorA, 2, 0, false, 0);
        _return(id, 0, 2);
        _rights(id, donorB, 0, 2, true, 0);
        assertEq(advance.campaign(id).custody, 6); // A base2+B supplement2+dust2.
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).refunded, 8);
        assertEq(advance.campaign(id).custody, 2);
        assertEq(token.balanceOf(address(advance)), 2);
    }

    function test_FailedSupplementTransferKeepsConsumedBaseAndPaidUnchanged() public {
        FaultToken fault = new FaultToken();
        _useToken(fault, true);
        uint256 id = _stoppedG2();
        _claim(id, donorA);
        _claim(id, donorB);
        _return(id, 1, 110e6);
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.FALSE_RETURN);
        vm.expectRevert();
        vm.prank(donorA);
        advance.claimRefund(id);
        _rights(id, donorA, 0, 66e6, true, 0);
        assertEq(advance.campaign(id).refunded, 1_100e6);
        assertEq(advance.campaign(id).custody, 110e6);
        fault.configure(FaultToken.Mode.NORMAL, FaultToken.Mode.NORMAL);
        _claim(id, donorA);
        _rights(id, donorA, 0, 0, true, 66e6);
        assertEq(advance.campaign(id).custody, 44e6);
    }

    function test_ZeroRoundedBaseRetainsSupplementRightsAsCumulativeDustChanges() public {
        uint256[] memory b = budgets(2, 9);
        b[1] = 1;
        bytes32[] memory c = criteria(2);
        vm.prank(organizer);
        uint256 id = advance.submitCampaignForDraft(REASON, PLAN, 1 days, b, c);
        publish(id);
        fund(id, 3, 7);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        _rights(id, donorA, 0, 0, false, 0);
        _rights(id, donorB, 0, 0, false, 0);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).custody, 1);
        _return(id, 0, 1);
        _rights(id, donorB, 0, 0, true, 0);
        _return(id, 0, 1);
        _rights(id, donorB, 0, 1, true, 0);
        _claim(id, donorB);
        assertEq(advance.campaign(id).refunded, 1);
        assertEq(advance.campaign(id).custody, 2);
    }

    function test_FullPrecisionNearUint256MaximumDoesNotMultiplyOverflow() public {
        _useToken(new MockUSDC(), false);
        uint256 max = type(uint256).max;
        uint256 half = max / 2;
        token.mint(donorA, half);
        token.mint(donorB, max - half);
        uint256[] memory b = budgets(2, 3);
        b[1] = max - 3;
        bytes32[] memory c = criteria(2);
        vm.prank(organizer);
        uint256 id = advance.submitCampaignForDraft(REASON, PLAN, 1 days, b, c);
        publish(id);
        fund(id, half, max - half);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        // floor(half*(max-3)/max) = half-2 for both half-sized contributors.
        _rights(id, donorA, half - 2, 0, false, 0);
        _rights(id, donorB, max - half - 2, 0, false, 0);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).custody, 1);
        _return(id, 0, 3);
        _rights(id, donorA, 0, 1, true, 0);
        _rights(id, donorB, 0, 1, true, 0);
        _claim(id, donorA);
        _claim(id, donorB);
        assertEq(advance.campaign(id).custody, 2);
    }

    function test_RefundRequiresSnapshotAndContributorNoExpiryOrRecipientRedirect() public {
        uint256 id = create(1, 2_200e6);
        publish(id);
        fund(id, 100e6, 0);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(donorA);
        advance.claimRefund(id);
        vm.prank(organizer);
        advance.cancelCampaign(id, PLAN);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.claimRefund(id);
        vm.warp(block.timestamp + 1000 days);
        _claim(id, donorA);
        assertEq(advance.campaign(id).refunded, 100e6);
        id = create(1, 1);
        vm.prank(organizer);
        advance.cancelCampaign(id, PLAN);
        _rights(id, donorA, 0, 0, false, 0); // C=0, no division.
    }

    function test_CallbackDuringRefundOrReturnCannotReenterClaim() public {
        FaultToken fault = new FaultToken();
        _useToken(fault, true);
        uint256 id = _stoppedG2();
        fault.arm(address(advance), abi.encodeCall(IAdvanceFunding.claimRefund, (id)));
        _claim(id, donorA);
        assertFalse(fault.nestedSucceeded());
        assertEq(fault.nestedError(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        fault.arm(address(advance), abi.encodeCall(IAdvanceFunding.claimRefund, (id)));
        _return(id, 1, 110e6);
        assertFalse(fault.nestedSucceeded());
        assertEq(fault.nestedError(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        _rights(id, donorA, 0, 66e6, true, 0);
    }

    function _stoppedG2() private returns (uint256 id) {
        id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 1_100e6);
        vm.warp(advance.stage(id, 0).challengeEnd);
        advance.finalizeStage(ref);
        vm.prank(organizer);
        advance.claimAdvance(id, 1, PLAN);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
    }

    function _claim(uint256 id, address donor) private {
        vm.prank(donor);
        advance.claimRefund(id);
    }

    function _return(uint256 id, uint256 index, uint256 amount) private {
        vm.startPrank(organizer);
        token.approve(address(advance), amount);
        advance.returnFunds(id, index, amount);
        vm.stopPrank();
    }

    function _rights(uint256 id, address donor, uint256 base, uint256 supplement, bool consumed, uint256 paid) private view {
        (uint256 actualBase, uint256 actualSupplement, bool actualConsumed, uint256 actualPaid) = advance.refundClaimable(id, donor);
        assertEq(actualBase, base);
        assertEq(actualSupplement, supplement);
        assertEq(actualConsumed, consumed);
        assertEq(actualPaid, paid);
    }

    function _useToken(MockUSDC fresh, bool mintBalances) private {
        token = fresh;
        advance = IAdvanceFunding(deployCode("FundTogetherAdvance.sol:FundTogetherAdvance",
            abi.encode(address(token), resolver, keccak256("B refund fixture"))));
        if (mintBalances) {
            token.mint(donorA, 10_000e6);
            token.mint(donorB, 10_000e6);
        }
        vm.prank(donorA);
        token.approve(address(advance), type(uint256).max);
        vm.prank(donorB);
        token.approve(address(advance), type(uint256).max);
    }
}
