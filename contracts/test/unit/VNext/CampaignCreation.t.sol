// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../../mocks/MockReviewFinality.sol";
import { MockRandomness } from "../../../src/jury/MockRandomness.sol";
import { CampaignEscrowVNext } from "../../../src/campaigns/CampaignEscrowVNext.sol";
import { JuryRegistry } from "../../../src/jury/JuryRegistry.sol";
import { JuryReview } from "../../../src/jury/JuryReview.sol";
import { JuryTypes } from "../../../src/jury/JuryTypes.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";

contract VNextCampaignCreationTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("vnext-campaign-creator");
    address private payout = makeAddr("vnext-campaign-payout");

    function setUp() public {
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 2 days, 7 days, 7 days
        );
    }

    function test_anyWalletCreatesFrozenCampaignWithMilestones() public {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = 40e6;
        budgets[1] = 60e6;
        bytes32[] memory criteria = new bytes32[](2);
        criteria[0] = keccak256("draft");
        criteria[1] = keccak256("final");

        bytes32 publicationEvidence = keccak256("publication-evidence");
        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(
            payout, 100e6, block.timestamp + 7 days, budgets, criteria, publicationEvidence
        );

        assertEq(escrow.campaignCreator(campaignId), creator);
        assertEq(escrow.campaignPayoutWallet(campaignId), payout);
        assertEq(escrow.campaignGoal(campaignId), 100e6);
        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.CREATED));
        assertEq(escrow.publicationEvidenceHash(campaignId), publicationEvidence);
        assertTrue(escrow.publicationReviewCase(campaignId) != bytes32(0));
        assertEq(escrow.milestoneBudget(campaignId, 0), 40e6);
        assertEq(escrow.milestoneBudget(campaignId, 1), 60e6);
        assertTrue(escrow.campaignTermsHash(campaignId) != bytes32(0));
    }

    function test_rejectsInvalidFrozenTerms() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 101e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("over-budget");

        vm.prank(creator);
        vm.expectRevert(CampaignEscrowVNext.InvalidTerms.selector);
        escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
    }

    function test_BudgetBelowGoalReverts() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 99e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("under-budget");

        vm.prank(creator);
        vm.expectRevert(CampaignEscrowVNext.InvalidTerms.selector);
        escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
    }

    function test_publicationPassOpensPermissionlessFunding() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("final");

        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(
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

        assertEq(uint8(escrow.campaignState(campaignId)), uint8(VNextTypes.CampaignState.FUNDING));
        assertEq(
            uint8(escrow.publicationOutcome(campaignId)), uint8(VNextTypes.ReviewOutcome.FINAL_PASS)
        );
    }

    function test_creatorCanAppealFailedPublication() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("final");

        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
        bytes32 publicationCaseId = escrow.publicationReviewCase(campaignId);
        review.setReviewResult(publicationCaseId, 2);

        vm.prank(creator);
        bytes32 appealCaseId = escrow.openAppeal(campaignId, type(uint256).max);

        assertTrue(appealCaseId != bytes32(0));
        assertEq(escrow.publicationReviewCase(campaignId), appealCaseId);
    }
}

contract VNextPublicationAppealIntegrationTest is Test {
    MockUSDC private token;
    MockRandomness private randomness;
    JuryRegistry private registry;
    JuryReview private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("vnext-publication-creator");
    address private payout = makeAddr("vnext-publication-payout");
    address[3] private judges = [
        makeAddr("vnext-publication-judge-one"),
        makeAddr("vnext-publication-judge-two"),
        makeAddr("vnext-publication-judge-three")
    ];

    function setUp() public {
        vm.chainId(31339);
        token = new MockUSDC();
        randomness = new MockRandomness();
        registry = new JuryRegistry(address(token), address(0));
        review = new JuryReview(
            address(registry),
            address(0),
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
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v2"), 7 days, 7 days, 7 days
        );
        registry.configureReviewController(address(review));
        review.configureCampaignEscrow(address(escrow));
    }

    function test_creatorCanAppealRealPublicationVerdictFail() public {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("publication-criteria");

        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(
            payout,
            100e6,
            block.timestamp + 30 days,
            budgets,
            criteria,
            keccak256("publication-evidence")
        );
        bytes32 caseId = escrow.publicationReviewCase(campaignId);
        randomness.setSeed(caseId, keccak256("publication-seed"));

        for (uint256 i = 0; i < judges.length; i++) {
            token.mint(judges[i], 10e6);
            vm.startPrank(judges[i]);
            token.approve(address(registry), type(uint256).max);
            registry.depositStake(10e6);
            registry.reserveCaseStake(caseId, 10e6);
            review.enroll(caseId);
            vm.stopPrank();
        }

        vm.warp(review.enrollmentDeadline(caseId));
        review.finalizeSnapshot(caseId);
        review.assignCourt(caseId, 0);
        for (uint256 slot = 0; slot < 3; slot++) {
            address judge = review.courtJudge(caseId, 0, slot);
            bytes32 salt = bytes32(uint256(slot + 1));
            bytes32 commitment = JuryTypes.voteCommitment(
                block.chainid,
                review.protocolVersion(),
                campaignId,
                type(uint256).max,
                1,
                review.caseNumber(caseId),
                review.reviewRound(caseId),
                0,
                judge,
                JuryTypes.Vote.FAIL,
                salt
            );
            vm.prank(judge);
            review.commitVote(caseId, 0, commitment);
        }

        vm.warp(review.commitDeadline(caseId));
        for (uint256 slot = 0; slot < 3; slot++) {
            address judge = review.courtJudge(caseId, 0, slot);
            vm.prank(judge);
            review.revealVote(caseId, 0, JuryTypes.Vote.FAIL, bytes32(uint256(slot + 1)));
        }

        vm.warp(review.revealDeadline(caseId));
        assertEq(uint8(review.finalizeCourt(caseId, 0)), uint8(JuryTypes.CourtResult.FAIL));

        token.mint(creator, 1e6);
        vm.startPrank(creator);
        token.approve(address(review), 1e6);
        bytes32 appealCaseId = escrow.openAppeal(campaignId, type(uint256).max);
        vm.stopPrank();

        assertTrue(appealCaseId != bytes32(0));
        assertEq(escrow.publicationReviewCase(campaignId), appealCaseId);
        assertEq(token.balanceOf(address(review)), 1e6);
    }
}
