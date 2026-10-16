pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { FundTogetherEditions } from "../../../src/reward/FundTogetherEditions.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EditionsEscrowTest is Test {
    MockUSDC private token;
    FundTogetherEditions private escrow;
    address private creator = makeAddr("editions-creator");
    address private resolver = makeAddr("editions-resolver");
    address private backup = makeAddr("editions-backup");
    address private alice = makeAddr("editions-alice");
    address private bob = makeAddr("editions-bob");
    bytes32 private constant TERMS = keccak256("frozen-pdf-terms");
    bytes32 private constant PDF = keccak256("final-pdf-bytes");
    bytes32 private constant EVIDENCE = keccak256("release-evidence");

    function setUp() public {
        vm.chainId(31339);
        token = new MockUSDC();
        escrow = new FundTogetherEditions(address(token), resolver, backup);
        token.mint(alice, 1000e6);
        token.mint(bob, 1000e6);
        vm.prank(alice);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        token.approve(address(escrow), type(uint256).max);
    }

    function create(uint256 goal) private returns (uint256 id) {
        uint256 deadline = block.timestamp + 20 days;
        vm.prank(resolver);
        escrow.approveCampaign(creator, TERMS, goal, 10e6, 1 days, deadline);
        vm.prank(creator);
        id = escrow.createCampaign(TERMS, goal, 10e6, 1 days, deadline);
    }

    function fund() private returns (uint256 id) {
        id = create(10e6);
        vm.prank(alice);
        escrow.pledge(id);
        vm.prank(bob);
        escrow.pledge(id);
        vm.warp(block.timestamp + 1 days);
        escrow.finalizeFunding(id);
    }

    function release(uint256 id) private {
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(creator);
        escrow.submitRelease(id, PDF, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewRelease(id, PDF, EVIDENCE, true);
    }

    function test_requiresReviewedExactTermsAndSingleUseApproval() public {
        vm.prank(creator);
        vm.expectRevert(FundTogetherEditions.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days, block.timestamp + 20 days);
        uint256 id = create(10e6);
        assertEq(id, 0);
        vm.prank(creator);
        vm.expectRevert(FundTogetherEditions.NotApproved.selector);
        escrow.createCampaign(TERMS, 10e6, 10e6, 1 days, block.timestamp + 20 days);
    }

    function test_overfundingSinglePledgeNoEarlyPayout() public {
        uint256 id = create(10e6);
        vm.prank(alice);
        escrow.pledge(id);
        vm.prank(alice);
        vm.expectRevert(FundTogetherEditions.AlreadyPledged.selector);
        escrow.pledge(id);
        vm.prank(bob);
        escrow.pledge(id);
        assertEq(escrow.campaign(id).raised, 20e6);
        assertEq(token.balanceOf(address(escrow)), 20e6);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.payout(id);
        assertEq(token.balanceOf(creator), 0);
    }

    function test_pledgeBoundaryAllowsOneSecondBeforeAndRejectsAtDeadline() public {
        uint256 id = create(20e6);
        uint256 deadline = escrow.campaign(id).fundingDeadline;

        vm.warp(deadline - 1);
        vm.prank(alice);
        escrow.pledge(id);
        assertTrue(escrow.pledged(id, alice));
        assertEq(escrow.campaign(id).raised, 10e6);

        vm.warp(deadline);
        vm.prank(bob);
        vm.expectRevert(FundTogetherEditions.Expired.selector);
        escrow.pledge(id);
        assertFalse(escrow.pledged(id, bob));
        assertEq(escrow.campaign(id).raised, 10e6);
    }

    function test_releaseProductionAndPaymentAreSeparateAndPayOnce() public {
        uint256 id = fund();
        vm.prank(creator);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.submitRelease(id, PDF, EVIDENCE);
        release(id);
        assertEq(token.balanceOf(creator), 0);
        vm.expectRevert(FundTogetherEditions.TooEarly.selector);
        escrow.payout(id);
        vm.warp(block.timestamp + 7 days);
        escrow.payout(id);
        assertEq(token.balanceOf(creator), 20e6);
        assertEq(escrow.campaign(id).escrowed, 0);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.payout(id);
        vm.prank(alice);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.claimRefund(id);
    }

    function test_fundingFailureFullRefundExactlyOnce() public {
        uint256 id = create(20e6);
        vm.prank(alice);
        escrow.pledge(id);
        vm.warp(block.timestamp + 1 days);
        escrow.finalizeFunding(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(alice), 1000e6);
        vm.prank(alice);
        vm.expectRevert(FundTogetherEditions.NoRefund.selector);
        escrow.claimRefund(id);
    }

    function test_missingReleaseTimeoutCannotRaceLateReview() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.warp(escrow.campaign(id).releaseDeadline + 7 days);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherEditions.Expired.selector);
        escrow.reviewProduction(id, EVIDENCE, true);
        escrow.startRefunds(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        vm.prank(bob);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_onlyBackerCanChallengeAndOpenDisputeBlocksPayout() public {
        uint256 id = fund();
        release(id);
        vm.prank(creator);
        vm.expectRevert(FundTogetherEditions.Unauthorized.selector);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(alice);
        vm.expectRevert(FundTogetherEditions.AlreadyChallenged.selector);
        escrow.challengeRelease(id, EVIDENCE);
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(FundTogetherEditions.OpenDisputes.selector);
        escrow.payout(id);
        vm.prank(bob);
        vm.expectRevert(FundTogetherEditions.Expired.selector);
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
        vm.expectRevert(FundTogetherEditions.Expired.selector);
        escrow.challengeRelease(id, EVIDENCE);
        assertEq(escrow.campaign(id).openDisputes, 1);
    }

    function test_payoutBoundaryRejectsOneSecondBeforeAndAllowsAtDeadline() public {
        uint256 id = fund();
        release(id);
        uint256 deadline = escrow.campaign(id).challengeDeadline;

        vm.warp(deadline - 1);
        vm.expectRevert(FundTogetherEditions.TooEarly.selector);
        escrow.payout(id);
        assertEq(token.balanceOf(creator), 0);
        assertEq(escrow.campaign(id).escrowed, 20e6);

        vm.warp(deadline);
        escrow.payout(id);
        assertEq(token.balanceOf(creator), 20e6);
        assertEq(escrow.campaign(id).escrowed, 0);
        assertEq(uint8(escrow.campaign(id).state), uint8(FundTogetherEditions.State.COMPLETED));
    }

    function test_backupAfterSevenDaysCanUpholdChallengeAndRefundEveryone() public {
        uint256 id = fund();
        release(id);
        vm.prank(alice);
        escrow.challengeRelease(id, EVIDENCE);
        vm.prank(backup);
        vm.expectRevert(FundTogetherEditions.Unauthorized.selector);
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
        vm.expectRevert(FundTogetherEditions.Expired.selector);
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
        escrow.payout(id);
        assertEq(token.balanceOf(creator), 20e6);
    }

    function test_creatorCancellationBeforePayoutRefundsAndFrozenReleaseCannotChange() public {
        uint256 id = fund();
        release(id);
        vm.prank(creator);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.submitRelease(id, keccak256("replacement"), EVIDENCE);
        vm.prank(creator);
        escrow.cancelCampaign(id);
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(token.balanceOf(alice), 1000e6);
    }

    function test_rolesCannotSelfApproveAndDeploymentIsLocalOnly() public {
        vm.prank(resolver);
        vm.expectRevert(FundTogetherEditions.InvalidInput.selector);
        escrow.approveCampaign(resolver, TERMS, 10e6, 10e6, 1 days, block.timestamp + 20 days);
        vm.prank(alice);
        vm.expectRevert(FundTogetherEditions.Unauthorized.selector);
        escrow.approveCampaign(creator, TERMS, 10e6, 10e6, 1 days, block.timestamp + 20 days);
        vm.chainId(1);
        vm.expectRevert(FundTogetherEditions.LocalOnly.selector);
        new FundTogetherEditions(address(token), resolver, backup);
    }

    function test_rejectedEvidenceCanBeCorrectedAndStaleHashesCannotBeReviewed() public {
        uint256 id = fund();
        vm.prank(creator);
        escrow.submitProduction(id, EVIDENCE);
        vm.prank(backup);
        vm.expectRevert(FundTogetherEditions.Unauthorized.selector);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(resolver);
        escrow.reviewProduction(id, EVIDENCE, false);
        bytes32 corrected = keccak256("corrected-production-evidence");
        vm.prank(creator);
        escrow.submitProduction(id, corrected);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.reviewProduction(id, EVIDENCE, true);
        vm.prank(resolver);
        escrow.reviewProduction(id, corrected, true);
        vm.prank(creator);
        escrow.submitRelease(id, PDF, EVIDENCE);
        vm.prank(resolver);
        escrow.reviewRelease(id, PDF, EVIDENCE, false);
        bytes32 replacement = keccak256("corrected-pdf-before-acceptance");
        vm.prank(creator);
        escrow.submitRelease(id, replacement, EVIDENCE);
        vm.prank(resolver);
        vm.expectRevert(FundTogetherEditions.WrongState.selector);
        escrow.reviewRelease(id, PDF, EVIDENCE, true);
        vm.prank(resolver);
        escrow.reviewRelease(id, replacement, EVIDENCE, true);
        assertEq(escrow.campaign(id).pdfHash, replacement);
    }

    function test_failedTokenTransferRollsBackRefundAndPayout() public {
        uint256 id = fund();
        release(id);
        vm.warp(block.timestamp + 7 days);
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(IERC20.transfer.selector, creator, 20e6),
            abi.encode(false)
        );
        vm.expectRevert();
        escrow.payout(id);
        assertEq(escrow.campaign(id).escrowed, 20e6);
        assertEq(uint8(escrow.campaign(id).state), uint8(FundTogetherEditions.State.RELEASED));
        vm.clearMockedCalls();
        vm.prank(creator);
        escrow.cancelCampaign(id);
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(IERC20.transfer.selector, alice, 10e6),
            abi.encode(false)
        );
        vm.prank(alice);
        vm.expectRevert();
        escrow.claimRefund(id);
        assertFalse(escrow.refunded(id, alice));
        assertEq(escrow.campaign(id).escrowed, 20e6);
        vm.clearMockedCalls();
        vm.prank(alice);
        escrow.claimRefund(id);
        assertEq(escrow.campaign(id).escrowed, 10e6);
    }

    function test_failedOrInexactPledgeCreatesNoClaim() public {
        uint256 id = create(10e6);
        vm.prank(alice);
        token.approve(address(escrow), 0);
        vm.prank(alice);
        vm.expectRevert();
        escrow.pledge(id);
        assertFalse(escrow.pledged(id, alice));
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(escrow)),
            abi.encode(0)
        );
        vm.prank(bob);
        vm.expectRevert(FundTogetherEditions.InexactTransfer.selector);
        escrow.pledge(id);
        vm.clearMockedCalls();
        assertFalse(escrow.pledged(id, bob));
        assertEq(escrow.campaign(id).raised, 0);
        assertEq(token.balanceOf(bob), 1000e6);
    }

    function testFuzz_custodyConservationOnCancel(uint96 price) public {
        price = uint96(bound(price, 1, 1000e6));
        uint256 deadline = block.timestamp + 20 days;
        vm.prank(resolver);
        escrow.approveCampaign(creator, TERMS, price, price, 1 days, deadline);
        vm.prank(creator);
        uint256 id = escrow.createCampaign(TERMS, price, price, 1 days, deadline);
        vm.prank(alice);
        escrow.pledge(id);
        vm.prank(bob);
        escrow.pledge(id);
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
