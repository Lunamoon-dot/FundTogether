pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingTypes
} from "../fixtures/V2FinancialAccountingFixture.sol";
import { V2CourtResetFixture } from "../fixtures/V2CourtResetFixture.sol";

contract V2CourtResetFixtureFuzzTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant RESET_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr3-court-reset-fixture");
    bytes32 internal constant ACCOUNTING_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    bytes32 internal constant CASE_ID = keccak256("pr3-fuzz-case");

    MockUSDC internal token;
    V2CourtResetFixture internal fixture;

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        fixture = _newFixture();
    }

    function testFuzz_oneTotalCompensationForEveryOffenderMask(uint8 rawMask) public {
        uint256 mask = bound(uint256(rawMask), 1, 7);
        _fundJudges(3, 50);
        fixture.createCase(CASE_ID, 1, 0, 23, 10, 3);
        bytes32 courtId = fixture.assignCourt(CASE_ID, V2CourtResetFixture.CourtLevel.COURT_1, 1);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        uint256 offenderCount;

        for (uint256 i = 0; i < 3; i++) {
            if ((mask & (1 << i)) != 0) {
                offenderCount++;
            } else {
                _commitReveal(courtId, court.judges[i], i + 1);
            }
        }

        vm.warp(court.revealDeadline);
        fixture.settleInvalidCourt(CASE_ID, courtId);
        court = fixture.courtInfo(courtId);
        uint256 expected = (3 - offenderCount) * 10 + 3;

        assertEq(court.offenderCount, offenderCount);
        assertEq(court.compensationTotal, expected);
        assertEq(fixture.settlementCompensation(court.settlementId), expected);
        assertEq(fixture.stakePool().totalClaimLiability(), expected);

        uint256 slashed;
        uint256 credited;
        for (uint256 i = 0; i < 3; i++) {
            address judge = court.judges[i];
            slashed += 50 - fixture.stakePool().depositedStake(judge);
            if ((mask & (1 << i)) == 0) {
                assertEq(fixture.compensationEntitlement(court.settlementId, judge), 10);
                credited += 10;
            } else {
                assertEq(fixture.compensationEntitlement(court.settlementId, judge), 0);
            }
        }
        credited += fixture.compensationEntitlement(court.settlementId, address(this));
        assertEq(slashed, expected);
        assertEq(credited, expected);
    }

    function testFuzz_requiredCollateralUsesCheckedMax(
        uint128 dSeed,
        uint128 fSeed,
        uint128 caseStake
    ) public {
        uint256 disruption = bound(uint256(dSeed), 0, type(uint128).max);
        uint256 finalization = bound(uint256(fSeed), 3, type(uint128).max);
        fixture.createCase(CASE_ID, 1, 0, caseStake, disruption, finalization);
        V2CourtResetFixture.CaseRecord memory terms = fixture.caseTerms(CASE_ID);
        uint256 expectedCost = disruption * 2 + finalization;
        uint256 expectedRequired = caseStake > expectedCost ? caseStake : expectedCost;

        assertEq(terms.resetCostMax, expectedCost);
        assertEq(terms.requiredLockedStake, expectedRequired);
        assertEq(terms.finalizationAllowance, finalization);
    }

    function _newFixture() internal returns (V2CourtResetFixture result) {
        ImmutableV2FinalOutcomeSource source = new ImmutableV2FinalOutcomeSource(
            V2FinancialAccountingTypesForFuzz.transcript(ACCOUNTING_IDENTITY)
        );
        result = new V2CourtResetFixture(token, RESET_IDENTITY, source, token);
    }

    function _fundJudges(uint256 count, uint256 amount) internal {
        for (uint256 i = 0; i < count; i++) {
            address judge = address(uint160(0x2000 + i));
            fixture.registerJudge(judge);
            token.mint(judge, amount);
            vm.startPrank(judge);
            token.approve(address(fixture.stakePool()), amount);
            fixture.depositStake(amount);
            vm.stopPrank();
        }
    }

    function _commitReveal(bytes32 courtId, address judge, uint256 saltValue) internal {
        bytes32 salt = bytes32(saltValue);
        bytes32 commitment = fixture.commitmentFor(CASE_ID, courtId, judge, true, salt);
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        vm.warp(court.commitDeadline - 1);
        vm.startPrank(judge);
        fixture.commitVote(CASE_ID, courtId, commitment);
        vm.warp(court.commitDeadline);
        fixture.revealVote(CASE_ID, courtId, true, salt);
        vm.stopPrank();
    }
}

library V2FinancialAccountingTypesForFuzz {
    function transcript(bytes32 deploymentIdentity)
        internal
        pure
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript_)
    {
        transcript_.deploymentIdentity = deploymentIdentity;
        transcript_.caseId = keccak256("pr3-fuzz-accounting-case");
        transcript_.campaignId = 1;
        transcript_.milestoneId = 0;
        transcript_.finalized = true;
        transcript_.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
        transcript_.court1.present = true;
        transcript_.court1.courtId = keccak256("invalid-court");
    }
}
