// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { MockReviewFinality } from "../mocks/MockReviewFinality.sol";
import { CampaignEscrowVNext } from "../../src/campaigns/CampaignEscrowVNext.sol";
import { VNextTypes } from "../../src/campaigns/VNextTypes.sol";

/// @notice Recorded and fuzzed action sequences for the local VNext funding
/// state machine. Every action is attempted by an arbitrary wallet and may be
/// repeated after a deadline jump; rejected actions must leave conservation
/// unchanged.
contract VNextStateMachineTest is Test {
    MockUSDC private token;
    MockReviewFinality private review;
    CampaignEscrowVNext private escrow;
    address private creator;
    address private payout;
    address[3] private callers;
    uint256 private campaignId;
    uint256 private fundingDeadline;

    function setUp() public {
        creator = makeAddr("fuzz-creator");
        payout = makeAddr("fuzz-payout");
        callers = [makeAddr("fuzz-backer-one"), makeAddr("fuzz-backer-two"), makeAddr("fuzz-outsider")];
        token = new MockUSDC();
        review = new MockReviewFinality();
        escrow = new CampaignEscrowVNext(
            address(token), address(review), 1, keccak256("policy-v2"), 7 days, 7 days, 7 days
        );

        uint256[] memory budgets = new uint256[](1);
        budgets[0] = 100e6;
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("fuzz-criteria");
        fundingDeadline = block.timestamp + 7 days;
        vm.prank(creator);
        campaignId = escrow.createCampaign(
            payout,
            100e6,
            fundingDeadline,
            budgets,
            criteria,
            keccak256("fuzz-publication")
        );
        review.setFinalOutcome(
            escrow.publicationReviewCase(campaignId), VNextTypes.ReviewOutcome.FINAL_PASS
        );
        escrow.finalizePublication(campaignId);
    }

    /// forge-config: default.fuzz.runs = 128
    function testFuzz_arbitraryCallersRepeatedActionsAndDeadlineJumps(
        uint256 seed,
        uint256 amountSeed,
        uint8 callerSeed
    ) public {
        for (uint256 step = 0; step < 16; step++) {
            uint256 action = uint256(keccak256(abi.encode(seed, step))) % 5;
            uint256 jump = uint256(keccak256(abi.encode(seed, step, "jump"))) % 2 days;
            if (jump != 0) vm.warp(block.timestamp + jump);

            address caller = callers[(uint256(callerSeed) + step) % callers.length];
            if (action == 0) {
                _tryContribute(caller, amountSeed, step);
            } else if (action == 1) {
                _tryFinalizeFunding(caller);
            } else if (action == 2) {
                _tryFinalizeFunding(caller);
            } else if (action == 3) {
                _tryExpireMilestone(caller);
            } else {
                _tryRefund(caller);
            }

            _assertConservation();
        }
    }

    function test_recordedSeedSequence_preservesFundingDeadlineAndConservation() public {
        uint256[10] memory actions = [uint256(0), 1, 0, 2, 4, 0, 3, 4, 1, 4];
        uint256[10] memory jumps = [uint256(0), 0, 1 days, 0, 6 days, 1 days, 7 days, 0, 1 days, 0];
        address[10] memory actors = [
            callers[0], callers[2], callers[1], callers[2], callers[1],
            callers[0], callers[2], callers[0], callers[1], callers[2]
        ];

        for (uint256 step = 0; step < actions.length; step++) {
            if (jumps[step] != 0) vm.warp(block.timestamp + jumps[step]);
            if (actions[step] == 0) _tryContribute(actors[step], 40e6, step);
            if (actions[step] == 1) _tryFinalizeFunding(actors[step]);
            if (actions[step] == 2) _tryFinalizeFunding(actors[step]);
            if (actions[step] == 3) _tryExpireMilestone(actors[step]);
            if (actions[step] == 4) _tryRefund(actors[step]);
            _assertConservation();
        }

        assertGe(block.timestamp, fundingDeadline);
        assertTrue(
            escrow.campaignState(campaignId) == VNextTypes.CampaignState.MILESTONES_RUNNING
                || escrow.campaignState(campaignId) == VNextTypes.CampaignState.REFUNDING
        );
    }

    function _tryContribute(address caller, uint256 amountSeed, uint256 step) private {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.FUNDING) return;
        uint256 remaining = escrow.campaignGoal(campaignId) - escrow.campaignRaised(campaignId);
        if (remaining == 0) return;
        uint256 amount = bound(amountSeed ^ step, 1, remaining);
        token.mint(caller, amount);
        vm.startPrank(caller);
        token.approve(address(escrow), amount);
        try escrow.contribute(campaignId, amount) { } catch { }
        vm.stopPrank();
    }

    function _tryFinalizeFunding(address caller) private {
        vm.prank(caller);
        try escrow.finalizeFunding(campaignId) { } catch { }
    }

    function _tryExpireMilestone(address caller) private {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.MILESTONES_RUNNING) return;
        vm.prank(caller);
        try escrow.expireMilestoneSubmission(campaignId, 0) { } catch { }
    }

    function _tryRefund(address caller) private {
        if (escrow.campaignState(campaignId) != VNextTypes.CampaignState.REFUNDING) return;
        try escrow.freezeRefundAllocations(campaignId, 2) { } catch { }
        vm.prank(caller);
        try escrow.claimRefund(campaignId) { } catch { }
    }

    function _assertConservation() private view {
        uint256 raised = escrow.campaignRaised(campaignId);
        uint256 paidOut = escrow.campaignPaidOut(campaignId);
        uint256 refunded = escrow.campaignRefunded(campaignId);
        uint256 held = token.balanceOf(address(escrow));
        assertEq(raised, paidOut + refunded + held);
    }
}
