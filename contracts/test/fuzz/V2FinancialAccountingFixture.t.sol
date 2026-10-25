pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingFixture,
    V2FinancialAccountingTypes
} from "../fixtures/V2FinancialAccountingFixture.sol";
import { V2FundingTypes } from "../fixtures/V2FundingFixture.sol";

contract FuzzTransferControlMockUSDC is MockUSDC {
    bool public transfersFail;

    function setTransfersFail(bool value) external {
        transfersFail = value;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (transfersFail) return false;
        return super.transfer(to, amount);
    }
}

contract V2FinancialAccountingFixtureFuzzTest is Test {
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
        _deploy(_transcript(false, true));
    }

    function testFuzz_rewardTermsMatchCheckedFloorFormula(uint128 targetSeed, uint16 rateSeed)
        public
        view
    {
        uint256 target = bound(uint256(targetSeed), 7, 1e30);
        uint256 researchRateBps = bound(uint256(rateSeed), 1, 1_666);
        uint256 expectedUnit = target * researchRateBps / 10_000;
        vm.assume(expectedUnit > 0);
        vm.assume(expectedUnit * 6 < target);

        (uint256 unit, uint256 reserve, uint256 creatorBudget) =
            fixture.deriveFinancialTerms(target, researchRateBps);

        assertEq(unit, expectedUnit);
        assertEq(reserve, expectedUnit * 6);
        assertEq(creatorBudget, target - expectedUnit * 6);
    }

    function testFuzz_floorBoundaryNeverOverstatesReward(uint128 targetSeed) public view {
        uint256 target = bound(uint256(targetSeed), 100, 1e30);
        (uint256 unit,,) = fixture.deriveFinancialTerms(target, 100);

        assertLe(unit * 10_000, target * 100);
        assertLt(target * 100, (unit + 1) * 10_000);
    }

    function testFuzz_validCourtCountAndVerdictDoNotChangePerSeatReward(
        bool appealed,
        bool pass
    ) public {
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript =
            _transcript(appealed, pass);
        _deploy(transcript);
        uint256 campaignId = _fund(400e6, 600e6);

        fixture.settleMilestone(campaignId, 0);

        uint256 expectedCourts = appealed ? 2 : 1;
        assertEq(fixture.judgePaid(campaignId, 0), expectedCourts * 30e6);
        assertEq(fixture.judgeRewardEntitlement(transcript.caseId, address(0x101)), 10e6);
        if (appealed) {
            assertEq(fixture.judgeRewardEntitlement(transcript.caseId, address(0x203)), 10e6);
        }
    }

    function testFuzz_refundTotalIsIndependentOfContributionSplitAndClaimOrder(
        uint96 splitSeed,
        bool reverseOrder
    ) public {
        uint256 split = bound(uint256(splitSeed), 1, 1_000e6 - 1);
        address first = address(0xA1);
        address second = address(0xB1);
        uint256 campaignId = _fundFor(first, split, second, 1_000e6 - split);
        fixture.settleMilestone(campaignId, 0);
        uint256 firstEntitlement = fixture.settlementRefundEntitlement(campaignId, 0, first);
        uint256 secondEntitlement = fixture.settlementRefundEntitlement(campaignId, 0, second);
        assertEq(firstEntitlement + secondEntitlement, 30e6);

        if (reverseOrder) {
            vm.prank(second);
            fixture.claimSettlementRefund(campaignId, 0);
            vm.prank(first);
            fixture.claimSettlementRefund(campaignId, 0);
        } else {
            vm.prank(first);
            fixture.claimSettlementRefund(campaignId, 0);
            vm.prank(second);
            fixture.claimSettlementRefund(campaignId, 0);
        }

        assertEq(fixture.settlementRefunded(campaignId, 0), 30e6);
    }

    function testFuzz_duplicateSettlementAndClaimsNeverIncreaseTransfers(uint8 repeatSeed) public {
        uint256 repeats = bound(uint256(repeatSeed), 1, 8);
        uint256 campaignId = _fund(400e6, 600e6);
        fixture.settleMilestone(campaignId, 0);
        for (uint256 i = 0; i < repeats; i++) {
            vm.expectRevert(V2FinancialAccountingFixture.SettlementAlreadyProcessed.selector);
            fixture.settleMilestone(campaignId, 0);
        }

        vm.prank(address(0x101));
        fixture.claimJudgeReward(campaignId, 0);
        uint256 balanceAfterClaim = token.balanceOf(address(0x101));
        for (uint256 i = 0; i < repeats; i++) {
            vm.prank(address(0x101));
            vm.expectRevert(V2FinancialAccountingFixture.ClaimAlreadyProcessed.selector);
            fixture.claimJudgeReward(campaignId, 0);
        }
        assertEq(token.balanceOf(address(0x101)), balanceAfterClaim);
        assertEq(fixture.judgePaid(campaignId, 0), 30e6);
    }

    function testFuzz_failedRewardTransferLeavesAccountingIdentical(uint8 judgeSeed) public {
        FuzzTransferControlMockUSDC controlled = new FuzzTransferControlMockUSDC();
        token = controlled;
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript = _transcript(false, true);
        _deploy(transcript);
        uint256 campaignId = _fund(400e6, 600e6);
        fixture.settleMilestone(campaignId, 0);
        address judge = transcript.court1.judges[bound(uint256(judgeSeed), 0, 2)];
        uint256 custodyBefore = fixture.physicalCustody(campaignId, 0);
        uint256 liabilitiesBefore = fixture.fundedLiabilities(campaignId, 0);
        controlled.setTransfersFail(true);

        vm.prank(judge);
        vm.expectRevert();
        fixture.claimJudgeReward(campaignId, 0);

        assertEq(fixture.judgeRewardClaimed(campaignId, 0), 0);
        assertEq(fixture.physicalCustody(campaignId, 0), custodyBefore);
        assertEq(fixture.fundedLiabilities(campaignId, 0), liabilitiesBefore);
    }

    function _fund(uint256 firstAmount, uint256 secondAmount)
        internal
        returns (uint256 campaignId)
    {
        return _fundFor(address(0xA1), firstAmount, address(0xB1), secondAmount);
    }

    function _fundFor(address first, uint256 firstAmount, address second, uint256 secondAmount)
        internal
        returns (uint256 campaignId)
    {
        V2FundingTypes.CampaignCommitment memory commitment = _commitment();
        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);
        _contribute(campaignId, first, firstAmount);
        _contribute(campaignId, second, secondAmount);
    }

    function _contribute(uint256 campaignId, address backer, uint256 amount) internal {
        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(fixture), amount);
        fixture.contribute(campaignId, 0, amount);
        vm.stopPrank();
    }

    function _deploy(V2FinancialAccountingTypes.FinalizedTranscript memory transcript) internal {
        ImmutableV2FinalOutcomeSource source = new ImmutableV2FinalOutcomeSource(transcript);
        fixture = new V2FinancialAccountingFixture(token, ACCOUNTING_IDENTITY, source);
    }

    function _transcript(bool appealed, bool pass)
        internal
        pure
        returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript)
    {
        transcript.deploymentIdentity = ACCOUNTING_IDENTITY;
        transcript.caseId = keccak256("fuzz-case");
        transcript.campaignId = 1;
        transcript.milestoneId = 0;
        transcript.finalized = true;
        transcript.finalOutcome = pass
            ? V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS
            : V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL;
        transcript.appealed = appealed;
        transcript.court1 = V2FinancialAccountingTypes.CourtTranscript({
            present: true,
            valid: true,
            pass: true,
            courtId: keccak256("fuzz-court-1"),
            attemptIndex: 0,
            judges: [address(0x101), address(0x102), address(0x103)]
        });
        if (!appealed) transcript.court1.pass = pass;
        transcript.court2 = V2FinancialAccountingTypes.CourtTranscript({
            present: appealed,
            valid: appealed,
            pass: appealed && pass,
            courtId: appealed ? keccak256("fuzz-court-2") : bytes32(0),
            attemptIndex: 0,
            judges: appealed
                ? [address(0x201), address(0x202), address(0x203)]
                : [address(0), address(0), address(0)]
        });
    }

    function _commitment()
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
        commitment.milestoneId[0] = 0;
        commitment.deliverableCommitment[0] = keccak256("fuzz-deliverable");
        commitment.acceptanceCriteriaHash[0] = keccak256("fuzz-criteria");
        commitment.fundingTarget[0] = 1_000e6;
        commitment.creatorPayoutBudget[0] = 940e6;
        commitment.judgeRewardRateBps[0] = 100;
        commitment.judgeRewardUnit[0] = 10e6;
        commitment.maxReviewReserve[0] = 60e6;
        commitment.fundingDeadline[0] = block.timestamp + 7 days;
        commitment.submissionDeadline[0] = block.timestamp + 14 days;
    }
}
