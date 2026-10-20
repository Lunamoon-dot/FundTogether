// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { JuryRegistry } from "../../src/jury/JuryRegistry.sol";
import { JuryReview } from "../../src/jury/JuryReview.sol";

contract InvariantRandomness {
    mapping(bytes32 => bytes32) private seeds;

    function setSeed(bytes32 reviewCaseId, bytes32 seed) external {
        seeds[reviewCaseId] = seed;
    }

    function randomSeed(bytes32 reviewCaseId) external view returns (bytes32) {
        return seeds[reviewCaseId];
    }
}

contract VNextJuryHandler is Test {
    MockUSDC public immutable token;
    JuryRegistry public immutable registry;
    InvariantRandomness public immutable randomness;
    JuryReview public immutable review;
    bytes32 public immutable caseId;
    address[9] private judges;

    constructor() {
        token = new MockUSDC();
        registry = new JuryRegistry(address(token), address(0));
        randomness = new InvariantRandomness();
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
        caseId = review.createReviewCase(address(0xCAFE), 7, 2, 1, 100e6);
        randomness.setSeed(caseId, keccak256("invariant-seed"));

        for (uint256 i = 0; i < judges.length; i++) {
            judges[i] = address(uint160(0x100000 + i));
            token.mint(judges[i], 10e6);
            vm.startPrank(judges[i]);
            token.approve(address(registry), type(uint256).max);
            registry.depositStake(10e6);
            registry.reserveCaseStake(caseId, 10e6);
            vm.stopPrank();
        }
    }

    function enroll(uint8 rawIndex) external {
        uint256 index = uint256(rawIndex) % judges.length;
        if (review.enrolled(caseId, judges[index])) return;

        vm.prank(judges[index]);
        try review.enroll(caseId) { } catch { }
    }

    function finalizeSnapshot() external {
        vm.warp(review.enrollmentDeadline(caseId) + 1);
        try review.finalizeSnapshot(caseId) { } catch { }
    }

    function assignCourt(uint8 rawCourt) external {
        uint256 count = review.courtCount(caseId);
        if (count == 0) return;

        uint256 courtId = uint256(rawCourt) % count;
        if (review.courtAssigned(caseId, courtId)) return;
        try review.assignCourt(caseId, courtId) { } catch { }
    }

    function judgeAt(uint256 index) external view returns (address) {
        return judges[index];
    }

    function judgeCount() external pure returns (uint256) {
        return 9;
    }
}

contract VNextJuryInvariantTest is StdInvariant, Test {
    VNextJuryHandler private handler;

    function setUp() public {
        vm.chainId(31339);
        handler = new VNextJuryHandler();
        targetContract(address(handler));
    }

    function invariant_assignedCourtsContainUniqueEnrolledJudges() public view {
        uint256 courtCount = handler.review().courtCount(handler.caseId());
        for (uint256 courtId = 0; courtId < courtCount; courtId++) {
            if (!handler.review().courtAssigned(handler.caseId(), courtId)) continue;

            address first = handler.review().courtJudge(handler.caseId(), courtId, 0);
            address second = handler.review().courtJudge(handler.caseId(), courtId, 1);
            address third = handler.review().courtJudge(handler.caseId(), courtId, 2);
            assertTrue(first != address(0) && second != address(0) && third != address(0));
            assertTrue(first != second && first != third && second != third);
            assertTrue(handler.review().enrolled(handler.caseId(), first));
            assertTrue(handler.review().enrolled(handler.caseId(), second));
            assertTrue(handler.review().enrolled(handler.caseId(), third));

            for (uint256 previousCourt = 0; previousCourt < courtId; previousCourt++) {
                if (!handler.review().courtAssigned(handler.caseId(), previousCourt)) continue;
                for (uint256 previousSlot = 0; previousSlot < 3; previousSlot++) {
                    address previous = handler.review().courtJudge(
                        handler.caseId(), previousCourt, previousSlot
                    );
                    assertTrue(first != previous && second != previous && third != previous);
                }
            }
        }
    }

    function invariant_assignedJudgeHasReservedStake() public view {
        uint256 requiredStake = handler.review().requiredCaseStake(handler.caseId());
        for (uint256 i = 0; i < handler.judgeCount(); i++) {
            address judge = handler.judgeAt(i);
            if (!handler.review().assignedJudge(handler.caseId(), judge)) continue;
            assertGe(handler.registry().caseStake(handler.caseId(), judge), requiredStake);
        }
    }
}
