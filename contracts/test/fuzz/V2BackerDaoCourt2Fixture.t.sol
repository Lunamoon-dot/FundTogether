pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { V2BackerDaoCourt2Fixture } from "../fixtures/V2BackerDaoCourt2Fixture.sol";

contract V2BackerDaoCourt2FixtureFuzzTest is Test {
    V2BackerDaoCourt2Fixture internal fixture;

    function setUp() public {
        MockUSDC token = new MockUSDC();
        fixture = new V2BackerDaoCourt2Fixture(token, token);
    }

    function testFuzz_floorSqrtIsTheLargestSafeInteger(uint128 contribution) public view {
        uint256 root = fixture.floorSqrt(contribution);
        assertLe(root * root, contribution);
        assertGt((root + 1) * (root + 1), contribution);
    }

    function testFuzz_equalWeightsAlwaysDefaultToAccept(uint128 rawWeight) public view {
        uint256 weight = bound(uint256(rawWeight), 0, type(uint256).max / 20_000);
        V2BackerDaoCourt2Fixture.DaoChoice decision =
            fixture.evaluateDaoWeightsForTest(weight * 2, weight, weight);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
    }

    function testFuzz_thresholdBoundaryIsInclusive(uint128 rawWeight) public view {
        uint256 total = bound(uint256(rawWeight), 1, type(uint256).max / 10_000);
        uint256 appeal = total / 5;
        uint256 accept = total - appeal;
        V2BackerDaoCourt2Fixture.DaoChoice decision =
            fixture.evaluateDaoWeightsForTest(total, accept, appeal);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
    }

    function testFuzz_overCapContributionAlwaysReverts(uint128 extra) public {
        vm.assume(extra != 0);
        uint256 contribution = uint256(type(uint128).max) + extra;
        vm.expectRevert(V2BackerDaoCourt2Fixture.SnapshotContributionCapExceeded.selector);
        fixture.floorSqrt(contribution);
    }
}
