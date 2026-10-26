pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { V2FundingFixture, V2FundingTypes } from "../../fixtures/V2FundingFixture.sol";
import {
    V2FinancialAccountingFixture,
    V2FinancialAccountingTypes
} from "../../fixtures/V2FinancialAccountingFixture.sol";
import { V2CourtResetFixture } from "../../fixtures/V2CourtResetFixture.sol";
import { V2BackerDaoCourt2Fixture } from "../../fixtures/V2BackerDaoCourt2Fixture.sol";

contract V2BackerDaoCourt2FixtureTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    address internal creator = address(0xCAFE);
    address internal payoutWallet = address(0xBEEF);

    MockUSDC internal token;
    V2BackerDaoCourt2Fixture internal fixture;
    address[12] internal judges;

    struct DaoSnapshot {
        V2BackerDaoCourt2Fixture.DaoCase dao;
        uint256 appealContribution;
        uint256 acceptContribution;
        uint256 appealWeight;
        uint256 acceptWeight;
    }

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        _deployWithJudges(12);
    }

    function test_policyStaysTestOnlyAndDoesNotClaimSybilResistance() public view {
        assertTrue(fixture.isTestOnlyPolicy());
        assertEq(fixture.policyStatus(), "PROPOSED_PENDING_APPROVAL");
        assertEq(fixture.daoPolicyStatus(), "PROPOSED_PENDING_APPROVAL");
        assertEq(fixture.DAO_POLICY_VERSION(), keccak256("CWQ-1/DAO-TEMPORAL-1"));
        assertEq(fixture.DAO_CONTRIBUTION_CAP(), type(uint128).max);
    }

    function test_Q1TieDefaultsToAccept() public view {
        uint256[] memory contributions = _values(1, 4, 9);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices = _choices(
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT,
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT,
            V2BackerDaoCourt2Fixture.DaoChoice.APPEAL
        );

        (
            V2BackerDaoCourt2Fixture.DaoChoice decision,
            uint256 total,
            uint256 accept,
            uint256 appeal
        ) = fixture.evaluateDaoVector(contributions, choices);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
        assertEq(total, 6);
        assertEq(accept, 3);
        assertEq(appeal, 3);
    }

    function test_Q2TieDefaultsToAccept() public view {
        uint256[] memory contributions = _values(1_000_000, 4_000_000, 9_000_000);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices = _choices(
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT,
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT,
            V2BackerDaoCourt2Fixture.DaoChoice.APPEAL
        );

        (V2BackerDaoCourt2Fixture.DaoChoice decision,, uint256 accept, uint256 appeal) =
            fixture.evaluateDaoVector(contributions, choices);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
        assertEq(accept, 3_000);
        assertEq(appeal, 3_000);
    }

    function test_Q3AcceptMajorityWins() public view {
        uint256[] memory contributions = _values(4, 4, 9);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices = _choices(
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT,
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT,
            V2BackerDaoCourt2Fixture.DaoChoice.APPEAL
        );

        (V2BackerDaoCourt2Fixture.DaoChoice decision,, uint256 accept, uint256 appeal) =
            fixture.evaluateDaoVector(contributions, choices);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
        assertEq(accept, 4);
        assertEq(appeal, 3);
    }

    function test_Q4AppealWinsWhenThresholdIsMet() public view {
        uint256[] memory contributions = _values(9, 16);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices = _choices(
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL
        );

        (V2BackerDaoCourt2Fixture.DaoChoice decision,, uint256 accept, uint256 appeal) =
            fixture.evaluateDaoVector(contributions, choices);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.APPEAL));
        assertEq(accept, 3);
        assertEq(appeal, 4);
    }

    function test_Q5OppositeEqualVotesDefaultToAccept() public view {
        uint256[] memory contributions = _values(2, 3);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices = _choices(
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL
        );

        (V2BackerDaoCourt2Fixture.DaoChoice decision,, uint256 accept, uint256 appeal) =
            fixture.evaluateDaoVector(contributions, choices);
        assertEq(uint256(decision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
        assertEq(accept, 1);
        assertEq(appeal, 1);
    }

    function test_Q6WalletSplittingIncreasesWeightWithoutIncreasingContribution() public view {
        uint256[] memory unsplit = new uint256[](1);
        unsplit[0] = 9_000_000;
        V2BackerDaoCourt2Fixture.DaoChoice[] memory oneAppeal =
            new V2BackerDaoCourt2Fixture.DaoChoice[](1);
        oneAppeal[0] = V2BackerDaoCourt2Fixture.DaoChoice.APPEAL;
        (, uint256 unsplitWeight,,) = fixture.evaluateDaoVector(unsplit, oneAppeal);

        uint256[] memory split = new uint256[](9);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory splitAppeal =
            new V2BackerDaoCourt2Fixture.DaoChoice[](9);
        for (uint256 i = 0; i < 9; i++) {
            split[i] = 1_000_000;
            splitAppeal[i] = V2BackerDaoCourt2Fixture.DaoChoice.APPEAL;
        }
        (, uint256 splitWeight,,) = fixture.evaluateDaoVector(split, splitAppeal);

        assertEq(unsplitWeight, 3_000);
        assertEq(splitWeight, 9_000);
    }

    function test_Q7SnapshotStaysUnchangedAfterFundingCloses() public {
        address backer = address(0xA11CE);
        bytes32 caseId = keccak256("q7");
        (uint256 campaignId,) =
            _createFinalizedCourt1(caseId, _addresses(backer), _values(1_000_000), true);

        fixture.openDao(caseId);
        assertEq(fixture.snapshotContribution(caseId, backer), 1_000_000);
        assertEq(fixture.snapshotWeight(caseId, backer), 1_000);

        token.mint(backer, 1_000_000);
        vm.startPrank(backer);
        token.approve(address(fixture), 1_000_000);
        vm.expectRevert(V2FundingFixture.FundingNotOpen.selector);
        fixture.contribute(campaignId, 0, 1_000_000);
        vm.stopPrank();

        assertEq(fixture.snapshotContribution(caseId, backer), 1_000_000);
        assertEq(fixture.snapshotWeight(caseId, backer), 1_000);
    }

    function test_Q8DuplicateBallotReverts() public {
        address backer = address(0xB0110);
        bytes32 caseId = keccak256("q8");
        _createFinalizedCourt1(caseId, _addresses(backer), _values(1_000_000), true);
        fixture.openDao(caseId);

        vm.prank(backer);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT);
        vm.prank(backer);
        vm.expectRevert(V2BackerDaoCourt2Fixture.DaoDuplicateBallot.selector);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
    }

    function test_Q9RejectsCapAndCheckedProductOverflow() public {
        uint256[] memory contributions = new uint256[](1);
        contributions[0] = uint256(type(uint128).max) + 1;
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices =
            new V2BackerDaoCourt2Fixture.DaoChoice[](1);
        choices[0] = V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT;

        vm.expectRevert(V2BackerDaoCourt2Fixture.SnapshotContributionCapExceeded.selector);
        fixture.evaluateDaoVector(contributions, choices);

        vm.expectRevert();
        fixture.evaluateDaoWeightsForTest(type(uint256).max, 0, 0);
    }

    function test_snapshotRejectsFundedContributionAboveCap() public {
        address overCapBacker = address(0xC0DE);
        bytes32 caseId = keccak256("snapshot-cap");
        _createFinalizedCourt1(
            caseId, _addresses(overCapBacker), _values(uint256(type(uint128).max) + 1), true
        );

        vm.expectRevert(V2BackerDaoCourt2Fixture.SnapshotContributionCapExceeded.selector);
        fixture.openDao(caseId);
    }

    function test_Q10SplittingCanChangeAcceptIntoAppeal() public view {
        uint256[] memory unsplit = new uint256[](2);
        unsplit[0] = 16_000_000;
        unsplit[1] = 9_000_000;
        V2BackerDaoCourt2Fixture.DaoChoice[] memory choices = _choices(
            V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL
        );
        (
            V2BackerDaoCourt2Fixture.DaoChoice unsplitDecision,,
            uint256 acceptWeight,
            uint256 appealWeight
        ) = fixture.evaluateDaoVector(unsplit, choices);
        assertEq(uint256(unsplitDecision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
        assertEq(acceptWeight, 4_000);
        assertEq(appealWeight, 3_000);

        uint256[] memory split = new uint256[](10);
        V2BackerDaoCourt2Fixture.DaoChoice[] memory splitChoices =
            new V2BackerDaoCourt2Fixture.DaoChoice[](10);
        split[0] = 16_000_000;
        splitChoices[0] = V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT;
        for (uint256 i = 1; i < 10; i++) {
            split[i] = 1_000_000;
            splitChoices[i] = V2BackerDaoCourt2Fixture.DaoChoice.APPEAL;
        }
        V2BackerDaoCourt2Fixture.DaoChoice splitDecision;
        (splitDecision,, acceptWeight, appealWeight) =
            fixture.evaluateDaoVector(split, splitChoices);
        assertEq(uint256(splitDecision), uint256(V2BackerDaoCourt2Fixture.DaoChoice.APPEAL));
        assertEq(acceptWeight, 4_000);
        assertEq(appealWeight, 9_000);
    }

    function test_zeroElectorateAndUnmetThresholdDefaultToAccept() public {
        _deployWithJudges(3);
        bytes32 zeroCase = keccak256("zero-electorate");
        address[] memory judgeBackers = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) {
            judgeBackers[i] = judges[i];
            amounts[i] = 1_000_000;
        }
        _createFinalizedCourt1(zeroCase, judgeBackers, amounts, true);
        fixture.openDao(zeroCase);
        assertEq(fixture.daoCaseInfo(zeroCase).totalWeight, 0);
        fixture.finalizeDao(zeroCase);
        assertEq(
            uint256(fixture.daoCaseInfo(zeroCase).decision),
            uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT)
        );

        _deployWithJudges(6);
        bytes32 thresholdCase = keccak256("threshold");
        address small = address(0x51A11);
        address large = address(0x1A436);
        _createFinalizedCourt1(
            thresholdCase, _addresses(small, large), _values(1_000_000, 99_000_000), true
        );
        fixture.openDao(thresholdCase);
        vm.prank(small);
        fixture.castDaoBallot(thresholdCase, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(thresholdCase);
        assertEq(
            uint256(fixture.daoCaseInfo(thresholdCase).decision),
            uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT)
        );
    }

    function test_court2RequiresFinalizedAppealAndBypassAlwaysReverts() public {
        address backer = address(0xA991);
        bytes32 caseId = keccak256("court2-gate");
        _createFinalizedCourt1(caseId, _addresses(backer), _values(2_000_000), true);

        vm.expectRevert(V2BackerDaoCourt2Fixture.Court2BypassDisabled.selector);
        fixture.enableCourt2ForTest(caseId);
        vm.expectRevert(V2CourtResetFixture.CourtTwoNotEnabled.selector);
        fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 7);

        fixture.openDao(caseId);
        fixture.finalizeDao(caseId);
        vm.expectRevert(V2CourtResetFixture.CourtTwoNotEnabled.selector);
        fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 7);

        bytes32 appealCase = keccak256("court2-appeal-gate");
        _createFinalizedCourt1(appealCase, _addresses(backer), _values(2_000_000), true);
        fixture.openDao(appealCase);
        vm.prank(backer);
        fixture.castDaoBallot(appealCase, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(appealCase);
        assertTrue(fixture.caseTerms(appealCase).court2GateEnabled);
    }

    function test_daoTemporalConflictsFreezeHistoryAndExcludeAllVotersFromCourt2() public {
        _deployWithJudges(3);
        address appealVoter = address(0xD001);
        address acceptVoter = address(0xD002);
        address nonVotingBacker = address(0xD003);
        bytes32 caseId = keccak256("temporal-conflicts");
        _createFinalizedCourt1(
            caseId,
            _addresses(appealVoter, acceptVoter, nonVotingBacker),
            _values(9_000_000, 4_000_000, 1_000_000),
            true
        );
        _registerAndFundJudge(appealVoter, 50);
        _registerAndFundJudge(acceptVoter, 50);
        _registerAndFundJudge(nonVotingBacker, 50);
        _registerAndFundJudge(address(0xD004), 50);
        _registerAndFundJudge(address(0xD005), 50);

        fixture.openDao(caseId);
        assertFalse(fixture.daoEligible(caseId, judges[0]));
        assertTrue(fixture.daoEligible(caseId, appealVoter));
        assertTrue(fixture.daoEligible(caseId, acceptVoter));
        assertTrue(fixture.daoEligible(caseId, nonVotingBacker));
        vm.prank(appealVoter);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        vm.prank(acceptVoter);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT);
        fixture.finalizeDao(caseId);
        DaoSnapshot memory snapshot = _daoSnapshot(caseId, appealVoter, acceptVoter);
        uint256 requiredLockedStake = fixture.caseTerms(caseId).requiredLockedStake;
        assertGe(fixture.stakePool().availableStake(appealVoter), requiredLockedStake);
        assertGe(fixture.stakePool().availableStake(acceptVoter), requiredLockedStake);

        {
            bytes32 court2 = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 9);
            _assertInitialCourt2Selection(
                fixture.courtInfo(court2), appealVoter, acceptVoter, nonVotingBacker
            );
            _warpPastReveal(court2);
            fixture.settleInvalidCourt(caseId, court2);
        }
        _registerAndFundJudge(address(0xD006), 50);
        _registerAndFundJudge(address(0xD007), 50);
        _registerAndFundJudge(address(0xD008), 50);
        {
            bytes32 replacement =
                fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 10);
            _assertCourt2VotersExcluded(fixture.courtInfo(replacement), appealVoter, acceptVoter);
        }
        _assertDaoSnapshot(caseId, appealVoter, acceptVoter, snapshot);
    }

    function test_daoExcludesJudgesFromInvalidCourt1History() public {
        _deployWithJudges(6);
        bytes32 caseId = keccak256("court1-reset-history");
        address[] memory backers = new address[](6);
        uint256[] memory amounts = new uint256[](6);
        for (uint256 i = 0; i < 6; i++) {
            backers[i] = judges[i];
            amounts[i] = 1_000_000;
        }
        uint256 target = 6_000_000;
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment(target);
        vm.prank(creator);
        uint256 campaignId = fixture.createCampaign(commitment);
        for (uint256 i = 0; i < 6; i++) {
            _contribute(campaignId, backers[i], amounts[i]);
        }

        fixture.createWorkflowCase(caseId, campaignId, 0, 23, 10, 3);
        bytes32 invalidCourt =
            fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_1, 16);
        _warpPastReveal(invalidCourt);
        fixture.settleInvalidCourt(caseId, invalidCourt);
        bytes32 replacement =
            fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_1, 17);
        _finalizeCourt(caseId, replacement, true);
        fixture.openDao(caseId);

        bytes32[] memory history = fixture.caseCourtHistory(caseId);
        assertEq(history.length, 2);
        for (uint256 i = 0; i < history.length; i++) {
            V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(history[i]);
            for (uint256 j = 0; j < 3; j++) {
                assertFalse(fixture.daoEligible(caseId, court.judges[j]));
            }
        }
        assertEq(fixture.daoCaseInfo(caseId).totalWeight, 0);
    }

    function test_court2ExcludesCreatorAndBindsFrozenCourt1Material() public {
        _deployWithJudges(3);
        address backer = address(0xC201);
        bytes32 caseId = keccak256("creator-and-material");
        (, bytes32 court1) =
            _createFinalizedCourt1(caseId, _addresses(backer), _values(4_000_000), true);
        _registerAndFundJudge(creator, 50);
        _registerAndFundJudge(address(0xC202), 50);
        _registerAndFundJudge(address(0xC203), 50);
        _registerAndFundJudge(address(0xC204), 50);

        fixture.openDao(caseId);
        vm.prank(backer);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(caseId);
        bytes32 court2 = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 18);

        V2BackerDaoCourt2Fixture.ReviewMaterial memory court1Material =
            fixture.courtReviewMaterialFor(court1);
        V2BackerDaoCourt2Fixture.ReviewMaterial memory court2Material =
            fixture.courtReviewMaterialFor(court2);
        assertEq(court1Material.creator, creator);
        assertTrue(court1Material.evidenceRevision != bytes32(0));
        assertTrue(court1Material.acceptanceCriteriaHash != bytes32(0));
        assertEq(court2Material.creator, court1Material.creator);
        assertEq(court2Material.evidenceRevision, court1Material.evidenceRevision);
        assertEq(court2Material.acceptanceCriteriaHash, court1Material.acceptanceCriteriaHash);
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(fixture.courtInfo(court2).judges[i] != creator);
        }
    }

    function test_court2ReversesCourt1AndCreatorCannotClaimBeforeFinalSettlement() public {
        address backer = address(0xE001);
        bytes32 caseId = keccak256("court2-reversal");
        (uint256 campaignId,) =
            _createFinalizedCourt1(caseId, _addresses(backer), _values(10_000_000), true);
        fixture.openDao(caseId);
        vm.prank(backer);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(caseId);

        vm.prank(payoutWallet);
        vm.expectRevert(V2FinancialAccountingFixture.SettlementNotProcessed.selector);
        fixture.claimCreatorPayout(campaignId, 0);

        bytes32 court2 = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 11);
        _finalizeCourt(caseId, court2, false);
        (
            bytes32 finalizedCase,
            V2FinancialAccountingTypes.FinalOutcome outcome,
            uint256 validCourtCount
        ) = fixture.validatedOutcome(campaignId, 0);
        assertEq(finalizedCase, caseId);
        assertEq(uint256(outcome), uint256(V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL));
        assertEq(validCourtCount, 2);
        fixture.settleMilestone(campaignId, 0);

        assertEq(
            uint256(fixture.finalOutcome(campaignId, 0)),
            uint256(V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL)
        );
        assertEq(fixture.creatorClaimable(campaignId, 0), 0);
        assertEq(fixture.judgePaid(campaignId, 0), 600_000);
        assertEq(fixture.escrowRemaining(campaignId, 0), 9_400_000);
        assertEq(fixture.physicalTokenCustody(), 10_000_000);
        assertEq(fixture.milestoneCustodyAttribution(campaignId, 0), 10_000_000);
        assertEq(fixture.fundedLiabilities(campaignId, 0), 10_000_000);
        vm.expectRevert(V2FinancialAccountingFixture.SettlementAlreadyProcessed.selector);
        fixture.settleMilestone(campaignId, 0);
    }

    function test_court2PassReversesCourt1FailAndAuthorizesOnlyFinalPayout() public {
        address backer = address(0xE101);
        bytes32 caseId = keccak256("court2-pass-reversal");
        (uint256 campaignId,) =
            _createFinalizedCourt1(caseId, _addresses(backer), _values(10_000_000), false);
        fixture.openDao(caseId);
        vm.prank(backer);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(caseId);

        bytes32 court2 = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 15);
        _finalizeCourt(caseId, court2, true);
        fixture.settleMilestone(campaignId, 0);

        assertEq(
            uint256(fixture.finalOutcome(campaignId, 0)),
            uint256(V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS)
        );
        assertEq(fixture.creatorClaimable(campaignId, 0), 9_400_000);
        vm.prank(payoutWallet);
        fixture.claimCreatorPayout(campaignId, 0);
        assertEq(token.balanceOf(payoutWallet), 9_400_000);
        assertEq(fixture.judgePaid(campaignId, 0), 600_000);
    }

    function test_court2ResetAndTerminalProtocolFailurePreserveCourt1RewardsAndCompensation()
        public
    {
        address backer = address(0xF001);
        bytes32 caseId = keccak256("court2-reset-terminal");
        (uint256 campaignId,) =
            _createFinalizedCourt1(caseId, _addresses(backer), _values(10_000_000), true);
        fixture.openDao(caseId);
        vm.prank(backer);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(caseId);

        bytes32 firstCourt2 =
            fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 12);
        _warpPastReveal(firstCourt2);
        fixture.settleInvalidCourt(caseId, firstCourt2);
        vm.expectRevert(V2BackerDaoCourt2Fixture.DaoAlreadyFinalized.selector);
        fixture.finalizeDao(caseId);
        bytes32 replacement =
            fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 13);
        _warpPastReveal(replacement);
        fixture.settleInvalidCourt(caseId, replacement);

        V2CourtResetFixture.CourtAttempt memory terminal = fixture.courtInfo(replacement);
        assertTrue(terminal.terminal);
        assertTrue(fixture.caseTerms(caseId).protocolFailed);
        assertEq(fixture.settlementCompensation(terminal.settlementId), 3);
        fixture.settleMilestone(campaignId, 0);

        assertEq(
            uint256(fixture.finalOutcome(campaignId, 0)),
            uint256(V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL)
        );
        assertEq(fixture.judgePaid(campaignId, 0), 300_000);
        assertEq(fixture.creatorClaimable(campaignId, 0), 0);
        assertEq(fixture.stakePool().totalClaimLiability(), 6);
    }

    function test_court2EligibilityExhaustionTimesOutToProtocolFailureWithoutMutatingDao() public {
        _deployWithJudges(3);
        address voterOne = address(0xF101);
        address voterTwo = address(0xF102);
        address voterThree = address(0xF103);
        bytes32 caseId = keccak256("court2-exhaustion");
        (uint256 campaignId,) = _createFinalizedCourt1(
            caseId,
            _addresses(voterOne, voterTwo, voterThree),
            _values(1_000_000, 1_000_000, 1_000_000),
            true
        );
        _registerAndFundJudge(voterOne, 50);
        _registerAndFundJudge(voterTwo, 50);
        _registerAndFundJudge(voterThree, 50);
        fixture.openDao(caseId);
        vm.prank(voterOne);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        vm.prank(voterTwo);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        vm.prank(voterThree);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        fixture.finalizeDao(caseId);

        V2BackerDaoCourt2Fixture.DaoCase memory frozen = fixture.daoCaseInfo(caseId);
        vm.expectRevert(V2CourtResetFixture.InvalidJudgeSet.selector);
        fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 14);
        vm.warp(frozen.finalizedAt + fixture.COURT2_ASSIGNMENT_TIMEOUT());
        fixture.finalizeCourt2AssignmentExhaustion(caseId);

        assertTrue(fixture.caseTerms(caseId).protocolFailed);
        assertEq(fixture.daoCaseInfo(caseId).totalWeight, frozen.totalWeight);
        assertEq(fixture.daoCaseInfo(caseId).castWeight, frozen.castWeight);
        assertTrue(fixture.daoVoted(caseId, voterOne));
        fixture.settleMilestone(campaignId, 0);
        assertEq(fixture.judgePaid(campaignId, 0), 90_000);
    }

    function _deployWithJudges(uint256 count) internal {
        fixture = new V2BackerDaoCourt2Fixture(token, token);
        for (uint256 i = 0; i < count; i++) {
            judges[i] = address(uint160(0x1000 + i));
            _registerAndFundJudge(judges[i], 100);
        }
    }

    function _registerAndFundJudge(address judge, uint256 amount) internal {
        fixture.registerJudge(judge);
        token.mint(judge, amount);
        vm.startPrank(judge);
        token.approve(address(fixture.stakePool()), amount);
        fixture.depositStake(amount);
        vm.stopPrank();
    }

    function _createFinalizedCourt1(
        bytes32 caseId,
        address[] memory backers,
        uint256[] memory amounts,
        bool pass
    ) internal returns (uint256 campaignId, bytes32 courtId) {
        uint256 target;
        for (uint256 i = 0; i < amounts.length; i++) {
            target += amounts[i];
        }
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment(target);
        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);
        for (uint256 i = 0; i < backers.length; i++) {
            _contribute(campaignId, backers[i], amounts[i]);
        }

        fixture.createWorkflowCase(caseId, campaignId, 0, 23, 10, 3);
        courtId = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_1, 1);
        _finalizeCourt(caseId, courtId, pass);
    }

    function _contribute(uint256 campaignId, address backer, uint256 amount) internal {
        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(fixture), amount);
        fixture.contribute(campaignId, 0, amount);
        vm.stopPrank();
    }

    function _finalizeCourt(bytes32 caseId, bytes32 courtId, bool pass) internal {
        V2CourtResetFixture.CourtAttempt memory court = fixture.courtInfo(courtId);
        for (uint256 i = 0; i < 3; i++) {
            bool vote = i < 2 ? pass : !pass;
            bytes32 salt = bytes32(i + 1);
            bytes32 commitment = fixture.commitmentFor(caseId, courtId, court.judges[i], vote, salt);
            vm.prank(court.judges[i]);
            fixture.commitVote(caseId, courtId, commitment);
        }
        vm.warp(court.commitDeadline);
        for (uint256 i = 0; i < 3; i++) {
            bool vote = i < 2 ? pass : !pass;
            vm.prank(court.judges[i]);
            fixture.revealVote(caseId, courtId, vote, bytes32(i + 1));
        }
        fixture.finalizeValidCourt(caseId, courtId);
    }

    function _warpPastReveal(bytes32 courtId) internal {
        vm.warp(fixture.courtInfo(courtId).revealDeadline);
    }

    function _assertInitialCourt2Selection(
        V2CourtResetFixture.CourtAttempt memory court,
        address appealVoter,
        address acceptVoter,
        address nonVotingBacker
    ) internal view {
        bool nonVoterSelected;
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(court.judges[i] != appealVoter);
            assertTrue(court.judges[i] != acceptVoter);
            if (court.judges[i] == nonVotingBacker) nonVoterSelected = true;
            for (uint256 j = 0; j < 3; j++) {
                assertTrue(court.judges[i] != judges[j]);
            }
        }
        assertTrue(nonVoterSelected);
    }

    function _assertCourt2VotersExcluded(
        V2CourtResetFixture.CourtAttempt memory court,
        address appealVoter,
        address acceptVoter
    ) internal pure {
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(court.judges[i] != appealVoter);
            assertTrue(court.judges[i] != acceptVoter);
        }
    }

    function _daoSnapshot(bytes32 caseId, address appealVoter, address acceptVoter)
        internal
        view
        returns (DaoSnapshot memory snapshot)
    {
        snapshot.dao = fixture.daoCaseInfo(caseId);
        snapshot.appealContribution = fixture.snapshotContribution(caseId, appealVoter);
        snapshot.acceptContribution = fixture.snapshotContribution(caseId, acceptVoter);
        snapshot.appealWeight = fixture.snapshotWeight(caseId, appealVoter);
        snapshot.acceptWeight = fixture.snapshotWeight(caseId, acceptVoter);
    }

    function _assertDaoSnapshot(
        bytes32 caseId,
        address appealVoter,
        address acceptVoter,
        DaoSnapshot memory snapshot
    ) internal view {
        V2BackerDaoCourt2Fixture.DaoCase memory afterReplacement = fixture.daoCaseInfo(caseId);
        assertEq(afterReplacement.eligibleWalletCount, snapshot.dao.eligibleWalletCount);
        assertEq(afterReplacement.totalWeight, snapshot.dao.totalWeight);
        assertEq(afterReplacement.acceptWeight, snapshot.dao.acceptWeight);
        assertEq(afterReplacement.appealWeight, snapshot.dao.appealWeight);
        assertEq(afterReplacement.castWeight, snapshot.dao.castWeight);
        assertEq(uint256(afterReplacement.decision), uint256(snapshot.dao.decision));
        assertEq(fixture.snapshotContribution(caseId, appealVoter), snapshot.appealContribution);
        assertEq(fixture.snapshotContribution(caseId, acceptVoter), snapshot.acceptContribution);
        assertEq(fixture.snapshotWeight(caseId, appealVoter), snapshot.appealWeight);
        assertEq(fixture.snapshotWeight(caseId, acceptVoter), snapshot.acceptWeight);
        assertTrue(fixture.daoVoted(caseId, appealVoter));
        assertTrue(fixture.daoVoted(caseId, acceptVoter));
        assertEq(
            uint256(fixture.daoBallot(caseId, appealVoter)),
            uint256(V2BackerDaoCourt2Fixture.DaoChoice.APPEAL)
        );
        assertEq(
            uint256(fixture.daoBallot(caseId, acceptVoter)),
            uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT)
        );
    }

    function _validCommitment(uint256 target)
        internal
        view
        returns (V2FundingTypes.CampaignCommitment memory commitment)
    {
        (uint256 rewardUnit, uint256 reserve, uint256 creatorBudget) =
            fixture.deriveFinancialTerms(target, 100);
        commitment.policyManifest = V2FundingTypes.PolicyManifest({
            commitmentSchemaVersion: "FTV2-COMMIT-2",
            policyVersion: "fundtogether-vnext-v2-pr0-remediation-20261025",
            supersedesCandidate: "fundtogether-vnext-v2-pr0-policy-20261025",
            policyStatus: "PROPOSED_PENDING_APPROVAL",
            pr1FixtureDeploymentIdentity: "fundtogether-vnext-v2-pr1-funding-fixture",
            asset: "MockUSDC",
            tokenDecimals: 6,
            policyManifestHash: bytes32(0),
            chainId: LOCAL_CHAIN_ID,
            token: address(token),
            creator: creator,
            payoutWallet: payoutWallet,
            publicationPolicy: "PUBLICATION_PRE_FUND_V1",
            evidenceDisclosurePolicy: "ReviewReferenceV1",
            daoFormulaVersion: "CWQ-1",
            daoParticipationThresholdBps: 2_000,
            daoTiePolicy: "ACCEPT",
            daoEmptyElectoratePolicy: "ACCEPT",
            daoSnapshot: "at-dao-open",
            daoContributionCapUnits: "uint128_max",
            daoTotalWeightArithmetic: "checked_uint256",
            daoConflictPolicyVersion: "DAO-TEMPORAL-1",
            daoExcludeAssignedBeforeOpen: true,
            daoExcludedAssignmentHistory: "all_court1_attempts",
            court2SelectionAfter: "dao_finalized_appeal",
            court2ExcludeCourt1Judges: true,
            court2ExcludeDaoVoters: "all_valid_accept_or_appeal_ballots",
            daoRetroactiveVoteChanges: false,
            resetPolicyVersion: "CCPS-1",
            resetDisruptionAllowanceUnits: "10",
            resetFinalizationAllowanceUnits: "3",
            resetFinalizationAllowanceMinimumUnits: "3",
            resetCostMaxUnits: "23",
            resetFixtureCaseStakeRequirementUnits: "23",
            requiredLockedStakeRule: "max(caseStakeRequirement,resetCostMax)",
            resetOffenderAllocation: "equal_split_remainder_ascending_canonical_address",
            resetRecipients: "compliant_invalid_court_judges_and_successful_finalizer",
            actualCostReimbursementCapUnits: "0",
            resetFundingSource: "offending_locked_stake_only",
            publicationRewardRateBps: 0,
            refundDustPolicy: "canonical_address_prefix",
            rewardRounding: "floor",
            rewardRateBps: 100,
            basisPointsDenominator: 10_000,
            referenceCourtSize: 3,
            maxValidCourts: 2,
            maxResetsPerCourt: 1,
            maxResetsPerCase: 2,
            lockedParameters: new string[](3),
            pendingParameterGroups: new string[](6)
        });
        commitment.policyManifest.lockedParameters[0] = "referenceCourtSize";
        commitment.policyManifest.lockedParameters[1] = "maxValidCourts";
        commitment.policyManifest.lockedParameters[2] = "court2ExcludeCourt1Judges";
        commitment.policyManifest.pendingParameterGroups[0] = "commitment_schema";
        commitment.policyManifest.pendingParameterGroups[1] = "reward_and_refund_economics";
        commitment.policyManifest.pendingParameterGroups[2] = "CCPS-1_and_limits";
        commitment.policyManifest.pendingParameterGroups[3] = "CWQ-1_and_threshold";
        commitment.policyManifest.pendingParameterGroups[4] = "DAO-TEMPORAL-1";
        commitment.policyManifest.pendingParameterGroups[5] = "publication_boundary";
        commitment.policyManifest.policyManifestHash =
            fixture.policyManifestHashFor(commitment.policyManifest);

        commitment.milestoneId = new uint256[](1);
        commitment.deliverableCommitment = new bytes32[](1);
        commitment.acceptanceCriteriaHash = new bytes32[](1);
        commitment.fundingTarget = new uint256[](1);
        commitment.creatorPayoutBudget = new uint256[](1);
        commitment.judgeRewardRateBps = new uint256[](1);
        commitment.judgeRewardUnit = new uint256[](1);
        commitment.maxReviewReserve = new uint256[](1);
        commitment.submissionDeadline = new uint256[](1);
        commitment.fundingDeadline = new uint256[](1);
        commitment.deliverableCommitment[0] = keccak256("deliverable");
        commitment.acceptanceCriteriaHash[0] = keccak256("criteria");
        commitment.fundingTarget[0] = target;
        commitment.creatorPayoutBudget[0] = creatorBudget;
        commitment.judgeRewardRateBps[0] = 100;
        commitment.judgeRewardUnit[0] = rewardUnit;
        commitment.maxReviewReserve[0] = reserve;
        commitment.fundingDeadline[0] = block.timestamp + 2 days;
        commitment.submissionDeadline[0] = block.timestamp + 3 days;
    }

    function _values(uint256 first) internal pure returns (uint256[] memory values) {
        values = new uint256[](1);
        values[0] = first;
    }

    function _values(uint256 first, uint256 second)
        internal
        pure
        returns (uint256[] memory values)
    {
        values = new uint256[](2);
        values[0] = first;
        values[1] = second;
    }

    function _values(uint256 first, uint256 second, uint256 third)
        internal
        pure
        returns (uint256[] memory values)
    {
        values = new uint256[](3);
        values[0] = first;
        values[1] = second;
        values[2] = third;
    }

    function _addresses(address first) internal pure returns (address[] memory values) {
        values = new address[](1);
        values[0] = first;
    }

    function _addresses(address first, address second)
        internal
        pure
        returns (address[] memory values)
    {
        values = new address[](2);
        values[0] = first;
        values[1] = second;
    }

    function _addresses(address first, address second, address third)
        internal
        pure
        returns (address[] memory values)
    {
        values = new address[](3);
        values[0] = first;
        values[1] = second;
        values[2] = third;
    }

    function _choices(
        V2BackerDaoCourt2Fixture.DaoChoice first,
        V2BackerDaoCourt2Fixture.DaoChoice second
    ) internal pure returns (V2BackerDaoCourt2Fixture.DaoChoice[] memory values) {
        values = new V2BackerDaoCourt2Fixture.DaoChoice[](2);
        values[0] = first;
        values[1] = second;
    }

    function _choices(
        V2BackerDaoCourt2Fixture.DaoChoice first,
        V2BackerDaoCourt2Fixture.DaoChoice second,
        V2BackerDaoCourt2Fixture.DaoChoice third
    ) internal pure returns (V2BackerDaoCourt2Fixture.DaoChoice[] memory values) {
        values = new V2BackerDaoCourt2Fixture.DaoChoice[](3);
        values[0] = first;
        values[1] = second;
        values[2] = third;
    }
}
