pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import {
    V2FinancialAccountingFixture
} from "../../fixtures/V2FinancialAccountingFixture.sol";
import { V2FundingTypes } from "../../fixtures/V2FundingFixture.sol";

contract V2FinancialAccountingFixtureTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant ACCOUNTING_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");

    MockUSDC internal token;
    V2FinancialAccountingFixture internal fixture;
    address internal creator = makeAddr("creator");
    address internal payoutWallet = makeAddr("payout");

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        fixture = new V2FinancialAccountingFixture(
            token, ACCOUNTING_IDENTITY, makeAddr("immutable-outcome-source")
        );
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
