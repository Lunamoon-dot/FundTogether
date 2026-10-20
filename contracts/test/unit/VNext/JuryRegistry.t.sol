// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { JuryRegistry } from "../../../src/jury/JuryRegistry.sol";

contract VNextJuryRegistryTest is Test {
    MockUSDC private token;
    JuryRegistry private registry;
    address private controller = makeAddr("vnext-review-controller");
    address private judge = makeAddr("vnext-judge");
    bytes32 private constant CASE_ID = keccak256("case-1");

    function setUp() public {
        token = new MockUSDC();
        registry = new JuryRegistry(address(token), controller);
        token.mint(judge, 100e6);

        vm.prank(judge);
        token.approve(address(registry), type(uint256).max);
    }

    function test_depositAndWithdrawUsesOnlyAvailableStake() public {
        vm.startPrank(judge);
        registry.depositStake(100e6);
        registry.withdrawStake(40e6);
        vm.stopPrank();

        assertEq(registry.depositedStake(judge), 60e6);
        assertEq(registry.availableStake(judge), 60e6);
        assertEq(registry.lockedStake(judge), 0);
        assertEq(token.balanceOf(judge), 40e6);
    }

    function test_caseReservationCannotExceedAvailableStake() public {
        vm.startPrank(judge);
        registry.depositStake(50e6);
        vm.stopPrank();
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));
        vm.prank(controller);
        registry.registerCase(keccak256("case-2"), block.timestamp + 1 days, 1, keccak256("BASE"));
        vm.startPrank(judge);
        registry.reserveCaseStake(CASE_ID, 30e6);
        vm.expectRevert(JuryRegistry.InsufficientAvailableStake.selector);
        registry.reserveCaseStake(keccak256("case-2"), 21e6);
        vm.stopPrank();

        assertEq(registry.availableStake(judge), 20e6);
        assertEq(registry.lockedStake(judge), 30e6);
        assertEq(registry.caseStake(CASE_ID, judge), 30e6);
    }

    function test_unknownCaseCannotReserveStake() public {
        vm.startPrank(judge);
        registry.depositStake(50e6);
        vm.expectRevert(JuryRegistry.UnknownCase.selector);
        registry.reserveCaseStake(CASE_ID, 30e6);
        vm.stopPrank();
    }

    function test_reserveBelowRequiredStakeReverts() public {
        vm.prank(judge);
        registry.depositStake(50e6);
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));

        vm.prank(judge);
        vm.expectRevert(JuryRegistry.InsufficientCaseStake.selector);
        registry.reserveCaseStake(CASE_ID, 29e6);
    }

    function test_unenrolledStakeCanBeRecovered() public {
        vm.prank(judge);
        registry.depositStake(50e6);
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));

        vm.prank(judge);
        registry.reserveCaseStake(CASE_ID, 30e6);
        vm.warp(block.timestamp + 1 days);

        registry.releaseUnenrolledCaseStake(CASE_ID, judge);

        assertEq(registry.availableStake(judge), 50e6);
        assertEq(registry.lockedStake(judge), 0);
        assertEq(registry.caseStake(CASE_ID, judge), 0);
    }

    function test_enrolledStakeCannotUsePreEnrollmentRecovery() public {
        vm.prank(judge);
        registry.depositStake(50e6);
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));

        vm.prank(judge);
        registry.reserveCaseStake(CASE_ID, 30e6);
        vm.prank(controller);
        registry.markCaseEnrollment(CASE_ID, judge);
        vm.warp(block.timestamp + 1 days);

        vm.expectRevert(JuryRegistry.CaseAlreadyEnrolled.selector);
        registry.releaseUnenrolledCaseStake(CASE_ID, judge);
    }

    function test_caseRegistrationIsControllerOnly() public {
        vm.prank(judge);
        vm.expectRevert(JuryRegistry.NotReviewController.selector);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));
    }

    function test_onlyReviewControllerCanSettleAndCannotSettleTwice() public {
        vm.prank(judge);
        registry.depositStake(50e6);
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));
        vm.prank(judge);
        registry.reserveCaseStake(CASE_ID, 30e6);

        vm.prank(judge);
        vm.expectRevert(JuryRegistry.NotReviewController.selector);
        registry.settleCaseStake(CASE_ID, judge, 5e6);

        vm.prank(controller);
        registry.settleCaseStake(CASE_ID, judge, 5e6);

        assertEq(registry.availableStake(judge), 45e6);
        assertEq(registry.lockedStake(judge), 0);
        assertEq(registry.caseStake(CASE_ID, judge), 0);
        assertTrue(registry.caseSettled(CASE_ID, judge));

        vm.prank(controller);
        vm.expectRevert(JuryRegistry.CaseAlreadySettled.selector);
        registry.settleCaseStake(CASE_ID, judge, 0);
    }

    function test_unknownCaseCannotSettleStake() public {
        vm.prank(controller);
        vm.expectRevert(JuryRegistry.UnknownCase.selector);
        registry.settleCaseStake(CASE_ID, judge, 0);
    }

    function test_settlementCannotSlashMoreThanLockedCaseStake() public {
        vm.prank(judge);
        registry.depositStake(50e6);
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));
        vm.prank(judge);
        registry.reserveCaseStake(CASE_ID, 30e6);

        vm.prank(controller);
        vm.expectRevert(JuryRegistry.InvalidSlash.selector);
        registry.settleCaseStake(CASE_ID, judge, 31e6);
    }

    function test_slashPoolCanBeCreditedAndClaimedExactlyOnce() public {
        vm.prank(judge);
        registry.depositStake(50e6);
        vm.prank(controller);
        registry.registerCase(CASE_ID, block.timestamp + 1 days, 30e6, keccak256("BASE"));
        vm.prank(judge);
        registry.reserveCaseStake(CASE_ID, 30e6);

        vm.prank(controller);
        registry.settleCaseStake(CASE_ID, judge, 5e6);
        vm.prank(controller);
        registry.creditReward(CASE_ID, judge, 5e6);

        vm.prank(judge);
        registry.claimReward(CASE_ID);
        assertEq(token.balanceOf(judge), 55e6);

        vm.prank(judge);
        vm.expectRevert(JuryRegistry.RewardAlreadyClaimed.selector);
        registry.claimReward(CASE_ID);
    }

    function test_reviewControllerCanBeConfiguredOnlyOnce() public {
        JuryRegistry unconfigured = new JuryRegistry(address(token), address(0));
        unconfigured.configureReviewController(controller);
        assertEq(unconfigured.reviewController(), controller);
        assertTrue(unconfigured.controllerLocked());

        vm.expectRevert(JuryRegistry.ControllerAlreadyLocked.selector);
        unconfigured.configureReviewController(address(this));
    }
}
