pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";

contract AdvanceCaseTest is AdvanceFixtures {
    function test_ContributorCaseLocksFinalizationAndAdvance() public {
        T.EvidenceRef memory ref = _met(3);
        _open(ref, donorA);
        T.CaseView memory cs = advance.challengeCase(ref.campaignId, 0, 1);
        assertEq(cs.opener, donorA);
        assertEq(cs.reasonHash, REASON);
        assertTrue(cs.caseUsed);
        assertEq(cs.responseEnd, block.timestamp + 3 days);
        assertEq(cs.resolutionEnd, block.timestamp + 6 days);
        assertEq(uint256(advance.campaign(ref.campaignId).state), uint256(T.CampaignState.CASE_OPEN));
        vm.warp(advance.stage(ref.campaignId, 0).challengeEnd);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeStage(ref);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.claimAdvance(ref.campaignId, 1, PLAN);
        assertEq(advance.campaign(ref.campaignId).custody, 2_200e6);
    }

    function test_CaseRequiresContributorOrResolverAndCurrentRef() public {
        T.EvidenceRef memory ref = _met(1);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.openCase(ref, REASON);
        T.EvidenceRef memory wrong = T.EvidenceRef(ref.campaignId, 0, 1, PLAN);
        vm.expectRevert(IAdvanceFunding.InvalidReference.selector);
        vm.prank(donorA);
        advance.openCase(wrong, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(donorA);
        advance.openCase(ref, bytes32(0));
        _open(ref, resolver);
        assertEq(advance.challengeCase(ref.campaignId, 0, 1).opener, resolver);
    }

    function test_CaseCannotOpenBeforeMETOrAtAndAfterChallengeEnd() public {
        uint256 id = executing(1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(donorA);
        advance.openCase(ref, REASON);
        for (uint256 offset; offset < 2; ++offset) {
            ref = _met(1);
            vm.warp(advance.stage(ref.campaignId, 0).challengeEnd + offset);
            vm.expectRevert(IAdvanceFunding.Expired.selector);
            vm.prank(donorA);
            advance.openCase(ref, REASON);
        }
    }

    function test_ResponseAndMaterialAreBoundedAndResponseCannotBeOverwritten() public {
        T.EvidenceRef memory ref = _met(1);
        _open(ref, donorA);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        vm.prank(donorA);
        advance.submitCaseResponse(ref, VERIFICATION);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        vm.prank(organizer);
        advance.addCaseMaterial(ref, VERIFICATION);
        vm.prank(donorB);
        advance.addCaseMaterial(ref, VERIFICATION);
        vm.prank(organizer);
        advance.submitCaseResponse(ref, VERIFICATION);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(organizer);
        advance.submitCaseResponse(ref, PLAN);
        assertEq(advance.challengeCase(ref.campaignId, 0, 1).responseHash, VERIFICATION);
        vm.warp(advance.challengeCase(ref.campaignId, 0, 1).responseEnd);
        vm.expectRevert(IAdvanceFunding.Expired.selector);
        vm.prank(donorB);
        advance.addCaseMaterial(ref, VERIFICATION);
    }

    function test_ResolutionWaitsForResponseEndAndRequiresResolver() public {
        T.EvidenceRef memory ref = _met(1);
        _open(ref, donorA);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(resolver);
        advance.resolveCase(ref, T.Resolution.CONTINUE, REASON);
        vm.warp(advance.challengeCase(ref.campaignId, 0, 1).responseEnd);
        vm.expectRevert(IAdvanceFunding.WrongCaller.selector);
        advance.resolveCase(ref, T.Resolution.STOP, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.resolveCase(ref, T.Resolution.TIMEOUT, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.resolveCase(ref, T.Resolution.PENDING, REASON);
        vm.expectRevert(IAdvanceFunding.InvalidInput.selector);
        vm.prank(resolver);
        advance.resolveCase(ref, T.Resolution.STOP, bytes32(0));
        _resolve(ref, T.Resolution.CONTINUE);
        assertEq(uint256(advance.challengeCase(ref.campaignId, 0, 1).resolution), uint256(T.Resolution.CONTINUE));
    }

    function test_CONTINUEOpensFreshThreeDaysButDoesNotReopenCaseOrChangeMET() public {
        T.EvidenceRef memory ref = _met(3);
        uint256 oldEnd = advance.stage(ref.campaignId, 0).challengeEnd;
        _open(ref, donorA);
        vm.warp(advance.challengeCase(ref.campaignId, 0, 1).responseEnd);
        _resolve(ref, T.Resolution.CONTINUE);
        uint256 end = advance.stage(ref.campaignId, 0).challengeEnd;
        assertEq(end, block.timestamp + 3 days);
        assertGt(end, oldEnd);
        assertEq(advance.submission(ref.campaignId, 0, 1).reportHash, REASON);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(donorB);
        advance.openCase(ref, REASON);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        advance.finalizeStage(ref);
        vm.warp(end);
        advance.finalizeStage(ref);
        assertEq(advance.campaign(ref.campaignId).currentStage, 1);
        assertEq(advance.campaign(ref.campaignId).advanced, 1_100e6);
    }

    function test_RESUBMITPreservesOldCaseAndRequiresNewVersionWithoutAdvance() public {
        T.EvidenceRef memory ref = _met(3);
        _open(ref, donorA);
        vm.warp(advance.challengeCase(ref.campaignId, 0, 1).responseEnd);
        _resolve(ref, T.Resolution.RESUBMIT);
        assertEq(advance.stage(ref.campaignId, 0).submissionEnd, block.timestamp + 7 days);
        T.EvidenceRef memory next = evidence(ref.campaignId, 0, 2);
        assertEq(uint256(advance.challengeCase(ref.campaignId, 0, 1).resolution), uint256(T.Resolution.RESUBMIT));
        assertEq(advance.submission(ref.campaignId, 0, 1).evidenceHash, ref.evidenceHash);
        met(next, 1_100e6);
        _open(next, donorB);
        assertTrue(advance.challengeCase(ref.campaignId, 0, 2).caseUsed);
        assertEq(token.balanceOf(organizer), 1_100e6);
        assertEq(advance.campaign(ref.campaignId).advanced, 1_100e6);
    }

    function test_RESUBMITAtVersionThreeStopsInsteadOfGrantingVersionFour() public {
        uint256 id = executing(1);
        for (uint256 version = 1; version <= 3; ++version) {
            T.EvidenceRef memory ref = evidence(id, 0, version);
            met(ref, 2_200e6);
            _open(ref, donorA);
            vm.warp(advance.challengeCase(id, 0, version).responseEnd);
            _resolve(ref, T.Resolution.RESUBMIT);
        }
        assertEq(uint256(advance.campaign(id).state), uint256(T.CampaignState.STOPPED));
        assertTrue(advance.campaign(id).refundSnapshotted);
        assertEq(advance.campaign(id).basePool, 0);
        assertEq(advance.stage(id, 0).latestVersion, 3);
    }

    function test_STOPAndAbsentResolverTimeoutPreserveOnlyRemainingEscrow() public {
        for (uint256 mode; mode < 2; ++mode) {
            T.EvidenceRef memory ref = _met(3);
            _open(ref, donorA);
            T.CaseView memory cs = advance.challengeCase(ref.campaignId, 0, 1);
            if (mode == 0) {
                vm.warp(cs.responseEnd);
                _resolve(ref, T.Resolution.STOP);
            } else {
                vm.warp(cs.resolutionEnd - 1);
                vm.expectRevert(IAdvanceFunding.WrongState.selector);
                advance.finalizeTimeout(ref.campaignId);
                vm.warp(cs.resolutionEnd);
                vm.expectRevert(IAdvanceFunding.Expired.selector);
                vm.prank(resolver);
                advance.resolveCase(ref, T.Resolution.CONTINUE, REASON);
                advance.finalizeTimeout(ref.campaignId);
            }
            assertEq(advance.campaign(ref.campaignId).basePool, 2_200e6);
            assertEq(advance.campaign(ref.campaignId).advanced, 1_100e6);
            T.CaseView memory finalCase = advance.challengeCase(ref.campaignId, 0, 1);
            assertEq(uint256(finalCase.resolution), uint256(mode == 0 ? T.Resolution.STOP : T.Resolution.TIMEOUT));
            if (mode == 1) assertEq(finalCase.resolutionReasonHash, bytes32(0));
        }
    }

    function test_GenericResolverStopAlsoTerminatesPendingCase() public {
        T.EvidenceRef memory ref = _met(3);
        _open(ref, donorA);
        vm.prank(resolver);
        advance.stopCampaign(ref.campaignId, PLAN, VERIFICATION);
        T.CaseView memory cs = advance.challengeCase(ref.campaignId, 0, 1);
        assertEq(uint256(cs.resolution), uint256(T.Resolution.STOP));
        assertEq(cs.resolutionReasonHash, VERIFICATION);
        assertEq(advance.campaign(ref.campaignId).basePool, 2_200e6);
    }

    function test_HardStopCapsEqualCaseWindowsAndPreventsEarlyResolution() public {
        T.EvidenceRef memory ref = _lateThirdReview();
        vm.warp(advance.stage(ref.campaignId, 0).challengeEnd - 1);
        _open(ref, donorA);
        T.CaseView memory cs = advance.challengeCase(ref.campaignId, 0, 3);
        uint256 hardStop = advance.stage(ref.campaignId, 0).hardStop;
        assertEq(cs.responseEnd, hardStop);
        assertEq(cs.resolutionEnd, hardStop);
        vm.warp(hardStop - 1);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(resolver);
        advance.resolveCase(ref, T.Resolution.STOP, REASON);
        vm.warp(hardStop);
        advance.finalizeTimeout(ref.campaignId);
        assertEq(uint256(advance.challengeCase(ref.campaignId, 0, 3).resolution), uint256(T.Resolution.TIMEOUT));
    }

    function test_InsufficientFullChallengeWindowCannotApproveMETOrCONTINUE() public {
        uint256 id = executing(1);
        uint256 start = block.timestamp;
        vm.warp(start + 30 days - 1);
        T.EvidenceRef memory ref = evidence(id, 0, 1);
        vm.warp(advance.stage(id, 0).reviewEnd - 1);
        met(ref, 2_200e6);
        vm.warp(advance.stage(id, 0).challengeEnd - 1);
        _open(ref, donorA);
        vm.warp(advance.challengeCase(id, 0, 1).resolutionEnd - 1);
        _resolve(ref, T.Resolution.RESUBMIT);
        vm.warp(advance.stage(id, 0).submissionEnd - 1);
        ref = evidence(id, 0, 2);
        vm.warp(advance.stage(id, 0).reviewEnd - 1);
        met(ref, 2_200e6);
        vm.warp(advance.stage(id, 0).challengeEnd - 1);
        _open(ref, donorA);
        vm.warp(advance.challengeCase(id, 0, 2).responseEnd);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(resolver);
        advance.resolveCase(ref, T.Resolution.CONTINUE, REASON);
        assertEq(uint256(advance.challengeCase(id, 0, 2).resolution), uint256(T.Resolution.PENDING));
        _resolve(ref, T.Resolution.RESUBMIT);
        vm.warp(advance.stage(id, 0).hardStop - 1);
        ref = evidence(id, 0, 3);
        assertEq(advance.stage(id, 0).reviewEnd, advance.stage(id, 0).hardStop);
        vm.expectRevert(IAdvanceFunding.WrongState.selector);
        vm.prank(resolver);
        advance.approveEvidence(ref, VERIFICATION, REASON, 2_200e6);
        assertFalse(advance.submission(id, 0, 3).reviewed);
    }

    function _lateThirdReview() private returns (T.EvidenceRef memory ref) {
        uint256 id = executing(1);
        uint256 start = block.timestamp;
        vm.warp(start + 26 days);
        for (uint256 version = 1; version <= 2; ++version) {
            ref = evidence(id, 0, version);
            vm.warp(advance.stage(id, 0).reviewEnd - 1);
            met(ref, 2_200e6);
            vm.warp(advance.stage(id, 0).challengeEnd - 1);
            _open(ref, donorA);
            T.CaseView memory cs = advance.challengeCase(id, 0, version);
            vm.warp(version == 1 ? cs.resolutionEnd - 1 : cs.responseEnd);
            _resolve(ref, T.Resolution.RESUBMIT);
            if (version == 1) vm.warp(advance.stage(id, 0).submissionEnd - 1);
        }
        vm.warp(start + 56 days);
        ref = evidence(id, 0, 3);
        met(ref, 2_200e6);
    }

    function _met(uint256 count) private returns (T.EvidenceRef memory ref) {
        uint256 id = executing(count);
        ref = evidence(id, 0, 1);
        met(ref, count == 1 ? 2_200e6 : 1_100e6);
    }

    function _open(T.EvidenceRef memory ref, address actor) private {
        vm.prank(actor);
        advance.openCase(ref, REASON);
    }

    function _resolve(T.EvidenceRef memory ref, T.Resolution outcome) private {
        vm.prank(resolver);
        advance.resolveCase(ref, outcome, REASON);
    }
}
