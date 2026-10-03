pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { SettlementCallbackToken } from "../../mocks/SettlementCallbackToken.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Test } from "forge-std/Test.sol";

interface SettlementFlow {
    function submitEvidence(uint256 id, uint256 index, bytes32 hash) external;
    function openChallenge(uint256 id, uint256 index, bytes32 reasonHash) external;
    function settleMilestone(uint256 id, uint256 index) external;
    function milestoneEvidence(uint256 id, uint256 index) external view returns (bytes32, uint256);
    function totalReleased(uint256 id) external view returns (uint256);
    function REVIEW_WINDOW() external view returns (uint256);
}

contract FundTogetherSettlementTest is Test {
    FundTogether internal target;
    SettlementFlow internal flow;
    MockUSDC internal token;
    address internal organizer = address(0xA11CE);
    address internal donor = address(0xB0B);
    uint256 internal id;
    bytes32 internal constant EVIDENCE = keccak256("evidence manifest");
    event SubmissionVerified(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address verifier,
        bytes32 evidenceHash,
        uint256 reviewEnd
    );
    event MilestoneSettled(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 amount
    );

    function setUp() public {
        target = new FundTogether();
        flow = SettlementFlow(address(target));
        token = new MockUSDC();
        id = _fund(CampaignFixtures.equalBudgets(2, 2_000_000));
        vm.prank(organizer);
        target.activateMilestone(id, 0);
    }

    function _fund(uint256[] memory budgets) internal returns (uint256 campaignId) {
        vm.prank(organizer);
        campaignId =
            target.createCampaign("Supplies", address(token), block.timestamp + 7 days, budgets);
        CampaignFixtures.configureCriteria(target, campaignId);
        (,, uint256 goal, uint256 bond,,,,) = target.campaigns(campaignId);
        token.mint(organizer, bond);
        vm.startPrank(organizer);
        token.approve(address(target), bond);
        target.lockBond(campaignId);
        vm.stopPrank();
        target.approveCampaign(campaignId);
        vm.prank(organizer);
        target.publishCampaign(campaignId);
        token.mint(donor, goal);
        vm.startPrank(donor);
        token.approve(address(target), goal);
        target.donate(campaignId, goal);
        vm.stopPrank();
    }

    function _submit(uint256 campaignId, uint256 index) internal returns (uint256 end) {
        vm.prank(organizer);
        flow.submitEvidence(campaignId, index, EVIDENCE);
        uint256 version = target.submissionVersion(campaignId, index);
        address reviewer = address(0xE11);
        target.grantRole(target.VERIFIER_ROLE(), reviewer);
        target.assignVerifier(campaignId, index, version, reviewer);
        vm.prank(reviewer);
        target.verifySubmission(campaignId, index, version, EVIDENCE);
        (, end) = flow.milestoneEvidence(campaignId, index);
    }

    function testDefaultReviewIs72Hours() public view {
        assertEq(flow.REVIEW_WINDOW(), 72 hours);
    }

    function testSubmissionCommitsEvidenceAndEmitsDeadlineWithoutMovingMoney() public {
        vm.prank(organizer);
        flow.submitEvidence(id, 0, EVIDENCE);
        target.grantRole(target.VERIFIER_ROLE(), address(0xE11));
        target.assignVerifier(id, 0, 1, address(0xE11));
        vm.expectEmit(true, true, true, true, address(target));
        emit SubmissionVerified(id, 0, 1, address(0xE11), EVIDENCE, block.timestamp + 72 hours);
        vm.prank(address(0xE11));
        target.verifySubmission(id, 0, 1, EVIDENCE);
        (, uint256 end) = flow.milestoneEvidence(id, 0);
        (bytes32 hash,) = flow.milestoneEvidence(id, 0);
        assertEq(hash, EVIDENCE);
        assertEq(end, block.timestamp + 72 hours);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        assertEq(token.balanceOf(organizer), 0);
    }

    function testOnlyOrganizerCanSubmit() public {
        vm.expectRevert("only organizer");
        vm.prank(donor);
        flow.submitEvidence(id, 0, EVIDENCE);
    }

    function testZeroEvidenceRejected() public {
        vm.expectRevert("evidence required");
        vm.prank(organizer);
        flow.submitEvidence(id, 0, bytes32(0));
    }

    function testFutureEvidenceRejected() public {
        vm.expectRevert("not current milestone");
        vm.prank(organizer);
        flow.submitEvidence(id, 1, EVIDENCE);
    }

    function testEvidenceCannotRestartReview() public {
        uint256 end = _submit(id, 0);
        vm.warp(block.timestamp + 1);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        flow.submitEvidence(id, 0, keccak256("replacement"));
        (bytes32 hash, uint256 unchangedEnd) = flow.milestoneEvidence(id, 0);
        assertEq(hash, EVIDENCE);
        assertEq(end, unchangedEnd);
    }

    function testSettlementRequiresEvidence() public {
        vm.expectRevert("invalid state");
        flow.settleMilestone(id, 0);
    }

    function testSettlementBlockedOneSecondBeforeDeadline() public {
        uint256 end = _submit(id, 0);
        vm.warp(end - 1);
        vm.expectRevert("review not ended");
        flow.settleMilestone(id, 0);
        assertEq(token.balanceOf(address(target)), 6_000_000);
    }

    function testAnyoneSettlesAtDeadlinePayingOrganizerOnly() public {
        vm.warp(_submit(id, 0));
        vm.expectEmit(true, true, false, true, address(target));
        emit MilestoneSettled(id, 0, 2_000_000);
        vm.prank(donor);
        flow.settleMilestone(id, 0);
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(donor), 0);
        assertEq(token.balanceOf(address(target)), 4_000_000);
        assertEq(flow.totalReleased(id), 2_000_000);
        assertEq(target.currentMilestoneIndex(id), 1);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(id);
        assertTrue(locked);
        assertEq(bond, 2_000_000);
    }

    function testCannotSettleFutureOrRepeatMilestone() public {
        vm.warp(_submit(id, 0));
        vm.expectRevert("not current milestone");
        flow.settleMilestone(id, 1);
        flow.settleMilestone(id, 0);
        vm.expectRevert("invalid state");
        flow.settleMilestone(id, 0);
    }

    function testNextActivationWaitsForSettlement() public {
        _submit(id, 0);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        target.activateMilestone(id, 1);
    }

    function testFullJourneyCompletesAndReturnsBondOnce() public {
        vm.warp(_submit(id, 0));
        flow.settleMilestone(id, 0);
        vm.prank(organizer);
        target.activateMilestone(id, 1);
        vm.warp(_submit(id, 1));
        flow.settleMilestone(id, 1);
        assertEq(flow.totalReleased(id), 4_000_000);
        assertEq(token.balanceOf(organizer), 6_000_000);
        assertEq(token.balanceOf(address(target)), 0);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(id);
        assertFalse(locked);
        assertEq(bond, 0);
        vm.expectRevert("invalid state");
        flow.settleMilestone(id, 1);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        target.activateMilestone(id, 2);
        assertFalse(target.refundSnapshotted(id));
    }

    function testDonorChallengeBeforeDeadlineBlocksRelease() public {
        uint256 end = _submit(id, 0);
        vm.warp(end - 1);
        vm.prank(donor);
        flow.openChallenge(id, 0, keccak256("missing receipts"));
        vm.warp(end);
        vm.expectRevert("invalid state");
        flow.settleMilestone(id, 0);
        assertEq(token.balanceOf(address(target)), 6_000_000);
    }

    function testChallengeCannotStartAtDeadline() public {
        vm.warp(_submit(id, 0));
        vm.expectRevert("review ended");
        vm.prank(donor);
        flow.openChallenge(id, 0, EVIDENCE);
        flow.settleMilestone(id, 0);
    }

    function testNonDonorCannotChallenge() public {
        _submit(id, 0);
        vm.expectRevert("no contribution");
        flow.openChallenge(id, 0, EVIDENCE);
    }

    function testEmptyChallengeReasonRejected() public {
        _submit(id, 0);
        vm.expectRevert("reason required");
        vm.prank(donor);
        flow.openChallenge(id, 0, bytes32(0));
    }

    function testReleaseFailureRollsBackAndCanRetry() public {
        vm.warp(_submit(id, 0));
        vm.mockCall(
            address(token),
            abi.encodeCall(IERC20.transfer, (organizer, 2_000_000)),
            abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        flow.settleMilestone(id, 0);
        assertEq(flow.totalReleased(id), 0);
        assertEq(target.currentMilestoneIndex(id), 0);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        vm.clearMockedCalls();
        flow.settleMilestone(id, 0);
    }

    function testFinalBondFailureRollsBackEntireSettlement() public {
        SettlementCallbackToken failingToken = new SettlementCallbackToken();
        token = failingToken;
        uint256 single = _fund(CampaignFixtures.equalBudgets(1, 3_000_000));
        vm.prank(organizer);
        target.activateMilestone(single, 0);
        vm.warp(_submit(single, 0));
        // Execute a real release, then fail the bond transfer to verify atomic rollback.
        failingToken.arm(address(target), "", 2);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        flow.settleMilestone(single, 0);
        assertEq(flow.totalReleased(single), 0);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(single);
        assertTrue(locked);
        assertEq(bond, 3_000_000);
        assertEq(token.balanceOf(organizer), 0);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        failingToken.arm(address(target), "", 0);
        flow.settleMilestone(single, 0);
        assertEq(token.balanceOf(address(target)), 0);
        assertEq(token.balanceOf(organizer), 6_000_000);
    }

    function testTokenCallbackCannotActivateNextMilestoneDuringRelease() public {
        SettlementCallbackToken callbackToken = new SettlementCallbackToken();
        token = callbackToken;
        organizer = address(callbackToken);
        uint256 campaignId = _fund(CampaignFixtures.equalBudgets(2, 2_000_000));
        vm.prank(organizer);
        target.activateMilestone(campaignId, 0);
        vm.warp(_submit(campaignId, 0));
        callbackToken.arm(
            address(target), abi.encodeCall(FundTogether.activateMilestone, (campaignId, 1)), 0
        );
        flow.settleMilestone(campaignId, 0);
        assertTrue(callbackToken.attempted());
        assertFalse(callbackToken.nestedSucceeded());
        assertEq(
            callbackToken.nestedError(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        (, FundTogether.MilestoneState state) = target.milestones(campaignId, 1);
        assertTrue(state == FundTogether.MilestoneState.PENDING);
    }

    function testUnknownCampaignCannotSubmitChallengeOrSettle() public {
        vm.expectRevert("unknown campaign");
        flow.submitEvidence(999, 0, EVIDENCE);
        vm.expectRevert("unknown campaign");
        flow.openChallenge(999, 0, EVIDENCE);
        vm.expectRevert("unknown campaign");
        flow.settleMilestone(999, 0);
    }

    function testChallengeCannotTargetFutureMilestoneOrRepeat() public {
        _submit(id, 0);
        vm.expectRevert("not current milestone");
        vm.prank(donor);
        flow.openChallenge(id, 1, EVIDENCE);
        vm.prank(donor);
        flow.openChallenge(id, 0, EVIDENCE);
        vm.expectRevert("invalid state");
        vm.prank(donor);
        flow.openChallenge(id, 0, EVIDENCE);
    }

    function testFuzzSettlementConservesEscrowAndBond(uint96 first, uint96 second) public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = bound(first, 1, type(uint96).max);
        budgets[1] = bound(second, 1, type(uint96).max);
        uint256 goal = budgets[0] + budgets[1];
        uint256 bond = budgets[0] > budgets[1] ? budgets[0] : budgets[1];
        uint256 campaignId = _fund(budgets);
        vm.prank(organizer);
        target.activateMilestone(campaignId, 0);
        vm.warp(_submit(campaignId, 0));
        flow.settleMilestone(campaignId, 0);
        assertEq(token.balanceOf(address(target)), 6_000_000 + budgets[1] + bond);
        assertEq(flow.totalReleased(campaignId), budgets[0]);
        vm.prank(organizer);
        target.activateMilestone(campaignId, 1);
        vm.warp(_submit(campaignId, 1));
        flow.settleMilestone(campaignId, 1);
        assertEq(token.balanceOf(organizer), goal + bond);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        assertEq(flow.totalReleased(campaignId), goal);
        assertTrue(target.campaignState(campaignId) == FundTogether.CampaignState.COMPLETED);
        assertTrue(target.campaignState(id) == FundTogether.CampaignState.MILESTONE_ACTIVE);
        assertEq(flow.totalReleased(id), 0);
    }
}
