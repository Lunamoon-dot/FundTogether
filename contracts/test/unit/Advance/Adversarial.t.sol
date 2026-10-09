pragma solidity 0.8.24;

import { AdvanceFixtures } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";

contract AdvanceAdversarialTest is AdvanceFixtures {
    function testFuzz_SeparatePoolsConserveFundsForFractionsAndClaimOrders(
        uint96 totalSeed, uint96 weightSeed, uint96 advanceSeed, uint96 returnSeed, bool returnFirst
    ) public {
        uint256 total = bound(uint256(totalSeed), 2, type(uint96).max);
        uint256 a = bound(uint256(weightSeed), 1, total - 1);
        uint256 released = bound(uint256(advanceSeed), 1, total - 1);
        uint256 returned = bound(uint256(returnSeed), 0, released);
        token.mint(donorA, a);
        token.mint(donorB, total - a);
        uint256[] memory b = budgets(2, released);
        b[1] = total - released;
        bytes32[] memory c = criteria(2);
        vm.prank(organizer);
        uint256 id = advance.submitCampaignForDraft(REASON, PLAN, 1 days, b, c);
        publish(id);
        fund(id, a, total - a);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
        vm.prank(resolver);
        advance.stopCampaign(id, PLAN, REASON);
        uint256 beforeA = token.balanceOf(donorA);
        uint256 beforeB = token.balanceOf(donorB);
        if (returnFirst && returned != 0) _return(id, returned);
        _claim(id, donorA);
        _claim(id, donorB);
        if (!returnFirst && returned != 0) {
            _return(id, returned);
            if (a * returned / total != 0) _claim(id, donorA);
            if ((total - a) * returned / total != 0) _claim(id, donorB);
        }
        // uint96 fixtures allow an independent checked product (<=192 bits).
        uint256 expectedA = a * (total - released) / total + a * returned / total;
        uint256 expectedB = (total - a) * (total - released) / total + (total - a) * returned / total;
        T.CampaignView memory view_ = advance.campaign(id);
        assertEq(token.balanceOf(donorA) - beforeA, expectedA);
        assertEq(token.balanceOf(donorB) - beforeB, expectedB);
        assertEq(view_.basePool, total - released);
        assertEq(view_.supplementPool, returned);
        assertEq(view_.refunded, expectedA + expectedB);
        assertEq(total + returned, released + view_.refunded + view_.custody);
        assertEq(token.balanceOf(address(advance)), view_.custody);
        assertLt(view_.custody, 4); // At most one remainder per donor per pool.
    }

    function test_OtherCampaignAndUnsolicitedTokensAreNeverRefundEntitlements() public {
        uint256[] memory b = budgets(2, 3);
        b[1] = 7;
        bytes32[] memory c = criteria(2);
        vm.prank(organizer);
        uint256 first = advance.submitCampaignForDraft(REASON, PLAN, 1 days, b, c);
        publish(first);
        fund(first, 3, 7);
        vm.prank(resolver);
        advance.confirmFirstAdvance(first, PLAN, VERIFICATION, REASON);
        vm.prank(organizer);
        advance.claimAdvance(first, 0, PLAN);
        uint256 other = create(1, 10);
        publish(other);
        fund(other, 5, 0);
        token.mint(address(advance), 17);
        vm.prank(resolver);
        advance.stopCampaign(first, PLAN, REASON);
        _claim(first, donorA);
        _claim(first, donorB);
        assertEq(advance.campaign(first).basePool, 7);
        assertEq(advance.campaign(first).refunded, 6);
        assertEq(advance.campaign(first).custody, 1);
        assertEq(advance.campaign(other).custody, 5);
        assertEq(uint256(advance.campaign(other).state), uint256(T.CampaignState.FUNDING));
        assertEq(token.balanceOf(address(advance)), 23); // first1 + other5 + unsolicited17.
    }

    function test_RefundGasDoesNotGrowWithDonorCount() public {
        uint256 small = create(1, 100);
        publish(small);
        fund(small, 2, 98);
        uint256 large = create(1, 100);
        publish(large);
        fund(large, 2, 0);
        for (uint256 i; i < 63; ++i) {
            address wallet = address(uint160(0x3000 + i));
            uint256 amount = i == 62 ? 36 : 1;
            token.mint(wallet, amount);
            vm.startPrank(wallet);
            token.approve(address(advance), amount);
            advance.donate(large, amount);
            vm.stopPrank();
        }
        vm.startPrank(organizer);
        advance.cancelCampaign(small, PLAN);
        advance.cancelCampaign(large, PLAN);
        vm.stopPrank();
        vm.cool(address(advance));
        vm.cool(address(token));
        vm.prank(donorA);
        uint256 beforeSmall = gasleft();
        advance.claimRefund(small);
        uint256 smallGas = beforeSmall - gasleft();
        vm.cool(address(advance));
        vm.cool(address(token));
        vm.prank(donorA);
        uint256 beforeLarge = gasleft();
        advance.claimRefund(large);
        uint256 largeGas = beforeLarge - gasleft();
        emit log_named_uint("claim gas,2 donors", smallGas);
        emit log_named_uint("claim gas,64 donors", largeGas);
        assertApproxEqAbs(smallGas, largeGas, 500);
        assertEq(advance.campaign(small).refunded, 2);
        assertEq(advance.campaign(large).refunded, 2);
    }

    function _claim(uint256 id, address donor) private {
        vm.prank(donor);
        advance.claimRefund(id);
    }

    function _return(uint256 id, uint256 amount) private {
        vm.startPrank(organizer);
        token.approve(address(advance), amount);
        advance.returnFunds(id, 0, amount);
        vm.stopPrank();
    }
}
