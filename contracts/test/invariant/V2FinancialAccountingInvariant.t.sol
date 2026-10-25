pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import {
    ImmutableV2FinalOutcomeSource,
    V2FinancialAccountingFixture,
    V2FinancialAccountingTypes
} from "../fixtures/V2FinancialAccountingFixture.sol";
import { V2FundingTypes } from "../fixtures/V2FundingFixture.sol";

contract InvariantTransferControlMockUSDC is MockUSDC {
    bool public transfersFail;

    function setTransfersFail(bool value) external {
        transfersFail = value;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (transfersFail) return false;
        return super.transfer(to, amount);
    }
}

contract V2FinancialAccountingHandler is Test {
    InvariantTransferControlMockUSDC public immutable token;
    V2FinancialAccountingFixture public immutable fixture;
    uint256 public immutable campaignId;
    address public immutable payoutWallet;

    address[3] internal judges = [address(0x101), address(0x102), address(0x103)];
    address[2] internal backers = [address(0xA1), address(0xB1)];

    constructor(
        InvariantTransferControlMockUSDC token_,
        V2FinancialAccountingFixture fixture_,
        uint256 campaignId_,
        address payoutWallet_
    ) {
        token = token_;
        fixture = fixture_;
        campaignId = campaignId_;
        payoutWallet = payoutWallet_;
    }

    function settleAgain() external {
        try fixture.settleMilestone(campaignId, 0) { } catch { }
    }

    function claimJudge(uint8 seed, bool failTransfer) external {
        address judge = judges[uint256(seed) % judges.length];
        token.setTransfersFail(failTransfer);
        vm.prank(judge);
        try fixture.claimJudgeReward(campaignId, 0) { } catch { }
        token.setTransfersFail(false);
    }

    function claimCreator(bool failTransfer) external {
        token.setTransfersFail(failTransfer);
        vm.prank(payoutWallet);
        try fixture.claimCreatorPayout(campaignId, 0) { } catch { }
        token.setTransfersFail(false);
    }

    function claimRefund(uint8 seed, bool failTransfer) external {
        address backer = backers[uint256(seed) % backers.length];
        token.setTransfersFail(failTransfer);
        vm.prank(backer);
        try fixture.claimSettlementRefund(campaignId, 0) { } catch { }
        token.setTransfersFail(false);
    }

    function openMilestoneTwo() external {
        try fixture.openMilestoneFunding(campaignId, 1) { } catch { }
    }
}

contract V2FinancialAccountingInvariantTest is Test {
    uint256 internal constant LOCAL_CHAIN_ID = 31339;
    bytes32 internal constant ACCOUNTING_IDENTITY =
        keccak256("fundtogether-vnext-v2-pr2-financial-accounting-fixture");
    address internal constant CREATOR = address(0xC001);
    address internal constant PAYOUT = address(0xC002);

    InvariantTransferControlMockUSDC internal passToken;
    InvariantTransferControlMockUSDC internal failToken;
    InvariantTransferControlMockUSDC internal protocolToken;
    V2FinancialAccountingFixture internal passFixture;
    V2FinancialAccountingFixture internal failFixture;
    V2FinancialAccountingFixture internal protocolFixture;
    uint256 internal passCampaign;
    uint256 internal failCampaign;
    uint256 internal protocolCampaign;

    function setUp() public {
        vm.chainId(LOCAL_CHAIN_ID);
        (passToken, passFixture, passCampaign) =
            _scenario(V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS, true, true);
        (failToken, failFixture, failCampaign) =
            _scenario(V2FinancialAccountingTypes.FinalOutcome.VERDICT_FAIL, true, false);
        (protocolToken, protocolFixture, protocolCampaign) =
            _scenario(V2FinancialAccountingTypes.FinalOutcome.PROTOCOL_FAIL, false, false);

        targetContract(
            address(new V2FinancialAccountingHandler(passToken, passFixture, passCampaign, PAYOUT))
        );
        targetContract(
            address(new V2FinancialAccountingHandler(failToken, failFixture, failCampaign, PAYOUT))
        );
        targetContract(
            address(
                new V2FinancialAccountingHandler(
                    protocolToken, protocolFixture, protocolCampaign, PAYOUT
                )
            )
        );
    }

    function invariant_milestoneConservationAlwaysHolds() public view {
        _assertConservation(passToken, passFixture, passCampaign);
        _assertConservation(failToken, failFixture, failCampaign);
        _assertConservation(protocolToken, protocolFixture, protocolCampaign);
    }

    function invariant_fundedLiabilitiesNeverExceedPhysicalCustody() public view {
        _assertSolvent(passFixture, passCampaign);
        _assertSolvent(failFixture, failCampaign);
        _assertSolvent(protocolFixture, protocolCampaign);
    }

    function invariant_rewardAndCreatorBoundsHold() public view {
        _assertBounds(passFixture, passCampaign, true, 30e6);
        _assertBounds(failFixture, failCampaign, false, 30e6);
        _assertBounds(protocolFixture, protocolCampaign, false, 0);
    }

    function invariant_invalidCourtEarnsNoServiceReward() public view {
        assertEq(protocolFixture.judgePaid(protocolCampaign, 0), 0);
        assertEq(
            protocolFixture.judgeRewardEntitlement(keccak256("invariant-case"), address(0x101)), 0
        );
    }

    function invariant_claimsCannotTransferMoreThanTheirFrozenEntitlements() public view {
        _assertClaimBounds(passToken, passFixture, passCampaign, 30e6);
        _assertClaimBounds(failToken, failFixture, failCampaign, 970e6);
        _assertClaimBounds(protocolToken, protocolFixture, protocolCampaign, 1_000e6);
    }

    function invariant_milestoneTwoRequiresSuccessfulCreatorPayout() public view {
        _assertSequential(passFixture, passCampaign, true);
        _assertSequential(failFixture, failCampaign, false);
        _assertSequential(protocolFixture, protocolCampaign, false);
    }

    function _assertConservation(
        InvariantTransferControlMockUSDC token,
        V2FinancialAccountingFixture fixture,
        uint256 campaignId
    ) internal view {
        uint256 raised = fixture.raised(campaignId, 0);
        uint256 creatorPaid = fixture.creatorPaid(campaignId, 0);
        uint256 judgePaid = fixture.judgePaid(campaignId, 0);
        uint256 refunded =
            fixture.refunded(campaignId, 0) + fixture.settlementRefunded(campaignId, 0);
        assertEq(
            raised, creatorPaid + judgePaid + refunded + fixture.escrowRemaining(campaignId, 0)
        );
        assertEq(
            judgePaid,
            fixture.judgeRewardClaimed(campaignId, 0) + fixture.judgeRewardUnclaimed(campaignId, 0)
        );
        assertEq(fixture.physicalCustody(campaignId, 0), token.balanceOf(address(fixture)));
    }

    function _assertSolvent(V2FinancialAccountingFixture fixture, uint256 campaignId)
        internal
        view
    {
        assertLe(fixture.fundedLiabilities(campaignId, 0), fixture.physicalCustody(campaignId, 0));
    }

    function _assertBounds(
        V2FinancialAccountingFixture fixture,
        uint256 campaignId,
        bool creatorMayBePaid,
        uint256 expectedJudgePaid
    ) internal view {
        assertEq(fixture.judgePaid(campaignId, 0), expectedJudgePaid);
        assertLe(fixture.judgePaid(campaignId, 0), 60e6);
        assertLe(fixture.creatorPaid(campaignId, 0), 940e6);
        if (fixture.creatorPaid(campaignId, 0) > 0) {
            assertTrue(creatorMayBePaid);
            assertEq(
                uint256(fixture.finalOutcome(campaignId, 0)),
                uint256(V2FinancialAccountingTypes.FinalOutcome.FINAL_PASS)
            );
        }
    }

    function _assertClaimBounds(
        InvariantTransferControlMockUSDC token,
        V2FinancialAccountingFixture fixture,
        uint256 campaignId,
        uint256 refundMaximum
    ) internal view {
        assertLe(token.balanceOf(address(0x101)), 10e6);
        assertLe(token.balanceOf(address(0x102)), 10e6);
        assertLe(token.balanceOf(address(0x103)), 10e6);
        assertLe(token.balanceOf(PAYOUT), 940e6);
        assertLe(fixture.settlementRefunded(campaignId, 0), refundMaximum);
    }

    function _assertSequential(
        V2FinancialAccountingFixture fixture,
        uint256 campaignId,
        bool finalPass
    ) internal view {
        if (fixture.activeMilestoneId(campaignId) == 1) {
            assertTrue(finalPass);
            assertEq(fixture.creatorPaid(campaignId, 0), 940e6);
            assertEq(
                uint256(fixture.milestoneState(campaignId, 0)),
                uint256(V2FundingTypes.MilestoneState.PAID)
            );
        }
    }

    function _scenario(V2FinancialAccountingTypes.FinalOutcome outcome, bool validCourt, bool pass)
        internal
        returns (
            InvariantTransferControlMockUSDC token,
            V2FinancialAccountingFixture fixture,
            uint256 campaignId
        )
    {
        token = new InvariantTransferControlMockUSDC();
        V2FinancialAccountingTypes.FinalizedTranscript memory transcript =
            _transcript(outcome, validCourt, pass);
        ImmutableV2FinalOutcomeSource source = new ImmutableV2FinalOutcomeSource(transcript);
        fixture = new V2FinancialAccountingFixture(token, ACCOUNTING_IDENTITY, source);
        V2FundingTypes.CampaignCommitment memory commitment = _commitment(token, fixture);
        vm.prank(CREATOR);
        campaignId = fixture.createCampaign(commitment);
        _contribute(token, fixture, campaignId, address(0xA1), 400e6);
        _contribute(token, fixture, campaignId, address(0xB1), 600e6);
        fixture.settleMilestone(campaignId, 0);
    }

    function _contribute(
        InvariantTransferControlMockUSDC token,
        V2FinancialAccountingFixture fixture,
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

    function _transcript(
        V2FinancialAccountingTypes.FinalOutcome outcome,
        bool validCourt,
        bool pass
    ) internal pure returns (V2FinancialAccountingTypes.FinalizedTranscript memory transcript) {
        transcript.deploymentIdentity = ACCOUNTING_IDENTITY;
        transcript.caseId = keccak256("invariant-case");
        transcript.campaignId = 1;
        transcript.milestoneId = 0;
        transcript.finalized = true;
        transcript.finalOutcome = outcome;
        transcript.court1 = V2FinancialAccountingTypes.CourtTranscript({
            present: true,
            valid: validCourt,
            pass: pass,
            courtId: keccak256("invariant-court-1"),
            attemptIndex: 0,
            judges: [address(0x101), address(0x102), address(0x103)]
        });
    }

    function _commitment(MockUSDC token, V2FinancialAccountingFixture fixture)
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
            creator: CREATOR,
            payoutWallet: PAYOUT,
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
            commitment.deliverableCommitment[i] = keccak256(abi.encode("invariant-deliverable", i));
            commitment.acceptanceCriteriaHash[i] = keccak256(abi.encode("invariant-criteria", i));
            commitment.fundingTarget[i] = 1_000e6;
            commitment.creatorPayoutBudget[i] = 940e6;
            commitment.judgeRewardRateBps[i] = 100;
            commitment.judgeRewardUnit[i] = 10e6;
            commitment.maxReviewReserve[i] = 60e6;
            commitment.fundingDeadline[i] = block.timestamp + 7 days + i * 14 days;
            commitment.submissionDeadline[i] = block.timestamp + 14 days + i * 14 days;
        }
    }
}
