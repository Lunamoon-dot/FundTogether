pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { FundTogetherMvp } from "../../../src/FundTogetherMvp.sol";
import { FundTogetherBase } from "../../../src/modules/FundTogetherBase.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";

contract MvpBlockedToken is MockUSDC {
    address public blocked;
    bool public returnsFalse;
    bool public rejectDeposits;
    FundTogetherMvp public observedTarget;
    uint256 public observedCampaign;
    uint256 public observedPaid;
    bool public reentryRejected;

    function setBlocked(address value) external {
        blocked = value;
    }

    function setReturnsFalse(bool value) external {
        returnsFalse = value;
    }

    function setRejectDeposits(bool value) external {
        rejectDeposits = value;
    }

    function setObserver(FundTogetherMvp value, uint256 campaignId) external {
        observedTarget = value;
        observedCampaign = campaignId;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (address(observedTarget) != address(0)) {
            observedPaid = observedTarget.refundPaid(observedCampaign);
            (bool success, bytes memory reason) = address(observedTarget)
                .call(abi.encodeCall(observedTarget.claimRefund, (observedCampaign)));
            reentryRejected =
                !success && bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()"));
        }
        if (to == blocked) {
            if (returnsFalse) return false;
            revert("blocked recipient");
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (rejectDeposits) return false;
        return super.transferFrom(from, to, amount);
    }
}

// Prepared for the user's combined verification run; compilation is not execution.
contract FundTogetherMvpTest is Test {
    FundTogetherMvp target;
    MvpBlockedToken token;
    address organizer = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCAFE);
    bytes32 constant HASH = keccak256("evidence-1");
    bytes32 constant REASON = keccak256("review findings");
    uint256 id;

    function setUp() public {
        token = new MvpBlockedToken();
        target = new FundTogetherMvp(address(token), keccak256("instance-1"));
        vm.prank(organizer);
        id = target.createCampaign(
            "Supplies",
            address(token),
            block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(2, 2_000_000)
        );
        CampaignFixtures.configureCriteria(target, id);
        token.mint(organizer, 2_000_000);
        vm.startPrank(organizer);
        token.approve(address(target), 2_000_000);
        target.lockBond(id);
        vm.stopPrank();
        target.approveCampaign(id);
        vm.prank(organizer);
        target.publishCampaign(id);
        _donate(alice, 3_000_000);
        _donate(bob, 1_000_000);
        _submit(0, HASH);
    }

    function _donate(address donor, uint256 amount) internal {
        token.mint(donor, amount);
        vm.startPrank(donor);
        token.approve(address(target), amount);
        target.donate(id, amount);
        vm.stopPrank();
    }

    function _submit(uint256 index, bytes32 hash) internal {
        vm.startPrank(organizer);
        if (target.campaignState(id) != FundTogetherBase.CampaignState.MILESTONE_ACTIVE) {
            target.activateMilestone(id, index);
        }
        target.submitEvidence(id, index, hash);
        vm.stopPrank();
    }

    function _admit(uint256 index, uint256 version, bytes32 hash) internal {
        target.admitEvidence(id, index, version, hash, REASON);
    }

    function _open(uint256 index, uint256 version, bytes32 hash)
        internal
        returns (uint256 response, uint256 end)
    {
        _admit(index, version, hash);
        vm.prank(alice);
        target.openChallenge(id, index, REASON);
        (,,,, response, end,,) = target.challengeCases(id, index, version);
    }

    function _resolve(
        uint256 index,
        uint256 version,
        bytes32 hash,
        FundTogetherMvp.Resolution verdict
    ) internal {
        (,,,, uint256 response,,,) = target.challengeCases(id, index, version);
        vm.warp(response);
        target.resolveChallenge(id, index, version, hash, verdict, REASON);
    }

    function _state(FundTogetherBase.CampaignState expected) internal view {
        assertEq(uint256(target.campaignState(id)), uint256(expected));
    }

    function _resolution(uint256 index, uint256 version, FundTogetherMvp.Resolution expected)
        internal
        view
    {
        (,,,,,, FundTogetherMvp.Resolution actual,) = target.challengeCases(id, index, version);
        assertEq(uint256(actual), uint256(expected));
    }

    function _settleFirst() internal {
        _admit(0, 1, HASH);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        vm.warp(end);
        target.settleMilestone(id, 0);
        _submit(1, HASH);
    }

    function testResolverAdmissionWithoutVerifierStartsExactly72Hours() public {
        uint256 start = block.timestamp;
        _admit(0, 1, HASH);
        _state(FundTogetherBase.CampaignState.IN_REVIEW);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, start + 72 hours);
        assertEq(token.balanceOf(organizer), 0);
        vm.expectRevert("invalid state");
        _admit(0, 1, HASH);
    }

    function testDeploymentInstanceIsRequiredAndChangesRuntimeIdentity() public {
        vm.expectRevert("deployment ID required");
        new FundTogetherMvp(address(token), bytes32(0));
        FundTogetherMvp other = new FundTogetherMvp(address(token), keccak256("fresh-instance"));
        assertEq(target.deploymentId(), keccak256("instance-1"));
        assertTrue(keccak256(address(target).code) != keccak256(address(other).code));
    }

    function testAdmissionRequiresResolverExactVersionHashAndReason() public {
        vm.expectRevert("only resolver");
        vm.prank(organizer);
        target.admitEvidence(id, 0, 1, HASH, REASON);
        vm.expectRevert("not current submission");
        target.admitEvidence(id, 0, 2, HASH, REASON);
        vm.expectRevert("evidence mismatch");
        target.admitEvidence(id, 0, 1, REASON, REASON);
        vm.expectRevert("reason required");
        target.admitEvidence(id, 0, 1, HASH, bytes32(0));
    }

    function testVersionBoundSubmissionCannotUseAnOldConfirmationAfterRejection() public {
        target.rejectEvidence(id, 0, 1, HASH, REASON);
        vm.expectRevert("evidence version changed");
        vm.prank(organizer);
        target.submitEvidenceForVersion(id, 0, 1, REASON);
        assertEq(target.submissionVersion(id, 0), 1);
        vm.prank(organizer);
        target.submitEvidenceForVersion(id, 0, 2, REASON);
        assertEq(target.submissionVersion(id, 0), 2);
    }

    function testVersionBoundChallengeRejectsStaleVersionAndHash() public {
        target.rejectEvidence(id, 0, 1, HASH, REASON);
        vm.prank(organizer);
        target.submitEvidenceForVersion(id, 0, 2, REASON);
        _admit(0, 2, REASON);
        vm.expectRevert("evidence version changed");
        vm.prank(alice);
        target.challengeEvidenceForVersion(id, 0, 1, HASH, REASON);
        vm.expectRevert("evidence hash changed");
        vm.prank(alice);
        target.challengeEvidenceForVersion(id, 0, 2, HASH, REASON);
        _state(FundTogetherBase.CampaignState.IN_REVIEW);
        vm.prank(alice);
        target.challengeEvidenceForVersion(id, 0, 2, REASON, HASH);
        _state(FundTogetherBase.CampaignState.CHALLENGED);
    }

    function testVersionBoundSettlementRejectsStaleConfirmationWithoutMovingFunds() public {
        target.rejectEvidence(id, 0, 1, HASH, REASON);
        vm.prank(organizer);
        target.submitEvidenceForVersion(id, 0, 2, REASON);
        _admit(0, 2, REASON);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        vm.warp(end);
        vm.expectRevert("evidence version changed");
        target.settleMilestoneForVersion(id, 0, 1, HASH);
        vm.expectRevert("evidence hash changed");
        target.settleMilestoneForVersion(id, 0, 2, HASH);
        assertEq(target.totalReleased(id), 0);
        assertEq(token.balanceOf(organizer), 0);
        target.settleMilestoneForVersion(id, 0, 2, REASON);
        assertEq(target.totalReleased(id), 2_000_000);
        vm.expectRevert("invalid state");
        target.settleMilestoneForVersion(id, 0, 2, REASON);
    }

    function testAdmissionAtDeadlineMustExpireInstead() public {
        vm.warp(target.admissionDeadlines(id, 0, 1));
        vm.expectRevert("admission deadline passed");
        _admit(0, 1, HASH);
        target.expireSubmission(id, 0, 1);
        _state(FundTogetherBase.CampaignState.MILESTONE_ACTIVE);
        assertEq(target.evidenceDeadlines(id, 0), block.timestamp + 7 days);
    }

    function testLegacyRoleGrantsCannotBypassMvpAdmission() public {
        target.grantRole(target.VERIFIER_ROLE(), bob);
        vm.expectRevert("separate verifier is post-MVP");
        target.assignVerifier(id, 0, 1, bob);
        vm.expectRevert("use MVP evidence admission");
        vm.prank(bob);
        target.verifySubmission(id, 0, 1, HASH);
        vm.expectRevert("use MVP evidence rejection");
        vm.prank(bob);
        target.rejectSubmission(id, 0, 1, HASH, REASON);
    }

    function testResolverWhoContributedCannotAdmit() public {
        FundTogetherMvp other = new FundTogetherMvp(address(token), keccak256("instance-2"));
        vm.prank(organizer);
        uint256 otherId = other.createCampaign(
            "Conflict",
            address(token),
            block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(1, 10)
        );
        CampaignFixtures.configureCriteria(other, otherId);
        token.mint(organizer, 10);
        vm.startPrank(organizer);
        token.approve(address(other), 10);
        other.lockBond(otherId);
        vm.stopPrank();
        other.approveCampaign(otherId);
        vm.prank(organizer);
        other.publishCampaign(otherId);
        token.mint(address(this), 10);
        token.approve(address(other), 10);
        other.donate(otherId, 10);
        vm.startPrank(organizer);
        other.activateMilestone(otherId, 0);
        other.submitEvidence(otherId, 0, HASH);
        vm.stopPrank();
        vm.expectRevert("contributor cannot review");
        other.admitEvidence(otherId, 0, 1, HASH, REASON);
    }

    function testChallengeRequiresDonorAndOpenReviewWindow() public {
        _admit(0, 1, HASH);
        vm.expectRevert("no contribution");
        target.openChallenge(id, 0, REASON);
        vm.expectRevert("reason required");
        vm.prank(alice);
        target.openChallenge(id, 0, bytes32(0));
        (, uint256 end) = target.milestoneEvidence(id, 0);
        vm.warp(end);
        vm.expectRevert("review ended");
        vm.prank(alice);
        target.openChallenge(id, 0, REASON);
        target.settleMilestone(id, 0);
        assertEq(target.totalReleased(id), 2_000_000);
    }

    function testResolverOrganizerCannotReviewOwnEvidence() public {
        uint256 ownId = target.createCampaign(
            "Own", address(token), block.timestamp + 7 days, CampaignFixtures.equalBudgets(1, 10)
        );
        target.configureMilestoneCriteria(ownId, 0, HASH);
        token.mint(address(this), 10);
        token.approve(address(target), 10);
        target.lockBond(ownId);
        target.approveCampaign(ownId);
        target.publishCampaign(ownId);
        token.mint(alice, 10);
        vm.startPrank(alice);
        token.approve(address(target), 10);
        target.donate(ownId, 10);
        vm.stopPrank();
        target.activateMilestone(ownId, 0);
        target.submitEvidence(ownId, 0, HASH);
        vm.expectRevert("organizer cannot review");
        target.admitEvidence(ownId, 0, 1, HASH, REASON);
    }

    function testPendingCaseDoesNotAllowRefundOrCancellation() public {
        _open(0, 1, HASH);
        vm.expectRevert("refund unavailable");
        vm.prank(alice);
        target.claimRefund(id);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        target.cancelCampaign(id);
        _state(FundTogetherBase.CampaignState.CHALLENGED);
        assertFalse(target.refundSnapshotted(id));
        assertEq(token.balanceOf(address(target)), 6_000_000);
    }

    function testCasePinsVersionHashDeadlinesAndBlocksSettlement() public {
        uint256 start = block.timestamp;
        (uint256 response, uint256 end) = _open(0, 1, HASH);
        assertEq(response, start + 7 days);
        assertEq(end, start + 14 days);
        (address challenger, bytes32 hash, bytes32 reason,,,,,) = target.challengeCases(id, 0, 1);
        assertEq(challenger, alice);
        assertEq(hash, HASH);
        assertEq(reason, REASON);
        vm.warp(start + 3 days);
        vm.expectRevert("invalid state");
        target.settleMilestone(id, 0);
        vm.expectRevert("version case already opened");
        vm.prank(bob);
        target.openChallenge(id, 0, REASON);
        assertEq(target.totalReleased(id), 0);
    }

    function testMaterialsRequireDonorAndDoNotResetDeadlines() public {
        (uint256 response, uint256 end) = _open(0, 1, HASH);
        vm.expectRevert("no contribution");
        target.addChallengeMaterial(id, 0, 1, HASH);
        vm.expectRevert("duplicate material");
        vm.prank(bob);
        target.addChallengeMaterial(id, 0, 1, REASON);
        vm.prank(bob);
        target.addChallengeMaterial(id, 0, 1, HASH);
        assertTrue(target.challengeMaterial(id, 0, 1, HASH));
        (,,,, uint256 sameResponse, uint256 sameEnd,,) = target.challengeCases(id, 0, 1);
        assertEq(sameResponse, response);
        assertEq(sameEnd, end);
        vm.warp(response);
        vm.expectRevert("response deadline passed");
        vm.prank(bob);
        target.addChallengeMaterial(id, 0, 1, keccak256("late"));
    }

    function testOrganizerResponseIsImmutableAndBounded() public {
        (uint256 response,) = _open(0, 1, HASH);
        vm.expectRevert("only organizer");
        target.submitChallengeResponse(id, 0, 1, HASH);
        vm.expectRevert("response required");
        vm.prank(organizer);
        target.submitChallengeResponse(id, 0, 1, bytes32(0));
        vm.prank(organizer);
        target.submitChallengeResponse(id, 0, 1, HASH);
        vm.expectRevert("response already submitted");
        vm.prank(organizer);
        target.submitChallengeResponse(id, 0, 1, REASON);
        vm.warp(response);
        vm.expectRevert("response deadline passed");
        vm.prank(organizer);
        target.submitChallengeResponse(id, 0, 1, REASON);
    }

    function testResolutionCannotBypassActorTimeVersionHashOrReason() public {
        (uint256 response, uint256 end) = _open(0, 1, HASH);
        vm.expectRevert("only resolver");
        vm.prank(bob);
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.CONTINUE, REASON);
        vm.expectRevert("response window open");
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.CONTINUE, REASON);
        vm.warp(response);
        vm.expectRevert("not current milestone");
        target.resolveChallenge(id, 1, 1, HASH, FundTogetherMvp.Resolution.CONTINUE, REASON);
        vm.expectRevert("not current submission");
        target.resolveChallenge(id, 0, 2, HASH, FundTogetherMvp.Resolution.CONTINUE, REASON);
        vm.expectRevert("evidence mismatch");
        target.resolveChallenge(id, 0, 1, REASON, FundTogetherMvp.Resolution.CONTINUE, REASON);
        vm.expectRevert("reason required");
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.CONTINUE, bytes32(0));
        vm.expectRevert("invalid resolution");
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.TIMEOUT, REASON);
        vm.warp(end);
        vm.expectRevert("resolution deadline passed");
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.CONTINUE, REASON);
    }

    function testContinuePreservesReviewEndNoCaseReplayAndSingleRelease() public {
        _open(0, 1, HASH);
        (, uint256 originalEnd) = target.milestoneEvidence(id, 0);
        _resolve(0, 1, HASH, FundTogetherMvp.Resolution.CONTINUE);
        _resolution(0, 1, FundTogetherMvp.Resolution.CONTINUE);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, originalEnd);
        assertEq(token.balanceOf(organizer), 0);
        vm.expectRevert("version case already opened");
        vm.prank(bob);
        target.openChallenge(id, 0, REASON);
        vm.expectRevert("invalid state");
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.STOP, REASON);
        target.settleMilestone(id, 0);
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(target.totalReleased(id), 2_000_000);
        assertEq(target.currentMilestoneIndex(id), 1);
        vm.expectRevert("invalid state");
        target.settleMilestone(id, 0);
    }

    function testResubmitPreservesOldCaseAndRequiresNewAdmissionAndReview() public {
        _open(0, 1, HASH);
        _resolve(0, 1, HASH, FundTogetherMvp.Resolution.RESUBMIT);
        _state(FundTogetherBase.CampaignState.MILESTONE_ACTIVE);
        assertEq(target.evidenceDeadlines(id, 0), block.timestamp + 7 days);
        _resolution(0, 1, FundTogetherMvp.Resolution.RESUBMIT);
        _submit(0, REASON);
        vm.expectRevert("not current submission");
        _admit(0, 1, HASH);
        _admit(0, 2, REASON);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, block.timestamp + 72 hours);
        vm.prank(bob);
        target.openChallenge(id, 0, HASH);
        _state(FundTogetherBase.CampaignState.CHALLENGED);
        _resolution(0, 1, FundTogetherMvp.Resolution.RESUBMIT);
    }

    function testThirdVersionCannotRequestFourthButCanStop() public {
        for (uint256 version = 1; version < 3; ++version) {
            _open(0, version, HASH);
            _resolve(0, version, HASH, FundTogetherMvp.Resolution.RESUBMIT);
            _submit(0, HASH);
        }
        (uint256 response,) = _open(0, 3, HASH);
        vm.warp(response);
        vm.expectRevert("submission limit reached");
        target.resolveChallenge(id, 0, 3, HASH, FundTogetherMvp.Resolution.RESUBMIT, REASON);
        target.resolveChallenge(id, 0, 3, HASH, FundTogetherMvp.Resolution.STOP, REASON);
        _state(FundTogetherBase.CampaignState.FAILED);
    }

    function testRepeatedAdmissionRejectionAlsoUsesSameThreeVersionLimit() public {
        for (uint256 version = 1; version <= 3; ++version) {
            target.rejectEvidence(id, 0, version, HASH, REASON);
            if (version < 3) _submit(0, HASH);
        }
        _state(FundTogetherBase.CampaignState.FAILED);
        assertEq(target.refundPool(id), 4_000_000);
        assertEq(target.claimableBond(id), 2_000_000);
        assertEq(token.balanceOf(organizer), 0);
    }

    function testStopAfterPriorReleaseRefundsOnlyRemainderAndReturnsBondSeparately() public {
        _settleFirst();
        _open(1, 1, HASH);
        _resolve(1, 1, HASH, FundTogetherMvp.Resolution.STOP);
        assertEq(target.totalReleased(id), 2_000_000);
        assertEq(target.refundPool(id), 2_000_000);
        assertEq(token.balanceOf(organizer), 2_000_000);
        vm.prank(organizer);
        target.claimBond(id);
        assertEq(token.balanceOf(organizer), 4_000_000);
        vm.prank(alice);
        target.claimRefund(id);
        vm.prank(bob);
        target.claimRefund(id);
        assertEq(token.balanceOf(alice), 1_500_000);
        assertEq(token.balanceOf(bob), 500_000);
        assertEq(token.balanceOf(address(target)), 0);
        vm.expectRevert("refund already claimed");
        vm.prank(alice);
        target.claimRefund(id);
    }

    function testTimeoutAtExactBoundaryIsPermissionlessAndCannotRepeat() public {
        (, uint256 end) = _open(0, 1, HASH);
        vm.warp(end - 1);
        vm.expectRevert("resolution deadline not reached");
        target.finalizeChallengeTimeout(id, 0, 1);
        vm.warp(end);
        vm.prank(address(123));
        target.finalizeChallengeTimeout(id, 0, 1);
        _state(FundTogetherBase.CampaignState.FAILED);
        _resolution(0, 1, FundTogetherMvp.Resolution.TIMEOUT);
        assertEq(target.refundPool(id), 4_000_000);
        assertEq(target.claimableBond(id), 2_000_000);
        vm.expectRevert("invalid state");
        target.finalizeChallengeTimeout(id, 0, 1);
    }

    function testBlockedBondRecipientCannotBlockRefundSnapshotAndOtherClaims() public {
        _open(0, 1, HASH);
        token.setBlocked(organizer);
        (,,,, uint256 response,,,) = target.challengeCases(id, 0, 1);
        vm.warp(response);
        target.resolveChallenge(id, 0, 1, HASH, FundTogetherMvp.Resolution.STOP, REASON);
        _state(FundTogetherBase.CampaignState.FAILED);
        _resolution(0, 1, FundTogetherMvp.Resolution.STOP);
        assertTrue(target.refundSnapshotted(id));
        assertEq(token.balanceOf(address(target)), 6_000_000);
        vm.expectRevert("blocked recipient");
        vm.prank(organizer);
        target.claimBond(id);
        assertEq(target.claimableBond(id), 2_000_000);
        vm.prank(alice);
        target.claimRefund(id);
        vm.prank(bob);
        target.claimRefund(id);
        assertEq(target.refundPaid(id), 4_000_000);
        assertEq(token.balanceOf(address(target)), 2_000_000);
        token.setBlocked(address(0));
        vm.prank(organizer);
        target.claimBond(id);
        assertEq(target.claimableBond(id), 0);
        assertEq(token.balanceOf(organizer), 2_000_000);
        vm.expectRevert("no claimable bond");
        vm.prank(organizer);
        target.claimBond(id);
    }

    function testSettlementFailureRollsBackCounterAndCanRetry() public {
        _admit(0, 1, HASH);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        vm.warp(end);
        token.setBlocked(organizer);
        vm.expectRevert("blocked recipient");
        target.settleMilestone(id, 0);
        assertEq(target.totalReleased(id), 0);
        assertEq(target.currentMilestoneIndex(id), 0);
        _state(FundTogetherBase.CampaignState.IN_REVIEW);
        token.setBlocked(address(0));
        target.settleMilestone(id, 0);
        assertEq(target.totalReleased(id), 2_000_000);
    }

    function testCompletionReleasesBudgetsInOrderAndReturnsBondOnce() public {
        _settleFirst();
        _admit(1, 1, HASH);
        (, uint256 end) = target.milestoneEvidence(id, 1);
        vm.warp(end);
        target.settleMilestone(id, 1);
        _state(FundTogetherBase.CampaignState.COMPLETED);
        assertEq(target.totalReleased(id), 4_000_000);
        assertEq(token.balanceOf(organizer), 4_000_000);
        assertEq(token.balanceOf(address(target)), 2_000_000);
        vm.prank(organizer);
        target.claimBond(id);
        assertEq(token.balanceOf(organizer), 6_000_000);
        assertEq(token.balanceOf(address(target)), 0);
        assertFalse(target.refundSnapshotted(id));
        vm.expectRevert("invalid state");
        target.settleMilestone(id, 1);
    }

    function testBondCreditCannotBeClaimedEarlyOrByAnotherWallet() public {
        vm.expectRevert("no claimable bond");
        vm.prank(organizer);
        target.claimBond(id);
        _open(0, 1, HASH);
        _resolve(0, 1, HASH, FundTogetherMvp.Resolution.STOP);
        vm.expectRevert("only organizer");
        vm.prank(alice);
        target.claimBond(id);
        assertEq(target.claimableBond(id), 2_000_000);
    }

    function testFalseRefundTransferRetainsRightsAndCountersWhileOtherDonorClaims() public {
        _open(0, 1, HASH);
        _resolve(0, 1, HASH, FundTogetherMvp.Resolution.STOP);
        token.setBlocked(alice);
        token.setReturnsFalse(true);
        vm.expectRevert();
        vm.prank(alice);
        target.claimRefund(id);
        assertFalse(target.claimedRefund(id, alice));
        assertEq(target.refundPaid(id), 0);
        assertEq(target.refundClaimedContribution(id), 0);
        vm.prank(bob);
        target.claimRefund(id);
        assertEq(target.refundPaid(id), 1_000_000);
        token.setReturnsFalse(false);
        vm.expectRevert("blocked recipient");
        vm.prank(alice);
        target.claimRefund(id);
        token.setBlocked(address(0));
        vm.prank(alice);
        target.claimRefund(id);
        assertEq(target.refundPaid(id), 4_000_000);
        vm.expectRevert("refund already claimed");
        vm.prank(alice);
        target.claimRefund(id);
    }

    function testFalseBondClaimRetainsCredit() public {
        _open(0, 1, HASH);
        _resolve(0, 1, HASH, FundTogetherMvp.Resolution.STOP);
        token.setBlocked(organizer);
        token.setReturnsFalse(true);
        vm.expectRevert();
        vm.prank(organizer);
        target.claimBond(id);
        assertEq(target.claimableBond(id), 2_000_000);
        assertEq(token.balanceOf(organizer), 0);
    }

    function testRefundAccountingPrecedesTokenCallbackAndRejectsReentry() public {
        _open(0, 1, HASH);
        _resolve(0, 1, HASH, FundTogetherMvp.Resolution.STOP);
        token.setObserver(target, id);
        vm.prank(alice);
        target.claimRefund(id);
        assertEq(token.observedPaid(), 3_000_000);
        assertTrue(token.reentryRejected());
        assertEq(target.refundClaimedContribution(id), 3_000_000);
    }

    function testRejectedAtomicBondDepositDoesNotCreateCampaignOrConsumeDraftKey() public {
        token.mint(organizer, 10);
        vm.prank(organizer);
        token.approve(address(target), 10);
        token.setRejectDeposits(true);
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = HASH;
        uint256 beforeId = target.nextCampaignId();
        vm.expectRevert();
        vm.prank(organizer);
        target.submitCampaignForDraft(
            REASON, "New", block.timestamp + 7 days, CampaignFixtures.equalBudgets(1, 10), criteria
        );
        assertEq(target.nextCampaignId(), beforeId);
        assertEq(target.campaignForDraft(organizer, REASON), 0);
        token.setRejectDeposits(false);
        vm.prank(organizer);
        target.submitCampaignForDraft(
            REASON, "New", block.timestamp + 7 days, CampaignFixtures.equalBudgets(1, 10), criteria
        );
        assertEq(target.nextCampaignId(), beforeId + 1);
    }

    function testFuzzFinalDustIsOneBaseUnitAndNotUnclaimedRights(uint256 rawGoal, bool reverse)
        public
    {
        uint256 goal = bound(rawGoal, 4, type(uint200).max);
        FundTogetherMvp other = new FundTogetherMvp(address(token), keccak256("dust-instance"));
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 1;
        budgets[1] = goal - 1;
        vm.prank(organizer);
        uint256 otherId =
            other.createCampaign("Dust", address(token), block.timestamp + 7 days, budgets);
        CampaignFixtures.configureCriteria(other, otherId);
        token.mint(organizer, goal - 1);
        vm.startPrank(organizer);
        token.approve(address(other), goal - 1);
        other.lockBond(otherId);
        vm.stopPrank();
        other.approveCampaign(otherId);
        vm.prank(organizer);
        other.publishCampaign(otherId);
        token.mint(alice, goal - 1);
        vm.startPrank(alice);
        token.approve(address(other), goal - 1);
        other.donate(otherId, goal - 1);
        vm.stopPrank();
        token.mint(bob, 1);
        vm.startPrank(bob);
        token.approve(address(other), 1);
        other.donate(otherId, 1);
        vm.stopPrank();
        vm.startPrank(organizer);
        other.activateMilestone(otherId, 0);
        other.submitEvidence(otherId, 0, HASH);
        vm.stopPrank();
        other.admitEvidence(otherId, 0, 1, HASH, REASON);
        (, uint256 end) = other.milestoneEvidence(otherId, 0);
        vm.warp(end);
        other.settleMilestone(otherId, 0);
        vm.warp(other.activationDeadlines(otherId));
        other.finalizeMilestoneTimeout(otherId, 1);
        (uint256 paid, uint256 remaining, bool allClaimed, uint256 dust) =
            other.refundAccounting(otherId);
        assertEq(paid, 0);
        assertEq(remaining, goal - 1);
        assertFalse(allClaimed);
        assertEq(dust, 0);
        address first = reverse ? bob : alice;
        address second = reverse ? alice : bob;
        vm.prank(first);
        other.claimRefund(otherId);
        (,, allClaimed, dust) = other.refundAccounting(otherId);
        assertFalse(allClaimed);
        assertEq(dust, 0);
        vm.prank(second);
        other.claimRefund(otherId);
        (paid, remaining, allClaimed, dust) = other.refundAccounting(otherId);
        assertEq(paid, goal - 2);
        assertEq(remaining, 1);
        assertTrue(allClaimed);
        assertEq(dust, 1);
        assertEq(other.refundClaimedContribution(otherId), goal);
        assertEq(other.claimableBond(otherId), goal - 1);
        assertEq(token.balanceOf(address(other)), goal); // Bond credit plus one dust unit.
        vm.expectRevert("refund already claimed");
        vm.prank(bob);
        other.claimRefund(otherId);
    }
}
