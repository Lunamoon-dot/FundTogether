// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { JuryRegistry } from "../../../src/jury/JuryRegistry.sol";
import { JuryReview } from "../../../src/jury/JuryReview.sol";

contract BatchSettlementTest is Test {
    MockUSDC private token;
    JuryRegistry private registry;
    MockBatchRandomness private randomness;
    JuryReview private review;
    mapping(uint256 => mapping(address => uint256)) private contributions;

    function setUp() public {
        vm.chainId(31339);
        token = new MockUSDC();
        registry = new JuryRegistry(address(token), address(0));
        randomness = new MockBatchRandomness();
        review = new JuryReview(
            address(registry),
            address(this),
            address(randomness),
            1 days,
            1 days,
            1 days,
            1 days,
            1,
            300,
            1e6,
            2,
            500
        );
        registry.configureReviewController(address(review));
    }

    function contributionOf(uint256 campaignId, address backer) external view returns (uint256) {
        return contributions[campaignId][backer];
    }

    function test_settlementBatchGasProfiles() public {
        bytes32 reviewCaseId = _createAndEnroll(45);
        vm.warp(review.randomnessDeadline(reviewCaseId) + 1);
        review.prepareRetrySettlement(reviewCaseId);

        uint256 beforeGas = gasleft();
        review.settleCaseBatch(reviewCaseId, 1);
        emit log_named_uint("settleCaseBatch(1) gas", beforeGas - gasleft());

        beforeGas = gasleft();
        review.settleCaseBatch(reviewCaseId, 2);
        emit log_named_uint("settleCaseBatch(2) gas", beforeGas - gasleft());

        beforeGas = gasleft();
        review.settleCaseBatch(reviewCaseId, 10);
        emit log_named_uint("settleCaseBatch(10) gas", beforeGas - gasleft());

        beforeGas = gasleft();
        review.settleCaseBatch(reviewCaseId, 32);
        emit log_named_uint("settleCaseBatch(32) gas", beforeGas - gasleft());

        assertTrue(review.reviewCaseSettled(reviewCaseId));
    }

    function test_threeHundredJudgesSettleThroughCappedBatches() public {
        bytes32 reviewCaseId = _createAndEnroll(300);
        vm.warp(review.randomnessDeadline(reviewCaseId) + 1);
        review.prepareRetrySettlement(reviewCaseId);

        for (uint256 i = 0; i < 10; i++) {
            review.settleCaseBatch(reviewCaseId, 300);
        }

        assertTrue(review.reviewCaseSettled(reviewCaseId));
        assertEq(review.settlementCursor(reviewCaseId), 300);
        assertEq(review.settlementPhase(reviewCaseId), 3);
    }

    function _createAndEnroll(uint256 count) private returns (bytes32 reviewCaseId) {
        reviewCaseId = review.createReviewCase(address(0xCAFE), 7, 2, 1, 100e6);
        randomness.setSeed(reviewCaseId, keccak256(abi.encode("batch", count)));

        for (uint256 i = 0; i < count; i++) {
            address judge = address(uint160(0x100000 + i));
            token.mint(judge, 10e6);
            vm.startPrank(judge);
            token.approve(address(registry), type(uint256).max);
            registry.depositStake(10e6);
            registry.reserveCaseStake(reviewCaseId, 10e6);
            review.enroll(reviewCaseId);
            vm.stopPrank();
        }
    }
}

contract MockBatchRandomness {
    mapping(bytes32 => bytes32) private seeds;

    function setSeed(bytes32 reviewCaseId, bytes32 seed) external {
        seeds[reviewCaseId] = seed;
    }

    function randomSeed(bytes32 reviewCaseId) external view returns (bytes32) {
        return seeds[reviewCaseId];
    }
}
