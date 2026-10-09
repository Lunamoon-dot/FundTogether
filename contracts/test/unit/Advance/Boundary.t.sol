pragma solidity 0.8.24;

import { AdvanceFixtures, IAdvanceFunding } from "../../helpers/AdvanceFixtures.sol";
import { AdvanceTypes as T } from "../../../src/advance/AdvanceTypes.sol";

contract AdvanceBoundaryTest is AdvanceFixtures {
    function test_FirstEligibilityBeforeAtAfterDeadline() public {
        for (uint256 offset; offset < 3; ++offset) {
            uint256 id = create(1, 10);
            publish(id);
            fund(id, 6, 4);
            vm.warp(advance.campaign(id).firstReviewEnd - 1 + offset);
            if (offset != 0) vm.expectRevert(IAdvanceFunding.Expired.selector);
            vm.prank(resolver);
            advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
            if (offset != 0) advance.finalizeTimeout(id);
            assertEq(advance.campaign(id).advanced, 0);
            assertEq(advance.campaign(id).custody, 10);
        }
    }

    function test_AllReviewDecisionsBeforeAtAfterDeadline() public {
        token.mint(donorA, 30_000e6);
        token.mint(donorB, 30_000e6);
        for (uint256 outcome; outcome < 4; ++outcome) {
            for (uint256 offset; offset < 3; ++offset) {
                uint256 id = executing(3);
                T.EvidenceRef memory ref = evidence(id, 0, 1);
                vm.warp(advance.stage(id, 0).reviewEnd - 1 + offset);
                if (offset != 0) vm.expectRevert(IAdvanceFunding.Expired.selector);
                vm.prank(resolver);
                if (outcome == 0) advance.approveEvidence(ref, VERIFICATION, REASON, 1_100e6);
                else if (outcome == 2) advance.rejectEvidence(ref, REASON);
                else advance.requestSupplement(ref, T.ReviewOutcome(outcome), REASON);
                if (offset != 0) advance.finalizeTimeout(id);
                assertEq(advance.campaign(id).advanced, 1_100e6);
                assertEq(advance.campaign(id).custody, 2_200e6);
            }
        }
    }

    function test_SupplementBeforeAtAfterDeadline() public {
        for (uint256 offset; offset < 3; ++offset) {
            uint256 id = executing(3);
            T.EvidenceRef memory ref = evidence(id, 0, 1);
            vm.prank(resolver);
            advance.requestSupplement(ref, T.ReviewOutcome.NEEDS_INFORMATION, REASON);
            vm.warp(advance.stage(id, 0).submissionEnd - 1 + offset);
            if (offset == 0) evidence(id, 0, 2);
            else {
                vm.expectRevert(IAdvanceFunding.Expired.selector);
                vm.prank(organizer);
                advance.submitEvidence(id, 0, 2, REASON);
                advance.finalizeTimeout(id);
            }
            assertEq(advance.campaign(id).advanced, 1_100e6);
        }
    }

    function test_FinalizationBeforeAtAfterExpiryAndAfterChallengeBoundary() public {
        for (uint256 offset; offset < 4; ++offset) {
            uint256 id = executing(3);
            T.EvidenceRef memory ref = evidence(id, 0, 1);
            met(ref, 1_100e6);
            T.StageView memory s = advance.stage(id, 0);
            vm.warp(offset == 0 ? s.challengeEnd + 1 : s.finalizeEnd - 2 + offset);
            if (offset < 2) advance.finalizeStage(ref);
            else {
                vm.expectRevert(IAdvanceFunding.Expired.selector);
                advance.finalizeStage(ref);
                advance.finalizeTimeout(id);
            }
            assertEq(advance.campaign(id).advanced, 1_100e6);
            assertEq(advance.campaign(id).custody, 2_200e6);
        }
    }
}
