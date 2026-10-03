pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { Test } from "forge-std/Test.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";

contract FundTogetherVerifierTest is Test {
    FundTogether internal target;
    FundTogether internal verifier;
    MockUSDC internal token;
    address internal organizer = address(0xA11CE);
    address internal donor = address(0xB0B);
    address internal reviewer = address(0xE11);
    address internal backup = address(0xE22);
    bytes32 internal constant ROLE = keccak256("VERIFIER_ROLE");
    bytes32 internal constant HASH = keccak256("evidence v1");
    bytes32 internal constant HASH2 = keccak256("evidence v2");
    bytes32 internal constant REASON = keccak256("missing required invoice");
    uint256 internal id;
    event VerifierAssigned(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address previousVerifier,
        address verifier
    );
    event SubmissionRejected(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 indexed version,
        address verifier,
        bytes32 reasonHash
    );

    function setUp() public {
        target = new FundTogether();
        verifier = target;
        token = new MockUSDC();
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
        token.mint(donor, 4_000_000);
        vm.startPrank(donor);
        token.approve(address(target), 4_000_000);
        target.donate(id, 4_000_000);
        vm.stopPrank();
        vm.prank(organizer);
        target.activateMilestone(id, 0);
    }

    function _submit() internal {
        vm.prank(organizer);
        target.submitEvidence(id, 0, HASH);
    }

    function _assign() internal {
        verifier.grantRole(ROLE, reviewer);
        verifier.assignVerifier(id, 0, 1, reviewer);
    }

    function _accept() internal {
        vm.prank(reviewer);
        verifier.verifySubmission(id, 0, 1, HASH);
    }

    function testMultipleVerifiersCanBeGrantedAndRevoked() public {
        verifier.grantRole(ROLE, reviewer);
        verifier.grantRole(ROLE, backup);
        assertTrue(verifier.hasRole(ROLE, reviewer));
        assertTrue(verifier.hasRole(ROLE, backup));
        verifier.revokeRole(ROLE, reviewer);
        assertFalse(verifier.hasRole(ROLE, reviewer));
    }

    function testNonAdminCannotGrantRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, organizer, bytes32(0)
            )
        );
        vm.prank(organizer);
        verifier.grantRole(ROLE, organizer);
    }

    function testSubmissionDoesNotStartReviewOrMoveMoney() public {
        _submit();
        assertEq(verifier.submissionVersion(id, 0), 1);
        (
            bytes32 hash,
            FundTogether.SubmissionState status,
            address assigned,
            address checkedBy,
            uint256 checkedAt,
        ) = verifier.evidenceSubmissions(id, 0, 1);
        assertEq(hash, HASH);
        assertEq(uint256(status), 1);
        assertEq(assigned, address(0));
        assertEq(checkedBy, address(0));
        assertEq(checkedAt, 0);
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, 0);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        vm.warp(block.timestamp + 100 days);
        vm.expectRevert("invalid state");
        target.settleMilestone(id, 0);
    }

    function testOnlyAssignedRoleHolderCanAccept() public {
        _submit();
        _assign();
        verifier.grantRole(ROLE, backup);
        vm.expectRevert("not assigned verifier");
        vm.prank(backup);
        verifier.verifySubmission(id, 0, 1, HASH);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, organizer, ROLE
            )
        );
        vm.prank(organizer);
        verifier.verifySubmission(id, 0, 1, HASH);
        _accept();
    }

    function testRevokedVerifierCannotDecideAndAdminCanReassign() public {
        _submit();
        _assign();
        verifier.revokeRole(ROLE, reviewer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, reviewer, ROLE
            )
        );
        vm.prank(reviewer);
        verifier.verifySubmission(id, 0, 1, HASH);
        verifier.grantRole(ROLE, backup);
        verifier.assignVerifier(id, 0, 1, backup);
        vm.prank(backup);
        verifier.verifySubmission(id, 0, 1, HASH);
        (,, address assigned, address checkedBy,,) = verifier.evidenceSubmissions(id, 0, 1);
        assertEq(assigned, backup);
        assertEq(checkedBy, backup);
    }

    function testAcceptanceStarts72HoursFromDecision() public {
        _submit();
        _assign();
        vm.warp(vm.getBlockTimestamp() + 2 days);
        _accept();
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, block.timestamp + 72 hours);
        (, FundTogether.SubmissionState status,, address checkedBy, uint256 checkedAt,) =
            verifier.evidenceSubmissions(id, 0, 1);
        assertEq(uint256(status), 2);
        assertEq(checkedBy, reviewer);
        assertEq(checkedAt, block.timestamp);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        assertEq(token.balanceOf(reviewer), 0);
        assertEq(target.totalReleased(id), 0);
        vm.warp(end);
        target.settleMilestone(id, 0);
    }

    function testWrongHashAndVersionCannotBeAccepted() public {
        _submit();
        _assign();
        vm.expectRevert("not current submission");
        vm.prank(reviewer);
        verifier.verifySubmission(id, 0, 2, HASH);
        vm.expectRevert("evidence mismatch");
        vm.prank(reviewer);
        verifier.verifySubmission(id, 0, 1, HASH2);
    }

    function testRejectAndResubmitPreserveHistoryAndRequireNewAssignment() public {
        _submit();
        _assign();
        vm.prank(reviewer);
        verifier.rejectSubmission(id, 0, 1, HASH, REASON);
        (
            bytes32 oldHash,
            FundTogether.SubmissionState status,,
            address checkedBy,,
            bytes32 reason
        ) = verifier.evidenceSubmissions(id, 0, 1);
        assertEq(oldHash, HASH);
        assertEq(uint256(status), 3);
        assertEq(checkedBy, reviewer);
        assertEq(reason, REASON);
        assertEq(token.balanceOf(address(target)), 6_000_000);
        vm.prank(organizer);
        target.submitEvidence(id, 0, HASH2);
        assertEq(verifier.submissionVersion(id, 0), 2);
        (,, address assigned,,,) = verifier.evidenceSubmissions(id, 0, 2);
        assertEq(assigned, address(0));
        vm.expectRevert("not current submission");
        vm.prank(reviewer);
        verifier.verifySubmission(id, 0, 1, HASH);
        verifier.assignVerifier(id, 0, 2, reviewer);
        vm.prank(reviewer);
        verifier.verifySubmission(id, 0, 2, HASH2);
        (bytes32 retainedHash, FundTogether.SubmissionState retainedStatus,,,,) =
            verifier.evidenceSubmissions(id, 0, 1);
        assertEq(retainedHash, HASH);
        assertEq(uint256(retainedStatus), 3);
    }

    function testPendingSubmissionCannotBeOverwritten() public {
        _submit();
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        target.submitEvidence(id, 0, HASH2);
    }

    function testDecisionCannotBeRepeatedReversedOrReassigned() public {
        _submit();
        _assign();
        _accept();
        vm.expectRevert("invalid state");
        _accept();
        vm.expectRevert("invalid state");
        vm.prank(reviewer);
        verifier.rejectSubmission(id, 0, 1, HASH, REASON);
        vm.expectRevert("invalid state");
        verifier.assignVerifier(id, 0, 1, reviewer);
    }

    function testRejectRequiresReason() public {
        _submit();
        _assign();
        vm.expectRevert("reason required");
        vm.prank(reviewer);
        verifier.rejectSubmission(id, 0, 1, HASH, bytes32(0));
    }

    function testOnlyAdminCanAssignAndOrganizerCannotReviewOwnCampaign() public {
        _submit();
        verifier.grantRole(ROLE, reviewer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, donor, bytes32(0)
            )
        );
        vm.prank(donor);
        verifier.assignVerifier(id, 0, 1, reviewer);
        verifier.grantRole(ROLE, organizer);
        vm.expectRevert("organizer cannot verify");
        verifier.assignVerifier(id, 0, 1, organizer);
    }

    function testCannotAssignUnregisteredVerifier() public {
        _submit();
        vm.expectRevert("verifier role required");
        verifier.assignVerifier(id, 0, 1, backup);
    }

    function testReassignmentEmitsPreviousAndNewReviewer() public {
        _submit();
        _assign();
        verifier.grantRole(ROLE, backup);
        vm.expectEmit(true, true, true, true, address(target));
        emit VerifierAssigned(id, 0, 1, reviewer, backup);
        verifier.assignVerifier(id, 0, 1, backup);
        vm.expectRevert("not assigned verifier");
        _accept();
    }

    function testRejectionRecordsDecisionAndCannotBeReversed() public {
        _submit();
        _assign();
        vm.expectEmit(true, true, true, true, address(target));
        emit SubmissionRejected(id, 0, 1, reviewer, REASON);
        vm.prank(reviewer);
        verifier.rejectSubmission(id, 0, 1, HASH, REASON);
        vm.expectRevert("invalid state");
        _accept();
        (, uint256 end) = target.milestoneEvidence(id, 0);
        assertEq(end, 0);
        assertEq(target.currentMilestoneIndex(id), 0);
        assertEq(target.totalReleased(id), 0);
        (,,,,, bool locked, uint256 bond,) = target.campaigns(id);
        assertTrue(locked);
        assertEq(bond, 2_000_000);
    }

    function testWrongHashCannotBeRejected() public {
        _submit();
        _assign();
        vm.expectRevert("evidence mismatch");
        vm.prank(reviewer);
        verifier.rejectSubmission(id, 0, 1, HASH2, REASON);
    }

    function testUnassignedVerifierCannotReject() public {
        _submit();
        _assign();
        verifier.grantRole(ROLE, backup);
        vm.expectRevert("not assigned verifier");
        vm.prank(backup);
        verifier.rejectSubmission(id, 0, 1, HASH, REASON);
    }

    function testRevokedVerifierCannotReject() public {
        _submit();
        _assign();
        verifier.revokeRole(ROLE, reviewer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, reviewer, ROLE
            )
        );
        vm.prank(reviewer);
        verifier.rejectSubmission(id, 0, 1, HASH, REASON);
    }

    function testUnknownCampaignWrongMilestoneAndZeroVersionRejected() public {
        _submit();
        _assign();
        vm.expectRevert("unknown campaign");
        verifier.assignVerifier(999, 0, 1, reviewer);
        vm.expectRevert("not current milestone");
        verifier.assignVerifier(id, 1, 1, reviewer);
        vm.expectRevert("not current submission");
        verifier.assignVerifier(id, 0, 0, reviewer);
        vm.expectRevert("unknown campaign");
        vm.prank(reviewer);
        verifier.verifySubmission(999, 0, 1, HASH);
    }

    function testCannotAssignBeforeSubmissionOrAssignZeroAddress() public {
        vm.expectRevert("invalid state");
        verifier.assignVerifier(id, 0, 1, reviewer);
        _submit();
        vm.expectRevert("verifier role required");
        verifier.assignVerifier(id, 0, 1, address(0));
    }

    function testPendingEvidenceCannotBeChallengedOrSkipMilestone() public {
        _submit();
        vm.expectRevert("invalid state");
        vm.prank(donor);
        target.openChallenge(id, 0, REASON);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        target.activateMilestone(id, 1);
    }

    function testFuzzRejectedVersionsRetainHistory(uint8 rounds) public {
        rounds = uint8(bound(rounds, 1, 8));
        verifier.grantRole(ROLE, reviewer);
        for (uint256 version = 1; version <= rounds; ++version) {
            bytes32 hash = keccak256(abi.encode(version));
            vm.prank(organizer);
            target.submitEvidence(id, 0, hash);
            verifier.assignVerifier(id, 0, version, reviewer);
            vm.prank(reviewer);
            verifier.rejectSubmission(id, 0, version, hash, REASON);
        }
        for (uint256 version = 1; version <= rounds; ++version) {
            (
                bytes32 hash,
                FundTogether.SubmissionState status,,
                address checkedBy,,
                bytes32 reason
            ) = verifier.evidenceSubmissions(id, 0, version);
            assertEq(hash, keccak256(abi.encode(version)));
            assertEq(uint256(status), 3);
            assertEq(checkedBy, reviewer);
            assertEq(reason, REASON);
        }
        assertEq(token.balanceOf(address(target)), 6_000_000);
        assertEq(token.balanceOf(organizer), 0);
        assertEq(target.totalReleased(id), 0);
    }
}
