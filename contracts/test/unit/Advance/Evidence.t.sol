pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";

contract AdvanceEvidenceTest is AdvanceFixtures {
    function test_SubmissionCommitsCurrentTupleAndStartsReviewWithoutPayout() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        T.SubmissionView memory v = advance.submission(id, 0, 1);
        assertEq(v.version, 1);
        assertEq(v.evidenceHash, ref.evidenceHash);
        assertEq(v.parentVersion, 0);
        assertEq(v.submittedAt, block.timestamp);
        assertFalse(v.reviewed);
        assertEq(advance.stage(id, 0).reviewEnd, block.timestamp + 3 days);
        assertEq(advance.campaign(id).advanced, 1_100e6);
        assertEq(advance.campaign(id).custody, 2_200e6);
        assertEq(token.balanceOf(organizer), 1_100e6);
    }

    function test_SubmitRequiresOrganizerNextVersionCurrentStageAndNonzeroHash() public {
        uint256 id = executing(3);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.submitEvidence(id, 0, 1, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        vm.prank(organizer);
        advance.submitEvidence(id, 1, 1, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        vm.prank(organizer);
        advance.submitEvidence(id, 0, 2, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(organizer);
        advance.submitEvidence(id, 0, 1, bytes32(0));
        evidence(id, 0, 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.submitEvidence(id, 0, 2, REASON);
    }

    function test_InitialSubmissionDeadlineBeforeAtAfter() public {
        for (uint256 offset; offset < 3; ++offset) {
            uint256 id = executing(1);
            vm.warp(advance.stage(id, 0).submissionEnd - 1 + offset);
            if (offset == 0) evidence(id, 0, 1);
            else {
                vm.expectRevert(IAdvanceFunding.Expired.selector);
                vm.prank(organizer);
                advance.submitEvidence(id, 0, 1, REASON);
                advance.finalizeTimeout(id);
                assertTrue(advance.campaign(id).refundSnapshotted);
                assertEq(advance.campaign(id).basePool, 0);
            }
        }
    }

    function test_UnreviewedEvidenceAndDonorSilenceCannotFinalizeOrOpenNextAdvance() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeStage(ref);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(id, 1, PLAN);
        vm.warp(advance.stage(id, 0).reviewEnd);
        advance.finalizeTimeout(id);
        assertEq(advance.campaign(id).basePool, 2_200e6);
    }

    function test_METRequiresResolverExactRefPublicReportAndBudgetBound() public {
        uint256 id = executing(1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.approveEvidence(ref, VERIFICATION, REASON, 2_200e6);
        T.EvidenceRef memory wrong = T.EvidenceRef(id, 0, 1, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        vm.prank(resolver);
        advance.approveEvidence(wrong, VERIFICATION, REASON, 2_200e6);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.approveEvidence(ref, bytes32(0), REASON, 2_200e6);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.approveEvidence(ref, VERIFICATION, bytes32(0), 2_200e6);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.approveEvidence(ref, VERIFICATION, REASON, 2_200e6 + 1);
        assertFalse(advance.submission(id, 0, 1).reviewed);
        met(ref, 2_200e6);
        assertTrue(advance.submission(id, 0, 1).reviewed);
        assertEq(advance.stage(id, 0).challengeEnd, block.timestamp + 3 days);
        assertEq(token.balanceOf(organizer), 2_200e6);
    }

    function test_ReviewAtAndAfterDeadlineRejectsAndTimeoutPreservesCustody() public {
        for (uint256 offset; offset < 2; ++offset) {
            uint256 id = executing(3);
            T.EvidenceRef memory ref = evidence(id, 0, 1);
            vm.warp(advance.stage(id, 0).reviewEnd + offset);
            vm.expectRevert(IAdvanceFunding.Expired.selector);
            vm.prank(resolver);
            advance.approveEvidence(ref, VERIFICATION, REASON, 1_100e6);
            advance.finalizeTimeout(id);
            assertEq(advance.campaign(id).basePool, 2_200e6);
        }
    }

    function test_NeedsInformationAndInconclusiveRequireFreshImmutableVersions() public {
        for (uint256 outcome = 1; outcome <= 3; outcome += 2) {
            uint256 beforeBalance = token.balanceOf(organizer);
            uint256 id = executing(1);
            T.EvidenceRef memory first = evidence(id, 0, 1);
            vm.prank(resolver);
            advance.requestSupplement(first, T.ReviewOutcome(outcome), REASON);
            T.SubmissionView memory prior = advance.submission(id, 0, 1);
            assertTrue(prior.reviewed);
            assertEq(uint256(prior.outcome), outcome);
            assertEq(advance.stage(id, 0).submissionEnd, block.timestamp + 7 days);
            T.EvidenceRef memory next = evidence(id, 0, 2);
            assertEq(advance.submission(id, 0, 2).parentVersion, 1);
            assertEq(advance.submission(id, 0, 1).evidenceHash, first.evidenceHash);
            assertEq(advance.submission(id, 0, 1).reportHash, REASON);
            vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
            vm.prank(resolver);
            advance.approveEvidence(first, VERIFICATION, REASON, 2_200e6);
            met(next, 2_200e6);
            assertEq(advance.campaign(id).advanced, 2_200e6);
            assertEq(token.balanceOf(organizer) - beforeBalance, 2_200e6);
        }
    }

    function test_SupplementExhaustionStopsAtVersionThreeAndDoesNotReAdvance() public {
        uint256 id = executing(3);
        for (uint256 version = 1; version <= 3; ++version) {
            T.EvidenceRef memory ref = evidence(id, 0, version);
            vm.prank(resolver);
            advance.requestSupplement(ref, T.ReviewOutcome.NEEDS_INFORMATION, REASON);
        }
        assertEq(uint256(advance.campaign(id).state), uint256(T.CampaignState.STOPPED));
        assertEq(advance.campaign(id).basePool, 2_200e6);
        assertEq(advance.stage(id, 0).latestVersion, 3);
        assertEq(token.balanceOf(organizer), 1_100e6);
        assertEq(uint256(advance.submission(id, 0, 3).outcome), uint256(T.ReviewOutcome.NEEDS_INFORMATION));
    }

    function test_SupplementCannotMasqueradeAsMETOrNOT_MET() public {
        uint256 id = executing(1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.requestSupplement(ref, T.ReviewOutcome.MET, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.requestSupplement(ref, T.ReviewOutcome.NOT_MET, REASON);
    }

    function test_MissingSupplementAtDeadlineStops() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.prank(resolver);
        advance.requestSupplement(ref, T.ReviewOutcome.INCONCLUSIVE, REASON);
        vm.warp(advance.stage(id, 0).submissionEnd);
        advance.finalizeTimeout(id);
        assertEq(advance.campaign(id).basePool, 2_200e6);
    }

    function test_NOT_METStopsAndStoresDecisionWithoutClawback() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.prank(resolver);
        advance.rejectEvidence(ref, REASON);
        assertEq(advance.campaign(id).basePool, 2_200e6);
        assertEq(advance.campaign(id).advanced, 1_100e6);
        assertEq(token.balanceOf(organizer), 1_100e6);
        assertEq(uint256(advance.submission(id, 0, 1).outcome), uint256(T.ReviewOutcome.NOT_MET));
    }

    function test_G1FinalAcceptanceDoesNotPayAgain() public {
        uint256 id = executing(1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 2_200e6);
        uint256 end = advance.stage(id, 0).challengeEnd;
        vm.warp(end - 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeStage(ref);
        vm.warp(end);
        advance.finalizeStage(ref);
        assertEq(uint256(advance.campaign(id).state), uint256(T.CampaignState.COMPLETED));
        assertEq(advance.campaign(id).advanced, 2_200e6);
        assertEq(advance.campaign(id).basePool, 0);
        assertTrue(advance.campaign(id).refundSnapshotted);
        assertEq(token.balanceOf(organizer), 2_200e6);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeStage(ref);
    }

    function test_UnusedMustActuallyReturnBeforeFinalization() public {
        uint256 id = executing(1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 2_150e6);
        assertEq(advance.stage(id, 0).declaredUnused, 50e6);
        vm.warp(advance.stage(id, 0).challengeEnd);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeStage(ref);
        vm.startPrank(organizer);
        token.approve(address(advance), 50e6);
        advance.returnFunds(id, 0, 50e6);
        vm.stopPrank();
        advance.finalizeStage(ref);
        assertEq(advance.campaign(id).basePool, 50e6);
        assertEq(advance.campaign(id).custody, 50e6);
        assertEq(advance.campaign(id).returned, 50e6);
        assertEq(token.balanceOf(organizer), 2_150e6);
    }

    function test_G2RequiresFinalizationBeforeEachNextClaimAndFinalAcceptance() public {
        uint256 id = executing(3);
        for (uint256 index; index < 3; ++index) {
            T.EvidenceRef memory ref = evidence(id, index, 1);
            met(ref, 1_100e6);
            vm.warp(advance.stage(id, index).challengeEnd);
            advance.finalizeStage(ref);
            if (index < 2) {
                assertEq(advance.campaign(id).currentStage, index + 1);
                assertEq(advance.campaign(id).claimEnd, block.timestamp + 7 days);
                assertFalse(advance.campaign(id).refundSnapshotted);
                vm.prank(organizer);
                advance.claimAdvance(id, index + 1, PLAN);
            }
        }
        assertEq(advance.campaign(id).advanced, 3_300e6);
        assertEq(token.balanceOf(organizer), 3_300e6);
        assertEq(uint256(advance.campaign(id).state), uint256(T.CampaignState.COMPLETED));
        assertEq(advance.campaign(id).basePool, 0);
    }

    function test_FinalizationAtExpiryRejectsAndTimeoutStops() public {
        uint256 id = executing(3);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        met(ref, 1_100e6);
        vm.warp(advance.stage(id, 0).finalizeEnd);
        vm.expectRevert(IAdvanceFunding.Expired.selector);
        advance.finalizeStage(ref);
        advance.finalizeTimeout(id);
        assertEq(advance.campaign(id).basePool, 2_200e6);
    }
}
