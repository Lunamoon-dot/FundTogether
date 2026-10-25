pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingFixture,
    V2FinancialAccountingTypes
} from "../../fixtures/V2FinancialAccountingFixture.sol";
import { V2CourtResetFixture, V2CourtResetStakePool } from "../../fixtures/V2CourtResetFixture.sol";

contract ResetTransferControlMockUSDC is MockUSDC {
    bool public transfersFail;

    function setTransfersFail(bool value) external {
        transfersFail = value;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (transfersFail) return false;
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (transfersFail) return false;
        return super.transferFrom(from, to, amount);
    }
}

contract V2CourtResetFixtureTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant RESET_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr3-court-reset-fixture");
    bytes32 internal constant ACCOUNTING_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    bytes32 internal constant CASE_ID = keccak256("pr3-case");

    MockUSDC internal token;
    V2CourtResetFixture internal fixture;

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        fixture = _newFixture(token);
    }

    function test_policyRemainsTestOnlyAndFreezesCCPSParameters() public {
        fixture.createCase(CASE_ID, 11, 4, 23, 10, 3);
        V2CourtResetFixture.CaseRecord memory terms = fixture.caseTerms(CASE_ID);

        assertTrue(fixture.isTestOnlyPolicy());
        assertEq(fixture.policyStatus(), "PROPOSED_PENDING_APPROVAL");
        assertEq(terms.policyVersion, keccak256("CCPS-1"));
        assertEq(terms.resetCostMax, 23);
        assertEq(terms.requiredLockedStake, 23);
        assertEq(terms.campaignId, 11);
        assertEq(terms.milestoneId, 4);
    }

    function test_revealCannotStartBeforeCommitWindowEnds() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 0);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        address judge = court.judges[0];
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitment = fixture.commitmentFor(CASE_ID, courtId, judge, true, salt);

        vm.startPrank(judge);
        fixture.commitVote(CASE_ID, courtId, commitment);
        vm.expectRevert(V2CourtResetFixture.CourtNotReady.selector);
        fixture.revealVote(CASE_ID, courtId, true, salt);
        vm.warp(court.commitDeadline);
        fixture.revealVote(CASE_ID, courtId, true, salt);
        vm.stopPrank();

        court = fixture.courtInfo(courtId);
        assertTrue(court.revealValid[0]);
    }

    function test_R1OneOffenderPaysOneTotalAndCompliantSeatsReceiveD() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 1);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[1], true, 1);
        _commitReveal(CASE_ID, courtId, court.judges[2], false, 2);

        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        court = fixture.courtInfo(courtId);

        assertEq(court.offenderCount, 1);
        assertEq(court.compensationTotal, 23);
        assertEq(fixture.settlementCompensation(court.settlementId), 23);
        assertEq(fixture.stakePool().depositedStake(court.judges[0]), 27);
        assertEq(fixture.compensationEntitlement(court.settlementId, court.judges[0]), 0);
        assertEq(fixture.compensationEntitlement(court.settlementId, court.judges[1]), 10);
        assertEq(fixture.compensationEntitlement(court.settlementId, court.judges[2]), 10);
        assertEq(fixture.compensationEntitlement(court.settlementId, address(this)), 3);
        assertEq(fixture.stakePool().totalClaimLiability(), 23);
    }

    function test_R2TwoOffendersSplitOneTotalByCanonicalAddress() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 2);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[2], true, 2);

        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        court = fixture.courtInfo(courtId);

        address lower =
            uint160(court.judges[0]) < uint160(court.judges[1]) ? court.judges[0] : court.judges[1];
        address higher = lower == court.judges[0] ? court.judges[1] : court.judges[0];
        assertEq(court.offenderCount, 2);
        assertEq(court.compensationTotal, 13);
        assertEq(fixture.stakePool().depositedStake(lower), 43);
        assertEq(fixture.stakePool().depositedStake(higher), 44);
        assertEq(fixture.compensationEntitlement(court.settlementId, lower), 0);
        assertEq(fixture.compensationEntitlement(court.settlementId, higher), 0);
        assertEq(fixture.compensationEntitlement(court.settlementId, court.judges[2]), 10);
        assertEq(fixture.compensationEntitlement(court.settlementId, address(this)), 3);
    }

    function test_R3ThreeOffendersSplitOnlyFinalizationAllowance() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 3);
        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);

        assertEq(court.offenderCount, 3);
        assertEq(court.compensationTotal, 3);
        for (uint256 i = 0; i < court.judges.length; i++) {
            assertEq(fixture.stakePool().depositedStake(court.judges[i]), 49);
            assertEq(fixture.compensationEntitlement(court.settlementId, court.judges[i]), 0);
        }
        assertEq(fixture.compensationEntitlement(court.settlementId, address(this)), 3);
        assertEq(fixture.stakePool().totalClaimLiability(), 3);
    }

    function test_R4ExactCollateralCoversSoleOffender() public {
        _fundJudges(3, 23);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 4);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[1], true, 4);
        _commitReveal(CASE_ID, courtId, court.judges[2], true, 5);
        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);

        assertEq(fixture.stakePool().depositedStake(court.judges[0]), 0);
        assertEq(fixture.stakePool().reservedStake(court.judges[0]), 0);
        assertEq(fixture.stakePool().depositedStake(court.judges[0]), 0);
        assertEq(fixture.compensationEntitlement(court.settlementId, court.judges[0]), 0);
    }

    function test_R5InsufficientCollateralRejectsBeforeAssignment() public {
        _fundJudges(3, 22);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);

        vm.expectRevert(V2CourtResetFixture.InvalidJudgeSet.selector);
        fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 5);
        assertEq(fixture.stakePool().reservedStake(_judge(0)), 0);
        assertEq(fixture.stakePool().reservedStake(_judge(1)), 0);
        assertEq(fixture.stakePool().reservedStake(_judge(2)), 0);
    }

    function test_assignCourtSkipsUnderCollateralizedJudgesWhenThreeEligibleRemain() public {
        for (uint256 i = 0; i < 3; i++) {
            _fundJudge(i, 22);
        }
        for (uint256 i = 3; i < 6; i++) {
            _fundJudge(i, 50);
        }
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);

        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 0);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);

        for (uint256 i = 0; i < court.judges.length; i++) {
            assertTrue(
                court.judges[i] != _judge(0) && court.judges[i] != _judge(1)
                    && court.judges[i] != _judge(2)
            );
            assertEq(fixture.stakePool().reservedStake(court.judges[i]), 23);
        }
        assertEq(fixture.stakePool().reservedStake(_judge(0)), 0);
        assertEq(fixture.stakePool().reservedStake(_judge(1)), 0);
        assertEq(fixture.stakePool().reservedStake(_judge(2)), 0);
    }

    function test_assignCourtRejectsWhenFewerThanThreeEligibleJudgesRemain() public {
        _fundJudge(0, 50);
        _fundJudge(1, 50);
        _fundJudge(2, 22);
        _fundJudge(3, 22);
        _fundJudge(4, 22);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);

        vm.expectRevert(V2CourtResetFixture.InvalidJudgeSet.selector);
        fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 7);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(fixture.stakePool().reservedStake(_judge(i)), 0);
        }
    }

    function test_reservedCollateralCannotBeWithdrawnWhileAvailableStakeCan() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 8);
        address judge = fixture.courtInfo(courtId).judges[0];

        vm.startPrank(judge);
        vm.expectRevert(V2CourtResetStakePool.InsufficientAvailableStake.selector);
        fixture.withdrawAvailableStake(28);
        fixture.withdrawAvailableStake(27);
        vm.stopPrank();

        assertEq(fixture.stakePool().depositedStake(judge), 23);
        assertEq(fixture.stakePool().reservedStake(judge), 23);
        assertEq(token.balanceOf(judge), 27);
    }

    function test_R3SameEconomicActorCanRecaptureFinalizerAllowanceBeforeGas() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 9);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        address finalizer = address(0xF1A1);
        uint256 controlledStakeBefore = _depositedStake(court.judges);

        _warpPastReveal(courtId);
        vm.prank(finalizer);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        court = fixture.courtInfo(courtId);

        uint256 grossSlash = controlledStakeBefore - _depositedStake(court.judges);
        assertEq(grossSlash, 3);
        assertEq(fixture.settlementCompensation(court.settlementId), 3);
        assertEq(fixture.compensationEntitlement(court.settlementId, finalizer), 3);
        assertEq(fixture.stakePool().totalClaimLiability(), 3);

        vm.prank(finalizer);
        fixture.claimCompensation(court.settlementId);

        uint256 controlledAssetsAfterClaim =
            _depositedStake(court.judges) + token.balanceOf(finalizer);
        assertEq(fixture.settlementPaid(court.settlementId), 3);
        assertEq(controlledAssetsAfterClaim, controlledStakeBefore);
        assertEq(grossSlash - token.balanceOf(finalizer), 0);
    }

    function test_R6TwoResetsAreSeparateFromAppealAndKeepHistory() public {
        _fundJudges(12, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);

        bytes32 courtOne = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 6);
        V2CourtResetFixture.CourtAttempt memory first = fixture.courtInfo(courtOne);
        _commitReveal(CASE_ID, courtOne, first.judges[1], true, 6);
        _commitReveal(CASE_ID, courtOne, first.judges[2], false, 7);
        _warpPastReveal(courtOne);
        fixture.settleInvalidCourt(CASE_ID, courtOne);

        bytes32 replacementOne =
            fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 7);
        V2CourtResetFixture.CourtAttempt memory replacement = fixture.courtInfo(replacementOne);
        _commitAll(CASE_ID, replacementOne, replacement, true);
        _warpPastReveal(replacementOne);
        fixture.finalizeValidCourt(CASE_ID, replacementOne);
        fixture.enableCourt2ForTest(CASE_ID);

        bytes32 courtTwo = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_2, 8);
        V2CourtResetFixture.CourtAttempt memory second = fixture.courtInfo(courtTwo);
        _commitReveal(CASE_ID, courtTwo, second.judges[2], true, 8);
        _warpPastReveal(courtTwo);
        fixture.settleInvalidCourt(CASE_ID, courtTwo);

        bytes32 replacementTwo =
            fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_2, 9);
        V2CourtResetFixture.CourtAttempt memory finalCourt = fixture.courtInfo(replacementTwo);
        _commitAll(CASE_ID, replacementTwo, finalCourt, false);
        _warpPastReveal(replacementTwo);
        fixture.finalizeValidCourt(CASE_ID, replacementTwo);

        bytes32[] memory history = fixture.caseCourtHistory(CASE_ID);
        bytes32[] memory resets = fixture.caseResetHistory(CASE_ID);
        assertEq(history.length, 4);
        assertEq(resets.length, 2);
        assertTrue(history[0] != history[1]);
        assertTrue(history[2] != history[3]);
        assertEq(fixture.caseTerms(CASE_ID).resetCount, 2);
        assertEq(fixture.stakePool().totalClaimLiability(), 36);
    }

    function test_R7ValidMinorityVoteHasNoProceduralSlash() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 10);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[0], true, 10);
        _commitReveal(CASE_ID, courtId, court.judges[1], false, 11);
        _commitReveal(CASE_ID, courtId, court.judges[2], false, 12);
        _warpPastReveal(courtId);
        fixture.finalizeValidCourt(CASE_ID, courtId);
        court = fixture.courtInfo(courtId);

        assertTrue(court.valid);
        assertEq(fixture.caseTerms(CASE_ID).resetCount, 0);
        assertEq(fixture.stakePool().totalClaimLiability(), 0);
        for (uint256 i = 0; i < court.judges.length; i++) {
            assertEq(fixture.stakePool().reservedStake(court.judges[i]), 0);
            assertEq(fixture.stakePool().depositedStake(court.judges[i]), 50);
        }
    }

    function test_R8TerminalProtocolFailSettlesFinalInvalidCourtAndPreservesClaims() public {
        _fundJudges(12, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);

        bytes32 courtOne = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 13);
        V2CourtResetFixture.CourtAttempt memory first = fixture.courtInfo(courtOne);
        _commitReveal(CASE_ID, courtOne, first.judges[1], true, 13);
        _commitReveal(CASE_ID, courtOne, first.judges[2], true, 14);
        _warpPastReveal(courtOne);
        fixture.settleInvalidCourt(CASE_ID, courtOne);

        bytes32 replacementOne =
            fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 14);
        V2CourtResetFixture.CourtAttempt memory validOne = fixture.courtInfo(replacementOne);
        _commitAll(CASE_ID, replacementOne, validOne, true);
        _warpPastReveal(replacementOne);
        fixture.finalizeValidCourt(CASE_ID, replacementOne);
        fixture.enableCourt2ForTest(CASE_ID);

        bytes32 courtTwo = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_2, 15);
        V2CourtResetFixture.CourtAttempt memory second = fixture.courtInfo(courtTwo);
        _commitReveal(CASE_ID, courtTwo, second.judges[1], false, 15);
        _commitReveal(CASE_ID, courtTwo, second.judges[2], true, 16);
        _warpPastReveal(courtTwo);
        fixture.settleInvalidCourt(CASE_ID, courtTwo);

        bytes32 replacementTwo =
            fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_2, 16);
        V2CourtResetFixture.CourtAttempt memory terminal = fixture.courtInfo(replacementTwo);
        _commitReveal(CASE_ID, replacementTwo, terminal.judges[1], true, 17);
        _commitReveal(CASE_ID, replacementTwo, terminal.judges[2], false, 18);
        _warpPastReveal(replacementTwo);
        fixture.settleInvalidCourt(CASE_ID, replacementTwo);
        terminal = fixture.courtInfo(replacementTwo);

        assertTrue(terminal.terminal);
        assertTrue(fixture.caseTerms(CASE_ID).protocolFailed);
        assertEq(fixture.caseCourtHistory(CASE_ID).length, 4);
        assertEq(fixture.caseResetHistory(CASE_ID).length, 2);
        assertEq(fixture.stakePool().totalClaimLiability(), 69);
        vm.expectRevert(V2CourtResetFixture.ProtocolFailed.selector);
        fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_2, 17);
    }

    function test_R9MissingCommitAndRevealCountAsOneSeatViolation() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 19);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[1], true, 19);
        _commitReveal(CASE_ID, courtId, court.judges[2], true, 20);
        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);

        assertEq(court.compensationTotal, 0);
        court = fixture.courtInfo(courtId);
        assertEq(court.compensationTotal, 23);
        assertEq(fixture.stakePool().totalClaimLiability(), 23);
    }

    function test_R10RejectsFinalizationAllowanceBelowMinimum() public {
        vm.expectRevert(V2CourtResetFixture.InvalidPolicy.selector);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 2);
    }

    function test_resetDoesNotOpenCourtTwoOrConsumeAppealState() public {
        _fundJudges(6, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 21);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[1], true, 21);
        _commitReveal(CASE_ID, courtId, court.judges[2], true, 22);
        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);

        assertFalse(fixture.caseTerms(CASE_ID).court2GateEnabled);
        vm.expectRevert(V2CourtResetFixture.CourtTwoNotEnabled.selector);
        fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_2, 22);
    }

    function test_failedCompensationTransferRollsBackClaimAndRemainsRetryable() public {
        ResetTransferControlMockUSDC controlled = new ResetTransferControlMockUSDC();
        V2CourtResetFixture controlledFixture = _newFixture(controlled);
        _fundJudgesOn(controlledFixture, controlled, 3, 50);
        controlledFixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId =
            controlledFixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 23);
        V2CourtResetFixture.CourtAttempt memory court = controlledFixture.courtInfo(courtId);
        _commitRevealOn(controlledFixture, CASE_ID, courtId, court.judges[1], true, 23);
        _commitRevealOn(controlledFixture, CASE_ID, courtId, court.judges[2], true, 24);
        vm.warp(court.revealDeadline);
        controlledFixture.settleInvalidCourt(CASE_ID, courtId);
        court = controlledFixture.courtInfo(courtId);

        controlled.setTransfersFail(true);
        vm.expectRevert();
        vm.prank(court.judges[1]);
        controlledFixture.claimCompensation(court.settlementId);
        assertFalse(controlledFixture.compensationClaimed(court.settlementId, court.judges[1]));
        assertEq(controlledFixture.settlementPaid(court.settlementId), 0);

        controlled.setTransfersFail(false);
        vm.prank(court.judges[1]);
        controlledFixture.claimCompensation(court.settlementId);
        assertTrue(controlledFixture.compensationClaimed(court.settlementId, court.judges[1]));
        assertEq(controlledFixture.settlementPaid(court.settlementId), 10);
    }

    function test_duplicateSettlementAndClaimsCannotDoubleSpend() public {
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 25);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[1], true, 25);
        _commitReveal(CASE_ID, courtId, court.judges[2], true, 26);
        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        court = fixture.courtInfo(courtId);

        vm.expectRevert(V2CourtResetFixture.CourtAlreadySettled.selector);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        vm.prank(court.judges[1]);
        fixture.claimCompensation(court.settlementId);
        vm.expectRevert(V2FinancialAccountingFixture.ClaimAlreadyProcessed.selector);
        vm.prank(court.judges[1]);
        fixture.claimCompensation(court.settlementId);
    }

    function test_resetCompensationUsesSeparateStakeCustodyFromAccountingFixture() public {
        uint256 custodyBefore = fixture.physicalTokenCustody();
        uint256 rewardBefore = fixture.judgePaid(1, 0);
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 27);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        _commitReveal(CASE_ID, courtId, court.judges[1], true, 27);
        _commitReveal(CASE_ID, courtId, court.judges[2], true, 28);
        _warpPastReveal(courtId);
        fixture.settleInvalidCourt(CASE_ID, courtId);

        assertEq(fixture.physicalTokenCustody(), custodyBefore);
        assertEq(fixture.judgePaid(1, 0), rewardBefore);
        assertEq(token.balanceOf(address(fixture.stakePool())), 150);
        assertEq(fixture.stakePool().totalClaimLiability(), 23);
    }

    function _newFixture(IERC20 token_) internal returns (V2CourtResetFixture result) {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript;
        transcript.deploymentIdentity = ACCOUNTING_IDENTITY;
        transcript.caseId = keccak256("pr3-accounting-case");
        transcript.campaignId = 1;
        transcript.milestoneId = 0;
        transcript.finalized = true;
        transcript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
        transcript.court1.present = true;
        transcript.court1.courtId = keccak256("invalid-court");
        ImmutableV2FinalOutcomeSource source = new ImmutableV2FinalOutcomeSource(transcript);
        result = new V2CourtResetFixture(token_, RESET_IDENTITY, source, token_);
    }

    function _fundJudges(uint256 count, uint256 amount) internal {
        _fundJudgesOn(fixture, token, count, amount);
    }

    function _fundJudge(uint256 index, uint256 amount) internal {
        address judge = _judge(index);
        fixture.registerJudge(judge);
        token.mint(judge, amount);
        vm.startPrank(judge);
        token.approve(address(fixture.stakePool()), amount);
        fixture.depositStake(amount);
        vm.stopPrank();
    }

    function _fundJudgesOn(
        V2CourtResetFixture target,
        IERC20 targetToken,
        uint256 count,
        uint256 amount
    ) internal {
        for (uint256 i = 0; i < count; i++) {
            address judge = _judge(i);
            target.registerJudge(judge);
            MockUSDC(address(targetToken)).mint(judge, amount);
            vm.startPrank(judge);
            targetToken.approve(address(target.stakePool()), amount);
            target.depositStake(amount);
            vm.stopPrank();
        }
    }

    function _judge(uint256 index) internal pure returns (address) {
        return address(uint160(0x1000 + index));
    }

    function _depositedStake(address[3] memory judges) internal view returns (uint256 total) {
        for (uint256 i = 0; i < judges.length; i++) {
            total += fixture.stakePool().depositedStake(judges[i]);
        }
    }

    function _commitAll(
        bytes32 caseId,
        bytes32 courtId,
        V2CourtResetFixture.CourtAttempt memory court,
        bool pass
    ) internal {
        for (uint256 i = 0; i < court.judges.length; i++) {
            _commitReveal(caseId, courtId, court.judges[i], pass, i + 30);
        }
    }

    function _commitReveal(
        bytes32 caseId,
        bytes32 courtId,
        address judge,
        bool pass,
        uint256 saltValue
    ) internal {
        _commitRevealOn(fixture, caseId, courtId, judge, pass, saltValue);
    }

    function _commitRevealOn(
        V2CourtResetFixture target,
        bytes32 caseId,
        bytes32 courtId,
        address judge,
        bool pass,
        uint256 saltValue
    ) internal {
        bytes32 salt = bytes32(saltValue);
        bytes32 commitment = target.commitmentFor(caseId, courtId, judge, pass, salt);
        V2CourtResetFixture.CourtAttempt memory court = target.courtInfo(courtId);
        vm.warp(court.commitDeadline - 1);
        vm.startPrank(judge);
        target.commitVote(caseId, courtId, commitment);
        vm.warp(court.commitDeadline);
        target.revealVote(caseId, courtId, pass, salt);
        vm.stopPrank();
    }

    function _warpPastReveal(bytes32 courtId) internal {
        vm.warp(fixture.courtInfo(courtId).revealDeadline);
    }
}
