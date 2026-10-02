pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { RefundAccounting, RefundCallbackToken } from "../../mocks/RefundCallbackToken.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Test } from "forge-std/Test.sol";

contract FundTogetherRefundTest is Test {
    FundTogether internal fundTogether;
    MockUSDC internal token;
    RefundAccounting internal refunds;
    address internal organizer = address(0xA11CE);
    address internal alice = address(0xB0B);
    address internal bob = address(0xCAFE);
    uint256 internal campaignId;
    uint256 internal deadline;

    event RefundPoolSnapshotted(uint256 indexed campaignId, uint256 amount);
    event BondReturned(uint256 indexed campaignId, address indexed organizer, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);

    function setUp() public {
        fundTogether = new FundTogether();
        token = new MockUSDC();
        refunds = RefundAccounting(address(fundTogether));
        deadline = block.timestamp + 7 days;
        campaignId = _publish();
    }

    function _publish() internal returns (uint256 id) {
        vm.prank(organizer);
        id = fundTogether.createCampaign(
            "Clean water", address(token), 10_000_000, 2_000_000, deadline
        );
        token.mint(organizer, 2_000_000);
        vm.startPrank(organizer);
        token.approve(address(fundTogether), 2_000_000);
        fundTogether.lockBond(id);
        vm.stopPrank();
        fundTogether.approveCampaign(id);
        vm.prank(organizer);
        fundTogether.publishCampaign(id);
    }

    function _donate(uint256 id, address donor, uint256 amount) internal {
        token.mint(donor, amount);
        vm.startPrank(donor);
        token.approve(address(fundTogether), amount);
        fundTogether.donate(id, amount);
        vm.stopPrank();
    }

    function _cancel() internal {
        vm.prank(organizer);
        fundTogether.cancelCampaign(campaignId);
    }

    function testCancelReturnsBondAndLeavesDonorEscrow() public {
        _donate(campaignId, alice, 3_000_000);
        _cancel();
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 3_000_000);
        (,,,,, bool locked, uint256 bond,) = fundTogether.campaigns(campaignId);
        assertFalse(locked);
        assertEq(bond, 0);
    }

    function testDeadlineFailureReturnsBondToOrganizerNotCaller() public {
        _donate(campaignId, alice, 3_000_000);
        vm.warp(deadline);
        vm.prank(bob);
        fundTogether.finalizeFundingFailure(campaignId);
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(bob), 0);
        assertEq(refunds.refundPool(campaignId), 3_000_000);
    }

    function testCancelEmitsSnapshotAndBondReturn() public {
        _donate(campaignId, alice, 3_000_000);
        vm.expectEmit(true, false, false, true, address(fundTogether));
        emit RefundPoolSnapshotted(campaignId, 3_000_000);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit BondReturned(campaignId, organizer, 2_000_000);
        _cancel();
    }

    function testIndependentClaimsIncludeRepeatedDonationsAndKeepSnapshot() public {
        _donate(campaignId, alice, 1_000_000);
        _donate(campaignId, alice, 2_000_000);
        _donate(campaignId, bob, 4_000_000);
        assertEq(refunds.contributions(campaignId, alice), 3_000_000);
        _cancel();
        assertTrue(refunds.refundSnapshotted(campaignId));
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit RefundClaimed(campaignId, bob, 4_000_000);
        vm.prank(bob);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(bob), 4_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 3_000_000);
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(alice), 3_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 0);
        assertEq(refunds.refundPool(campaignId), 7_000_000);
        assertTrue(refunds.claimedRefund(campaignId, alice));
    }

    function testDeadlineFailureOpensFullRefund() public {
        _donate(campaignId, alice, 3_000_000);
        vm.warp(deadline);
        fundTogether.finalizeFundingFailure(campaignId);
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(alice), 3_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 0);
    }

    function testRepeatClaimCannotTakeOtherDonorsFunds() public {
        _donate(campaignId, alice, 3_000_000);
        _donate(campaignId, bob, 4_000_000);
        _cancel();
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        vm.expectRevert("refund already claimed");
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(address(fundTogether)), 4_000_000);
    }

    function testNonContributorCannotClaim() public {
        _donate(campaignId, alice, 3_000_000);
        _cancel();
        vm.expectRevert("no contribution");
        vm.prank(bob);
        refunds.claimRefund(campaignId);
    }

    function testRefundUnavailableDuringFundingAndAfterGoalReached() public {
        _donate(campaignId, alice, 3_000_000);
        vm.expectRevert("refund unavailable");
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        _donate(campaignId, alice, 7_000_000);
        vm.expectRevert("refund unavailable");
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(address(fundTogether)), 12_000_000);
    }

    function testUnknownCampaignCannotClaim() public {
        vm.expectRevert("unknown campaign");
        refunds.claimRefund(999);
    }

    function testZeroDonationsStillReturnsBondAndSnapshotsZero() public {
        _cancel();
        assertTrue(refunds.refundSnapshotted(campaignId));
        assertEq(refunds.refundPool(campaignId), 0);
        assertEq(token.balanceOf(organizer), 2_000_000);
    }

    function testCannotRepeatTerminationOrRelockReturnedBond() public {
        _donate(campaignId, alice, 3_000_000);
        _cancel();
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.cancelCampaign(campaignId);
        vm.warp(deadline);
        vm.expectRevert("invalid state");
        fundTogether.finalizeFundingFailure(campaignId);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.lockBond(campaignId);
        assertEq(refunds.refundPool(campaignId), 3_000_000);
        assertEq(token.balanceOf(organizer), 2_000_000);
    }

    function testCannotCancelOrFinalizeFundedCampaign() public {
        _donate(campaignId, alice, 10_000_000);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.cancelCampaign(campaignId);
        vm.warp(deadline);
        vm.expectRevert("invalid state");
        fundTogether.finalizeFundingFailure(campaignId);
        assertEq(token.balanceOf(organizer), 0);
    }

    function testUnauthorizedCancelAndEarlyFailureCannotMoveBond() public {
        vm.expectRevert("only organizer");
        vm.prank(alice);
        fundTogether.cancelCampaign(campaignId);
        vm.expectRevert("deadline not reached");
        fundTogether.finalizeFundingFailure(campaignId);
        assertEq(token.balanceOf(address(fundTogether)), 2_000_000);
    }

    function testBondTransferFailureRollsBackTerminationAndAllowsRetry() public {
        _donate(campaignId, alice, 3_000_000);
        bytes memory transfer = abi.encodeCall(IERC20.transfer, (organizer, 2_000_000));
        vm.mockCall(address(token), transfer, abi.encode(false));
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        _cancel();
        assertEq(
            uint256(fundTogether.campaignState(campaignId)),
            uint256(FundTogether.CampaignState.FUNDING)
        );
        assertFalse(refunds.refundSnapshotted(campaignId));
        assertEq(token.balanceOf(address(fundTogether)), 5_000_000);
        vm.clearMockedCalls();
        _cancel();
        assertEq(token.balanceOf(organizer), 2_000_000);
    }

    function testRefundTransferFailurePreservesClaimForRetry() public {
        _donate(campaignId, alice, 3_000_000);
        _cancel();
        vm.mockCall(
            address(token), abi.encodeCall(IERC20.transfer, (alice, 3_000_000)), abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertFalse(refunds.claimedRefund(campaignId, alice));
        assertEq(token.balanceOf(address(fundTogether)), 3_000_000);
        vm.clearMockedCalls();
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(alice), 3_000_000);
    }

    function testClaimsCannotSpendAnotherCampaignBondOrUnexpectedTransfers() public {
        uint256 other = _publish();
        _donate(campaignId, alice, 3_000_000);
        _donate(other, bob, 4_000_000);
        token.mint(address(fundTogether), 123);
        _cancel();
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        assertEq(refunds.refundPool(campaignId), 3_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 6_000_123);
        assertFalse(refunds.refundSnapshotted(other));
    }

    function testDonationTransferFailureDoesNotCreateRefundEntitlement() public {
        token.mint(alice, 3_000_000);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector,
                address(fundTogether),
                0,
                3_000_000
            )
        );
        vm.prank(alice);
        fundTogether.donate(campaignId, 3_000_000);
        assertEq(refunds.contributions(campaignId, alice), 0);
        (,,,,,,, uint256 total) = fundTogether.campaigns(campaignId);
        assertEq(total, 0);
        _cancel();
        assertEq(refunds.refundPool(campaignId), 0);
    }

    function testTokenCallbackCannotClaimDuringBondReturn() public {
        RefundCallbackToken callbackToken = new RefundCallbackToken();
        uint256 id = fundTogether.createCampaign(
            "Callback", address(callbackToken), 10_000_000, 2_000_000, deadline
        );
        callbackToken.mint(address(this), 2_000_000);
        callbackToken.approve(address(fundTogether), 2_000_000);
        fundTogether.lockBond(id);
        fundTogether.approveCampaign(id);
        fundTogether.publishCampaign(id);
        callbackToken.mint(address(callbackToken), 3_000_000);
        vm.startPrank(address(callbackToken));
        callbackToken.approve(address(fundTogether), 3_000_000);
        fundTogether.donate(id, 3_000_000);
        vm.stopPrank();
        callbackToken.arm(refunds, id);
        fundTogether.cancelCampaign(id);
        assertTrue(callbackToken.attempted());
        assertFalse(callbackToken.nestedSucceeded());
        assertEq(
            callbackToken.nestedError(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertFalse(refunds.claimedRefund(id, address(callbackToken)));
        assertEq(callbackToken.balanceOf(address(fundTogether)), 3_000_000);
        vm.prank(address(callbackToken));
        refunds.claimRefund(id);
        assertEq(callbackToken.balanceOf(address(callbackToken)), 3_000_000);
        assertEq(callbackToken.balanceOf(address(fundTogether)), 0);
    }

    function testFuzzFullRefundConservesFunds(uint256 aliceAmount, uint256 bobAmount) public {
        aliceAmount = bound(aliceAmount, 1, 4_999_999);
        bobAmount = bound(bobAmount, 1, 4_999_999);
        _donate(campaignId, alice, aliceAmount);
        _donate(campaignId, bob, bobAmount);
        _cancel();
        vm.prank(alice);
        refunds.claimRefund(campaignId);
        vm.prank(bob);
        refunds.claimRefund(campaignId);
        assertEq(token.balanceOf(alice), aliceAmount);
        assertEq(token.balanceOf(bob), bobAmount);
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 0);
        assertEq(refunds.refundPool(campaignId), aliceAmount + bobAmount);
    }
}
