pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { V2FundingFixture, V2FundingTypes } from "../fixtures/V2FundingFixture.sol";

contract V2FundingFixtureFuzzTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant FIXTURE_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr1-funding-fixture");
    MockUSDC internal token;
    V2FundingFixture internal fixture;
    address internal creator = makeAddr("fuzz-creator");
    address internal payoutWallet = makeAddr("fuzz-payout");
    address internal backer = makeAddr("fuzz-backer");

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        fixture = new V2FundingFixture(token, FIXTURE_IDENTITY);
    }

    function testFuzz_singleContributionNeverOverfunds(uint256 rawAmount) public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        uint256 target = commitment.fundingTarget[0];
        uint256 amount = bound(rawAmount, 0, target + 1);

        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(fixture), amount);
        if (amount == 0) {
            vm.expectRevert(V2FundingFixture.ZeroContribution.selector);
            fixture.contribute(campaignId, 0, amount);
        } else if (amount > target) {
            vm.expectRevert(V2FundingFixture.OverTarget.selector);
            fixture.contribute(campaignId, 0, amount);
        } else {
            fixture.contribute(campaignId, 0, amount);
        }
        vm.stopPrank();

        assertLe(fixture.raised(campaignId, 0), target);
        assertEq(fixture.raised(campaignId, 0), token.balanceOf(address(fixture)));
        assertEq(token.balanceOf(payoutWallet), 0);
        if (amount == target) {
            assertEq(
                uint256(fixture.milestoneState(campaignId, 0)),
                uint256(V2FundingTypes.MilestoneState.FUNDED)
            );
        }
    }

    function testFuzz_repeatedContributionsConserve(uint256[8] memory rawAmounts) public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        uint256 target = commitment.fundingTarget[0];

        for (uint256 i = 0; i < rawAmounts.length; i++) {
            uint256 raised = fixture.raised(campaignId, 0);
            if (raised == target) break;

            uint256 remaining = target - raised;
            uint256 amount = bound(rawAmounts[i], 0, remaining + 1);
            token.mint(backer, amount);
            vm.startPrank(backer);
            token.approve(address(fixture), amount);
            if (amount == 0) {
                vm.expectRevert(V2FundingFixture.ZeroContribution.selector);
                fixture.contribute(campaignId, 0, amount);
            } else if (amount > remaining) {
                vm.expectRevert(V2FundingFixture.OverTarget.selector);
                fixture.contribute(campaignId, 0, amount);
            } else {
                fixture.contribute(campaignId, 0, amount);
            }
            vm.stopPrank();
        }

        assertLe(fixture.raised(campaignId, 0), target);
        assertEq(fixture.raised(campaignId, 0), fixture.contributionOf(campaignId, 0, backer));
        assertEq(fixture.raised(campaignId, 0), token.balanceOf(address(fixture)));
        assertEq(token.balanceOf(payoutWallet), 0);
    }

    function testFuzz_deadlineBoundaryAlwaysRejectsContribution(uint256 rawAmount) public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        uint256 amount = bound(rawAmount, 1, commitment.fundingTarget[0]);
        token.mint(backer, amount);
        vm.warp(commitment.fundingDeadline[0]);

        vm.startPrank(backer);
        token.approve(address(fixture), amount);
        vm.expectRevert(V2FundingFixture.FundingDeadlinePassed.selector);
        fixture.contribute(campaignId, 0, amount);
        vm.stopPrank();

        assertEq(fixture.raised(campaignId, 0), 0);
        assertEq(token.balanceOf(address(fixture)), 0);
    }

    function _createCampaign(V2FundingTypes.CampaignCommitment memory commitment)
        internal
        returns (uint256 campaignId)
    {
        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);
    }

    function _validCommitment()
        internal
        view
        returns (V2FundingTypes.CampaignCommitment memory commitment)
    {
        commitment.policyManifest = V2FundingTypes.PolicyManifest({
            commitmentSchemaVersion: "FTV2-COMMIT-2",
            policyVersion: "fundtogether-vnext-v2-pr0-remediation-20261025",
            supersedesCandidate: "fundtogether-vnext-v2-pr0-policy-20251025",
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
            commitment.deliverableCommitment[i] = keccak256(abi.encode("fuzz-deliverable", i));
            commitment.acceptanceCriteriaHash[i] = keccak256(abi.encode("fuzz-criteria", i));
            commitment.fundingTarget[i] = 1_000e6 + i * 100e6;
            commitment.creatorPayoutBudget[i] = 940e6 + i * 100e6;
            commitment.judgeRewardRateBps[i] = 100;
            commitment.judgeRewardUnit[i] = 10e6;
            commitment.maxReviewReserve[i] = 60e6;
            commitment.fundingDeadline[i] = block.timestamp + 7 days + i * 14 days;
            commitment.submissionDeadline[i] = block.timestamp + 14 days + i * 14 days;
        }
    }
}
