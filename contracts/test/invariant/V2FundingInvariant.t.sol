pragma solidity 0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { V2FundingFixture, V2FundingTypes } from "../fixtures/V2FundingFixture.sol";

contract V2FundingInvariantHandler is Test {
    uint256 internal constant TARGET = 1_000e6;

    MockUSDC public immutable token;
    V2FundingFixture public immutable fixture;
    uint256 public immutable campaignId;
    uint256 public immutable fundingDeadline;
    address public immutable creator;
    address public immutable backerOne;
    address public immutable backerTwo;
    address public immutable payoutWallet;

    constructor() {
        creator = makeAddr("invariant-creator");
        backerOne = makeAddr("invariant-backer-one");
        backerTwo = makeAddr("invariant-backer-two");
        payoutWallet = makeAddr("invariant-payout");
        token = new MockUSDC();
        fixture =
            new V2FundingFixture(token, keccak256("fundtogether-vnext-v2-pr1-funding-fixture"));

        V2FundingTypes.CampaignCommitment memory commitment = _validCommitment();
        vm.prank(creator);
        campaignId = fixture.createCampaign(commitment);
        fundingDeadline = commitment.fundingDeadline[0];
    }

    function contribute(uint256 actorSeed, uint256 rawAmount) external {
        if (fixture.milestoneState(campaignId, 0) != V2FundingTypes.MilestoneState.FUNDING_OPEN) {
            return;
        }

        address backer = actorSeed % 2 == 0 ? backerOne : backerTwo;
        uint256 raised = fixture.raised(campaignId, 0);
        if (raised >= TARGET) return;

        uint256 amount = bound(rawAmount, 1, TARGET - raised + 1);
        token.mint(backer, amount);
        vm.startPrank(backer);
        token.approve(address(fixture), amount);
        try fixture.contribute(campaignId, 0, amount) { } catch { }
        vm.stopPrank();
    }

    function finalizeFailure() external {
        if (fixture.milestoneState(campaignId, 0) != V2FundingTypes.MilestoneState.FUNDING_OPEN) {
            return;
        }
        vm.warp(fundingDeadline);
        try fixture.finalizeFundingFailure(campaignId, 0) { } catch { }
    }

    function claimRefund(uint256 actorSeed) external {
        address backer = actorSeed % 2 == 0 ? backerOne : backerTwo;
        vm.prank(backer);
        try fixture.claimFundingRefund(campaignId, 0) { } catch { }
    }

    function attemptOpenMilestoneTwo() external {
        try fixture.openMilestoneFunding(campaignId, 1) { } catch { }
    }

    function _validCommitment()
        internal
        view
        returns (V2FundingTypes.CampaignCommitment memory commitment)
    {
        commitment.policyManifest = V2FundingTypes.PolicyManifest({
            commitmentSchemaVersion: "FTV2-COMMIT-2",
            policyVersion: "fundtogether-vnext-v2-pr0-remediation-20261025",
            policyManifestHash: keccak256("invariant-pr1-policy-manifest"),
            chainId: block.chainid,
            token: address(token),
            creator: creator,
            payoutWallet: payoutWallet,
            publicationPolicy: "PUBLICATION_PRE_FUND_V1",
            evidenceDisclosurePolicy: "ReviewReferenceV1",
            daoFormulaVersion: "CWQ-1",
            daoConflictPolicyVersion: "DAO-TEMPORAL-1",
            resetPolicyVersion: "CCPS-1",
            rewardRateBps: 100,
            basisPointsDenominator: 10_000,
            referenceCourtSize: 3,
            maxValidCourts: 2,
            maxResetsPerCourt: 1,
            maxResetsPerCase: 2
        });

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
            commitment.fundingTarget[i] = TARGET + i * 100e6;
            commitment.creatorPayoutBudget[i] = 940e6 + i * 100e6;
            commitment.judgeRewardRateBps[i] = 100;
            commitment.judgeRewardUnit[i] = 10e6;
            commitment.maxReviewReserve[i] = 60e6;
            commitment.fundingDeadline[i] = block.timestamp + 7 days + i * 14 days;
            commitment.submissionDeadline[i] = block.timestamp + 14 days + i * 14 days;
        }
    }
}

contract V2FundingInvariantTest is StdInvariant, Test {
    V2FundingInvariantHandler private handler;

    function setUp() public {
        vm.chainId(31339);
        handler = new V2FundingInvariantHandler();
        targetContract(address(handler));
    }

    function invariant_raisedNeverExceedsActiveTarget() public view {
        assertLe(handler.fixture().raised(handler.campaignId(), 0), 1_000e6);
    }

    function invariant_ledgerMatchesCustodyAndRefunds() public view {
        uint256 raised = handler.fixture().raised(handler.campaignId(), 0);
        uint256 refunded = handler.fixture().refunded(handler.campaignId(), 0);
        uint256 snapshot = handler.fixture().refundSnapshot(handler.campaignId(), 0);

        assertLe(refunded, snapshot);
        assertLe(snapshot, raised);
        assertEq(handler.token().balanceOf(address(handler.fixture())), raised - refunded);
        assertEq(
            raised,
            handler.fixture().contributionOf(handler.campaignId(), 0, handler.backerOne())
                + handler.fixture().contributionOf(handler.campaignId(), 0, handler.backerTwo())
        );
    }

    function invariant_stopLineAndPayoutBoundaryHold() public view {
        assertEq(handler.fixture().activeMilestoneId(handler.campaignId()), 0);
        assertEq(
            uint256(handler.fixture().milestoneState(handler.campaignId(), 1)),
            uint256(V2FundingTypes.MilestoneState.DECLARED)
        );
        assertTrue(
            handler.fixture().milestoneState(handler.campaignId(), 0)
                != V2FundingTypes.MilestoneState.PAID
        );
        assertEq(handler.token().balanceOf(handler.payoutWallet()), 0);
    }
}
