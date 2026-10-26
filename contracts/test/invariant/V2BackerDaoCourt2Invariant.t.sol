pragma solidity 0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { V2BackerDaoCourt2Fixture } from "../fixtures/V2BackerDaoCourt2Fixture.sol";
import { V2CourtResetFixture } from "../fixtures/V2CourtResetFixture.sol";
import { V2FundingTypes } from "../fixtures/V2FundingFixture.sol";

contract V2BackerDaoCourt2InvariantHandler {
    V2BackerDaoCourt2Fixture internal immutable fixture;
    uint256 public contribution;
    uint256 public root;
    V2BackerDaoCourt2Fixture.DaoChoice public tieDecision;

    constructor(V2BackerDaoCourt2Fixture fixture_) {
        fixture = fixture_;
        tieDecision = V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT;
    }

    function probeSqrt(uint128 contribution_) external {
        contribution = contribution_;
        root = fixture.floorSqrt(contribution_);
    }

    function probeTie(uint128 rawWeight) external {
        uint256 weight = uint256(rawWeight) % (type(uint256).max / 20_000 + 1);
        tieDecision = fixture.evaluateDaoWeightsForTest(weight * 2, weight, weight);
    }
}

contract V2BackerDaoCourt2InvariantTest is StdInvariant, Test {
    V2BackerDaoCourt2Fixture internal fixture;
    V2BackerDaoCourt2InvariantHandler internal handler;

    function setUp() public {
        MockUSDC token = new MockUSDC();
        fixture = new V2BackerDaoCourt2Fixture(token, token);
        handler = new V2BackerDaoCourt2InvariantHandler(fixture);
        targetContract(address(handler));
    }

    function invariant_floorSqrtBoundsEveryCappedContribution() public view {
        uint256 root = handler.root();
        uint256 contribution = handler.contribution();
        assertLe(root * root, contribution);
        assertGt((root + 1) * (root + 1), contribution);
    }

    function invariant_tieCannotOpenAppeal() public view {
        assertEq(uint256(handler.tieDecision()), uint256(V2BackerDaoCourt2Fixture.DaoChoice.ACCEPT));
    }
}

contract V2BackerDaoCourt2SettlementHandler {
    struct Workflow {
        V2BackerDaoCourt2Fixture fixture;
        uint256 campaignId;
        bytes32 caseId;
    }

    Workflow[4] private workflows;
    mapping(uint256 => bytes32) public firstSettledCase;
    mapping(uint256 => uint256) public successfulSettlements;
    mapping(uint256 => uint256) public duplicateReverts;
    mapping(uint256 => uint256) public unexpectedDuplicateSettlements;

    constructor(
        Workflow memory accept,
        Workflow memory court2Pass,
        Workflow memory court2FailAfterReset,
        Workflow memory protocolFail
    ) {
        workflows[0] = accept;
        workflows[1] = court2Pass;
        workflows[2] = court2FailAfterReset;
        workflows[3] = protocolFail;
        for (uint256 i = 0; i < workflows.length; i++) {
            _settlePreparedWorkflow(i);
        }
    }

    function settle(uint8 rawWorkflow) external {
        uint256 index = rawWorkflow % workflows.length;
        Workflow storage workflow = workflows[index];
        try workflow.fixture.settleMilestone(workflow.campaignId, 0) {
            unexpectedDuplicateSettlements[index] += 1;
        } catch {
            duplicateReverts[index] += 1;
        }
    }

    function workflowAt(uint256 index)
        external
        view
        returns (V2BackerDaoCourt2Fixture fixture, uint256 campaignId, bytes32 caseId)
    {
        Workflow storage workflow = workflows[index];
        return (workflow.fixture, workflow.campaignId, workflow.caseId);
    }

    function _settlePreparedWorkflow(uint256 index) internal {
        Workflow storage workflow = workflows[index];
        workflow.fixture.settleMilestone(workflow.campaignId, 0);
        firstSettledCase[index] = workflow.fixture.settledCaseId(workflow.campaignId, 0);
        successfulSettlements[index] = 1;
        try workflow.fixture.settleMilestone(workflow.campaignId, 0) {
            unexpectedDuplicateSettlements[index] += 1;
        } catch {
            duplicateReverts[index] = 1;
        }
    }
}

contract V2BackerDaoCourt2SettlementInvariantTest is StdInvariant, Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;

    enum WorkflowEnd {
        ACCEPT,
        COURT2_PASS,
        COURT2_FAIL_AFTER_RESET,
        PROTOCOL_FAIL
    }

    V2BackerDaoCourt2SettlementHandler internal handler;

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        V2BackerDaoCourt2SettlementHandler.Workflow memory accept =
            _prepareWorkflow(0x6000, WorkflowEnd.ACCEPT);
        V2BackerDaoCourt2SettlementHandler.Workflow memory court2Pass =
            _prepareWorkflow(0x6100, WorkflowEnd.COURT2_PASS);
        V2BackerDaoCourt2SettlementHandler.Workflow memory court2FailAfterReset =
            _prepareWorkflow(0x6200, WorkflowEnd.COURT2_FAIL_AFTER_RESET);
        V2BackerDaoCourt2SettlementHandler.Workflow memory protocolFail =
            _prepareWorkflow(0x6300, WorkflowEnd.PROTOCOL_FAIL);

        handler = new V2BackerDaoCourt2SettlementHandler(
            accept, court2Pass, court2FailAfterReset, protocolFail
        );
        targetContract(address(handler));
    }

    function invariant_finalizedWorkflowConservesCustodyAndSettlesOnce() public view {
        for (uint256 i = 0; i < 4; i++) {
            (V2BackerDaoCourt2Fixture fixture, uint256 campaignId, bytes32 caseId) =
                handler.workflowAt(i);
            assertTrue(fixture.settlementProcessed(campaignId, 0));
            assertEq(fixture.settledCaseId(campaignId, 0), caseId);
            assertEq(handler.firstSettledCase(i), caseId);
            assertEq(handler.successfulSettlements(i), 1);
            assertGe(handler.duplicateReverts(i), 1);
            assertEq(handler.unexpectedDuplicateSettlements(i), 0);
            assertEq(
                fixture.fundedLiabilities(campaignId, 0),
                fixture.milestoneCustodyAttribution(campaignId, 0)
            );
            assertEq(
                fixture.physicalTokenCustody(), fixture.milestoneCustodyAttribution(campaignId, 0)
            );
        }
    }

    function _prepareWorkflow(uint160 seed, WorkflowEnd end)
        internal
        returns (V2BackerDaoCourt2SettlementHandler.Workflow memory workflow)
    {
        MockUSDC token = new MockUSDC();
        V2BackerDaoCourt2Fixture fixture = new V2BackerDaoCourt2Fixture(token, token);
        for (uint256 i = 0; i < 9; i++) {
            _registerAndFundJudge(token, fixture, address(seed + uint160(i)), 100);
        }

        address creator = address(seed + 0x20);
        address payoutWallet = address(seed + 0x21);
        address voter = address(seed + 0x22);
        V2FundingTypes.CampaignCommitment memory commitment =
            _commitment(token, fixture, creator, payoutWallet);
        vm.prank(creator);
        uint256 campaignId = fixture.createCampaign(commitment);
        _contribute(token, fixture, campaignId, voter, 1_000_000);

        bytes32 caseId = keccak256(abi.encode("pr4-settlement-invariant", seed));
        fixture.createWorkflowCase(caseId, campaignId, 0, 23, 10, 3);
        bytes32 court1 = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_1, 1);
        _finalizeCourt(fixture, caseId, court1, end != WorkflowEnd.COURT2_PASS);
        fixture.openDao(caseId);
        if (end == WorkflowEnd.ACCEPT) {
            _finalizeDaoAfterVoting(fixture, caseId);
            return V2BackerDaoCourt2SettlementHandler.Workflow(fixture, campaignId, caseId);
        }

        vm.prank(voter);
        fixture.castDaoBallot(caseId, V2BackerDaoCourt2Fixture.DaoChoice.APPEAL);
        _finalizeDaoAfterVoting(fixture, caseId);
        bytes32 court2 = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 2);
        if (end == WorkflowEnd.COURT2_PASS) {
            _finalizeCourt(fixture, caseId, court2, true);
            return V2BackerDaoCourt2SettlementHandler.Workflow(fixture, campaignId, caseId);
        }

        _invalidateCourt(fixture, caseId, court2);
        bytes32 replacement = fixture.assignCourt(caseId, V2CourtResetFixture.CourtLevel.COURT_2, 3);
        if (end == WorkflowEnd.COURT2_FAIL_AFTER_RESET) {
            _finalizeCourt(fixture, caseId, replacement, false);
        } else {
            _invalidateCourt(fixture, caseId, replacement);
        }
        return V2BackerDaoCourt2SettlementHandler.Workflow(fixture, campaignId, caseId);
    }

    function _registerAndFundJudge(
        MockUSDC token,
        V2BackerDaoCourt2Fixture fixture,
        address judge,
        uint256 amount
    ) internal {
        fixture.registerJudge(judge);
        token.mint(judge, amount);
        vm.startPrank(judge);
        token.approve(address(fixture.stakePool()), amount);
        fixture.depositStake(amount);
        vm.stopPrank();
    }

    function _contribute(
        MockUSDC token,
        V2BackerDaoCourt2Fixture fixture,
        uint256 campaignId,
        address backer,
        uint256 amount
    ) internal {
        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(fixture), amount);
        fixture.contribute(campaignId, 0, amount);
        vm.stopPrank();
    }

    function _finalizeCourt(
        V2BackerDaoCourt2Fixture fixture,
        bytes32 caseId,
        bytes32 courtId,
        bool pass
    ) internal {
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

    function _invalidateCourt(V2BackerDaoCourt2Fixture fixture, bytes32 caseId, bytes32 courtId)
        internal
    {
        vm.warp(fixture.courtInfo(courtId).revealDeadline);
        fixture.settleInvalidCourt(caseId, courtId);
    }

    function _finalizeDaoAfterVoting(V2BackerDaoCourt2Fixture fixture, bytes32 caseId) internal {
        vm.warp(fixture.daoCaseInfo(caseId).votingDeadline);
        fixture.finalizeDao(caseId);
    }

    function _commitment(
        MockUSDC token,
        V2BackerDaoCourt2Fixture fixture,
        address creator,
        address payoutWallet
    ) internal view returns (V2FundingTypes.CampaignCommitment memory commitment) {
        (uint256 rewardUnit, uint256 reserve, uint256 creatorBudget) =
            fixture.deriveFinancialTerms(1_000_000, 100);
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
        commitment.deliverableCommitment[0] = keccak256("invariant-deliverable");
        commitment.acceptanceCriteriaHash[0] = keccak256("invariant-criteria");
        commitment.fundingTarget[0] = 1_000_000;
        commitment.creatorPayoutBudget[0] = creatorBudget;
        commitment.judgeRewardRateBps[0] = 100;
        commitment.judgeRewardUnit[0] = rewardUnit;
        commitment.maxReviewReserve[0] = reserve;
        commitment.fundingDeadline[0] = block.timestamp + 2 days;
        commitment.submissionDeadline[0] = block.timestamp + 3 days;
    }
}
