pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";

contract AdvanceTimeoutTest is AdvanceFixtures {
    function test_UnfundedDraftApprovedAndTerminalCannotTimeout() public {
        uint256 id = create(1, 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
        approve(id);
        vm.warp(100 days);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
        vm.prank(organizer);
        advance.cancelCampaign(id, PLAN);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
    }

    function test_ChallengeExpiryOpensFinalizationRatherThanTimeout() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 1_100e6);
        vm.warp(advance.stage(id, 0).challengeEnd);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
        assertFalse(advance.campaign(id).refundSnapshotted);
        advance.finalizeStage(ref);
        assertEq(advance.campaign(id).currentStage, 1);
    }

    function test_NextStageClaimTimeoutPreservesUnusedStagesAndActualReturn() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 1_050e6);
        vm.startPrank(organizer);
        token.approve(address(advance), 50e6);
        advance.returnFunds(id, 0, 50e6);
        vm.stopPrank();
        vm.warp(advance.stage(id, 0).challengeEnd);
        advance.finalizeStage(ref);
        vm.warp(advance.campaign(id).claimEnd);
        advance.finalizeTimeout(id);
        assertEq(advance.campaign(id).basePool, 2_250e6);
        assertEq(advance.campaign(id).advanced, 1_100e6);
        assertEq(advance.campaign(id).returned, 50e6);
        assertEq(token.balanceOf(address(advance)), 2_250e6);
    }
}
