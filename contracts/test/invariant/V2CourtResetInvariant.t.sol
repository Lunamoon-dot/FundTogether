pragma solidity 0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingTypes
} from "../fixtures/V2FinancialAccountingFixture.sol";
import { V2CourtResetFixture } from "../fixtures/V2CourtResetFixture.sol";

contract V2CourtResetInvariantHandler is Test {
    V2CourtResetFixture public immutable fixture;
    bytes32 public immutable caseId;
    bytes32 public immutable courtId;

    constructor(V2CourtResetFixture fixture_, bytes32 caseId_, bytes32 courtId_) {
        fixture = fixture_;
        caseId = caseId_;
        courtId = courtId_;
    }

    function completeSeat(uint8 rawSeat) external {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        if (block.timestamp >= court.commitDeadline) return;
        uint256 seat = uint256(rawSeat) % 3;
        if (court.commitSubmitted[seat]) return;
        address judge = court.judges[seat];
        bytes32 salt = bytes32(seat + 1);
        bytes32 commitment = fixture.commitmentFor(caseId, courtId, judge, true, salt);
        vm.startPrank(judge);
        try fixture.commitVote(caseId, courtId, commitment) { }
        catch {
            vm.stopPrank();
            return;
        }
        vm.warp(court.commitDeadline);
        try fixture.revealVote(caseId, courtId, true, salt) { } catch { }
        vm.stopPrank();
    }

    function finalizeValid() external {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        vm.warp(court.revealDeadline);
        try fixture.finalizeValidCourt(caseId, courtId) { } catch { }
    }

    function settleInvalid() external {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        vm.warp(court.revealDeadline);
        try fixture.settleInvalidCourt(caseId, courtId) { } catch { }
    }

    function claim(uint8 rawRecipient) external {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        if (court.settlementId == bytes32(0)) return;
        uint256 recipient = uint256(rawRecipient) % 4;
        if (recipient == 3) {
            try fixture.claimCompensation(court.settlementId) { } catch { }
            return;
        }
        vm.prank(court.judges[recipient]);
        try fixture.claimCompensation(court.settlementId) { } catch { }
    }
}

contract V2CourtResetInvariantTest is StdInvariant, Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant RESET_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr3-court-reset-fixture");
    bytes32 internal constant ACCOUNTING_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    bytes32 internal constant CASE_ID = keccak256("pr3-invariant-case");

    MockUSDC internal token;
    V2CourtResetFixture internal fixture;
    V2CourtResetInvariantHandler internal handler;
    bytes32 internal courtId;

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript;
        transcript.deploymentIdentity = ACCOUNTING_IDENTITY;
        transcript.caseId = keccak256("pr3-invariant-accounting-case");
        transcript.campaignId = 1;
        transcript.milestoneId = 0;
        transcript.finalized = true;
        transcript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
        transcript.court1.present = true;
        transcript.court1.courtId = keccak256("invalid-court");
        ImmutableV2FinalOutcomeSource source = new ImmutableV2FinalOutcomeSource(transcript);
        fixture = new V2CourtResetFixture(token, RESET_IDENTITY, source, token);

        for (uint256 i = 0; i < 3; i++) {
            address judge = address(uint160(0x3000 + i));
            fixture.registerJudge(judge);
            token.mint(judge, 50);
            vm.startPrank(judge);
            token.approve(address(fixture.stakePool()), 50);
            fixture.depositStake(50);
            vm.stopPrank();
        }

        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 1);
        handler = new V2CourtResetInvariantHandler(fixture, CASE_ID, courtId);
        targetContract(address(handler));
    }

    function invariant_resetLedgerIsFullyFundedAndIdempotent() public view {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        uint256 liability = fixture.stakePool().totalClaimLiability();
        if (court.settlementId == bytes32(0)) {
            assertEq(liability, 0);
            assertEq(court.compensationTotal, 0);
            return;
        }

        assertEq(
            fixture.settlementCompensation(court.settlementId),
            fixture.settlementPaid(court.settlementId)
                + fixture.unclaimedCompensation(court.settlementId)
        );
        assertEq(liability, fixture.unclaimedCompensation(court.settlementId));
        assertLe(court.compensationTotal, 23);
    }

    function invariant_reservedStakeNeverExceedsRequiredCollateral() public view {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        for (uint256 i = 0; i < court.judges.length; i++) {
            assertLe(fixture.stakePool().reservedStake(court.judges[i]), 23);
            assertLe(
                fixture.stakePool().reservedStake(court.judges[i]),
                fixture.stakePool().depositedStake(court.judges[i])
            );
        }
    }

    function invariant_stakePoolCustodyMatchesDepositsAndLiability() public view {
        uint256 deposited;
        for (uint256 i = 0; i < 3; i++) {
            deposited += fixture.stakePool().depositedStake(address(uint160(0x3000 + i)));
        }
        assertEq(
            token.balanceOf(address(fixture.stakePool())),
            deposited + fixture.stakePool().totalClaimLiability()
        );
    }

    function invariant_noValidServiceRewardIsCreatedByReset() public view {
        assertEq(fixture.judgePaid(1, 0), 0);
        assertEq(fixture.physicalTokenCustody(), 0);
    }
}
