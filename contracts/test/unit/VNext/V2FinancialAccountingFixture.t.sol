pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingFixture,
    V2FinancialAccountingTypes
} from "../../fixtures/V2FinancialAccountingFixture.sol";
import { V2FundingTypes } from "../../fixtures/V2FundingFixture.sol";

contract V2FinancialAccountingFixtureTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant ACCOUNTING_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");

    MockUSDC internal token;
    V2FinancialAccountingFixture internal fixture;
    ImmutableV2FinalOutcomeSource internal source;
    address internal creator = makeAddr("creator");
    address internal payoutWallet = makeAddr("payout");

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        _deployFixture(_defaultTranscript());
    }

    function test_rewardCalculationUsesFloorTokenUnits() public view {
        (uint256 rewardUnit, uint256 reserve, uint256 creatorBudget) =
            fixture.deriveFinancialTerms(1_001, 100);

        assertEq(rewardUnit, 10);
        assertEq(reserve, 60);
        assertEq(creatorBudget, 941);
    }

    function test_rewardTermsMatchThePr1FrozenCommitment() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        vm.prank(creator);
        uint256 campaignId = fixture.createCampaign(commitment);

        (
            ,
            ,
            ,
            uint256 target,
            uint256 frozenCreatorBudget,
            uint256 rateBps,
            uint256 frozenRewardUnit,
            uint256 frozenReserve,
            ,
            ,

        ) = fixture.milestoneTerms(campaignId, 0);
        (uint256 derivedRewardUnit, uint256 derivedReserve, uint256 derivedCreatorBudget) =
            fixture.deriveFinancialTerms(target, rateBps);

        assertEq(derivedRewardUnit, frozenRewardUnit);
        assertEq(derivedReserve, frozenReserve);
        assertEq(derivedCreatorBudget, frozenCreatorBudget);
    }

    function test_vectorV1FreezesOnePercentForTwoValidCourts() public view {
        (uint256 rewardUnit, uint256 reserve, uint256 creatorBudget) =
            fixture.deriveFinancialTerms(1_000, 100);

        assertEq(rewardUnit, 10);
        assertEq(reserve, 60);
        assertEq(creatorBudget, 940);
    }

    function test_vectorV5PreservesTheFloorRemainder() public view {
        (uint256 rewardUnit, uint256 reserve, uint256 creatorBudget) =
            fixture.deriveFinancialTerms(1_001, 100);

        assertEq(rewardUnit, 10);
        assertEq(reserve, 60);
        assertEq(creatorBudget, 941);
    }

    function test_vectorV6RejectsZeroRewardWhenResearchFixtureRequiresReward() public {
        vm.expectRevert(V2FinancialAccountingFixture.InvalidFinancialTerms.selector);
        fixture.deriveFinancialTerms(1, 100);
    }

    function test_rejectsZeroRewardRate() public {
        vm.expectRevert(V2FinancialAccountingFixture.InvalidFinancialTerms.selector);
        fixture.deriveFinancialTerms(1_000, 0);
    }

    function test_rejectsRewardMultiplicationOverflow() public {
        vm.expectRevert(V2FinancialAccountingFixture.InvalidFinancialTerms.selector);
        fixture.deriveFinancialTerms(type(uint256).max, 100);
    }

    function test_rejectsReserveGreaterThanTarget() public {
        vm.expectRevert(V2FinancialAccountingFixture.InvalidFinancialTerms.selector);
        fixture.deriveFinancialTerms(1_000, 2_000);
    }

    function test_rejectsZeroCreatorPayoutWhenReserveEqualsTarget() public {
        vm.expectRevert(V2FinancialAccountingFixture.InvalidFinancialTerms.selector);
        fixture.deriveFinancialTerms(600, 1_667);
    }

    function test_outcomeIsReadFromImmutableSourceForEveryCaller() public {
        uint256 campaignId = _createAndFundMilestoneZero();

        vm.prank(makeAddr("permissionless-finalizer-one"));
        (bytes32 firstCaseId, V2FinancialAccountingTypes.FinalOutcome firstOutcome, uint256 firstValidCourts) =
            fixture.validatedOutcome(campaignId, 0);
        vm.prank(makeAddr("permissionless-finalizer-two"));
        (bytes32 secondCaseId, V2FinancialAccountingTypes.FinalOutcome secondOutcome, uint256 secondValidCourts) =
            fixture.validatedOutcome(campaignId, 0);

        assertEq(firstCaseId, keccak256("case-1"));
        assertEq(firstCaseId, secondCaseId);
        assertEq(uint256(firstOutcome), uint256(V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS));
        assertEq(uint256(firstOutcome), uint256(secondOutcome));
        assertEq(firstValidCourts, 1);
        assertEq(firstValidCourts, secondValidCourts);
    }

    function test_transcriptRejectsMismatchedDeploymentIdentity() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _defaultTranscript();
        transcript.deploymentIdentity = keccak256("wrong-deployment");
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        vm.expectRevert(V2FinancialAccountingFixture.InvalidOutcomeTranscript.selector);
        fixture.validatedOutcome(campaignId, 0);
    }

    function test_transcriptRejectsDuplicateJudgesInValidCourt() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _defaultTranscript();
        transcript.court1.judges[1] = transcript.court1.judges[0];
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        vm.expectRevert(V2FinancialAccountingFixture.InvalidOutcomeTranscript.selector);
        fixture.validatedOutcome(campaignId, 0);
    }

    function test_transcriptRejectsCourtTwoWithoutValidCourtOne() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _defaultTranscript();
        transcript.appealed = true;
        transcript.court1.valid = false;
        transcript.court2 = _courtTranscript(
            true,
            true,
            true,
            keccak256("court-2"),
            [address(0x201), address(0x202), address(0x203)]
        );
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        vm.expectRevert(V2FinancialAccountingFixture.InvalidOutcomeTranscript.selector);
        fixture.validatedOutcome(campaignId, 0);
    }

    function test_transcriptRejectsNonFinalOutcome() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _defaultTranscript();
        transcript.finalized = false;
        transcript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.NONE;
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        vm.expectRevert(V2FinancialAccountingFixture.InvalidOutcomeTranscript.selector);
        fixture.validatedOutcome(campaignId, 0);
    }

    function test_unauthorizedCallerCannotChooseFinalOutcome() public {
        uint256 campaignId = _createAndFundMilestoneZero();
        address backend = makeAddr("backend");

        vm.prank(backend);
        (bool success,) = address(fixture).call(
            abi.encodeWithSignature("setFinalOutcome(uint256,uint256,uint8)", campaignId, 0, 2)
        );
        assertFalse(success);

        (, V2FinancialAccountingTypes.FinalOutcome outcome,) =
            fixture.validatedOutcome(campaignId, 0);
        assertEq(uint256(outcome), uint256(V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS));
    }

    function test_unauthorizedCallerCannotMutateOutcomeSource() public {
        (bool success,) = address(source).call(
            abi.encodeWithSignature("setFinalOutcome(uint8)", uint8(2))
        );
        assertFalse(success);
    }

    function test_validCourtAccruesTheSameFixedRewardForPassAndFail() public {
        uint256 campaignId = _createAndFundMilestoneZero();
        fixture.settleMilestone(campaignId, 0);
        bytes32 caseId = keccak256("case-1");

        assertEq(fixture.judgePaid(campaignId, 0), 30e6);
        assertEq(fixture.judgeRewardEntitlement(caseId, address(0x101)), 10e6);
        assertEq(fixture.judgeRewardEntitlement(caseId, address(0x102)), 10e6);
        assertEq(fixture.judgeRewardEntitlement(caseId, address(0x103)), 10e6);

        V2FinancialAccountingTypes.FinalizedTranscript memory failTranscript =
            _defaultTranscript();
        failTranscript.court1.pass = false;
        failTranscript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
        _deployFixture(failTranscript);
        campaignId = _createAndFundMilestoneZero();
        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 30e6);
        assertEq(fixture.judgeRewardEntitlement(caseId, address(0x101)), 10e6);
    }

    function test_validCourtTwoAccruesBothCourtRewardsExactlyOnce() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _courtTwoTranscript(true);
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 60e6);
        assertEq(fixture.judgeRewardEntitlement(transcript.caseId, address(0x101)), 10e6);
        assertEq(fixture.judgeRewardEntitlement(transcript.caseId, address(0x203)), 10e6);
        vm.expectRevert(V2FinancialAccountingFixture.SettlementAlreadyProcessed.selector);
        fixture.settleMilestone(campaignId, 0);
        assertEq(fixture.judgePaid(campaignId, 0), 60e6);
    }

    function test_invalidCourtAccruesZeroValidServiceReward() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _defaultTranscript();
        transcript.court1.valid = false;
        transcript.court1.pass = false;
        transcript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 0);
        assertEq(fixture.judgeRewardEntitlement(transcript.caseId, address(0x101)), 0);
        assertEq(token.balanceOf(address(fixture)), 1_000e6);
    }

    function test_vectorV2CourtOnePassAccruesThirtyAndMovesNoTokens() public {
        uint256 campaignId = _createAndFundMilestoneZero();
        uint256 custodyBefore = token.balanceOf(address(fixture));

        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 30e6);
        assertEq(token.balanceOf(address(fixture)), custodyBefore);
        assertEq(fixture.raised(campaignId, 0), 1_000e6);
    }

    function test_vectorV3CourtTwoPassAccruesSixty() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _courtTwoTranscript(true);
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 60e6);
    }

    function test_vectorV4CourtTwoFailStillAccruesSixty() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _courtTwoTranscript(false);
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();

        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 60e6);
    }

    function test_vectorV7FundingFailureAccruesNoReward() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        vm.prank(creator);
        uint256 campaignId = fixture.createCampaign(commitment);
        address backer = makeAddr("partial-backer");
        token.mint(backer, 400e6);
        vm.startPrank(backer);
        token.approve(address(fixture), 400e6);
        fixture.contribute(campaignId, 0, 400e6);
        vm.stopPrank();
        vm.warp(commitment.fundingDeadline[0]);

        fixture.finalizeFundingFailure(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 0);
        assertEq(fixture.refundSnapshot(campaignId, 0), 400e6);
        vm.expectRevert(V2FinancialAccountingFixture.InvalidOutcomeTranscript.selector);
        fixture.settleMilestone(campaignId, 0);
    }

    function test_vectorV8InvalidCourtHasNoServiceRewardOrResetInflow() public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _defaultTranscript();
        transcript.court1.valid = false;
        transcript.court1.pass = false;
        transcript.finalOutcome = V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL;
        _deployFixture(transcript);
        uint256 campaignId = _createAndFundMilestoneZero();
        uint256 custodyBefore = token.balanceOf(address(fixture));

        fixture.settleMilestone(campaignId, 0);

        assertEq(fixture.judgePaid(campaignId, 0), 0);
        assertEq(token.balanceOf(address(fixture)), custodyBefore);
        assertEq(fixture.raised(campaignId, 0), 1_000e6);
    }

    function _deployFixture(V2FinancialAccountingTypes.FinalizedTranscript memory transcript)
        internal
    {
        source = new ImmutableV2FinalOutcomeSource(transcript);
        fixture = new V2FinancialAccountingFixture(token, ACCOUNTING_IDENTITY, source);
    }

    function _createAndFundMilestoneZero() internal returns (uint256 campaignId) {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);

        address backer = makeAddr("funding-backer");
        token.mint(backer, commitment.fundingTarget[0]);
        vm.startPrank(backer);
        token.approve(address(fixture), commitment.fundingTarget[0]);
        fixture.contribute(campaignId, 0, commitment.fundingTarget[0]);
        vm.stopPrank();
    }

    function _defaultTranscript()
        internal
        pure
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript)
    {
        transcript = V2FinancialAccountingTypes.FinalizedTranscript({
            deploymentIdentity: ACCOUNTING_IDENTITY,
            caseId: keccak256("case-1"),
            campaignId: 1,
            milestoneId: 0,
            finalized: true,
            finalOutcome: V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS,
            appealed: false,
            court1: _courtTranscript(
                true,
                true,
                true,
                keccak256("court-1"),
                [address(0x101), address(0x102), address(0x103)]
            ),
            court2: _courtTranscript(
                false,
                false,
                false,
                bytes32(0),
                [address(0), address(0), address(0)]
            )
        });
    }

    function _courtTwoTranscript(bool pass)
        internal
        pure
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript)
    {
        transcript = _defaultTranscript();
        transcript.appealed = true;
        transcript.finalOutcome = pass
            ? V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
            : V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
        transcript.court2 = _courtTranscript(
            true,
            true,
            pass,
            keccak256("court-2"),
            [address(0x201), address(0x202), address(0x203)]
        );
    }

    function _courtTranscript(
        bool present,
        bool valid,
        bool pass,
        bytes32 courtId,
        address[3] memory judges
    ) internal pure returns (V2FinancialAccountingTypes.CourtTranscript memory transcript) {
        transcript = V2FinancialAccountingTypes.CourtTranscript({
            present: present,
            valid: valid,
            pass: pass,
            courtId: courtId,
            attemptIndex: 0,
            judges: judges
        });
    }

    function _validCommitment()
        internal
        view
        returns (V2FundingTypes.CampaignCommitment memory commitment)
    {
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

        commitment.milestoneId = new uint256[](2);
        commitment.deliverableCommitment = new bytes32[](2);
        commitment.acceptanceCriteriaHash = new bytes32[](2);
        commitment.fundingTarget = new uint256[](2);
        commitment.creatorPayoutBudget = new uint256[](2);
        commitment.judgeRewardRateBps = new uint256[](2);
        commitment.judgeRewardUnit = new uint256[](2);
        commitment.maxReviewReserve = new uint256[](2);
        commitment.submissionDeadline = new uint256[](2);
        commitment.fundingDeadline = new uint256[](2);

        for (uint256 i = 0; i < 2; i++) {
            commitment.milestoneId[i] = i;
            commitment.deliverableCommitment[i] = keccak256(abi.encode("deliverable", i));
            commitment.acceptanceCriteriaHash[i] = keccak256(abi.encode("criteria", i));
            commitment.fundingTarget[i] = 1_000e6 + i * 100e6;
            commitment.creatorPayoutBudget[i] = i == 0 ? 940e6 : 1_034e6;
            commitment.judgeRewardRateBps[i] = 100;
            commitment.judgeRewardUnit[i] = i == 0 ? 10e6 : 11e6;
            commitment.maxReviewReserve[i] = i == 0 ? 60e6 : 66e6;
            commitment.fundingDeadline[i] = block.timestamp + 7 days + i * 14 days;
            commitment.submissionDeadline[i] = block.timestamp + 14 days + i * 14 days;
        }
    }
}
