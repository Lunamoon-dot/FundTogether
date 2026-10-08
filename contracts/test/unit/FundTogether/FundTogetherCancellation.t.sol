pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { FundTogetherBase } from "../../../src/modules/FundTogetherBase.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Test } from "forge-std/Test.sol";

contract FundTogetherCancellationTest is Test {
    FundTogether internal fundTogether;
    MockUSDC internal token;
    address internal organizer = address(0xA11CE);
    address internal donor = address(0xB0B);
    uint256 internal deadline;
    uint256 internal campaignId;

    event CampaignCancelled(uint256 indexed campaignId, address indexed organizer);
    event BondReturned(uint256 indexed campaignId, address indexed organizer, uint256 amount);

    function setUp() public {
        fundTogether = new FundTogether();
        token = new MockUSDC();
        deadline = block.timestamp + 7 days;
        campaignId = _create(address(token));
    }

    function _create(address donationToken) internal returns (uint256 id) {
        vm.prank(organizer);
        id = fundTogether.createCampaign(
            "Clean water", donationToken, deadline, CampaignFixtures.equalBudgets(5, 2_000_000)
        );
    }

    function _lock(uint256 id) internal {
        token.mint(organizer, 2_000_000);
        vm.startPrank(organizer);
        token.approve(address(fundTogether), 2_000_000);
        fundTogether.lockBond(id);
        vm.stopPrank();
    }

    function _cancel(uint256 id) internal {
        vm.prank(organizer);
        fundTogether.cancelCampaign(id);
    }

    function testDraftCancellationReturnsLockedBondBeforeDeadline() public {
        _lock(campaignId);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit CampaignCancelled(campaignId, organizer);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit BondReturned(campaignId, organizer, 2_000_000);
        _cancel(campaignId);

        assertEq(
            uint256(fundTogether.campaignState(campaignId)),
            uint256(FundTogetherBase.CampaignState.CANCELLED)
        );
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 0);
        (,,,,, bool locked, uint256 bond,) = fundTogether.campaigns(campaignId);
        assertFalse(locked);
        assertEq(bond, 0);
        assertEq(fundTogether.refundPool(campaignId), 0);
        vm.expectRevert("no contribution");
        vm.prank(donor);
        fundTogether.claimRefund(campaignId);
    }

    function testApprovedCancellationRecoversBondAfterPublicationDeadline() public {
        _lock(campaignId);
        CampaignFixtures.configureCriteria(fundTogether, campaignId);
        fundTogether.approveCampaign(campaignId);
        vm.warp(deadline);
        vm.expectRevert("deadline passed");
        vm.prank(organizer);
        fundTogether.publishCampaign(campaignId);

        _cancel(campaignId);
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 0);
    }

    function testDraftCancellationRecoversBondAfterDeadlineWithoutApproval() public {
        _lock(campaignId);
        vm.warp(deadline + 1);
        _cancel(campaignId);
        assertEq(token.balanceOf(organizer), 2_000_000);
    }

    function testUnbondedDraftCancellationDoesNotCallToken() public {
        // Configuration alone has moved no tokens, so cancellation must not depend on a token call.
        uint256 id = _create(address(0xBAD));
        _cancel(id);
        assertEq(
            uint256(fundTogether.campaignState(id)), uint256(FundTogetherBase.CampaignState.CANCELLED)
        );
        assertEq(token.balanceOf(organizer), 0);
    }

    function testUnbondedApprovedCancellationDoesNotCallToken() public {
        uint256 id = _create(address(0xBAD));
        CampaignFixtures.configureCriteria(fundTogether, id);
        fundTogether.approveCampaign(id);
        _cancel(id);
        assertEq(
            uint256(fundTogether.campaignState(id)), uint256(FundTogetherBase.CampaignState.CANCELLED)
        );
    }

    function testOnlyOrganizerCanCancelDraftOrApprovedCampaign() public {
        _lock(campaignId);
        vm.expectRevert("only organizer");
        vm.prank(donor);
        fundTogether.cancelCampaign(campaignId);
        CampaignFixtures.configureCriteria(fundTogether, campaignId);
        fundTogether.approveCampaign(campaignId);
        vm.expectRevert("only organizer");
        vm.prank(donor);
        fundTogether.cancelCampaign(campaignId);
        assertEq(token.balanceOf(address(fundTogether)), 2_000_000);
    }

    function testCancelledDraftCannotApprovePublishRelockOrReturnBondAgain() public {
        _lock(campaignId);
        _cancel(campaignId);
        vm.expectRevert("invalid state");
        fundTogether.approveCampaign(campaignId);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.publishCampaign(campaignId);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.lockBond(campaignId);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.cancelCampaign(campaignId);
        assertEq(token.balanceOf(organizer), 2_000_000);
    }

    function testDraftBondTransferFailurePreservesCustodyAndAllowsRetry() public {
        _lock(campaignId);
        vm.mockCall(
            address(token),
            abi.encodeCall(IERC20.transfer, (organizer, 2_000_000)),
            abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        _cancel(campaignId);
        assertEq(
            uint256(fundTogether.campaignState(campaignId)),
            uint256(FundTogetherBase.CampaignState.DRAFT)
        );
        assertFalse(fundTogether.refundSnapshotted(campaignId));
        (,,,,, bool locked, uint256 bond,) = fundTogether.campaigns(campaignId);
        assertTrue(locked);
        assertEq(bond, 2_000_000);
        assertEq(token.balanceOf(address(fundTogether)), 2_000_000);
        vm.clearMockedCalls();
        _cancel(campaignId);
        assertEq(token.balanceOf(organizer), 2_000_000);
    }

    function testDraftCancellationLeavesAnotherCampaignEscrowIntact() public {
        _lock(campaignId);
        uint256 activeId = _create(address(token));
        _lock(activeId);
        CampaignFixtures.configureCriteria(fundTogether, activeId);
        fundTogether.approveCampaign(activeId);
        vm.prank(organizer);
        fundTogether.publishCampaign(activeId);
        token.mint(donor, 3_000_000);
        vm.startPrank(donor);
        token.approve(address(fundTogether), 3_000_000);
        fundTogether.donate(activeId, 3_000_000);
        vm.stopPrank();

        _cancel(campaignId);
        assertEq(token.balanceOf(address(fundTogether)), 5_000_000);
        assertEq(fundTogether.contributions(activeId, donor), 3_000_000);
        assertEq(
            uint256(fundTogether.campaignState(activeId)),
            uint256(FundTogetherBase.CampaignState.FUNDING)
        );
        assertFalse(fundTogether.refundSnapshotted(activeId));
    }
}
