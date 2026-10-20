pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { FundTogetherCampaign } from "../../../src/campaigns/FundTogetherCampaign.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CampaignEscrowTest is Test {
    MockUSDC private token;
    FundTogetherCampaign private escrow;
    address private creator = makeAddr("campaigns-creator");
    address private resolver = makeAddr("campaigns-resolver");
    address private backup = makeAddr("campaigns-backup");
    address private judgeOne = makeAddr("campaigns-judge-one");
    address private judgeTwo = makeAddr("campaigns-judge-two");
    address private judgeThree = makeAddr("campaigns-judge-three");
    address private judgeFour = makeAddr("campaigns-judge-four");
    address private alice = makeAddr("campaigns-alice");
    address private bob = makeAddr("campaigns-bob");
    bytes32 private constant TERMS = keccak256("frozen-pdf-terms");
    bytes32 private constant PDF = keccak256("final-pdf-bytes");
    bytes32 private constant EVIDENCE = keccak256("release-evidence");
    bytes32 private constant COMPLETION_REQUEST = keccak256("completion-request-v1");
    bytes32 private constant COMPLETION_DECISION = keccak256("completion-decision-v1");
    bytes32 private constant DISBURSEMENT_REQUEST = keccak256("disbursement-request-v1");
    bytes32 private constant DISBURSEMENT_DECISION = keccak256("disbursement-decision-v1");

    function setUp() public {
        vm.chainId(31339);
        token = new MockUSDC();
        address[] memory judges = new address[](4);
        judges[0] = judgeOne;
        judges[1] = judgeTwo;
        judges[2] = judgeThree;
        judges[3] = judgeFour;
        escrow = new FundTogetherCampaign(address(token), resolver, backup, judges);
        token.mint(alice, 1000e6);
        token.mint(bob, 1000e6);
        vm.prank(alice);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        token.approve(address(escrow), type(uint256).max);
    }

    function createPublicationCase(bytes32 terms, uint256 goal, uint256 price, uint256 duration)
        private
        returns (uint256 caseId)
    {
        vm.prank(creator);
        caseId = escrow.createPublicationCase(terms, goal, price, duration);
    }

    function approvePublication(bytes32 terms, uint256 goal, uint256 price)
        private
        returns (uint256 id)
    {
        uint256 caseId = createPublicationCase(terms, goal, price, 1 days);
        vm.prank(escrow.publicationJudge(caseId, 0));
        escrow.votePublicationCase(caseId, true);
        vm.prank(escrow.publicationJudge(caseId, 1));
        escrow.votePublicationCase(caseId, true);
        vm.prank(creator);
        id = escrow.createCampaign(terms, goal, price, 1 days);
    }

    function test_creatorCanOpenPublicationCaseWithoutStudioState() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);

        assertEq(caseId, 0);
        assertEq(escrow.publicationCaseId(TERMS), caseId);
    }

    function test_publicationCaseSelectsThreeUniqueNonCreatorJudges() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);
        address first = escrow.publicationJudge(caseId, 0);
        address second = escrow.publicationJudge(caseId, 1);
        address third = escrow.publicationJudge(caseId, 2);

        assertTrue(first != address(0));
        assertTrue(second != address(0));
        assertTrue(third != address(0));
        assertTrue(first != creator);
        assertTrue(second != creator);
        assertTrue(third != creator);
        assertTrue(first != second);
        assertTrue(first != third);
        assertTrue(second != third);
    }

    function test_creatorCannotCreateCampaignBeforePublicationApproval() public {
        createPublicationCase(TERMS, 10e6, 10e6, 1 days);

        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days);
    }

    function test_onlyAssignedJudgeCanVoteAndEachJudgeVotesOnce() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);

        vm.prank(alice);
        vm.expectRevert();
        escrow.votePublicationCase(caseId, true);

        address assignedJudge = escrow.publicationJudge(caseId, 0);
        vm.prank(assignedJudge);
        escrow.votePublicationCase(caseId, true);

        vm.prank(assignedJudge);
        vm.expectRevert();
        escrow.votePublicationCase(caseId, false);
    }

    function test_twoApprovalsPermitExactCampaignCreationAndNoFundsMove() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);
        uint256 balanceBefore = token.balanceOf(address(escrow));

        vm.prank(escrow.publicationJudge(caseId, 0));
        escrow.votePublicationCase(caseId, true);
        vm.prank(escrow.publicationJudge(caseId, 1));
        escrow.votePublicationCase(caseId, true);

        vm.prank(creator);
        uint256 campaignId = escrow.createCampaign(TERMS, 10e6, 10e6, 1 days);

        assertEq(campaignId, 0);
        assertEq(token.balanceOf(address(escrow)), balanceBefore);
    }

    function test_twoRejectionsPreventCampaignCreation() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);

        vm.prank(escrow.publicationJudge(caseId, 0));
        escrow.votePublicationCase(caseId, false);
        vm.prank(escrow.publicationJudge(caseId, 1));
        escrow.votePublicationCase(caseId, false);

        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days);
    }

    function test_voteAfterResolutionIsRejected() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);

        vm.prank(escrow.publicationJudge(caseId, 0));
        escrow.votePublicationCase(caseId, true);
        vm.prank(escrow.publicationJudge(caseId, 1));
        escrow.votePublicationCase(caseId, true);

        vm.prank(escrow.publicationJudge(caseId, 2));
        vm.expectRevert();
        escrow.votePublicationCase(caseId, true);
    }

    function test_expiredPublicationCaseDoesNotPermitFunding() public {
        uint256 caseId = createPublicationCase(TERMS, 10e6, 10e6, 1 days);
        vm.warp(block.timestamp + 7 days + 1);

        escrow.expirePublicationCase(caseId);

        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days);
    }

    function create(uint256 goal) private returns (uint256 id) {
        id = approvePublication(TERMS, goal, 10e6);
    }

    function createWithTerms(bytes32 terms, uint256 goal) private returns (uint256 id) {
        id = approvePublication(terms, goal, 10e6);
    }

    function createWithPrice(bytes32 terms, uint256 goal, uint256 price)
        private
        returns (uint256 id)
    {
        id = approvePublication(terms, goal, price);
    }

    function fund() private returns (uint256 id) {
        id = create(10e6);
        vm.prank(alice);
        escrow.pledge(id, 1);
        vm.prank(bob);
        escrow.pledge(id, 1);
        vm.warp(block.timestamp + 1 days);
        vm.prank(resolver);
        escrow.finalizeFunding(id);
    }

    function release(uint256 id) private {
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(creator);
        escrow.confirmCampaignCompletion(id, block.timestamp + 20 days);
        vm.prank(creator);
        escrow.submitRelease(id, PDF, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewRelease(id, PDF, EVIDENCE, true);
    }

    function requestCompletion(uint256 id) private {
        release(id);
        vm.warp(escrow.campaign(id).challengeDeadline);
        vm.prank(creator);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
    }

    function test_requiresReviewedExactTermsAndSingleUseApproval() public {
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days);
        uint256 id = create(10e6);
        assertEq(id, 0);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days);
    }

    function test_overfundingPaysGoalAndLeavesSurplusForEveryBacker() public {
        uint256 id = create(100e6);
        vm.prank(alice);
        escrow.pledge(id, 4);
        vm.prank(bob);
        escrow.pledge(id, 16);
        vm.warp(escrow.campaign(id).fundingDeadline);
        vm.prank(resolver);
        escrow.finalizeFunding(id);
        requestCompletion(id);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);

        assertEq(token.balanceOf(creator), 100e6);
        assertEq(escrow.campaign(id).raised, 200e6);
        assertEq(escrow.campaign(id).escrowed, 100e6);
        assertEq(escrow.campaign(id).surplusPool, 100e6);
        assertEq(escrow.claimableSurplus(id, alice), 20e6);
        assertEq(escrow.claimableSurplus(id, bob), 80e6);
    }

    function test_onlyPrimaryOrBackupResolverCanFinalizeFunding() public {
        uint256 fundedId = create(10e6);
        vm.prank(alice);
        escrow.pledge(fundedId, 1);
        vm.warp(escrow.campaign(fundedId).fundingDeadline);

        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.finalizeFunding(fundedId);

        vm.prank(resolver);
        escrow.finalizeFunding(fundedId);
        assertEq(uint8(escrow.campaign(fundedId).state), uint8(FundTogetherCampaign.State.ACTIVE));

        uint256 failedId = createWithTerms(keccak256("funding-failure-terms"), 10e6);
        vm.warp(escrow.campaign(failedId).fundingDeadline);
        vm.prank(backup);
        escrow.finalizeFunding(failedId);
        assertEq(uint8(escrow.campaign(failedId).state), uint8(FundTogetherCampaign.State.REFUNDING));
    }

    function test_zeroQuantityIsRejectedWithoutChangingFunding() public {
        uint256 id = create(10e6);
        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.InvalidInput.selector);
        escrow.pledge(id, 0);
        assertEq(escrow.pledged(id, alice), 0);
        assertEq(escrow.campaign(id).raised, 0);
        assertEq(escrow.campaign(id).escrowed, 0);
    }

    function test_pledgeBoundaryAllowsOneSecondBeforeAndRejectsAtDeadline() public {
        uint256 id = create(20e6);
        uint256 deadline = escrow.campaign(id).fundingDeadline;

        vm.warp(deadline - 1);
        vm.prank(alice);
        escrow.pledge(id, 2);
        assertEq(escrow.pledged(id, alice), 2);
        assertEq(escrow.campaign(id).raised, 20e6);

        vm.warp(deadline);
        vm.prank(bob);
        vm.expectRevert(FundTogetherCampaign.Expired.selector);
        escrow.pledge(id, 1);
        assertEq(escrow.pledged(id, bob), 0);
        assertEq(escrow.campaign(id).raised, 20e6);
    }

    function test_releaseAndCompletionAreSeparateAndPayOnce() public {
        uint256 id = fund();
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.submitRelease(id, PDF, EVIDENCE);
        release(id);
        assertEq(token.balanceOf(creator), 0);

        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.TooEarly.selector);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.warp(escrow.campaign(id).challengeDeadline);
        vm.prank(creator);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 10e6);
        assertEq(escrow.campaign(id).escrowed, 10e6);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        vm.prank(alice);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);
        assertEq(escrow.campaign(id).escrowed, 5e6);
    }

    function test_firstDisbursementNeedsNoProductionEvidenceAndCountsAgainstGoal() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.requestDisbursement(id, DISBURSEMENT_REQUEST, 3e6);
        assertEq(escrow.campaign(id).payoutAmount, 3e6);
        assertEq(escrow.campaign(id).creatorPaid, 0);

        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.approveDisbursement(id, DISBURSEMENT_REQUEST, DISBURSEMENT_DECISION);

        vm.prank(resolver);
        escrow.approveDisbursement(id, DISBURSEMENT_REQUEST, DISBURSEMENT_DECISION);
        assertEq(token.balanceOf(creator), 3e6);
        assertEq(escrow.campaign(id).creatorPaid, 3e6);
        assertEq(escrow.campaign(id).escrowed, 17e6);

        requestCompletion(id);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 10e6);
        assertEq(escrow.campaign(id).creatorPaid, 10e6);
        assertEq(escrow.campaign(id).escrowed, 10e6);
    }

    function test_disbursementHasNoResolverTimerAndRejectClearsPendingRequest() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.requestDisbursement(id, DISBURSEMENT_REQUEST, 3e6);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.requestDisbursement(id, keccak256("second-pending"), 1e6);

        vm.prank(resolver);
        escrow.rejectDisbursement(id, DISBURSEMENT_REQUEST, DISBURSEMENT_DECISION);
        assertEq(escrow.campaign(id).payoutRequestHash, bytes32(0));
        assertEq(escrow.campaign(id).payoutDecisionHash, DISBURSEMENT_DECISION);

        vm.prank(creator);
        escrow.requestDisbursement(id, keccak256("disbursement-request-v2"), 1e6);
        vm.warp(block.timestamp + 90 days);
        vm.prank(resolver);
        escrow.approveDisbursement(id, keccak256("disbursement-request-v2"), keccak256("decision-v2"));
        assertEq(token.balanceOf(creator), 1e6);
    }

    function test_exactGoalHasNoSurplus() public {
        uint256 id = create(20e6);
        vm.prank(alice);
        escrow.pledge(id, 2);
        vm.warp(escrow.campaign(id).fundingDeadline);
        vm.prank(resolver);
        escrow.finalizeFunding(id);
        requestCompletion(id);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 20e6);
        assertEq(escrow.campaign(id).surplusPool, 0);
        assertEq(escrow.campaign(id).escrowed, 0);
        assertEq(escrow.claimableSurplus(id, alice), 0);
        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.NoSurplus.selector);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);
    }

    function test_onlyCreatorRequestsAndResolverCanRejectWithoutNewTimer() public {
        uint256 id = fund();
        release(id);
        vm.warp(escrow.campaign(id).challengeDeadline);

        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.InvalidInput.selector);
        escrow.requestCompletion(id, bytes32(0));
        vm.prank(creator);
        escrow.requestCompletion(id, COMPLETION_REQUEST);

        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        vm.prank(backup);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 10e6);
    }

    function test_rejectCompletionReturnsToReleasedAndAllowsRevision() public {
        uint256 id = fund();
        requestCompletion(id);
        vm.prank(resolver);
        escrow.rejectCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(uint8(escrow.campaign(id).state), uint8(FundTogetherCampaign.State.RELEASED));
        assertEq(escrow.campaign(id).completionDecisionHash, COMPLETION_DECISION);
        assertEq(escrow.campaign(id).escrowed, 20e6);

        bytes32 revised = keccak256("completion-request-v2");
        vm.prank(creator);
        escrow.requestCompletion(id, revised);
        assertEq(escrow.campaign(id).completionRequestHash, revised);
        assertEq(escrow.campaign(id).completionDecisionHash, bytes32(0));
    }

    function test_onlyBackerCanChallengeAndOpenDisputeBlocksCompletion() public {
        uint256 id = fund();
        release(id);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.AlreadyChallenged.selector);
        escrow.challengeRelease(id, EVIDENCE);
        vm.warp(block.timestamp + 7 days);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.OpenDisputes.selector);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.prank(bob);
        vm.expectRevert(FundTogetherCampaign.Expired.selector);
        escrow.challengeRelease(id, EVIDENCE);
    }

    function test_challengeBoundaryAllowsOneSecondBeforeAndRejectsAtDeadline() public {
        uint256 id = fund();
        release(id);
        uint256 deadline = escrow.campaign(id).challengeDeadline;

        vm.warp(deadline - 1);
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        assertEq(escrow.campaign(id).openDisputes, 1);

        vm.warp(deadline);
        vm.prank(bob);
        vm.expectRevert(FundTogetherCampaign.Expired.selector);
        escrow.challengeRelease(id, EVIDENCE);
        assertEq(escrow.campaign(id).openDisputes, 1);
    }

    function test_completionBoundaryRejectsBeforeChallengeAndAllowsAtDeadline() public {
        uint256 id = fund();
        release(id);
        uint256 deadline = escrow.campaign(id).challengeDeadline;

        vm.warp(deadline - 1);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.TooEarly.selector);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.warp(deadline);
        vm.prank(creator);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 10e6);
        assertEq(uint8(escrow.campaign(id).state), uint8(FundTogetherCampaign.State.COMPLETED));
    }

    function test_backupCanApproveCompletionImmediatelyWithoutTakeoverDelay() public {
        uint256 id = fund();
        requestCompletion(id);
        vm.prank(backup);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 10e6);
    }

    function test_proRataChoicesAndDuplicateClaims() public {
        uint256 id = create(100e6);
        vm.prank(alice);
        escrow.pledge(id, 4);
        vm.prank(bob);
        escrow.pledge(id, 16);
        vm.warp(escrow.campaign(id).fundingDeadline);
        vm.prank(resolver);
        escrow.finalizeFunding(id);
        requestCompletion(id);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);

        vm.prank(alice);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);
        assertEq(token.balanceOf(alice), 980e6);
        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.NoRefund.selector);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);

        vm.prank(bob);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.DONATE_TO_CREATOR);
        assertEq(token.balanceOf(creator), 180e6);
        assertEq(escrow.campaign(id).escrowed, 0);
        assertEq(escrow.campaign(id).surplusClaimed, 100e6);
    }

    function test_finalClaimReceivesRoundingRemainder() public {
        uint256 id = createWithPrice(keccak256("rounding-terms"), 1e6, 1e6);
        vm.prank(alice);
        escrow.pledge(id, 2);
        vm.prank(bob);
        escrow.pledge(id, 3);
        vm.warp(escrow.campaign(id).fundingDeadline);
        vm.prank(resolver);
        escrow.finalizeFunding(id);
        requestCompletion(id);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);

        assertEq(escrow.campaign(id).surplusPool, 4e6);
        assertEq(escrow.claimableSurplus(id, bob), 2.4e6);
        vm.prank(bob);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);
        assertEq(escrow.claimableSurplus(id, alice), 1.6e6);
        vm.prank(alice);
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);
        assertEq(escrow.campaign(id).surplusClaimed, 4e6);
    }

    function test_pendingCompletionCannotBeCancelledOrRefunded() public {
        uint256 id = fund();
        requestCompletion(id);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.cancelCampaign(id);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.startRefunds(id);
        assertEq(escrow.campaign(id).escrowed, 20e6);
        assertEq(uint8(escrow.campaign(id).state), uint8(FundTogetherCampaign.State.COMPLETION_REQUESTED));
    }

    function test_failedTokenTransferRollsBackCompletionAndClaim() public {
        uint256 id = fund();
        requestCompletion(id);
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(IERC20.transfer.selector, creator, 10e6),
            abi.encode(false)
        );
        vm.prank(resolver);
        vm.expectRevert();
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(escrow.campaign(id).escrowed, 20e6);
        assertEq(uint8(escrow.campaign(id).state), uint8(FundTogetherCampaign.State.COMPLETION_REQUESTED));
        vm.clearMockedCalls();
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);

        vm.mockCall(
            address(token),
            abi.encodeWithSelector(IERC20.transfer.selector, alice, 5e6),
            abi.encode(false)
        );
        vm.prank(alice);
        vm.expectRevert();
        escrow.claimSurplus(id, FundTogetherCampaign.SurplusChoice.REFUND_TO_BACKER);
        assertEq(escrow.claimedSurplus(id, alice), false);
        assertEq(escrow.campaign(id).escrowed, 10e6);
    }

    function test_onlyCreatorConfirmsCompletionAndSetsReleaseDeadline() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.confirmCampaignCompletion(id, block.timestamp + 20 days);
        assertEq(escrow.campaign(id).releaseDeadline, 0);
        uint256 deadline = block.timestamp + 20 days;
        vm.prank(creator);
        escrow.confirmCampaignCompletion(id, deadline);
        assertEq(escrow.campaign(id).releaseDeadline, deadline);
    }

    function test_fundingFailureFullRefundExactlyOnce() public {
        uint256 id = create(20e6);
        vm.prank(alice);
        escrow.pledge(id, 1);
        vm.warp(block.timestamp + 1 days);
        vm.prank(resolver);
        escrow.finalizeFunding(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(alice), 1000e6);
        vm.prank(alice);
        vm.expectRevert(FundTogetherCampaign.NoRefund.selector);
        escrow.claimRefund(id);
    }

    function test_missingReleaseTimeoutCannotRaceLateReview() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.warp(escrow.campaign(id).fundingDeadline + escrow.PRODUCTION_GRACE());
        vm.prank(resolver);
        vm.expectRevert(FundTogetherCampaign.Expired.selector);
        escrow.reviewProduction(id, EVIDENCE, true);
        escrow.startRefunds(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        vm.prank(bob);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_backupAfterSevenDaysCanUpholdChallengeAndRefundEveryone() public {
        uint256 id = fund();
        release(id);
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(backup);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.resolveChallenge(id, alice, true, EVIDENCE);
        vm.warp(block.timestamp + 7 days);
        vm.prank(backup);
        escrow.resolveChallenge(id, alice, true, EVIDENCE);
        vm.prank(alice);
        escrow.claimRefund(id);
        vm.prank(bob);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(creator), 0);
        assertEq(token.balanceOf(alice), 1000e6);
        assertEq(token.balanceOf(bob), 1000e6);
    }

    function test_unresolvedDisputeTimeoutPermissionlessFullRefund() public {
        uint256 id = fund();
        release(id);
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        vm.warp(block.timestamp + 30 days);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherCampaign.Expired.selector);
        escrow.resolveChallenge(id, alice, false, EVIDENCE);
        escrow.startRefunds(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(alice), 1000e6);
    }

    function test_dismissedChallengeDoesNotExtendWindowAndBackupCanReviewRelease() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.warp(block.timestamp + 7 days);
        vm.prank(backup);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(creator);
        escrow.confirmCampaignCompletion(id, block.timestamp + 20 days);
        vm.prank(creator);
        escrow.submitRelease(id, PDF, EVIDENCE);
        vm.warp(block.timestamp + 7 days);
        vm.prank(backup);
        escrow.reviewRelease(id, PDF, EVIDENCE, true);
        uint256 deadline = escrow.campaign(id).challengeDeadline;
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(resolver);
        escrow.resolveChallenge(id, alice, false, EVIDENCE);
        assertEq(escrow.campaign(id).challengeDeadline, deadline);
        vm.warp(deadline);
        vm.prank(creator);
        escrow.requestCompletion(id, COMPLETION_REQUEST);
        vm.prank(resolver);
        escrow.approveCompletion(id, COMPLETION_REQUEST, COMPLETION_DECISION);
        assertEq(token.balanceOf(creator), 10e6);
    }

    function test_creatorCancellationBeforeCompletionRefundsAndFrozenReleaseCannotChange() public {
        uint256 id = fund();
        release(id);
        vm.prank(creator);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.submitRelease(id, keccak256("replacement"), EVIDENCE);
        vm.prank(creator);
        escrow.cancelCampaign(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(alice), 1000e6);
    }

    function test_deploymentIsLocalOnlyAndJudgePoolIsAvailable() public {
        assertEq(escrow.judgePoolLength(), 4);
        assertTrue(escrow.isEligibleJudge(judgeOne));
        assertTrue(!escrow.isEligibleJudge(creator));
        vm.chainId(1);
        vm.expectRevert(FundTogetherCampaign.LocalOnly.selector);
        address[] memory judges = new address[](3);
        judges[0] = judgeOne;
        judges[1] = judgeTwo;
        judges[2] = judgeThree;
        new FundTogetherCampaign(address(token), resolver, backup, judges);
    }

    function test_rejectedEvidenceCanBeCorrectedAndStaleHashesCannotBeReviewed() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.prank(backup);
        vm.expectRevert(FundTogetherCampaign.Unauthorized.selector);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(resolver);
        escrow.reviewProduction(id, EVIDENCE, false);
        bytes32 corrected = keccak256("corrected-production-evidence");
        vm.prank(creator);
        escrow.submitProduction(id, corrected);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(resolver);
        escrow.reviewProduction(id, corrected, true);
        vm.prank(creator);
        escrow.confirmCampaignCompletion(id, block.timestamp + 20 days);
        vm.prank(creator);
        escrow.submitRelease(id, PDF, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewRelease(id, PDF, EVIDENCE, false);
        bytes32 replacement = keccak256("corrected-pdf-before-acceptance");
        vm.prank(creator);
        escrow.submitRelease(id, replacement, EVIDENCE);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherCampaign.WrongState.selector);
        escrow.reviewRelease(id, PDF, EVIDENCE, true);
        vm.prank(resolver);
        escrow.reviewRelease(id, replacement, EVIDENCE, true);
        assertEq(escrow.campaign(id).pdfHash, replacement);
    }

    function test_failedOrInexactPledgeCreatesNoClaim() public {
        uint256 id = create(10e6);
        vm.prank(alice);
        token.approve(address(escrow), 0);
        vm.prank(alice);
        vm.expectRevert();
        escrow.pledge(id, 1);
        assertEq(escrow.pledged(id, alice), 0);
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(escrow)),
            abi.encode(0)
        );
        vm.prank(bob);
        vm.expectRevert(FundTogetherCampaign.InexactTransfer.selector);
        escrow.pledge(id, 1);
        vm.clearMockedCalls();
        assertEq(escrow.pledged(id, bob), 0);
        assertEq(escrow.campaign(id).raised, 0);
        assertEq(token.balanceOf(bob), 1000e6);
    }

    function testFuzz_custodyConservationOnCancel(uint96 price) public {
        price = uint96(bound(price, 1, 1000e6));
        uint256 id = approvePublication(TERMS, price, price);
        vm.prank(alice);
        escrow.pledge(id, 1);
        vm.prank(bob);
        escrow.pledge(id, 1);
        assertEq(escrow.campaign(id).raised, uint256(price) * 2);
        vm.prank(creator);
        escrow.cancelCampaign(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(address(escrow)), price);
        vm.prank(bob);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(alice) + token.balanceOf(bob), 2000e6);
    }
}
