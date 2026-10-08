pragma solidity 0.8.24;

import { FundTogether } from "../../src/FundTogether.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../helpers/CampaignFixtures.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Test } from "forge-std/Test.sol";

// Ghost accounting exists only in the harness; production claims never enumerate donors.
contract RefundHandler is Test {
    FundTogether public target;
    MockUSDC public token;
    uint256 public unsolicited = 123;
    uint256 public lockedBond = 200;
    uint256[3] public totals;
    uint256[3] public paid;
    uint256[3] public pools;
    bool[3] public snapshotted;
    mapping(uint256 => mapping(uint256 => uint256)) public contributed;
    mapping(uint256 => mapping(uint256 => uint256)) public received;
    mapping(uint256 => mapping(uint256 => bool)) public claimed;
    address internal constant ORGANIZER = address(0xA11CE);
    address internal constant REVIEWER = address(0xE11);
    uint256 internal constant DONORS = 16;

    constructor() {
        target = new FundTogether();
        token = new MockUSDC();
        target.grantRole(target.VERIFIER_ROLE(), REVIEWER);
        _publish(200, 200);
        _publish(83, 53);
        for (uint256 id; id < 2; ++id) {
            for (uint256 i; i < DONORS; ++i) {
                // Repeated deposits must give one aggregated entitlement per wallet.
                _donate(id, i, 1);
                if (i > 0) _donate(id, i, i);
            }
        }
        vm.prank(ORGANIZER);
        target.cancelCampaign(0);
        pools[0] = 136;
        snapshotted[0] = true;
        vm.startPrank(ORGANIZER);
        target.activateMilestone(1, 0);
        target.submitEvidence(1, 0, keccak256("evidence"));
        vm.stopPrank();
        target.assignVerifier(1, 0, 1, REVIEWER);
        vm.prank(REVIEWER);
        target.verifySubmission(1, 0, 1, keccak256("evidence"));
        (, uint256 end) = target.milestoneEvidence(1, 0);
        vm.warp(end);
        target.settleMilestone(1, 0);
        vm.warp(target.activationDeadlines(1));
        target.finalizeMilestoneTimeout(1, 1);
        pools[1] = 53;
        snapshotted[1] = true;
        _publish(200, 200);
        for (uint256 i; i < DONORS; ++i) {
            _donate(2, i, i + 1);
        }
        token.mint(address(target), unsolicited);
    }

    function donor(uint256 i) public pure returns (address) {
        return address(uint160(0x1000 + i));
    }

    function _publish(uint256 first, uint256 second) internal {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = first;
        budgets[1] = second;
        vm.prank(ORGANIZER);
        uint256 id = target.createCampaign(
            "Refund invariant", address(token), block.timestamp + 7 days, budgets
        );
        CampaignFixtures.configureCriteria(target, id);
        uint256 bond = first > second ? first : second;
        token.mint(ORGANIZER, bond);
        vm.startPrank(ORGANIZER);
        token.approve(address(target), bond);
        target.lockBond(id);
        vm.stopPrank();
        target.approveCampaign(id);
        vm.prank(ORGANIZER);
        target.publishCampaign(id);
    }

    function _donate(uint256 id, uint256 i, uint256 amount) internal {
        token.mint(donor(i), amount);
        vm.startPrank(donor(i));
        token.approve(address(target), amount);
        target.donate(id, amount);
        vm.stopPrank();
        contributed[id][i] += amount;
        totals[id] += amount;
    }

    function entitlement(uint256 id, uint256 i) public view returns (uint256) {
        return contributed[id][i] * pools[id] / totals[id];
    }

    function claim(uint256 campaignSeed, uint256 donorSeed) public {
        uint256 id = campaignSeed % 3;
        uint256 i = donorSeed % DONORS;
        if (!snapshotted[id] || claimed[id][i]) {
            vm.expectRevert(
                !snapshotted[id] ? bytes("refund unavailable") : bytes("refund already claimed")
            );
            vm.prank(donor(i));
            target.claimRefund(id);
            return;
        }
        uint256 before = token.balanceOf(donor(i));
        vm.prank(donor(i));
        target.claimRefund(id);
        uint256 amount = token.balanceOf(donor(i)) - before;
        assertEq(amount, entitlement(id, i));
        received[id][i] += amount;
        paid[id] += amount;
        claimed[id][i] = true;
        // Every successful claim, including a zero payout, must immediately reject a second call.
        vm.expectRevert("refund already claimed");
        vm.prank(donor(i));
        target.claimRefund(id);
    }

    function failedTransferThenRetry(uint256 campaignSeed, uint256 donorSeed) external {
        uint256 id = campaignSeed % 3;
        uint256 i = donorSeed % DONORS;
        if (claimed[id][i] || entitlement(id, i) == 0) return;
        uint256 before = token.balanceOf(address(target));
        vm.mockCall(
            address(token),
            abi.encodeCall(IERC20.transfer, (donor(i), entitlement(id, i))),
            abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        vm.prank(donor(i));
        target.claimRefund(id);
        assertFalse(target.claimedRefund(id, donor(i)));
        assertEq(token.balanceOf(address(target)), before);
        vm.clearMockedCalls();
        claim(id, i);
    }

    function donateToOtherCampaign(uint256 donorSeed, uint256 amountSeed) external {
        if (snapshotted[2]) return;
        uint256 remaining = 399 - totals[2];
        if (remaining == 0) return;
        _donate(2, donorSeed % DONORS, bound(amountSeed, 1, remaining));
    }

    function cancelOtherCampaign() external {
        if (snapshotted[2]) {
            vm.expectRevert("invalid state");
            vm.prank(ORGANIZER);
            target.cancelCampaign(2);
            return;
        }
        vm.prank(ORGANIZER);
        target.cancelCampaign(2);
        pools[2] = totals[2];
        snapshotted[2] = true;
        lockedBond = 0;
    }

    function unexpectedTokens(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, 1_000_000);
        token.mint(address(target), amount);
        unsolicited += amount;
    }

    function outsiderClaim(uint256 campaignSeed) external {
        vm.expectRevert("no contribution");
        vm.prank(address(0xDEAD));
        target.claimRefund(campaignSeed % 2);
    }
}

contract FundTogetherRefundInvariantTest is Test {
    RefundHandler internal handler;
    FundTogether internal target;

    function setUp() public {
        handler = new RefundHandler();
        target = handler.target();
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.claim.selector;
        selectors[1] = handler.failedTransferThenRetry.selector;
        selectors[2] = handler.donateToOtherCampaign.selector;
        selectors[3] = handler.unexpectedTokens.selector;
        selectors[4] = handler.outsiderClaim.selector;
        selectors[5] = handler.cancelOtherCampaign.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
        targetContract(address(handler));
    }

    function invariant_entitlementsFlagsAndPoolsStayConsistent() public view {
        for (uint256 id; id < 3; ++id) {
            uint256 total;
            uint256 sumEntitlements;
            for (uint256 i; i < 16; ++i) {
                uint256 contribution = handler.contributed(id, i);
                total += contribution;
                assertEq(target.contributions(id, handler.donor(i)), contribution);
                assertEq(target.claimedRefund(id, handler.donor(i)), handler.claimed(id, i));
                assertLe(handler.received(id, i), handler.entitlement(id, i));
                sumEntitlements += handler.entitlement(id, i);
            }
            (,,,,,,, uint256 onchainTotal) = target.campaigns(id);
            assertEq(onchainTotal, total);
            assertEq(total, handler.totals(id));
            if (!handler.snapshotted(id)) {
                assertFalse(target.refundSnapshotted(id));
                assertEq(handler.paid(id), 0);
            } else {
                uint256 pool = handler.pools(id);
                assertTrue(target.refundSnapshotted(id));
                assertEq(target.refundPool(id), pool);
                assertLe(handler.paid(id), sumEntitlements);
                assertLe(sumEntitlements, pool);
                assertLt(pool - sumEntitlements, 16); // Base units, not whole tokens.
            }
        }
    }

    function invariant_escrowConservesFundsAcrossCampaigns() public view {
        // Terminal refunds and another campaign's live or cancelled escrow share one token.
        uint256 expected = 136 - handler.paid(0) + 53 - handler.paid(1) + handler.totals(2)
            - handler.paid(2) + handler.lockedBond() + handler.unsolicited();
        assertEq(handler.token().balanceOf(address(target)), expected);
        assertEq(target.totalReleased(0), 0);
        assertEq(target.totalReleased(1), 83);
        assertEq(target.totalReleased(2), 0);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(2);
        assertEq(locked, !handler.snapshotted(2));
        assertEq(bond, handler.lockedBond());
    }
}
