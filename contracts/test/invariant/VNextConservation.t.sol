// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../src/campaigns/VNextTypes.sol";

contract FailingMockUSDC is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Failing Mock USDC", "fmUSDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (failTransfers) revert("transfer blocked");
        super._update(from, to, amount);
    }
}

contract VNextConservationTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator = makeAddr("conservation-creator");
    address private payout = makeAddr("conservation-payout");
    address private backerOne = makeAddr("conservation-backer-one");
    address private backerTwo = makeAddr("conservation-backer-two");

    function setUp() public {
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v1"), 1 days, 7 days, 7 days
        );
    }

    function test_partialPayoutAndRefundConserveContributionEscrow() public {
        uint256 campaignId = _createCampaign(60e6, 40e6);
        _openFunding(campaignId);
        _fund(backerOne, 60e6, campaignId);
        _fund(backerTwo, 40e6, campaignId);
        vm.warp(block.timestamp + 7 days);
        escrow.finalizeFunding(campaignId);

        bytes32 firstCase = _submit(campaignId, 0, "milestone-one");
        review.setFinalOutcome(firstCase, VNextTypes.ReviewOutcome.FINAL_PASS);
        escrow.syncFinalRuling(campaignId, 0);
        vm.warp(block.timestamp + 1 days);
        escrow.payMilestone(campaignId, 0);

        bytes32 secondCase = _submit(campaignId, 1, "milestone-two");
        review.setFinalOutcome(secondCase, VNextTypes.ReviewOutcome.PROTOCOL_FAIL);
        escrow.syncFinalRuling(campaignId, 1);
        escrow.freezeRefundAllocations(campaignId, 10);
        vm.prank(backerOne);
        escrow.claimRefund(campaignId);
        vm.prank(backerTwo);
        escrow.claimRefund(campaignId);

        assertEq(
            escrow.campaignRaised(campaignId),
            escrow.campaignPaidOut(campaignId) + escrow.campaignRefunded(campaignId)
                + token.balanceOf(address(escrow))
        );
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function testFuzz_refundNeverExceedsSnapshot(uint96 first, uint96 second) public {
        uint256 firstAmount = bound(uint256(first), 1, 99e6);
        uint256 secondAmount = bound(uint256(second), 1, 100e6 - firstAmount);
        uint256 campaignId = _createCampaign(100e6);
        _openFunding(campaignId);
        _fund(backerOne, firstAmount, campaignId);
        _fund(backerTwo, secondAmount, campaignId);
        vm.warp(block.timestamp + 2 days);
        escrow.finalizeFunding(campaignId);
        escrow.freezeRefundAllocations(campaignId, 10);

        vm.prank(backerOne);
        escrow.claimRefund(campaignId);
        vm.prank(backerTwo);
        escrow.claimRefund(campaignId);

        assertLe(escrow.campaignRefunded(campaignId), escrow.campaignRefundPool(campaignId));
        assertLe(escrow.campaignRefunded(campaignId), escrow.campaignRefundSnapshot(campaignId));
        assertEq(
            escrow.campaignRaised(campaignId),
            escrow.campaignPaidOut(campaignId) + escrow.campaignRefunded(campaignId)
                + token.balanceOf(address(escrow))
        );
    }

    function test_failedPayoutTransferRollsBackPayoutState() public {
        FailingMockUSDC failingToken = new FailingMockUSDC();
        MockReviewFinality failingReview = new MockReviewFinality();
        CampaignEscrowVNext failingEscrow = new CampaignEscrowVNext(
            address(failingToken),
            address(failingReview),
            1,
            keccak256("policy-v1"),
            1 days,
            7 days,
            7 days
        );
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("criteria");
        vm.prank(creator);
        uint256 campaignId = failingEscrow.createCampaign(
            payout, 100e6, block.timestamp + 7 days, budgets, criteria, keccak256("publication")
        );
        failingReview.setFinalOutcome(
            failingEscrow.publicationReviewCase(campaignId), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        failingEscrow.finalizePublication(campaignId);
        failingToken.mint(backerOne, 100e6);
        vm.startPrank(backerOne);
        failingToken.approve(address(failingEscrow), 100e6);
        failingEscrow.contribute(campaignId, 100e6);
        vm.stopPrank();
        vm.warp(block.timestamp + 7 days);
        failingEscrow.finalizeFunding(campaignId);
        vm.prank(creator);
        bytes32 caseId = failingEscrow.submitMilestoneEvidence(campaignId, 0, keccak256("evidence"));
        failingReview.setFinalOutcome(caseId, VNextTypes.ReviewOutcome.FINAL_PASS);
        failingEscrow.syncFinalRuling(campaignId, 0);
        vm.warp(block.timestamp + 1 days);
        failingToken.setFailTransfers(true);

        vm.expectRevert("transfer blocked");
        failingEscrow.payMilestone(campaignId, 0);
        assertEq(failingEscrow.campaignPaidOut(campaignId), 0);
        assertFalse(failingEscrow.refundClaimed(campaignId, creator));
    }

    function _createCampaign(uint256 firstBudget, uint256 secondBudget)
        private
        returns (uint256 campaignId)
    {
        uint256[] memory budgets = new uint256[](2);
        budgets[0] = firstBudget;
        budgets[1] = secondBudget;
        bytes32[] memory criteria = new bytes32[](2);
        criteria[0] = keccak256("criteria-one");
        criteria[1] = keccak256("criteria-two");
        vm.prank(creator);
        campaignId = escrow.createCampaign(
            payout,
            firstBudget + secondBudget,
            block.timestamp + 7 days,
            budgets,
            criteria,
            keccak256("publication")
        );
    }

    function _createCampaign(uint256 goal) private returns (uint256 campaignId) {
        uint256[] memory budgets = new uint256[](1);
        budgets[0] = goal;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("criteria");
        vm.prank(creator);
        campaignId = escrow.createCampaign(
            payout, goal, block.timestamp + 1 days, budgets, criteria, keccak256("publication")
        );
    }

    function _openFunding(uint256 campaignId) private {
        review.setFinalOutcome(
            escrow.publicationReviewCase(campaignId), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        escrow.finalizePublication(campaignId);
    }

    function _fund(address backer, uint256 amount, uint256 campaignId) private {
        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(escrow), amount);
        escrow.contribute(campaignId, amount);
        vm.stopPrank();
    }

    function _submit(uint256 campaignId, uint256 milestoneId, string memory label)
        private
        returns (bytes32 caseId)
    {
        vm.prank(creator);
        caseId = escrow.submitMilestoneEvidence(campaignId, milestoneId, keccak256(bytes(label)));
    }
}
