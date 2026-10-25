pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { V2FundingFixture, V2FundingTypes } from "../../fixtures/V2FundingFixture.sol";

contract TransferControlMockUSDC is MockUSDC {
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

contract FeeOnTransferMockUSDC is ERC20 {
    bool public feeEnabled;

    constructor() ERC20("Fee Mock USDC", "fUSDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeEnabled(bool value) external {
        feeEnabled = value;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (feeEnabled && from != address(0) && to != address(0)) {
            uint256 fee = amount / 100;
            super._update(from, to, amount - fee);
            if (fee > 0) super._update(from, address(0), fee);
        } else {
            super._update(from, to, amount);
        }
    }
}

contract V2FundingFixtureTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant FIXTURE_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr1-funding-fixture");
    bytes32 internal constant CONTRIBUTION_EVENT_SIGNATURE = keccak256(
        "MilestoneContributionReceived(bytes32,uint256,uint256,address,uint256,uint256,uint256)"
    );
    bytes32 internal constant FUNDING_FINALIZED_EVENT_SIGNATURE = keccak256(
        "MilestoneFundingFinalized(bytes32,uint256,uint256,bool,uint256,uint256,uint256)"
    );
    MockUSDC internal token;
    V2FundingFixture internal fixture;
    address internal creator = makeAddr("creator");
    address internal payoutWallet = makeAddr("payout");

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        token = new MockUSDC();
        fixture = new V2FundingFixture(token, FIXTURE_IDENTITY);
    }

    function test_createCampaignRejectsEmptyMilestoneArrayBeforeStateMovement() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.milestoneId = new uint256[](0);
        commitment.deliverableCommitment = new bytes32[](0);
        commitment.acceptanceCriteriaHash = new bytes32[](0);
        commitment.fundingTarget = new uint256[](0);
        commitment.creatorPayoutBudget = new uint256[](0);
        commitment.judgeRewardRateBps = new uint256[](0);
        commitment.judgeRewardUnit = new uint256[](0);
        commitment.maxReviewReserve = new uint256[](0);
        commitment.submissionDeadline = new uint256[](0);
        commitment.fundingDeadline = new uint256[](0);

        vm.prank(creator);
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        fixture.createCampaign(commitment);

        assertEq(fixture.nextCampaignId(), 0);
        assertEq(token.balanceOf(address(fixture)), 0);
    }

    function test_createCampaignStoresTypedCommitmentAndOpensOnlyMilestoneZero() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId;

        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);

        assertEq(campaignId, 1);
        assertEq(fixture.commitmentHash(campaignId), _expectedCommitmentHash(commitment));
        assertEq(fixture.policyVersion(campaignId), commitment.policyManifest.policyVersion);
        assertEq(fixture.deploymentIdentity(), FIXTURE_IDENTITY);
        assertEq(fixture.activeMilestoneId(campaignId), 0);
        assertEq(
            uint256(fixture.milestoneState(campaignId, 0)),
            uint256(V2FundingTypes.MilestoneState.FUNDING_OPEN)
        );
        assertEq(
            uint256(fixture.milestoneState(campaignId, 1)),
            uint256(V2FundingTypes.MilestoneState.DECLARED)
        );

        (
            uint256 milestoneId,
            bytes32 deliverableCommitment,
            bytes32 acceptanceCriteriaHash,
            uint256 fundingTarget,
            uint256 creatorPayoutBudget,
            uint256 judgeRewardRateBps,
            uint256 judgeRewardUnit,
            uint256 maxReviewReserve,
            uint256 submissionDeadline,
            uint256 fundingDeadline,
            V2FundingTypes.MilestoneState state
        ) = fixture.milestoneTerms(campaignId, 0);

        assertEq(milestoneId, commitment.milestoneId[0]);
        assertEq(deliverableCommitment, commitment.deliverableCommitment[0]);
        assertEq(acceptanceCriteriaHash, commitment.acceptanceCriteriaHash[0]);
        assertEq(fundingTarget, commitment.fundingTarget[0]);
        assertEq(creatorPayoutBudget, commitment.creatorPayoutBudget[0]);
        assertEq(judgeRewardRateBps, commitment.judgeRewardRateBps[0]);
        assertEq(judgeRewardUnit, commitment.judgeRewardUnit[0]);
        assertEq(maxReviewReserve, commitment.maxReviewReserve[0]);
        assertEq(submissionDeadline, commitment.submissionDeadline[0]);
        assertEq(fundingDeadline, commitment.fundingDeadline[0]);
        assertEq(uint256(state), uint256(V2FundingTypes.MilestoneState.FUNDING_OPEN));
    }

    function test_acceptsTheRegistrySupersedesCandidateIdentifier() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();

        assertEq(
            commitment.policyManifest.supersedesCandidate,
            "fundtogether-vnext-v2-pr0-policy-20261025"
        );
        assertGt(_createCampaign(commitment), 0);
    }

    function test_rejectsTheLegacySupersedesCandidateIdentifier() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.policyManifest.supersedesCandidate = "fundtogether-vnext-v2-pr0-policy-20251025";
        commitment.policyManifest.policyManifestHash =
            fixture.policyManifestHashFor(commitment.policyManifest);

        _expectInvalid(commitment);
    }

    function test_storesTheV2FrozenRewardArithmeticForMilestoneOne() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);

        (
            uint256 milestoneId,
            bytes32 deliverableCommitment,
            bytes32 acceptanceCriteriaHash,
            uint256 fundingTarget,
            uint256 creatorPayoutBudget,
            uint256 judgeRewardRateBps,
            uint256 judgeRewardUnit,
            uint256 maxReviewReserve,
            uint256 submissionDeadline,
            uint256 fundingDeadline,
            V2FundingTypes.MilestoneState state
        ) = fixture.milestoneTerms(campaignId, 1);

        assertEq(milestoneId, 1);
        assertTrue(deliverableCommitment != bytes32(0));
        assertTrue(acceptanceCriteriaHash != bytes32(0));
        assertEq(fundingTarget, 1_100e6);
        assertEq(creatorPayoutBudget, 1_034e6);
        assertEq(judgeRewardRateBps, 100);
        assertEq(judgeRewardUnit, 11e6);
        assertEq(maxReviewReserve, 66e6);
        assertGt(submissionDeadline, fundingDeadline);
        assertEq(uint256(state), uint256(V2FundingTypes.MilestoneState.DECLARED));
    }

    function test_rejectsARewardUnitThatDoesNotMatchTheFrozenFormula() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.judgeRewardUnit[1] = 10e6;

        _expectInvalid(commitment);
    }

    function test_rejectsAReviewReserveThatDoesNotMatchTheFrozenFormula() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.maxReviewReserve[1] = 60e6;

        _expectInvalid(commitment);
    }

    function test_rejectsACreatorPayoutThatDoesNotMatchTheFrozenFormula() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.creatorPayoutBudget[1] = 1_033e6;

        _expectInvalid(commitment);
    }

    function test_createCampaignRejectsInvalidDeadlineAndPolicyIdentity() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.fundingDeadline[0] = block.timestamp;

        vm.prank(creator);
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        fixture.createCampaign(commitment);

        commitment = _validCommitment();
        commitment.policyManifest.commitmentSchemaVersion = "";

        vm.prank(creator);
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        fixture.createCampaign(commitment);

        commitment = _validCommitment();
        commitment.policyManifest.policyVersion = "registry-latest";
        commitment.policyManifest.policyManifestHash =
            fixture.policyManifestHashFor(commitment.policyManifest);
        vm.prank(creator);
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        fixture.createCampaign(commitment);

        commitment = _validCommitment();
        commitment.policyManifest.policyManifestHash = keccak256("arbitrary-policy-preimage");
        vm.prank(creator);
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        fixture.createCampaign(commitment);

        assertEq(fixture.nextCampaignId(), 0);
    }

    function test_constructorRejectsAnyNonFixtureIdentity() public {
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        new V2FundingFixture(token, keccak256("mutable-registry-alias"));
    }

    function test_createCampaignRejectsEveryUnequalParallelArray() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();

        commitment.deliverableCommitment = new bytes32[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.acceptanceCriteriaHash = new bytes32[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.fundingTarget = new uint256[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.creatorPayoutBudget = new uint256[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.judgeRewardRateBps = new uint256[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.judgeRewardUnit = new uint256[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.maxReviewReserve = new uint256[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.submissionDeadline = new uint256[](1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.fundingDeadline = new uint256[](1);
        _expectInvalid(commitment);

        assertEq(fixture.nextCampaignId(), 0);
        assertEq(token.balanceOf(address(fixture)), 0);
    }

    function test_createCampaignRejectsIncompleteTermsAndManifest() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();

        commitment.milestoneId[1] = 2;
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.deliverableCommitment[0] = bytes32(0);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.acceptanceCriteriaHash[0] = bytes32(0);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.fundingTarget[0] = 0;
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.creatorPayoutBudget[0] = 0;
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.maxReviewReserve[0] = commitment.fundingTarget[0];
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.fundingDeadline[0] = block.timestamp;
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.submissionDeadline[0] = commitment.fundingDeadline[0];
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.policyManifestHash = bytes32(0);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.chainId = LOCAL_CHAIN_ID + 1;
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.token = address(1);
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.creator = makeAddr("other-creator");
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.payoutWallet = address(0);
        _expectInvalid(commitment);

        commitment = _validCommitment();
        commitment.policyManifest.policyVersion = "";
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.publicationPolicy = "";
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.evidenceDisclosurePolicy = "";
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.daoFormulaVersion = "";
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.daoConflictPolicyVersion = "";
        _expectInvalid(commitment);
        commitment = _validCommitment();
        commitment.policyManifest.resetPolicyVersion = "";
        _expectInvalid(commitment);

        assertEq(fixture.nextCampaignId(), 0);
        assertEq(token.balanceOf(address(fixture)), 0);
    }

    function test_commitmentHashChangesWhenMilestoneOrderChanges() public {
        V2FundingTypes.CampaignCommitment memory original = _validCommitment();
        V2FundingTypes.CampaignCommitment memory reordered = _validCommitment();
        _swapMilestones(reordered);

        vm.prank(creator);
        uint256 originalId = fixture.createCampaign(original);
        vm.prank(creator);
        uint256 reorderedId = fixture.createCampaign(reordered);

        assertEq(fixture.commitmentHash(originalId), _expectedCommitmentHash(original));
        assertEq(fixture.commitmentHash(reorderedId), _expectedCommitmentHash(reordered));
        assertTrue(fixture.commitmentHash(originalId) != fixture.commitmentHash(reorderedId));
    }

    function test_createdTermsDoNotChangeWhenInputMemoryChanges() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        bytes32 expectedHash = _expectedCommitmentHash(commitment);

        vm.prank(creator);
        uint256 campaignId = fixture.createCampaign(commitment);

        commitment.fundingTarget[0] = 1;
        commitment.policyManifest.policyVersion = "mutated-after-create";

        assertEq(fixture.commitmentHash(campaignId), expectedHash);
        assertEq(
            fixture.policyVersion(campaignId), "fundtogether-vnext-v2-pr0-remediation-20261025"
        );
        (,,, uint256 fundingTarget,,,,,,,) = fixture.milestoneTerms(campaignId, 0);
        assertEq(fundingTarget, 1_000e6);
    }

    function test_contributionsUseActiveMilestoneLedgerAndExactTargetCustody() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        address backerA = makeAddr("backer-a");
        address backerB = makeAddr("backer-b");
        token.mint(backerA, 400e6);
        token.mint(backerB, 600e6);

        vm.startPrank(backerA);
        token.approve(address(fixture), 400e6);
        vm.expectEmit(true, true, true, true);
        emit V2FundingFixture.MilestoneContributionReceived(
            FIXTURE_IDENTITY, campaignId, 0, backerA, 400e6, 400e6, 1
        );
        fixture.contribute(campaignId, 0, 400e6);
        vm.stopPrank();

        vm.startPrank(backerB);
        token.approve(address(fixture), 600e6);
        vm.expectEmit(true, true, true, true);
        emit V2FundingFixture.MilestoneFundingFinalized(
            FIXTURE_IDENTITY, campaignId, 0, true, 1_000e6, 0, 1
        );
        fixture.contribute(campaignId, 0, 600e6);
        vm.stopPrank();

        assertEq(fixture.raised(campaignId, 0), 1_000e6);
        assertEq(fixture.contributionOf(campaignId, 0, backerA), 400e6);
        assertEq(fixture.contributionOf(campaignId, 0, backerB), 600e6);
        assertEq(token.balanceOf(address(fixture)), 1_000e6);
        assertEq(token.balanceOf(payoutWallet), 0);
        assertEq(
            uint256(fixture.milestoneState(campaignId, 0)),
            uint256(V2FundingTypes.MilestoneState.FUNDED)
        );
        assertEq(
            uint256(fixture.milestoneState(campaignId, 1)),
            uint256(V2FundingTypes.MilestoneState.DECLARED)
        );
        assertEq(fixture.activeMilestoneId(campaignId), 0);
    }

    function test_exactTargetEmitsContributionBeforeFundingFinalization() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        address backer = makeAddr("ordered-events-backer");
        token.mint(backer, 1_000e6);

        vm.startPrank(backer);
        token.approve(address(fixture), 1_000e6);
        vm.recordLogs();
        fixture.contribute(campaignId, 0, 1_000e6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        vm.stopPrank();

        uint256 fixtureLogCount;
        bytes32 firstFixtureEvent;
        bytes32 secondFixtureEvent;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(fixture)) continue;
            if (fixtureLogCount == 0) firstFixtureEvent = logs[i].topics[0];
            if (fixtureLogCount == 1) secondFixtureEvent = logs[i].topics[0];
            fixtureLogCount++;
        }

        assertEq(fixtureLogCount, 2);
        assertEq(firstFixtureEvent, CONTRIBUTION_EVENT_SIGNATURE);
        assertEq(secondFixtureEvent, FUNDING_FINALIZED_EVENT_SIGNATURE);
    }

    function test_contributeRejectsInactiveZeroOverTargetAndExpiredFunding() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        address backer = makeAddr("funding-backer");
        token.mint(backer, 2_001e6);
        vm.startPrank(backer);
        token.approve(address(fixture), type(uint256).max);

        vm.expectRevert(V2FundingFixture.NotActiveMilestone.selector);
        fixture.contribute(campaignId, 1, 1);
        vm.expectRevert(V2FundingFixture.ZeroContribution.selector);
        fixture.contribute(campaignId, 0, 0);
        fixture.contribute(campaignId, 0, 900e6);
        vm.expectRevert(V2FundingFixture.OverTarget.selector);
        fixture.contribute(campaignId, 0, 101e6);
        vm.stopPrank();

        assertEq(fixture.raised(campaignId, 0), 900e6);
        assertEq(token.balanceOf(address(fixture)), 900e6);

        vm.warp(commitment.fundingDeadline[0]);
        vm.prank(backer);
        vm.expectRevert(V2FundingFixture.FundingDeadlinePassed.selector);
        fixture.contribute(campaignId, 0, 100e6);

        assertEq(fixture.raised(campaignId, 0), 900e6);
        assertEq(token.balanceOf(address(fixture)), 900e6);
    }

    function test_exactTargetSuccessCannotBeFinalizedAsFailureOrContributedAgain() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        address backer = makeAddr("exact-backer");
        token.mint(backer, 1_000e6);

        vm.startPrank(backer);
        token.approve(address(fixture), type(uint256).max);
        fixture.contribute(campaignId, 0, 1_000e6);
        vm.expectRevert(V2FundingFixture.FundingNotOpen.selector);
        fixture.contribute(campaignId, 0, 1);
        vm.stopPrank();

        vm.warp(commitment.fundingDeadline[0]);
        vm.expectRevert(V2FundingFixture.FundingNotOpen.selector);
        fixture.finalizeFundingFailure(campaignId, 0);

        assertEq(token.balanceOf(address(fixture)), 1_000e6);
        assertEq(token.balanceOf(payoutWallet), 0);
        assertEq(fixture.refundSnapshot(campaignId, 0), 0);
    }

    function test_fundingFailureSnapshotsCustodyAndAllowsEachBackerRefund() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);
        address backerA = makeAddr("refund-a");
        address backerB = makeAddr("refund-b");
        token.mint(backerA, 400e6);
        token.mint(backerB, 300e6);

        vm.startPrank(backerA);
        token.approve(address(fixture), 400e6);
        fixture.contribute(campaignId, 0, 400e6);
        vm.stopPrank();
        vm.startPrank(backerB);
        token.approve(address(fixture), 300e6);
        fixture.contribute(campaignId, 0, 300e6);
        vm.stopPrank();

        vm.warp(commitment.fundingDeadline[0]);
        vm.expectEmit(true, true, true, true);
        emit V2FundingFixture.MilestoneFundingFinalized(
            FIXTURE_IDENTITY, campaignId, 0, false, 700e6, 700e6, 1
        );
        fixture.finalizeFundingFailure(campaignId, 0);

        assertEq(
            uint256(fixture.milestoneState(campaignId, 0)),
            uint256(V2FundingTypes.MilestoneState.REFUNDING)
        );
        assertEq(fixture.refundSnapshot(campaignId, 0), 700e6);
        assertEq(token.balanceOf(address(fixture)), 700e6);

        vm.prank(backerA);
        token.approve(address(fixture), 1);
        vm.prank(backerA);
        vm.expectRevert(V2FundingFixture.FundingNotOpen.selector);
        fixture.contribute(campaignId, 0, 1);

        vm.prank(backerA);
        vm.expectEmit(true, true, true, true);
        emit V2FundingFixture.MilestoneRefundClaimed(
            FIXTURE_IDENTITY, campaignId, 0, backerA, 400e6, 1
        );
        fixture.claimFundingRefund(campaignId, 0);
        vm.prank(backerB);
        fixture.claimFundingRefund(campaignId, 0);

        assertTrue(fixture.refundClaimed(campaignId, 0, backerA));
        assertTrue(fixture.refundClaimed(campaignId, 0, backerB));
        assertEq(fixture.refunded(campaignId, 0), 700e6);
        assertEq(token.balanceOf(address(fixture)), 0);
        assertEq(token.balanceOf(backerA), 400e6);
        assertEq(token.balanceOf(backerB), 300e6);

        vm.prank(backerA);
        vm.expectRevert(V2FundingFixture.RefundAlreadyClaimed.selector);
        fixture.claimFundingRefund(campaignId, 0);
        vm.prank(makeAddr("no-refund"));
        vm.expectRevert(V2FundingFixture.NoRefundAvailable.selector);
        fixture.claimFundingRefund(campaignId, 0);
    }

    function test_failedRefundTransferRollsBackClaimAndCanBeRetried() public {
        TransferControlMockUSDC failingToken = new TransferControlMockUSDC();
        V2FundingFixture failingFixture = new V2FundingFixture(failingToken, FIXTURE_IDENTITY);
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.policyManifest.token = address(failingToken);
        commitment.policyManifest.policyManifestHash =
            failingFixture.policyManifestHashFor(commitment.policyManifest);
        address backer = makeAddr("retry-refund");
        failingToken.mint(backer, 250e6);

        vm.prank(creator);
        uint256 campaignId = failingFixture.createCampaign(commitment);
        vm.startPrank(backer);
        failingToken.approve(address(failingFixture), 250e6);
        failingFixture.contribute(campaignId, 0, 250e6);
        vm.stopPrank();

        vm.warp(commitment.fundingDeadline[0]);
        failingFixture.finalizeFundingFailure(campaignId, 0);
        failingToken.setTransfersFail(true);

        vm.prank(backer);
        vm.expectRevert();
        failingFixture.claimFundingRefund(campaignId, 0);
        assertFalse(failingFixture.refundClaimed(campaignId, 0, backer));
        assertEq(failingFixture.refunded(campaignId, 0), 0);
        assertEq(failingToken.balanceOf(address(failingFixture)), 250e6);

        failingToken.setTransfersFail(false);
        vm.prank(backer);
        failingFixture.claimFundingRefund(campaignId, 0);
        assertTrue(failingFixture.refundClaimed(campaignId, 0, backer));
        assertEq(failingFixture.refunded(campaignId, 0), 250e6);
        assertEq(failingToken.balanceOf(address(failingFixture)), 0);
        assertEq(failingToken.balanceOf(backer), 250e6);
    }

    function test_failedContributionTransferRollsBackLedgerAndCustody() public {
        TransferControlMockUSDC failingToken = new TransferControlMockUSDC();
        V2FundingFixture failingFixture = new V2FundingFixture(failingToken, FIXTURE_IDENTITY);
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.policyManifest.token = address(failingToken);
        commitment.policyManifest.policyManifestHash =
            failingFixture.policyManifestHashFor(commitment.policyManifest);
        address backer = makeAddr("failed-contribution");
        failingToken.mint(backer, 250e6);

        vm.prank(creator);
        uint256 campaignId = failingFixture.createCampaign(commitment);
        failingToken.setTransfersFail(true);
        vm.startPrank(backer);
        failingToken.approve(address(failingFixture), 250e6);
        vm.expectRevert();
        failingFixture.contribute(campaignId, 0, 250e6);
        vm.stopPrank();

        assertEq(failingFixture.raised(campaignId, 0), 0);
        assertEq(failingFixture.contributionOf(campaignId, 0, backer), 0);
        assertEq(failingToken.balanceOf(address(failingFixture)), 0);
        assertEq(failingToken.balanceOf(backer), 250e6);
    }

    function test_feeOnTransferContributionIsRejectedAtomically() public {
        FeeOnTransferMockUSDC feeToken = new FeeOnTransferMockUSDC();
        V2FundingFixture feeFixture = new V2FundingFixture(feeToken, FIXTURE_IDENTITY);
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.policyManifest.token = address(feeToken);
        commitment.policyManifest.policyManifestHash =
            feeFixture.policyManifestHashFor(commitment.policyManifest);
        address backer = makeAddr("fee-contribution");
        feeToken.mint(backer, 250e6);

        vm.prank(creator);
        uint256 campaignId = feeFixture.createCampaign(commitment);
        feeToken.setFeeEnabled(true);
        vm.startPrank(backer);
        feeToken.approve(address(feeFixture), 250e6);
        vm.expectRevert(V2FundingFixture.UnsupportedTokenTransfer.selector);
        feeFixture.contribute(campaignId, 0, 250e6);
        vm.stopPrank();

        assertEq(feeFixture.raised(campaignId, 0), 0);
        assertEq(feeFixture.contributionOf(campaignId, 0, backer), 0);
        assertEq(feeToken.balanceOf(address(feeFixture)), 0);
        assertEq(feeToken.balanceOf(backer), 250e6);
    }

    function test_feeOnTransferRefundRollsBackClaimAndCanBeRetried() public {
        FeeOnTransferMockUSDC feeToken = new FeeOnTransferMockUSDC();
        V2FundingFixture feeFixture = new V2FundingFixture(feeToken, FIXTURE_IDENTITY);
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        commitment.policyManifest.token = address(feeToken);
        commitment.policyManifest.policyManifestHash =
            feeFixture.policyManifestHashFor(commitment.policyManifest);
        address backer = makeAddr("fee-refund");
        feeToken.mint(backer, 250e6);

        vm.prank(creator);
        uint256 campaignId = feeFixture.createCampaign(commitment);
        vm.startPrank(backer);
        feeToken.approve(address(feeFixture), 250e6);
        feeFixture.contribute(campaignId, 0, 250e6);
        vm.stopPrank();

        vm.warp(commitment.fundingDeadline[0]);
        feeFixture.finalizeFundingFailure(campaignId, 0);
        feeToken.setFeeEnabled(true);

        vm.prank(backer);
        vm.expectRevert(V2FundingFixture.UnsupportedTokenTransfer.selector);
        feeFixture.claimFundingRefund(campaignId, 0);
        assertFalse(feeFixture.refundClaimed(campaignId, 0, backer));
        assertEq(feeFixture.refunded(campaignId, 0), 0);
        assertEq(feeToken.balanceOf(address(feeFixture)), 250e6);
        assertEq(feeToken.balanceOf(backer), 0);

        feeToken.setFeeEnabled(false);
        vm.prank(backer);
        feeFixture.claimFundingRefund(campaignId, 0);
        assertTrue(feeFixture.refundClaimed(campaignId, 0, backer));
        assertEq(feeFixture.refunded(campaignId, 0), 250e6);
        assertEq(feeToken.balanceOf(address(feeFixture)), 0);
        assertEq(feeToken.balanceOf(backer), 250e6);
    }

    function test_milestoneTwoCannotOpenWithoutPaidMilestoneOne() public {
        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        uint256 campaignId = _createCampaign(commitment);

        vm.expectRevert(V2FundingFixture.PreviousMilestoneNotPaid.selector);
        fixture.openMilestoneFunding(campaignId, 1);
        vm.expectRevert(V2FundingFixture.PreviousMilestoneNotPaid.selector);
        fixture.openMilestoneFunding(campaignId, 0);

        address backer = makeAddr("first-milestone");
        token.mint(backer, 1_000e6);
        vm.startPrank(backer);
        token.approve(address(fixture), 1_000e6);
        fixture.contribute(campaignId, 0, 1_000e6);
        vm.stopPrank();

        vm.expectRevert(V2FundingFixture.PreviousMilestoneNotPaid.selector);
        fixture.openMilestoneFunding(campaignId, 1);
        assertEq(fixture.activeMilestoneId(campaignId), 0);
        assertEq(token.balanceOf(payoutWallet), 0);
    }

    function _createCampaign(V2FundingTypes.CampaignCommitment memory commitment)
        internal
        returns (uint256 campaignId)
    {
        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);
    }

    function _expectInvalid(V2FundingTypes.CampaignCommitment memory commitment) internal {
        vm.prank(creator);
        vm.expectRevert(V2FundingFixture.InvalidCommitment.selector);
        fixture.createCampaign(commitment);
    }

    function _swapMilestones(V2FundingTypes.CampaignCommitment memory commitment) internal pure {
        uint256 uintValue;
        bytes32 bytesValue;

        uintValue = commitment.milestoneId[0];
        commitment.milestoneId[0] = commitment.milestoneId[1];
        commitment.milestoneId[1] = uintValue;
        commitment.milestoneId[0] = 0;
        commitment.milestoneId[1] = 1;

        bytesValue = commitment.deliverableCommitment[0];
        commitment.deliverableCommitment[0] = commitment.deliverableCommitment[1];
        commitment.deliverableCommitment[1] = bytesValue;
        bytesValue = commitment.acceptanceCriteriaHash[0];
        commitment.acceptanceCriteriaHash[0] = commitment.acceptanceCriteriaHash[1];
        commitment.acceptanceCriteriaHash[1] = bytesValue;

        uintValue = commitment.fundingTarget[0];
        commitment.fundingTarget[0] = commitment.fundingTarget[1];
        commitment.fundingTarget[1] = uintValue;
        uintValue = commitment.creatorPayoutBudget[0];
        commitment.creatorPayoutBudget[0] = commitment.creatorPayoutBudget[1];
        commitment.creatorPayoutBudget[1] = uintValue;
        uintValue = commitment.judgeRewardRateBps[0];
        commitment.judgeRewardRateBps[0] = commitment.judgeRewardRateBps[1];
        commitment.judgeRewardRateBps[1] = uintValue;
        uintValue = commitment.judgeRewardUnit[0];
        commitment.judgeRewardUnit[0] = commitment.judgeRewardUnit[1];
        commitment.judgeRewardUnit[1] = uintValue;
        uintValue = commitment.maxReviewReserve[0];
        commitment.maxReviewReserve[0] = commitment.maxReviewReserve[1];
        commitment.maxReviewReserve[1] = uintValue;
        uintValue = commitment.submissionDeadline[0];
        commitment.submissionDeadline[0] = commitment.submissionDeadline[1];
        commitment.submissionDeadline[1] = uintValue;
        uintValue = commitment.fundingDeadline[0];
        commitment.fundingDeadline[0] = commitment.fundingDeadline[1];
        commitment.fundingDeadline[1] = uintValue;
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

    function _expectedCommitmentHash(V2FundingTypes.CampaignCommitment memory commitment)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(FIXTURE_IDENTITY, commitment));
    }
}
