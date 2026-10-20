// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { VNextTypes } from "../../../src/campaigns/VNextTypes.sol";
import { JuryTypes } from "../../../src/jury/JuryTypes.sol";

contract VNextStateMachineTest is Test {
    function test_finalPassOnlyUnlocksAfterAppealAndChallenge() public pure {
        assertTrue(
            VNextTypes.payoutEligible(
                VNextTypes.MilestoneState.CHALLENGE_WINDOW,
                VNextTypes.ReviewOutcome.FINAL_PASS,
                true,
                true,
                false
            )
        );
    }

    function test_finalPassCannotPayWhileAppealIsOpen() public pure {
        assertFalse(
            VNextTypes.payoutEligible(
                VNextTypes.MilestoneState.CHALLENGE_WINDOW,
                VNextTypes.ReviewOutcome.FINAL_PASS,
                false,
                true,
                false
            )
        );
    }

    function test_failuresAndDuplicatePayoutCannotPay() public pure {
        assertFalse(
            VNextTypes.payoutEligible(
                VNextTypes.MilestoneState.CORRECTION,
                VNextTypes.ReviewOutcome.VERDICT_FAIL,
                true,
                true,
                false
            )
        );
        assertFalse(
            VNextTypes.payoutEligible(
                VNextTypes.MilestoneState.PAID,
                VNextTypes.ReviewOutcome.FINAL_PASS,
                true,
                true,
                true
            )
        );
    }

    function test_protocolFailIsNotSubstantive() public pure {
        assertFalse(VNextTypes.isSubstantive(VNextTypes.ReviewOutcome.PROTOCOL_FAIL));
        assertTrue(VNextTypes.isSubstantive(VNextTypes.ReviewOutcome.FINAL_PASS));
        assertTrue(VNextTypes.isSubstantive(VNextTypes.ReviewOutcome.VERDICT_FAIL));
    }

    function test_reviewKeyChangesWhenRevisionOrRoundChanges() public pure {
        bytes32 base = VNextTypes.reviewKey(7, 2, 1, 9, 0, 0, 1);
        bytes32 revision = VNextTypes.reviewKey(7, 2, 2, 9, 0, 0, 1);
        bytes32 round = VNextTypes.reviewKey(7, 2, 1, 9, 1, 0, 1);

        assertTrue(base != revision);
        assertTrue(base != round);
        assertTrue(revision != round);
    }

    function test_voteCommitmentBindsCaseRoundCourtJudgeVoteAndSalt() public pure {
        bytes32 base = JuryTypes.voteCommitment(
            31339, 1, 7, 2, 3, 9, 1, 0, address(11), JuryTypes.Vote.PASS, bytes32(uint256(1))
        );
        bytes32 changedVote = JuryTypes.voteCommitment(
            31339, 1, 7, 2, 3, 9, 1, 0, address(11), JuryTypes.Vote.FAIL, bytes32(uint256(1))
        );

        assertTrue(base != changedVote);
    }

    function test_validCourtRequiresThreeUniqueJudgesAndAllReveals() public pure {
        address[3] memory judges = [address(1), address(2), address(3)];
        bool[3] memory revealed = [true, true, true];
        assertTrue(JuryTypes.validCourt(judges, revealed));

        revealed[2] = false;
        assertFalse(JuryTypes.validCourt(judges, revealed));

        revealed[2] = true;
        judges[2] = judges[1];
        assertFalse(JuryTypes.validCourt(judges, revealed));
    }
}
