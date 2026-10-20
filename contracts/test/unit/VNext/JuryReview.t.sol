// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { JuryRegistry } from "../../../src/jury/JuryRegistry.sol";
import { JuryReview } from "../../../src/jury/JuryReview.sol";
import { JuryTypes } from "../../../src/jury/JuryTypes.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";

contract MockVNextRandomness {
    mapping(bytes32 => bytes32) private seeds;

    function setSeed(bytes32 caseId, bytes32 seed) external {
        seeds[caseId] = seed;
    }

    function randomSeed(bytes32 caseId) external view returns (bytes32) {
        return seeds[caseId];
    }
}

contract VNextJuryReviewTest is Test {
    MockUSDC private token;
    JuryRegistry private registry;
    MockVNextRandomness private randomness;
    JuryReview private review;
    bytes32 private caseId;
    address private creator = makeAddr("vnext-review-creator");
    address private judgeOne = makeAddr("vnext-review-judge-one");
    address private judgeTwo = makeAddr("vnext-review-judge-two");
    address private judgeThree = makeAddr("vnext-review-judge-three");
    address private judgeFour = makeAddr("vnext-review-judge-four");
    address private judgeFive = makeAddr("vnext-review-judge-five");
    address private judgeSix = makeAddr("vnext-review-judge-six");
    bytes32 private constant SALT_ONE = keccak256("salt-one");
    bytes32 private constant SALT_TWO = keccak256("salt-two");
    bytes32 private constant SALT_THREE = keccak256("salt-three");

    function setUp() public {
        vm.chainId(31339);
        token = new MockUSDC();
        registry = new JuryRegistry(address(token), address(0));
        randomness = new MockVNextRandomness();
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

        caseId = review.createReviewCase(creator, 7, 2, 1);
        randomness.setSeed(caseId, keccak256("seed-1"));

        _depositAndReserve(judgeOne);
        _depositAndReserve(judgeTwo);
        _depositAndReserve(judgeThree);
        vm.prank(judgeOne);
        review.enroll(caseId);
        vm.prank(judgeTwo);
        review.enroll(caseId);
        vm.prank(judgeThree);
        review.enroll(caseId);
    }

    function _depositAndReserve(address judge) private {
        token.mint(judge, 20e6);
        vm.startPrank(judge);
        token.approve(address(registry), type(uint256).max);
        registry.depositStake(10e6);
        registry.reserveCaseStake(caseId, 10e6);
        vm.stopPrank();
    }

    function _prepareCourt() private {
        vm.warp(review.enrollmentDeadline(caseId));
        review.finalizeSnapshot(caseId);
        review.assignCourt(caseId, 0);
    }

    function _commit(address judge, JuryTypes.Vote vote, bytes32 salt) private {
        _commitFor(caseId, judge, vote, salt);
    }

    function _commitFor(bytes32 reviewCaseId, address judge, JuryTypes.Vote vote, bytes32 salt)
        private
    {
        bytes32 commitment = JuryTypes.voteCommitment(
            block.chainid,
            review.protocolVersion(),
            7,
            2,
            1,
            review.caseNumber(reviewCaseId),
            review.reviewRound(reviewCaseId),
            0,
            judge,
            vote,
            salt
        );
        vm.prank(judge);
        review.commitVote(reviewCaseId, 0, commitment);
    }

    function _reveal(bytes32 reviewCaseId, address judge, JuryTypes.Vote vote, bytes32 salt)
        private
    {
        vm.prank(judge);
        review.revealVote(reviewCaseId, 0, vote, salt);
    }

    function _depositAndReserveForCase(address judge, bytes32 reviewCaseId) private {
        token.mint(judge, 20e6);
        vm.startPrank(judge);
        token.approve(address(registry), type(uint256).max);
        registry.depositStake(10e6);
        registry.reserveCaseStake(reviewCaseId, 10e6);
        vm.stopPrank();
    }

    function test_snapshotAssignsThreeUniqueEnrolledJudges() public {
        _prepareCourt();

        address first = review.courtJudge(caseId, 0, 0);
        address second = review.courtJudge(caseId, 0, 1);
        address third = review.courtJudge(caseId, 0, 2);

        assertTrue(first != address(0));
        assertTrue(first != second);
        assertTrue(first != third);
        assertTrue(second != third);
        assertTrue(first != creator);
        assertTrue(second != creator);
        assertTrue(third != creator);
    }

    function test_multiCourtUsesFloorOfThreeAndNeverOverlapsJudges() public {
        _depositAndReserve(judgeFour);
        _depositAndReserve(judgeFive);
        _depositAndReserve(judgeSix);
        vm.prank(judgeFour);
        review.enroll(caseId);
        vm.prank(judgeFive);
        review.enroll(caseId);
        vm.prank(judgeSix);
        review.enroll(caseId);

        _prepareCourt();
        assertEq(review.courtCount(caseId), 2);
        review.assignCourt(caseId, 1);

        address[6] memory judges;
        for (uint256 courtId = 0; courtId < 2; courtId++) {
            for (uint256 slot = 0; slot < 3; slot++) {
                judges[courtId * 3 + slot] = review.courtJudge(caseId, courtId, slot);
            }
        }
        for (uint256 i = 0; i < judges.length; i++) {
            for (uint256 j = i + 1; j < judges.length; j++) {
                assertTrue(judges[i] != judges[j]);
            }
        }
    }

    function test_onlyAssignedJudgeCanCommitAndReveal() public {
        _prepareCourt();

        vm.prank(creator);
        vm.expectRevert(JuryReview.NotAssignedJudge.selector);
        review.commitVote(caseId, 0, bytes32(uint256(1)));

        address assigned = review.courtJudge(caseId, 0, 0);
        _commit(assigned, JuryTypes.Vote.PASS, SALT_ONE);

        vm.prank(assigned);
        vm.expectRevert(JuryReview.CommitmentAlreadySubmitted.selector);
        review.commitVote(caseId, 0, bytes32(uint256(2)));
    }

    function test_assignedJudgeCannotCommitForAnotherCourt() public {
        _prepareCourt();

        address assigned = review.courtJudge(caseId, 0, 0);
        vm.prank(assigned);
        vm.expectRevert(JuryReview.NotAssignedJudge.selector);
        review.commitVote(caseId, 1, bytes32(uint256(1)));
    }

    function test_twoPassVotesFinalizeCourtAsPass() public {
        _prepareCourt();

        address first = review.courtJudge(caseId, 0, 0);
        address second = review.courtJudge(caseId, 0, 1);
        address third = review.courtJudge(caseId, 0, 2);
        _commit(first, JuryTypes.Vote.PASS, SALT_ONE);
        _commit(second, JuryTypes.Vote.PASS, SALT_TWO);
        _commit(third, JuryTypes.Vote.FAIL, SALT_THREE);

        vm.warp(review.commitDeadline(caseId));
        vm.prank(first);
        review.revealVote(caseId, 0, JuryTypes.Vote.PASS, SALT_ONE);
        vm.prank(second);
        review.revealVote(caseId, 0, JuryTypes.Vote.PASS, SALT_TWO);
        vm.prank(third);
        review.revealVote(caseId, 0, JuryTypes.Vote.FAIL, SALT_THREE);

        vm.warp(review.revealDeadline(caseId));
        assertEq(uint8(review.finalizeCourt(caseId, 0)), uint8(JuryTypes.CourtResult.PASS));
    }

    function test_missingRevealInvalidatesCourtAndCanRetry() public {
        _prepareCourt();

        address first = review.courtJudge(caseId, 0, 0);
        address second = review.courtJudge(caseId, 0, 1);
        address third = review.courtJudge(caseId, 0, 2);
        _commit(first, JuryTypes.Vote.PASS, SALT_ONE);
        _commit(second, JuryTypes.Vote.PASS, SALT_TWO);
        _commit(third, JuryTypes.Vote.FAIL, SALT_THREE);

        vm.warp(review.commitDeadline(caseId));
        vm.prank(first);
        review.revealVote(caseId, 0, JuryTypes.Vote.PASS, SALT_ONE);
        vm.prank(second);
        review.revealVote(caseId, 0, JuryTypes.Vote.PASS, SALT_TWO);

        vm.warp(review.revealDeadline(caseId));
        assertEq(uint8(review.finalizeCourt(caseId, 0)), uint8(JuryTypes.CourtResult.INVALID));
        vm.expectRevert(JuryReview.ProtocolFailureNotReady.selector);
        review.finalizeProtocolFailure(caseId);

        bytes32 retryCaseId = review.openRetry(caseId);
        assertEq(review.retryCount(caseId), 1);
        assertEq(registry.lockedStake(judgeOne), 0);
        assertTrue(retryCaseId != caseId);
    }

    function test_finalRulingIsEstablishedOnlyAfterAppealWindow() public {
        _prepareCourt();

        address first = review.courtJudge(caseId, 0, 0);
        address second = review.courtJudge(caseId, 0, 1);
        address third = review.courtJudge(caseId, 0, 2);
        _commit(first, JuryTypes.Vote.PASS, SALT_ONE);
        _commit(second, JuryTypes.Vote.PASS, SALT_TWO);
        _commit(third, JuryTypes.Vote.FAIL, SALT_THREE);

        vm.warp(review.commitDeadline(caseId));
        vm.prank(first);
        review.revealVote(caseId, 0, JuryTypes.Vote.PASS, SALT_ONE);
        vm.prank(second);
        review.revealVote(caseId, 0, JuryTypes.Vote.PASS, SALT_TWO);
        vm.prank(third);
        review.revealVote(caseId, 0, JuryTypes.Vote.FAIL, SALT_THREE);

        vm.warp(review.revealDeadline(caseId));
        review.finalizeCourt(caseId, 0);

        vm.expectRevert(JuryReview.AppealWindowOpen.selector);
        review.finalizeNoAppeal(caseId);

        vm.warp(review.revealDeadline(caseId) + review.appealWindowDuration());
        assertEq(uint8(review.finalizeNoAppeal(caseId)), uint8(VNextTypes.ReviewOutcome.FINAL_PASS));
        assertEq(uint8(review.finalOutcome(caseId)), uint8(VNextTypes.ReviewOutcome.FINAL_PASS));
        assertEq(registry.lockedStake(first), 0);
        assertEq(registry.lockedStake(second), 0);
        assertEq(registry.lockedStake(third), 0);
        assertEq(registry.availableStake(first), 10e6);
        assertEq(registry.availableStake(second), 10e6);
        assertEq(registry.availableStake(third), 9.5e6);
        assertEq(registry.pendingReward(caseId, first), 250_000);
        assertEq(registry.pendingReward(caseId, second), 250_000);
        assertEq(registry.pendingReward(caseId, third), 0);
    }

    function test_appealUsesFreshPoolAndUpdatesRootFinality() public {
        _prepareCourt();
        address first = review.courtJudge(caseId, 0, 0);
        address second = review.courtJudge(caseId, 0, 1);
        address third = review.courtJudge(caseId, 0, 2);
        _commitFor(caseId, first, JuryTypes.Vote.PASS, SALT_ONE);
        _commitFor(caseId, second, JuryTypes.Vote.PASS, SALT_TWO);
        _commitFor(caseId, third, JuryTypes.Vote.FAIL, SALT_THREE);
        vm.warp(review.commitDeadline(caseId));
        _reveal(caseId, first, JuryTypes.Vote.PASS, SALT_ONE);
        _reveal(caseId, second, JuryTypes.Vote.PASS, SALT_TWO);
        _reveal(caseId, third, JuryTypes.Vote.FAIL, SALT_THREE);
        vm.warp(review.revealDeadline(caseId));
        review.finalizeCourt(caseId, 0);

        address requester = makeAddr("vnext-appeal-requester");
        token.mint(requester, 1e6);
        vm.startPrank(requester);
        token.approve(address(review), 1e6);
        vm.stopPrank();
        bytes32 appealCaseId = review.openAppeal(caseId, requester);

        _depositAndReserveForCase(judgeFour, appealCaseId);
        _depositAndReserveForCase(judgeFive, appealCaseId);
        _depositAndReserveForCase(judgeSix, appealCaseId);
        vm.prank(judgeFour);
        review.enroll(appealCaseId);
        vm.prank(judgeFive);
        review.enroll(appealCaseId);
        vm.prank(judgeSix);
        review.enroll(appealCaseId);
        randomness.setSeed(appealCaseId, keccak256("appeal-seed"));
        vm.warp(review.enrollmentDeadline(appealCaseId));
        review.finalizeSnapshot(appealCaseId);
        review.assignCourt(appealCaseId, 0);

        address appealFirst = review.courtJudge(appealCaseId, 0, 0);
        address appealSecond = review.courtJudge(appealCaseId, 0, 1);
        address appealThird = review.courtJudge(appealCaseId, 0, 2);
        _commitFor(appealCaseId, appealFirst, JuryTypes.Vote.FAIL, SALT_ONE);
        _commitFor(appealCaseId, appealSecond, JuryTypes.Vote.FAIL, SALT_TWO);
        _commitFor(appealCaseId, appealThird, JuryTypes.Vote.PASS, SALT_THREE);
        vm.warp(review.commitDeadline(appealCaseId));
        _reveal(appealCaseId, appealFirst, JuryTypes.Vote.FAIL, SALT_ONE);
        _reveal(appealCaseId, appealSecond, JuryTypes.Vote.FAIL, SALT_TWO);
        _reveal(appealCaseId, appealThird, JuryTypes.Vote.PASS, SALT_THREE);
        vm.warp(review.revealDeadline(appealCaseId));
        assertEq(uint8(review.finalizeCourt(appealCaseId, 0)), uint8(JuryTypes.CourtResult.FAIL));

        vm.warp(review.revealDeadline(appealCaseId) + review.appealWindowDuration());
        assertEq(
            uint8(review.finalizeNoAppeal(appealCaseId)),
            uint8(VNextTypes.ReviewOutcome.VERDICT_FAIL)
        );
        assertEq(uint8(review.finalOutcome(caseId)), uint8(VNextTypes.ReviewOutcome.VERDICT_FAIL));
        assertEq(token.balanceOf(requester), 1e6);
    }

    function test_noQuorumHasPermissionlessProtocolFailurePath() public {
        bytes32 noQuorumCase = review.createReviewCase(creator, 8, 3, 1);
        vm.warp(review.enrollmentDeadline(noQuorumCase));

        bytes32 retryCaseId = review.openRetry(noQuorumCase);
        vm.warp(review.enrollmentDeadline(retryCaseId));
        bytes32 finalRetryCaseId = review.openRetry(retryCaseId);
        vm.warp(review.enrollmentDeadline(finalRetryCaseId));

        assertEq(
            uint8(review.finalizeProtocolFailure(finalRetryCaseId)),
            uint8(VNextTypes.ReviewOutcome.PROTOCOL_FAIL)
        );
        assertEq(
            uint8(review.finalOutcome(noQuorumCase)), uint8(VNextTypes.ReviewOutcome.PROTOCOL_FAIL)
        );
    }
}
