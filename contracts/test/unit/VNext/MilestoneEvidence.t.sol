// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";

contract VNextMilestoneEvidenceTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("vnext-evidence-creator");
    address private payout = makeAddr("vnext-evidence-payout");
    uint256 private campaignId;

    function setUp() public {
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 2 days, 7 days, 7 days
        );

        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("acceptance-v1");
        vm.prank(creator);
        campaignId = escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
        review.setFinalOutcome(
            escrow.publicationReviewCase(campaignId), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        escrow.finalizePublication(campaignId);

        token.mint(address(this), 100e6);
        token.approve(address(escrow), 100e6);
        escrow.contribute(campaignId, 100e6);
        escrow.finalizeFunding(campaignId);
    }

    function test_evidenceRevisionCreatesOneBoundReviewCase() public {
        bytes32 evidenceHash = keccak256("evidence-r1");
        vm.prank(creator);
        bytes32 reviewCaseId = escrow.submitMilestoneEvidence(0, 0, evidenceHash);

        assertEq(escrow.milestoneEvidenceRevision(campaignId, 0), 1);
        assertEq(escrow.milestoneEvidenceHash(campaignId, 0), evidenceHash);
        assertEq(escrow.milestoneReviewCase(campaignId, 0), reviewCaseId);
        assertEq(
            uint8(escrow.milestoneState(campaignId, 0)),
            uint8(VNextTypes.MilestoneState.REVIEW_ENROLLMENT)
        );
    }

    function test_activeRevisionCannotBeReplacedBeforeResolution() public {
        vm.prank(creator);
        escrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence-r1"));

        vm.prank(creator);
        vm.expectRevert(CampaignEscrowVNext.EvidenceReviewActive.selector);
        escrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence-r2"));
    }

    function test_verdictFailCreatesCorrectionRevisionWithoutChangingTerms() public {
        vm.prank(creator);
        bytes32 caseId = escrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence-r1"));
        review.setFinalOutcome(caseId, VNextTypes.ReviewOutcome.VERDICT_FAIL);
        escrow.syncFinalRuling(campaignId, 0);

        bytes32 originalCriteria = keccak256("acceptance-v1");
        assertEq(escrow.milestoneBudget(campaignId, 0), 100e6);
        assertEq(escrow.milestoneAcceptanceCriteria(campaignId, 0), originalCriteria);

        vm.prank(creator);
        escrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence-r2"));

        assertEq(escrow.milestoneEvidenceRevision(campaignId, 0), 2);
        assertEq(escrow.milestoneBudget(campaignId, 0), 100e6);
        assertEq(escrow.milestoneAcceptanceCriteria(campaignId, 0), originalCriteria);

        bytes32 correctionCase = escrow.milestoneReviewCase(campaignId, 0);
        review.setFinalOutcome(correctionCase, VNextTypes.ReviewOutcome.VERDICT_FAIL);
        escrow.syncFinalRuling(campaignId, 0);
        vm.warp(block.timestamp + 7 days);
        escrow.finalizeCorrectionFailure(campaignId, 0);
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.REFUNDING));
    }

    function test_CreatorCanAppealOwnVerdictFail() public {
        vm.prank(creator);
        bytes32 caseId = escrow.submitMilestoneEvidence(
            campaignId, 0, keccak256("evidence-r1")
        );
        review.setReviewResult(caseId, 2);

        vm.prank(creator);
        bytes32 appealCaseId = escrow.openAppeal(campaignId, 0);
        assertTrue(appealCaseId != bytes32(0));
    }

    function test_backerCanOpenAppeal() public {
        vm.prank(creator);
        escrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence-r1"));

        bytes32 appealCaseId = escrow.openAppeal(campaignId, 0);
        assertTrue(appealCaseId != bytes32(0));
        assertEq(
            uint8(escrow.milestoneState(campaignId, 0)),
            uint8(VNextTypes.MilestoneState.APPEAL_WINDOW)
        );
    }

    function test_CorrectionTimeoutOpensRefund() public {
        vm.prank(creator);
        bytes32 caseId = escrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence-r1"));
        review.setFinalOutcome(caseId, VNextTypes.ReviewOutcome.VERDICT_FAIL);
        escrow.syncFinalRuling(campaignId, 0);

        vm.warp(block.timestamp + 7 days);
        vm.prank(makeAddr("permissionless-timeout-caller"));
        escrow.expireMilestoneSubmission(campaignId, 0);

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.REFUNDING));
    }
}
