pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { FundTogetherBase } from "../../../src/modules/FundTogetherBase.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { SettlementCallbackToken } from "../../mocks/SettlementCallbackToken.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Test } from "forge-std/Test.sol";

contract FundTogetherTimeoutTest is Test {
    struct RefundLedger {
        uint256 goal;
        uint256 paid;
        uint256 outstanding;
        uint256 dust;
    }

    FundTogether internal target;
    MockUSDC internal token;
    address internal organizer = address(0xA11CE);
    address internal alice = address(0xB0B);
    address internal bob = address(0xCAFE);
    address internal reviewer = address(0xE11);
    address internal backup = address(0xE22);
    bytes32 internal constant HASH = keccak256("evidence");
    bytes32 internal constant REASON = keccak256("missing invoice");
    uint256 internal id;

    event CampaignFailed(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        FundTogetherBase.FailureReason reason
    );
    event RefundPoolSnapshotted(uint256 indexed campaignId, uint256 amount);
    event BondReturned(uint256 indexed campaignId, address indexed organizer, uint256 amount);
    event EvidenceSubmissionExpired(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, uint256 indexed version
    );

    function setUp() public {
        target = new FundTogether();
        token = new MockUSDC();
        target.grantRole(target.VERIFIER_ROLE(), reviewer);
        target.grantRole(target.VERIFIER_ROLE(), backup);
        id = _fund(CampaignFixtures.equalBudgets(2, 2_000_000), 4_000_000);
    }

    function _fund(uint256[] memory budgets, uint256 aliceAmount)
        internal
        returns (uint256 campaignId)
    {
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
        _donate(campaignId, alice, aliceAmount);
        if (aliceAmount < goal) _donate(campaignId, bob, goal - aliceAmount);
    }

    function _donate(uint256 campaignId, address donor, uint256 amount) internal {
        token.mint(donor, amount);
        vm.startPrank(donor);
        token.approve(address(target), amount);
        target.donate(campaignId, amount);
        vm.stopPrank();
    }

    function _activate(uint256 campaignId, uint256 index) internal {
        vm.prank(organizer);
        target.activateMilestone(campaignId, index);
    }

    function _submit(uint256 campaignId, uint256 index, bytes32 hash)
        internal
        returns (uint256 version)
    {
        vm.prank(organizer);
        target.submitEvidence(campaignId, index, hash);
        return target.submissionVersion(campaignId, index);
    }

    function _reject(uint256 campaignId, uint256 index, uint256 version, bytes32 hash) internal {
        target.assignVerifier(campaignId, index, version, reviewer);
        vm.prank(reviewer);
        target.rejectSubmission(campaignId, index, version, hash, REASON);
    }

    function _settleFirst(uint256 campaignId) internal {
        _activate(campaignId, 0);
        _submit(campaignId, 0, HASH);
        target.assignVerifier(campaignId, 0, 1, reviewer);
        vm.prank(reviewer);
        target.verifySubmission(campaignId, 0, 1, HASH);
        (, uint256 end) = target.milestoneEvidence(campaignId, 0);
        vm.warp(end);
        target.settleMilestone(campaignId, 0);
    }

    function _assertFailed(uint256 campaignId, uint256 index, uint256 pool) internal view {
        assertEq(
            uint256(target.campaignState(campaignId)), uint256(FundTogetherBase.CampaignState.FAILED)
        );
        (, FundTogetherBase.MilestoneState state) = target.milestones(campaignId, index);
        assertEq(uint256(state), uint256(FundTogetherBase.MilestoneState.FAILED));
        assertTrue(target.refundSnapshotted(campaignId));
        assertEq(target.refundPool(campaignId), pool);
        assertEq(target.activationDeadlines(campaignId), 0);
        assertEq(target.evidenceDeadlines(campaignId, index), 0);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(campaignId);
        assertFalse(locked);
        assertEq(bond, 0);
    }

    function testDefaultWindowsAndFundingStartsActivationDeadline() public view {
        assertEq(target.ACTIVATION_WINDOW(), 7 days);
        assertEq(target.EVIDENCE_WINDOW(), 30 days);
        assertEq(target.ADMISSION_WINDOW(), 72 hours);
        assertEq(target.RESUBMISSION_WINDOW(), 7 days);
        assertEq(target.MAX_SUBMISSIONS(), 3);
        assertEq(target.activationDeadlines(id), block.timestamp + 7 days);
        assertEq(target.evidenceDeadlines(id, 0), 0);
    }

    function testActivationAllowedOneSecondBeforeDeadline() public {
        uint256 deadline = target.activationDeadlines(id);
        vm.warp(deadline - 1);
        vm.expectRevert("activation deadline not reached");
        target.finalizeMilestoneTimeout(id, 0);
        _activate(id, 0);
        assertEq(target.activationDeadlines(id), 0);
        assertEq(target.evidenceDeadlines(id, 0), deadline - 1 + 30 days);
    }

    function testFuzzActivationTimeoutAtAndAfterDeadline(uint8 offset) public {
        uint256 deadline = target.activationDeadlines(id);
        vm.warp(deadline + bound(offset, 0, 1));
        // Time passing alone cannot open refunds or return the bond.
        assertEq(uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.FUNDED));
        assertFalse(target.refundSnapshotted(id));
        vm.expectRevert("activation deadline passed");
        _activate(id, 0);
        vm.expectEmit(true, true, false, true, address(target));
        emit CampaignFailed(id, 0, FundTogetherBase.FailureReason.ACTIVATION_TIMEOUT);
        vm.expectEmit(true, false, false, true, address(target));
        emit RefundPoolSnapshotted(id, 4_000_000);
        vm.expectEmit(true, true, false, true, address(target));
        emit BondReturned(id, organizer, 2_000_000);
        vm.prank(bob);
        target.finalizeMilestoneTimeout(id, 0);
        _assertFailed(id, 0, 4_000_000);
        assertEq(token.balanceOf(organizer), 2_000_000);
        assertEq(token.balanceOf(bob), 0);
    }

    function testInitialEvidenceAllowedOneSecondBeforeDeadline() public {
        _activate(id, 0);
        uint256 deadline = target.evidenceDeadlines(id, 0);
        vm.warp(deadline - 1);
        vm.expectRevert("evidence deadline not reached");
        target.finalizeMilestoneTimeout(id, 0);
        _submit(id, 0, HASH);
        assertEq(target.evidenceDeadlines(id, 0), 0);
        assertEq(target.admissionDeadlines(id, 0, 1), deadline - 1 + 72 hours);
    }

    function testFuzzInitialEvidenceTimeoutAtAndAfterDeadline(uint8 offset) public {
        _activate(id, 0);
        vm.warp(target.evidenceDeadlines(id, 0) + bound(offset, 0, 1));
        vm.expectRevert("evidence deadline passed");
        _submit(id, 0, HASH);
        vm.expectEmit(true, true, false, true, address(target));
        emit CampaignFailed(id, 0, FundTogetherBase.FailureReason.EVIDENCE_TIMEOUT);
        vm.prank(bob);
        target.finalizeMilestoneTimeout(id, 0);
        _assertFailed(id, 0, 4_000_000);
        assertEq(target.submissionVersion(id, 0), 0);
        assertEq(target.totalReleased(id), 0);
    }

    function testFuzzAcceptOrRejectOneSecondBeforeAdmissionDeadline(bool accept) public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        uint256 deadline = target.admissionDeadlines(id, 0, 1);
        vm.warp(deadline - 1);
        target.assignVerifier(id, 0, 1, reviewer);
        vm.expectRevert("admission deadline not reached");
        target.expireSubmission(id, 0, 1);
        vm.startPrank(reviewer);
        if (accept) target.verifySubmission(id, 0, 1, HASH);
        else target.rejectSubmission(id, 0, 1, HASH, REASON);
        vm.stopPrank();
        assertEq(target.admissionDeadlines(id, 0, 1), deadline);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, accept ? deadline - 1 + 72 hours : 0);
        assertEq(target.evidenceDeadlines(id, 0), accept ? 0 : deadline - 1 + 7 days);
    }

    function testFuzzAdmissionExpiryBlocksLateDecisionsAndAssignment(uint8 offset) public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        target.assignVerifier(id, 0, 1, reviewer);
        uint256 deadline = target.admissionDeadlines(id, 0, 1);
        uint256 nowAtExpiry = deadline + bound(offset, 0, 1);
        vm.warp(nowAtExpiry);
        assertEq(
            uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.EVIDENCE_PENDING)
        );
        vm.expectRevert("admission deadline passed");
        target.assignVerifier(id, 0, 1, backup);
        vm.expectRevert("admission deadline passed");
        vm.prank(reviewer);
        target.verifySubmission(id, 0, 1, HASH);
        vm.expectRevert("admission deadline passed");
        vm.prank(reviewer);
        target.rejectSubmission(id, 0, 1, HASH, REASON);
        vm.expectEmit(true, true, true, true, address(target));
        emit EvidenceSubmissionExpired(id, 0, 1);
        vm.prank(bob);
        target.expireSubmission(id, 0, 1);
        _assertExpired(id, 0, 1, HASH, reviewer);
        assertEq(target.evidenceDeadlines(id, 0), nowAtExpiry + 7 days);
        assertEq(target.admissionDeadlines(id, 0, 1), deadline);
        assertFalse(target.refundSnapshotted(id));
        assertEq(token.balanceOf(address(target)), 6_000_000);
        (, uint256 reviewEnd) = target.milestoneEvidence(id, 0);
        assertEq(reviewEnd, 0);
        vm.expectRevert("invalid state");
        target.settleMilestone(id, 0);
        vm.expectRevert("invalid state");
        target.expireSubmission(id, 0, 1);
    }

    function _assertExpired(
        uint256 campaignId,
        uint256 index,
        uint256 version,
        bytes32 hash,
        address assigned
    ) internal view {
        (
            bytes32 storedHash,
            FundTogetherBase.SubmissionState status,
            address storedAssigned,
            address checkedBy,
            uint256 checkedAt,
            bytes32 reason
        ) = target.evidenceSubmissions(campaignId, index, version);
        assertEq(storedHash, hash);
        assertEq(uint256(status), uint256(FundTogetherBase.SubmissionState.EXPIRED));
        assertEq(storedAssigned, assigned);
        assertEq(checkedBy, address(0));
        assertEq(checkedAt, 0);
        assertEq(reason, bytes32(0));
    }

    function testDelayedUnassignedExpiryStartsCorrectionFromExecution() public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        uint256 nowAtExpiry = target.admissionDeadlines(id, 0, 1) + 10 days;
        vm.warp(nowAtExpiry);
        target.expireSubmission(id, 0, 1);
        assertEq(target.evidenceDeadlines(id, 0), nowAtExpiry + 7 days);
        _assertExpired(id, 0, 1, HASH, address(0));
    }

    function testReassignmentAndRoleRevocationCannotExtendAdmission() public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        uint256 deadline = target.admissionDeadlines(id, 0, 1);
        target.assignVerifier(id, 0, 1, reviewer);
        vm.warp(deadline - 1);
        target.revokeRole(target.VERIFIER_ROLE(), reviewer);
        target.assignVerifier(id, 0, 1, backup);
        assertEq(target.admissionDeadlines(id, 0, 1), deadline);
        vm.warp(deadline);
        vm.expectRevert("admission deadline passed");
        vm.prank(backup);
        target.verifySubmission(id, 0, 1, HASH);
        target.expireSubmission(id, 0, 1);
        _assertExpired(id, 0, 1, HASH, backup);
    }

    function testFuzzCorrectionCanResubmitAtLastSecond(bool expired) public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        if (expired) {
            vm.warp(target.admissionDeadlines(id, 0, 1));
            target.expireSubmission(id, 0, 1);
        } else {
            _reject(id, 0, 1, HASH);
        }
        uint256 deadline = target.evidenceDeadlines(id, 0);
        vm.warp(deadline - 1);
        vm.expectRevert("evidence deadline not reached");
        target.finalizeMilestoneTimeout(id, 0);
        _submit(id, 0, keccak256("corrected evidence"));
        assertEq(target.submissionVersion(id, 0), 2);
        assertEq(target.admissionDeadlines(id, 0, 2), deadline - 1 + 72 hours);
        (,, address assigned,,,) = target.evidenceSubmissions(id, 0, 2);
        assertEq(assigned, address(0));
        assertFalse(target.refundSnapshotted(id));
    }

    function testFuzzCorrectionTimeoutAtAndAfterDeadline(bool expired, uint8 offset) public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        if (expired) {
            vm.warp(target.admissionDeadlines(id, 0, 1));
            target.expireSubmission(id, 0, 1);
        } else {
            _reject(id, 0, 1, HASH);
        }
        vm.warp(target.evidenceDeadlines(id, 0) + bound(offset, 0, 1));
        vm.expectRevert("evidence deadline passed");
        _submit(id, 0, HASH);
        target.finalizeMilestoneTimeout(id, 0);
        _assertFailed(id, 0, 4_000_000);
        assertEq(target.submissionVersion(id, 0), 1);
    }

    function testFuzzMixedRejectionAndExpiryExhaustThreeVersions(uint8 expiryMask) public {
        expiryMask = uint8(bound(expiryMask, 0, 7));
        _activate(id, 0);
        uint256[3] memory deadlines;
        for (uint256 version = 1; version <= 3; ++version) {
            bytes32 hash = keccak256(abi.encode(version));
            _submit(id, 0, hash);
            (,, address assigned,,,) = target.evidenceSubmissions(id, 0, version);
            assertEq(assigned, address(0));
            deadlines[version - 1] = target.admissionDeadlines(id, 0, version);
            bool expired = (expiryMask & (1 << (version - 1))) != 0;
            if (expired) {
                vm.warp(deadlines[version - 1]);
                if (version == 3) {
                    vm.expectEmit(true, true, false, true, address(target));
                    emit CampaignFailed(
                        id, 0, FundTogetherBase.FailureReason.ADMISSION_TIMEOUTS_EXHAUSTED
                    );
                }
                target.expireSubmission(id, 0, version);
            } else {
                target.assignVerifier(id, 0, version, reviewer);
                if (version == 3) {
                    vm.expectEmit(true, true, false, true, address(target));
                    emit CampaignFailed(id, 0, FundTogetherBase.FailureReason.REJECTIONS_EXHAUSTED);
                }
                vm.prank(reviewer);
                target.rejectSubmission(id, 0, version, hash, REASON);
            }
            if (version < 3) {
                assertEq(
                    uint256(target.campaignState(id)),
                    uint256(FundTogetherBase.CampaignState.MILESTONE_ACTIVE)
                );
                assertEq(target.evidenceDeadlines(id, 0), vm.getBlockTimestamp() + 7 days);
                assertEq(token.balanceOf(address(target)), 6_000_000);
                assertFalse(target.refundSnapshotted(id));
            }
        }
        for (uint256 version = 1; version <= 3; ++version) {
            bool expired = (expiryMask & (1 << (version - 1))) != 0;
            (
                bytes32 hash,
                FundTogetherBase.SubmissionState status,,
                address checkedBy,
                uint256 checkedAt,
                bytes32 reason
            ) = target.evidenceSubmissions(id, 0, version);
            assertEq(hash, keccak256(abi.encode(version)));
            assertEq(
                uint256(status),
                uint256(
                    expired
                        ? FundTogetherBase.SubmissionState.EXPIRED
                        : FundTogetherBase.SubmissionState.REJECTED
                )
            );
            assertEq(checkedBy, expired ? address(0) : reviewer);
            assertEq(checkedAt, expired ? 0 : deadlines[version - 1] - 72 hours);
            assertEq(reason, expired ? bytes32(0) : REASON);
            assertEq(target.admissionDeadlines(id, 0, version), deadlines[version - 1]);
        }
        _assertFailed(id, 0, 4_000_000);
        assertEq(token.balanceOf(organizer), 2_000_000);
        vm.expectRevert("invalid state");
        _submit(id, 0, HASH);
        vm.expectRevert("invalid state");
        target.expireSubmission(id, 0, 3);
        vm.expectRevert("invalid state");
        vm.prank(reviewer);
        target.rejectSubmission(id, 0, 3, keccak256(abi.encode(uint256(3))), REASON);
        vm.expectRevert("invalid state");
        target.finalizeMilestoneTimeout(id, 0);
        vm.prank(alice);
        target.claimRefund(id);
        assertEq(token.balanceOf(alice), 4_000_000);
        assertEq(token.balanceOf(address(target)), 0);
        vm.expectRevert("refund already claimed");
        vm.prank(alice);
        target.claimRefund(id);
    }

    function testSecondRejectionAllowsThirdSubmissionBeforeCorrectionDeadline() public {
        _activate(id, 0);
        for (uint256 version = 1; version <= 2; ++version) {
            _submit(id, 0, HASH);
            _reject(id, 0, version, HASH);
        }
        uint256 deadline = target.evidenceDeadlines(id, 0);
        vm.warp(deadline - 1);
        _submit(id, 0, HASH);
        // Prior assignments do not authorize decisions on the new version.
        vm.expectRevert("not assigned verifier");
        vm.prank(reviewer);
        target.verifySubmission(id, 0, 3, HASH);
        target.assignVerifier(id, 0, 3, reviewer);
        vm.prank(reviewer);
        target.verifySubmission(id, 0, 3, HASH);
        assertEq(uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.IN_REVIEW));
        assertFalse(target.refundSnapshotted(id));
        assertEq(token.balanceOf(address(target)), 6_000_000);
    }

    function testOldVersionsCannotDecideExpireOrAssignAfterResubmission() public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        _reject(id, 0, 1, HASH);
        _submit(id, 0, HASH);
        vm.expectRevert("not current submission");
        target.assignVerifier(id, 0, 1, reviewer);
        vm.expectRevert("not current submission");
        target.expireSubmission(id, 0, 1);
        vm.expectRevert("not current submission");
        vm.prank(reviewer);
        target.verifySubmission(id, 0, 1, HASH);
        vm.expectRevert("not current submission");
        vm.prank(reviewer);
        target.rejectSubmission(id, 0, 1, HASH, REASON);
        assertEq(target.submissionVersion(id, 0), 2);
    }

    function testTimeoutRejectsUnknownCampaignAndFutureMilestone() public {
        vm.expectRevert("unknown campaign");
        target.finalizeMilestoneTimeout(999, 0);
        vm.expectRevert("not current milestone");
        target.finalizeMilestoneTimeout(id, 1);
        _activate(id, 0);
        _submit(id, 0, HASH);
        vm.expectRevert("unknown campaign");
        target.expireSubmission(999, 0, 1);
        vm.expectRevert("not current milestone");
        target.expireSubmission(id, 1, 1);
        vm.expectRevert("not current submission");
        target.expireSubmission(id, 0, 0);
        vm.expectRevert("invalid state");
        target.finalizeMilestoneTimeout(id, 0);
    }

    function testAcceptedAndChallengedEvidenceCannotBeTimedOut() public {
        _activate(id, 0);
        _submit(id, 0, HASH);
        target.assignVerifier(id, 0, 1, reviewer);
        vm.prank(reviewer);
        target.verifySubmission(id, 0, 1, HASH);
        vm.expectRevert("invalid state");
        target.expireSubmission(id, 0, 1);
        vm.expectRevert("invalid state");
        target.finalizeMilestoneTimeout(id, 0);
        vm.prank(alice);
        target.openChallenge(id, 0, REASON);
        vm.warp(block.timestamp + 100 days);
        vm.expectRevert("invalid state");
        target.expireSubmission(id, 0, 1);
        vm.expectRevert("invalid state");
        target.finalizeMilestoneTimeout(id, 0);
        assertFalse(target.refundSnapshotted(id));
        assertEq(target.totalReleased(id), 0);
    }

    function testCompletedCampaignCannotBeTimedOutOrRefunded() public {
        _settleFirst(id);
        _activate(id, 1);
        _submit(id, 1, HASH);
        target.assignVerifier(id, 1, 1, reviewer);
        vm.prank(reviewer);
        target.verifySubmission(id, 1, 1, HASH);
        (, uint256 end) = target.milestoneEvidence(id, 1);
        vm.warp(end);
        target.settleMilestone(id, 1);
        vm.warp(end + 100 days);
        vm.expectRevert("invalid state");
        target.finalizeMilestoneTimeout(id, 2);
        vm.expectRevert("invalid state");
        target.expireSubmission(id, 1, 1);
        vm.expectRevert("refund unavailable");
        vm.prank(alice);
        target.claimRefund(id);
        assertEq(uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.COMPLETED));
        assertEq(token.balanceOf(organizer), 6_000_000);
        assertEq(token.balanceOf(address(target)), 0);
    }

    function testNextMilestoneActivationDeadlineStartsAtSettlement() public {
        _settleFirst(id);
        uint256 deadline = target.activationDeadlines(id);
        assertEq(deadline, block.timestamp + 7 days);
        vm.warp(deadline - 1);
        vm.expectRevert("not current milestone");
        target.finalizeMilestoneTimeout(id, 0);
        vm.expectRevert("activation deadline not reached");
        target.finalizeMilestoneTimeout(id, 1);
        _activate(id, 1);
        assertEq(target.evidenceDeadlines(id, 1), deadline - 1 + 30 days);
    }

    function testFuzzPartialReleaseRefundsOnlyUnreleasedPool(
        uint96 first,
        uint96 second,
        uint96 aliceInput,
        uint8 failurePath,
        bool bobFirst
    ) public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = bound(first, 1, 1e24);
        budgets[1] = bound(second, 1, 1e24);
        uint256 goal = budgets[0] + budgets[1];
        uint256 aliceAmount = bound(aliceInput, 1, goal - 1);
        uint256 campaignId = _fund(budgets, aliceAmount);
        uint256 organizerBefore = token.balanceOf(organizer);
        _settleFirst(campaignId);
        failurePath = uint8(bound(failurePath, 0, 3));
        if (failurePath == 0) {
            vm.warp(target.activationDeadlines(campaignId));
            target.finalizeMilestoneTimeout(campaignId, 1);
        } else {
            _activate(campaignId, 1);
            if (failurePath == 1) {
                vm.warp(target.evidenceDeadlines(campaignId, 1));
                target.finalizeMilestoneTimeout(campaignId, 1);
            } else {
                for (uint256 version = 1; version <= 3; ++version) {
                    _submit(campaignId, 1, HASH);
                    if (failurePath == 2) {
                        _reject(campaignId, 1, version, HASH);
                    } else {
                        vm.warp(target.admissionDeadlines(campaignId, 1, version));
                        target.expireSubmission(campaignId, 1, version);
                    }
                }
            }
        }
        _assertFailed(campaignId, 1, budgets[1]);
        assertEq(target.totalReleased(campaignId), budgets[0]);
        uint256 bond = budgets[0] > budgets[1] ? budgets[0] : budgets[1];
        assertEq(token.balanceOf(organizer), organizerBefore + budgets[0] + bond);
        // Independent bounded arithmetic oracle; neither bond nor earlier release enters refunds.
        uint256 aliceRefund = aliceAmount * budgets[1] / goal;
        uint256 bobRefund = (goal - aliceAmount) * budgets[1] / goal;
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        vm.prank(bobFirst ? bob : alice);
        target.claimRefund(campaignId);
        vm.prank(bobFirst ? alice : bob);
        target.claimRefund(campaignId);
        assertEq(token.balanceOf(alice), aliceBefore + aliceRefund);
        assertEq(token.balanceOf(bob), bobBefore + bobRefund);
        assertTrue(target.claimedRefund(campaignId, alice));
        assertTrue(target.claimedRefund(campaignId, bob));
        uint256 dust = budgets[1] - aliceRefund - bobRefund;
        assertLe(dust, 1);
        assertEq(token.balanceOf(address(target)), 6_000_000 + dust);
        assertEq(target.refundPool(campaignId), budgets[1]);
        assertFalse(target.refundSnapshotted(id));
        assertEq(uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.FUNDED));
    }

    function testFuzzManyDonorPartialRefundConservation(
        uint256 seed, uint8 donorCount, uint96 releaseInput, uint96 poolInput
    ) public {
        uint256 release = bound(releaseInput, 1, 1e24);
        uint256 pool = bound(poolInput, 1, 1e24);
        (uint256 campaignId, uint256[] memory weights) =
            _fundManyDonors(seed, bound(donorCount, 2, 32), release, pool);
        _settleFirst(campaignId);
        vm.warp(target.activationDeadlines(campaignId));
        target.finalizeMilestoneTimeout(campaignId, 1);
        _assertManyRefundClaims(campaignId, weights, pool, seed);
    }

    function _fundManyDonors(uint256 seed, uint256 count, uint256 release, uint256 pool)
        internal returns (uint256 campaignId, uint256[] memory weights)
    {
        uint256 goal = release + pool;
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = release;
        budgets[1] = pool;
        vm.prank(organizer);
        campaignId = target.createCampaign("Many donor refund", address(token), block.timestamp + 7 days, budgets);
        CampaignFixtures.configureCriteria(target, campaignId);
        uint256 bond = release > pool ? release : pool;
        token.mint(organizer, bond);
        vm.startPrank(organizer);
        token.approve(address(target), bond);
        target.lockBond(campaignId);
        vm.stopPrank();
        target.approveCampaign(campaignId);
        vm.prank(organizer);
        target.publishCampaign(campaignId);
        // If goal is tiny, zero contributors are deliberately excluded from claim rights.
        count = count < goal ? count : goal;
        uint256 remaining = goal;
        weights = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 amount = i + 1 == count ? remaining : bound(seed, 1, remaining - (count - i - 1));
            weights[i] = amount;
            remaining -= amount;
            _donate(campaignId, address(uint160(0x1000 + i)), amount);
        }
    }

    function _assertManyRefundClaims(
        uint256 campaignId, uint256[] memory weights, uint256 pool, uint256 seed
    ) internal {
        uint256 count = weights.length;
        RefundLedger memory ledger;
        for (uint256 i; i < count; ++i) ledger.goal += weights[i];
        for (uint256 i; i < count; ++i) ledger.outstanding += weights[i] * pool / ledger.goal;
        assertLe(ledger.outstanding, pool);
        ledger.dust = pool - ledger.outstanding;
        assertLt(ledger.dust, count);
        // Fisher-Yates selection makes every wallet claim once in a randomized order.
        uint256[] memory order = new uint256[](count);
        for (uint256 i; i < count; ++i) order[i] = i;
        for (uint256 left = count; left > 0; --left) {
            seed = uint256(keccak256(abi.encode(seed, left)));
            uint256 pick = seed % left;
            uint256 i = order[pick];
            order[pick] = order[left - 1];
            uint256 entitlement = weights[i] * pool / ledger.goal; // Independent bounded oracle.
            _assertClaimOnce(campaignId, address(uint160(0x1000 + i)), entitlement);
            ledger.paid += entitlement;
            ledger.outstanding -= entitlement;
            assertLe(ledger.paid, pool);
            assertEq(target.refundPool(campaignId), pool);
            assertEq(token.balanceOf(address(target)), 6_000_000 + ledger.outstanding + ledger.dust);
            assertEq(ledger.paid + ledger.outstanding + ledger.dust, pool);
        }
        assertEq(ledger.outstanding, 0);
        assertEq(token.balanceOf(address(target)), 6_000_000 + pool - ledger.paid);
    }

    function _assertClaimOnce(uint256 campaignId, address donor, uint256 amount) internal {
        vm.prank(donor);
        target.claimRefund(campaignId);
        assertEq(token.balanceOf(donor), amount);
        vm.expectRevert("refund already claimed");
        vm.prank(donor);
        target.claimRefund(campaignId);
    }

    function testPartialRefundWithOverflowingIntermediateProduct() public {
        uint256 budget = uint256(1) << 200;
        uint256 aliceAmount = budget / 3;
        uint256 campaignId = _fund(CampaignFixtures.equalBudgets(2, budget), aliceAmount);
        _settleFirst(campaignId);
        vm.warp(target.activationDeadlines(campaignId));
        target.finalizeMilestoneTimeout(campaignId, 1);
        // contribution * pool exceeds uint256; P/T = 1/2 gives an independent oracle.
        vm.prank(alice);
        target.claimRefund(campaignId);
        vm.prank(bob);
        target.claimRefund(campaignId);
        assertEq(token.balanceOf(alice), aliceAmount / 2);
        assertEq(token.balanceOf(bob), (2 * budget - aliceAmount) / 2);
        assertEq(target.refundPool(campaignId), budget);
        assertEq(token.balanceOf(address(target)), 6_000_000 + 1);
    }

    function testZeroRoundedClaimAndUnexpectedTokensDoNotChangePool() public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 2;
        budgets[1] = 1;
        uint256 campaignId = _fund(budgets, 1);
        _settleFirst(campaignId);
        token.mint(address(target), 123);
        vm.warp(target.activationDeadlines(campaignId));
        target.finalizeMilestoneTimeout(campaignId, 1);
        vm.mockCall(address(token), abi.encodeCall(IERC20.transfer, (alice, 0)), abi.encode(false));
        vm.mockCall(address(token), abi.encodeCall(IERC20.transfer, (bob, 0)), abi.encode(false));
        vm.prank(alice);
        target.claimRefund(campaignId);
        vm.prank(bob);
        target.claimRefund(campaignId);
        assertTrue(target.claimedRefund(campaignId, alice));
        assertTrue(target.claimedRefund(campaignId, bob));
        assertEq(target.refundPool(campaignId), 1);
        assertEq(token.balanceOf(address(target)), 6_000_124);
        vm.expectRevert("refund already claimed");
        vm.prank(alice);
        target.claimRefund(campaignId);
    }

    function testBondTransferFailureRollsBackTimeoutAndAllowsRetry() public {
        uint256 deadline = target.activationDeadlines(id);
        vm.warp(deadline);
        vm.mockCall(
            address(token),
            abi.encodeCall(IERC20.transfer, (organizer, 2_000_000)),
            abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        target.finalizeMilestoneTimeout(id, 0);
        assertEq(uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.FUNDED));
        (, FundTogetherBase.MilestoneState state) = target.milestones(id, 0);
        assertEq(uint256(state), uint256(FundTogetherBase.MilestoneState.PENDING));
        assertEq(target.activationDeadlines(id), deadline);
        assertFalse(target.refundSnapshotted(id));
        assertEq(target.refundPool(id), 0);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(id);
        assertTrue(locked);
        assertEq(bond, 2_000_000);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        vm.clearMockedCalls();
        target.finalizeMilestoneTimeout(id, 0);
        _assertFailed(id, 0, 4_000_000);
    }

    function testFuzzBondTransferFailureRollsBackFinalDecision(bool expired) public {
        _activate(id, 0);
        for (uint256 version = 1; version <= 2; ++version) {
            _submit(id, 0, HASH);
            _reject(id, 0, version, HASH);
        }
        _submit(id, 0, HASH);
        target.assignVerifier(id, 0, 3, reviewer);
        if (expired) vm.warp(target.admissionDeadlines(id, 0, 3));
        vm.mockCall(
            address(token),
            abi.encodeCall(IERC20.transfer, (organizer, 2_000_000)),
            abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        if (expired) {
            target.expireSubmission(id, 0, 3);
        } else {
            vm.prank(reviewer);
            target.rejectSubmission(id, 0, 3, HASH, REASON);
        }
        (
            ,
            FundTogetherBase.SubmissionState status,,
            address checkedBy,
            uint256 checkedAt,
            bytes32 reason
        ) = target.evidenceSubmissions(id, 0, 3);
        assertEq(uint256(status), uint256(FundTogetherBase.SubmissionState.SUBMITTED));
        assertEq(checkedBy, address(0));
        assertEq(checkedAt, 0);
        assertEq(reason, bytes32(0));
        assertEq(
            uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.EVIDENCE_PENDING)
        );
        assertFalse(target.refundSnapshotted(id));
        vm.clearMockedCalls();
        if (expired) {
            target.expireSubmission(id, 0, 3);
        } else {
            vm.prank(reviewer);
            target.rejectSubmission(id, 0, 3, HASH, REASON);
        }
        _assertFailed(id, 0, 4_000_000);
    }

    function testPartialRefundTransferFailurePreservesClaimForRetry() public {
        _settleFirst(id);
        vm.warp(target.activationDeadlines(id));
        target.finalizeMilestoneTimeout(id, 1);
        vm.mockCall(
            address(token), abi.encodeCall(IERC20.transfer, (alice, 2_000_000)), abi.encode(false)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        vm.prank(alice);
        target.claimRefund(id);
        assertFalse(target.claimedRefund(id, alice));
        assertEq(target.refundPool(id), 2_000_000);
        assertEq(token.balanceOf(address(target)), 2_000_000);
        vm.clearMockedCalls();
        vm.prank(alice);
        target.claimRefund(id);
        assertEq(token.balanceOf(alice), 2_000_000);
        assertEq(token.balanceOf(address(target)), 0);
    }

    function testFuzzTokenCallbackCannotFinalizeOrClaimDuringTimeoutBondReturn(bool claim) public {
        SettlementCallbackToken callbackToken = new SettlementCallbackToken();
        token = callbackToken;
        uint256 campaignId = _fund(CampaignFixtures.equalBudgets(2, 2_000_000), 4_000_000);
        bytes memory callback = claim
            ? abi.encodeCall(target.claimRefund, (campaignId))
            : abi.encodeCall(target.finalizeMilestoneTimeout, (campaignId, 0));
        callbackToken.arm(address(target), callback, 0);
        vm.warp(target.activationDeadlines(campaignId));
        target.finalizeMilestoneTimeout(campaignId, 0);
        assertTrue(callbackToken.attempted());
        assertFalse(callbackToken.nestedSucceeded());
        assertEq(
            callbackToken.nestedError(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        _assertFailed(campaignId, 0, 4_000_000);
        assertEq(callbackToken.transfers(), 1);
        assertFalse(target.claimedRefund(campaignId, address(callbackToken)));
        assertEq(callbackToken.balanceOf(address(target)), 4_000_000);
    }
}
