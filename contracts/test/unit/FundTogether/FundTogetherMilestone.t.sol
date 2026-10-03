pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { Test } from "forge-std/Test.sol";

contract FundTogetherMilestoneTest is Test {
    FundTogether internal fundTogether;
    MockUSDC internal token;
    address internal organizer = address(0xA11CE);
    address internal donor = address(0xB0B);
    uint256 internal deadline;

    event MilestoneConfigured(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 budget
    );
    event MilestoneActivated(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 budget
    );

    function setUp() public {
        fundTogether = new FundTogether();
        token = new MockUSDC();
        deadline = block.timestamp + 7 days;
    }

    function _budgets() internal pure returns (uint256[] memory budgets) {
        budgets = new uint256[](3);
        budgets[0] = 3_000_000;
        budgets[1] = 1_000_000;
        budgets[2] = 5_000_000;
    }

    function _create() internal returns (uint256 id) {
        vm.prank(organizer);
        id = fundTogether.createCampaign("Clean water", address(token), deadline, _budgets());
    }

    function _publish(uint256 id) internal {
        token.mint(organizer, 5_000_000);
        vm.startPrank(organizer);
        token.approve(address(fundTogether), 5_000_000);
        fundTogether.lockBond(id);
        vm.stopPrank();
        CampaignFixtures.configureCriteria(fundTogether, id);
        fundTogether.approveCampaign(id);
        vm.prank(organizer);
        fundTogether.publishCampaign(id);
    }

    function _fund(uint256 id) internal {
        _publish(id);
        token.mint(donor, 9_000_000);
        vm.startPrank(donor);
        token.approve(address(fundTogether), 9_000_000);
        fundTogether.donate(id, 9_000_000);
        vm.stopPrank();
    }

    function testCampaignDerivesGoalAndBondFromCommittedBudgets() public {
        uint256 id = _create();
        (,, uint256 goal, uint256 bond,,,,) = fundTogether.campaigns(id);
        assertEq(goal, 9_000_000);
        assertEq(bond, 5_000_000);
        assertEq(fundTogether.milestoneCount(id), 3);
        (uint256 first, FundTogether.MilestoneState state) = fundTogether.milestones(id, 0);
        assertEq(first, 3_000_000);
        assertTrue(state == FundTogether.MilestoneState.PENDING);
        (uint256 last,) = fundTogether.milestones(id, 2);
        assertEq(last, 5_000_000);
    }

    function testSingleMilestoneRequiresBondEqualToGoal() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 7_000_000;
        uint256 id = fundTogether.createCampaign("Single", address(token), deadline, budgets);
        (,, uint256 goal, uint256 bond,,,,) = fundTogether.campaigns(id);
        assertEq(goal, 7_000_000);
        assertEq(bond, 7_000_000);
    }

    function testCreationEmitsOrderedMilestoneBudgets() public {
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit MilestoneConfigured(0, 0, 3_000_000);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit MilestoneConfigured(0, 1, 1_000_000);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit MilestoneConfigured(0, 2, 5_000_000);
        _create();
    }

    function testEmptyMilestonesRevertWithoutCreatingCampaign() public {
        vm.expectRevert("milestones required");
        fundTogether.createCampaign("Empty", address(token), deadline, new uint256[](0));
        assertEq(fundTogether.nextCampaignId(), 0);
    }

    function testZeroBudgetRevertsWithoutLeavingPartialConfiguration() public {
        uint256[] memory budgets = _budgets();
        budgets[1] = 0;
        vm.expectRevert("budget required");
        fundTogether.createCampaign("Zero", address(token), deadline, budgets);
        assertEq(fundTogether.nextCampaignId(), 0);
        uint256 id = _create();
        assertEq(id, 0);
        assertEq(fundTogether.milestoneCount(id), 3);
    }

    function testOverflowingTotalBudgetRevertsWithoutCreatingCampaign() public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = type(uint256).max;
        budgets[1] = 1;
        vm.expectRevert(abi.encodeWithSignature("Panic(uint256)", 0x11));
        fundTogether.createCampaign("Overflow", address(token), deadline, budgets);
        assertEq(fundTogether.nextCampaignId(), 0);
    }

    function testPastDeadlineReverts() public {
        vm.expectRevert("deadline required");
        fundTogether.createCampaign("Expired", address(token), block.timestamp, _budgets());
    }

    function testUnknownCampaignHasNoMilestoneCount() public {
        vm.expectRevert("unknown campaign");
        fundTogether.milestoneCount(999);
    }

    function testOrganizerActivatesFirstMilestoneWithoutMovingFunds() public {
        uint256 id = _create();
        _fund(id);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit MilestoneActivated(id, 0, 3_000_000);
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 0);
        (, FundTogether.MilestoneState firstState) = fundTogether.milestones(id, 0);
        (, FundTogether.MilestoneState secondState) = fundTogether.milestones(id, 1);
        assertTrue(firstState == FundTogether.MilestoneState.ACTIVE);
        assertTrue(secondState == FundTogether.MilestoneState.PENDING);
        assertEq(fundTogether.currentMilestoneIndex(id), 0);
        assertEq(
            uint256(fundTogether.campaignState(id)),
            uint256(FundTogether.CampaignState.MILESTONE_ACTIVE)
        );
        assertEq(token.balanceOf(address(fundTogether)), 14_000_000);
        assertEq(token.balanceOf(organizer), 0);
        assertEq(token.balanceOf(donor), 0);
        assertFalse(fundTogether.refundSnapshotted(id));
    }

    function testNonOrganizerCannotActivateFundedMilestone() public {
        uint256 id = _create();
        _fund(id);
        vm.expectRevert("only organizer");
        vm.prank(donor);
        fundTogether.activateMilestone(id, 0);
    }

    function testCannotActivateBeforeFundingSuccess() public {
        uint256 id = _create();
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 0);
        _publish(id);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 0);
    }

    function testCannotSkipFirstMilestoneOrActivateOutOfBounds() public {
        uint256 id = _create();
        _fund(id);
        vm.expectRevert("not next milestone");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 1);
        vm.expectRevert("not next milestone");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 999);
    }

    function testCannotRepeatActivationOrOpenNextBeforeSettlement() public {
        uint256 id = _create();
        _fund(id);
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 0);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 0);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 1);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.cancelCampaign(id);
    }

    function testUnknownCampaignCannotActivate() public {
        vm.expectRevert("unknown campaign");
        fundTogether.activateMilestone(999, 0);
    }

    function testCancelledCampaignCannotActivate() public {
        uint256 id = _create();
        vm.prank(organizer);
        fundTogether.cancelCampaign(id);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.activateMilestone(id, 0);
    }

    function testActivationDoesNotChangeAnotherCampaign() public {
        uint256 first = _create();
        uint256 second = _create();
        _fund(first);
        _fund(second);
        vm.prank(organizer);
        fundTogether.activateMilestone(first, 0);
        assertEq(
            uint256(fundTogether.campaignState(second)), uint256(FundTogether.CampaignState.FUNDED)
        );
        (, FundTogether.MilestoneState state) = fundTogether.milestones(second, 0);
        assertTrue(state == FundTogether.MilestoneState.PENDING);
        assertEq(token.balanceOf(address(fundTogether)), 28_000_000);
    }

    function testFuzzBudgetsPreserveGoalAndExposure(uint96 first, uint96 second, uint96 third)
        public
    {
        first = uint96(bound(first, 1, type(uint96).max));
        second = uint96(bound(second, 1, type(uint96).max));
        third = uint96(bound(third, 1, type(uint96).max));
        uint256[] memory budgets = new uint256[](3);
        budgets[0] = first;
        budgets[1] = second;
        budgets[2] = third;
        uint256 id = fundTogether.createCampaign("Fuzz", address(token), deadline, budgets);
        (,, uint256 goal, uint256 bond,,,,) = fundTogether.campaigns(id);
        assertEq(goal, uint256(first) + second + third);
        assertGe(bond, first);
        assertGe(bond, second);
        assertGe(bond, third);
        assertTrue(bond == first || bond == second || bond == third);
    }
}
