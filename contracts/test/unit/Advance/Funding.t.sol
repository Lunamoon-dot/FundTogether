pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Vm } from "forge-std/Vm.sol";

contract WrongDecimalsToken is ERC20 {
    constructor() ERC20("Wrong", "WRONG") {}
}

contract AdvanceFundingTest is AdvanceFixtures {
    function test_G1CreateHasGoal2200AndNoTokenMovement() public {
        uint256 id = create(1, 2_200e6);
        T.CampaignView memory c = advance.campaign(id);
        assertEq(c.organizer, organizer);
        assertEq(c.planHash, PLAN);
        assertEq(c.goal, 2_200e6);
        assertEq(uint256(c.state), uint256(T.CampaignState.DRAFT));
        assertEq(c.contributed + c.advanced + c.returned + c.refunded + c.custody, 0);
        assertFalse(c.refundSnapshotted);
        assertEq(advance.stageCount(id), 1);
        assertEq(advance.stage(id, 0).budget, 2_200e6);
        assertEq(token.balanceOf(organizer), 0);
        assertEq(token.balanceOf(address(advance)), 0);
        assertEq(token.balanceOf(donorA), 10_000e6);
        assertEq(advance.campaignForDraft(organizer, bytes32(uint256(1))), id + 1);
    }

    function test_G2GoalIs3300() public {
        uint256 id = create(3, 1_100e6);
        assertEq(advance.campaign(id).goal, 3_300e6);
        assertEq(advance.stageCount(id), 3);
        for (uint256 i; i < 3; ++i) {
            T.StageView memory s = advance.stage(id, i);
            assertEq(s.budget, 1_100e6);
            assertEq(s.advanced, 0);
            assertEq(s.criteriaHash, criteria(3)[i]);
        }
    }

    function test_CreateRejectsEmptyZeroAndMismatchedCriteria() public {
        uint256[] memory b = budgets(1, 1);
        bytes32[] memory c = criteria(1);
        _invalidCreate(bytes32(uint256(1)), PLAN, 1 days, new uint256[](0), c);
        _invalidCreate(bytes32(uint256(1)), PLAN, 1 days, budgets(1, 0), c);
        _invalidCreate(bytes32(uint256(1)), PLAN, 1 days, b, criteria(2));
        c[0] = bytes32(0);
        _invalidCreate(bytes32(uint256(1)), PLAN, 1 days, b, c);
    }

    function test_CreateRejectsZeroCommitments() public {
        _invalidCreate(bytes32(0), PLAN, 1 days, budgets(1, 1), criteria(1));
        _invalidCreate(bytes32(uint256(1)), bytes32(0), 1 days, budgets(1, 1), criteria(1));
    }

    function test_CreateRejectsOverflowWithoutConsumingDraftKey() public {
        uint256[] memory b = budgets(2, type(uint256).max);
        bytes32[] memory c = criteria(2);
        vm.expectRevert();
        vm.prank(organizer);
        advance.submitCampaignForDraft(bytes32(uint256(1)), PLAN, 1 days, b, c);
        assertEq(advance.nextCampaignId(), 0);
        assertEq(advance.campaignForDraft(organizer, bytes32(uint256(1))), 0);
    }

    function test_DraftKeyIsOrganizerScopedAndCannotBeReused() public {
        create(1, 2_200e6);
        uint256[] memory b = budgets(1, 1);
        bytes32[] memory c = criteria(1);
        _invalidCreate(bytes32(uint256(1)), PLAN, 1 days, b, c);
        vm.prank(donorB);
        uint256 id = advance.submitCampaignForDraft(bytes32(uint256(1)), PLAN, 1 days, b, c);
        assertEq(id, 1);
        assertEq(advance.campaignForDraft(donorB, bytes32(uint256(1))), 2);
    }

    function test_FundingDurationBounds() public {
        uint256[] memory b = budgets(1, 1);
        bytes32[] memory c = criteria(1);
        _invalidCreate(bytes32(uint256(1)), PLAN, 1 days - 1, b, c);
        _invalidCreate(bytes32(uint256(1)), PLAN, 30 days + 1, b, c);
        vm.startPrank(organizer);
        uint256 first = advance.submitCampaignForDraft(bytes32(uint256(1)), PLAN, 1 days, b, c);
        uint256 last = advance.submitCampaignForDraft(bytes32(uint256(2)), PLAN, 30 days, b, c);
        vm.stopPrank();
        assertEq(advance.campaign(first).fundingDuration, 1 days);
        assertEq(advance.campaign(last).fundingDuration, 30 days);
    }

    function test_ConstructorRejectsInvalidConfiguration() public {
        _invalidDeploy(address(0), resolver, REASON);
        _invalidDeploy(address(token), address(0), REASON);
        _invalidDeploy(address(token), resolver, bytes32(0));
        _invalidDeploy(address(new WrongDecimalsToken()), resolver, REASON);
    }

    function test_ResolverCannotCreateOrDonate() public {
        uint256[] memory b = budgets(1, 1);
        bytes32[] memory c = criteria(1);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        vm.prank(resolver);
        advance.submitCampaignForDraft(REASON, PLAN, 1 days, b, c);
        uint256 id = create(1, 2_200e6);
        publish(id);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        vm.prank(resolver);
        advance.donate(id, 1);
    }

    function test_ApprovalAndPublishEnforceCallerPlanAndState() public {
        uint256 id = create(1, 2_200e6);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.approveCampaign(id, PLAN, VERIFICATION, REASON);
        vm.expectRevert(IAdvanceFunding.WrongPlan.selector);
        vm.prank(resolver);
        advance.approveCampaign(id, REASON, VERIFICATION, REASON);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.publishCampaign(id, PLAN);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.approveCampaign(id, PLAN, bytes32(0), REASON);
        approve(id);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.publishCampaign(id, PLAN);
        vm.expectRevert(IAdvanceFunding.WrongPlan.selector);
        vm.prank(organizer);
        advance.publishCampaign(id, REASON);
        vm.warp(100 days);
        vm.prank(organizer);
        advance.publishCampaign(id, PLAN);
        assertEq(advance.campaign(id).fundingEnd, 101 days);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.publishCampaign(id, PLAN);
    }

    function test_FullFundingOpensFirstReviewWithoutPayout() public {
        uint256 id = create(1, 2_200e6);
        publish(id);
        vm.recordLogs();
        fund(id, 1_320e6, 880e6);
        T.CampaignView memory c = advance.campaign(id);
        assertEq(c.contributed, 2_200e6);
        assertEq(c.custody, 2_200e6);
        assertEq(c.firstReviewEnd, block.timestamp + 3 days);
        assertEq(uint256(c.state), uint256(T.CampaignState.FIRST_REVIEW));
        assertEq(c.advanced, 0);
        assertEq(token.balanceOf(organizer), 0);
        assertEq(token.balanceOf(address(advance)), 2_200e6);
        assertEq(advance.contributions(id, donorA), 1_320e6);
        assertEq(advance.contributions(id, donorB), 880e6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs[logs.length - 1].topics[0], keccak256("CampaignFunded(uint256,uint256)"));
    }

    function test_DonationRejectsZeroOverGoalUnpublishedAndAfterGoal() public {
        uint256 id = create(1, 2_200e6);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(donorA);
        advance.donate(id, 1);
        publish(id);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(donorA);
        advance.donate(id, 0);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(donorA);
        advance.donate(id, 2_200e6 + 1);
        fund(id, 2_200e6, 0);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(donorA);
        advance.donate(id, 1);
    }

    function test_DonationAtDeadlineRejectsAndFundingTimeoutSnapshots() public {
        uint256 id = create(1, 2_200e6);
        publish(id);
        uint256 deadline = advance.campaign(id).fundingEnd;
        vm.warp(deadline - 1);
        fund(id, 1_320e6, 0);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
        vm.warp(deadline);
        vm.expectRevert(IAdvanceFunding.Expired.selector);
        vm.prank(donorB);
        advance.donate(id, 880e6);
        advance.finalizeTimeout(id);
        T.CampaignView memory c = advance.campaign(id);
        assertEq(uint256(c.state), uint256(T.CampaignState.STOPPED));
        assertTrue(c.refundSnapshotted);
        assertEq(c.basePool, 1_320e6);
        assertEq(c.custody, 1_320e6);
        assertEq(c.refunded, 0);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeTimeout(id);
    }

    function test_CancelBeforeFirstAdvanceSnapshotsOnceInEveryFundingState() public {
        for (uint256 mode; mode < 4; ++mode) {
            uint256 id = create(1, 2_200e6);
            if (mode == 1) approve(id);
            if (mode >= 2) publish(id);
            if (mode == 2) fund(id, 100e6, 0);
            if (mode == 3) fund(id, 1_320e6, 880e6);
            uint256 held = advance.campaign(id).custody;
            uint256 beforeBalance = token.balanceOf(address(advance));
            vm.prank(organizer);
            advance.cancelCampaign(id, PLAN);
            T.CampaignView memory c = advance.campaign(id);
            assertEq(uint256(c.state), uint256(T.CampaignState.STOPPED));
            assertTrue(c.refundSnapshotted);
            assertEq(c.basePool, held);
            assertEq(c.custody, held);
            assertEq(c.supplementPool, 0);
            assertEq(token.balanceOf(address(advance)), beforeBalance);
            vm.expectRevert(IAdvanceFunding.WrongState.selector);
            vm.prank(organizer);
            advance.cancelCampaign(id, PLAN);
        }
    }

    function test_CancelEnforcesCallerAndFrozenPlan() public {
        uint256 id = create(1, 1);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.cancelCampaign(id, PLAN);
        vm.expectRevert(IAdvanceFunding.WrongPlan.selector);
        vm.prank(organizer);
        advance.cancelCampaign(id, REASON);
        assertFalse(advance.campaign(id).refundSnapshotted);
    }

    function test_UnknownCampaignOrStageIsNotAValidZeroRecord() public {
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        advance.campaign(0);
        uint256 id = create(1, 1);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        advance.stage(id, 1);
    }

    function _invalidCreate(bytes32 key, bytes32 plan, uint256 duration,
        uint256[] memory b, bytes32[] memory c) private {
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(organizer);
        advance.submitCampaignForDraft(key, plan, duration, b, c);
    }

    function _invalidDeploy(address t, address r, bytes32 instance) private {
        bytes memory code = vm.getCode("FundTogetherAdvance.sol:FundTogetherAdvance");
        code = abi.encodePacked(code, abi.encode(t, r, instance));
        address deployed;
        assembly { deployed := create(0, add(code, 32), mload(code)) }
        assertEq(deployed, address(0), "invalid deployment must revert");
    }
}
