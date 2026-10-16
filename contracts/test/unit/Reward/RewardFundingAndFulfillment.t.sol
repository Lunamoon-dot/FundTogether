pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { FundTogetherReward } from "../../../src/reward/FundTogetherReward.sol";
import { RewardTypes as T } from "../../../src/reward/RewardTypes.sol";

contract RewardFundingAndFulfillmentTest is Test {
    MockUSDC private token;
    FundTogetherReward private rewardEscrow;
    address private creator = makeAddr("creator");
    address private resolver = makeAddr("resolver");
    address private backupResolver = makeAddr("backup-resolver");
    address private backer1 = makeAddr("backer1");
    address private backer2 = makeAddr("backer2");

    function setUp() public {
        token = new MockUSDC();
        rewardEscrow = new FundTogetherReward(
            address(token), resolver, backupResolver, keccak256("reward-pivot-v1")
        );
        token.mint(backer1, 10_000e6);
        token.mint(backer2, 10_000e6);
        vm.prank(backer1);
        token.approve(address(rewardEscrow), type(uint256).max);
        vm.prank(backer2);
        token.approve(address(rewardEscrow), type(uint256).max);
    }

    function _createSampleCampaign(uint256 goal) internal returns (uint256 id) {
        T.TierView[] memory tiers = new T.TierView[](2);
        tiers[0] = T.TierView({ price: 50e6, maxQuantity: 40, pledgedQuantity: 0, isDigital: true }); // Digital Tier
        tiers[1] =
            T.TierView({ price: 100e6, maxQuantity: 30, pledgedQuantity: 0, isDigital: false }); // Book Tier
        vm.prank(creator);
        id = rewardEscrow.createCampaign(keccak256("comic-campaign"), goal, 30 days, tiers);
    }

    function test_campaignCreationAndPledgeWithTiers() public {
        uint256 id = _createSampleCampaign(4_000e6);
        assertEq(rewardEscrow.tierCount(id), 2);

        // Backer 1 pledges 2 digital tiers = 100 USDC
        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 2);
        assertEq(rewardEscrow.contributions(id, backer1), 100e6);
        assertEq(rewardEscrow.tierPledges(id, 0, backer1), 2);

        T.TierView memory tier0 = rewardEscrow.tier(id, 0);
        assertEq(tier0.pledgedQuantity, 2);

        // Backer 2 pledges 1 physical book tier = 100 USDC
        vm.prank(backer2);
        rewardEscrow.pledge(id, 1, 1);
        assertEq(rewardEscrow.contributions(id, backer2), 100e6);
        assertEq(rewardEscrow.tierPledges(id, 1, backer2), 1);

        T.CampaignView memory c = rewardEscrow.campaign(id);
        assertEq(c.contributed, 200e6);
        assertEq(c.available, 200e6);
        assertEq(token.balanceOf(address(rewardEscrow)), 200e6);
    }

    function test_revertWhenTierSoldOut() public {
        uint256 id = _createSampleCampaign(4_000e6);
        // Tier 1 maxQuantity = 30
        vm.prank(backer1);
        rewardEscrow.pledge(id, 1, 30);

        // Next pledge should revert
        vm.prank(backer2);
        vm.expectRevert(FundTogetherReward.TierSoldOut.selector);
        rewardEscrow.pledge(id, 1, 1);
    }

    function test_revertWhenDisbursementRequestExceeds50PercentGoal() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);

        // Fully fund campaign
        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 40); // 2,000 USDC
        vm.prank(backer2);
        rewardEscrow.pledge(id, 1, 20); // 2,000 USDC

        vm.prank(resolver);
        rewardEscrow.activateCampaign(id, keccak256("eligibility-proof"));

        // Creator attempts to request 2,001 USDC (> 50% of 4,000 USDC)
        vm.prank(creator);
        vm.expectRevert(FundTogetherReward.InvalidInput.selector);
        rewardEscrow.submitDisbursementRequest(id, keccak256("excessive-req"), creator, 2_001e6);
    }

    function test_underfundedCampaignAllows100PercentRefund() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);

        // Backer 1 pledges 500 USDC (not reaching 4,000 goal)
        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 10);

        // Fast forward past funding deadline
        vm.warp(block.timestamp + 31 days);

        rewardEscrow.finalizeFundingFailure(id);

        uint256 balanceBefore = token.balanceOf(backer1);
        vm.prank(backer1);
        rewardEscrow.claimRefund(id);
        uint256 balanceAfter = token.balanceOf(backer1);

        assertEq(
            balanceAfter - balanceBefore,
            500e6,
            "Backer must receive 100% refund on underfunded campaign"
        );
    }

    function test_happyPathFromPledgeToProductionAndCompletion() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);

        // 1. Backers pledge full amount
        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 40); // 2,000 USDC
        vm.prank(backer2);
        rewardEscrow.pledge(id, 1, 20); // 2,000 USDC

        // 2. Resolver activates campaign
        vm.prank(resolver);
        rewardEscrow.activateCampaign(id, keccak256("comic-eligibility"));

        // 3. Creator requests print deposit 1,500 USDC (37.5% <= 50%)
        bytes32 reqHash = keccak256("req-print-deposit");
        vm.prank(creator);
        uint256 reqId = rewardEscrow.submitDisbursementRequest(id, reqHash, creator, 1_500e6);

        // 4. Resolver approves and disburses
        vm.prank(resolver);
        rewardEscrow.approveAndDisburse(id, reqId, reqHash);
        assertEq(token.balanceOf(creator), 1_500e6);

        // 5. Creator submits candidate expenditure with invoice hash
        bytes32 invoiceHash = keccak256("vat-invoice-printing-press");
        vm.prank(resolver);
        rewardEscrow.candidateExpenditure(id, reqId, 1_500e6, invoiceHash);

        // 6. Challenge window passes -> finalize expenditure
        vm.warp(block.timestamp + 3 days + 1);
        rewardEscrow.finalizeExpenditure(id, reqId);

        // 7. Books are printed -> Resolver records production verified
        bytes32 proofOfPrint = keccak256("proof-of-printed-comics-batch");
        vm.prank(resolver);
        rewardEscrow.recordProductionVerified(id, proofOfPrint);

        T.CampaignView memory c = rewardEscrow.campaign(id);
        assertEq(uint8(c.state), uint8(T.CampaignState.PRODUCTION_VERIFIED));
        assertEq(c.productionReportHash, proofOfPrint);

        // 8. Attempting to complete campaign prematurely (before fulfillment verified) must revert!
        vm.prank(creator);
        vm.expectRevert(FundTogetherReward.WrongState.selector);
        rewardEscrow.completeCampaign(id);

        // 9. Resolver verifies physical delivery & fulfillment completion
        bytes32 proofOfFulfillment = keccak256("proof-of-all-books-shipped-and-delivered");
        vm.prank(resolver);
        rewardEscrow.recordFulfillmentComplete(id, proofOfFulfillment);

        c = rewardEscrow.campaign(id);
        assertEq(uint8(c.state), uint8(T.CampaignState.FULFILLMENT_COMPLETE));
        assertEq(c.fulfillmentReportHash, proofOfFulfillment);

        // 10. Now campaign can be finalized/completed
        vm.prank(creator);
        rewardEscrow.completeCampaign(id);
        assertEq(uint8(rewardEscrow.campaign(id).state), uint8(T.CampaignState.COMPLETED));
    }

    function test_disputeDuringChallengeBlocksSettlementUntilResolverUphold() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 40);
        vm.prank(backer2);
        rewardEscrow.pledge(id, 1, 20);

        vm.prank(resolver);
        rewardEscrow.activateCampaign(id, keccak256("eligibility"));

        bytes32 reqHash = keccak256("req-1");
        vm.prank(creator);
        uint256 reqId = rewardEscrow.submitDisbursementRequest(id, reqHash, creator, 1_000e6);
        vm.prank(resolver);
        rewardEscrow.approveAndDisburse(id, reqId, reqHash);

        vm.prank(resolver);
        rewardEscrow.candidateExpenditure(id, reqId, 1_000e6, keccak256("receipt"));

        // Backer 1 opens dispute during challenge window
        vm.prank(backer1);
        rewardEscrow.openDisputeCase(id, reqId, keccak256("dispute-invalid-print-cost"));

        // Warp past original challenge window
        vm.warp(block.timestamp + 4 days);

        // Finalize expenditure must revert while dispute is open
        vm.expectRevert(FundTogetherReward.WrongState.selector);
        rewardEscrow.finalizeExpenditure(id, reqId);

        // Resolver upholds case
        vm.prank(resolver);
        rewardEscrow.upholdDisputeCase(id, reqId, keccak256("resolver-settlement"));

        // Warp past new challenge window
        vm.warp(block.timestamp + 4 days);

        // Now finalize succeeds
        rewardEscrow.finalizeExpenditure(id, reqId);
        assertEq(
            uint8(rewardEscrow.request(id, reqId).state), uint8(T.RequestState.FINANCIALLY_SETTLED)
        );
    }

    function test_surplusReturnFundsIncreasesCustody() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 40);
        vm.prank(backer2);
        rewardEscrow.pledge(id, 1, 20);

        vm.prank(resolver);
        rewardEscrow.activateCampaign(id, keccak256("eligibility"));

        bytes32 reqHash = keccak256("req-1");
        vm.prank(creator);
        uint256 reqId = rewardEscrow.submitDisbursementRequest(id, reqHash, creator, 1_000e6);
        vm.prank(resolver);
        rewardEscrow.approveAndDisburse(id, reqId, reqHash);

        // Creator spent only 800 USDC, returns 200 USDC surplus
        vm.prank(creator);
        token.approve(address(rewardEscrow), 200e6);
        vm.prank(creator);
        rewardEscrow.returnFunds(id, reqId, 200e6);

        T.CampaignView memory c = rewardEscrow.campaign(id);
        assertEq(c.available, 3_200e6, "Available must be 3,000 + 200 returned = 3,200 USDC");
        assertEq(rewardEscrow.request(id, reqId).returned, 200e6);
    }

    function test_windDownAfterExecutionHorizonRefundsProportionalCustody() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        // Backer 1: 3,000 USDC (75%), Backer 2: 1,000 USDC (25%)
        vm.prank(backer1);
        rewardEscrow.pledge(id, 1, 30); // 3,000 USDC
        vm.prank(backer2);
        rewardEscrow.pledge(id, 0, 20); // 1,000 USDC

        vm.prank(resolver);
        rewardEscrow.activateCampaign(id, keccak256("eligibility"));

        // Creator disbursed 1,000 USDC (leaving 3,000 in Escrow)
        bytes32 reqHash = keccak256("req-1");
        vm.prank(creator);
        uint256 reqId = rewardEscrow.submitDisbursementRequest(id, reqHash, creator, 1_000e6);
        vm.prank(resolver);
        rewardEscrow.approveAndDisburse(id, reqId, reqHash);
        vm.prank(resolver);
        rewardEscrow.candidateExpenditure(id, reqId, 1_000e6, keccak256("receipt"));
        vm.warp(block.timestamp + 4 days);
        rewardEscrow.finalizeExpenditure(id, reqId);

        // Fast forward past execution horizon (180 days)
        vm.warp(block.timestamp + 181 days);

        rewardEscrow.startWindDown(id);

        // Backer 1 claims 75% of remaining 3,000 USDC = 2,250 USDC
        uint256 b1Before = token.balanceOf(backer1);
        vm.prank(backer1);
        rewardEscrow.claimRefund(id);
        uint256 b1After = token.balanceOf(backer1);
        assertEq(b1After - b1Before, 2_250e6);

        // Backer 2 claims 25% of remaining 3,000 USDC = 750 USDC
        uint256 b2Before = token.balanceOf(backer2);
        vm.prank(backer2);
        rewardEscrow.claimRefund(id);
        uint256 b2After = token.balanceOf(backer2);
        assertEq(b2After - b2Before, 750e6);
    }

    function testFuzz_rewardEscrowMaintainsExactCustody(uint96 rawGoal, uint96 rawRequest) public {
        uint256 goal = bound(uint256(rawGoal), 4e6, 4_000e6);
        uint256 requestAmount = bound(uint256(rawRequest), 1, goal / 2);

        token.mint(backer1, goal);
        T.TierView[] memory tiers = new T.TierView[](1);
        tiers[0] = T.TierView({ price: goal, maxQuantity: 1, pledgedQuantity: 0, isDigital: true });

        vm.prank(creator);
        uint256 id = rewardEscrow.createCampaign(keccak256("fuzz-campaign"), goal, 1 days, tiers);

        vm.prank(backer1);
        rewardEscrow.pledge(id, 0, 1);

        vm.prank(resolver);
        rewardEscrow.activateCampaign(id, keccak256("eligibility"));

        vm.prank(creator);
        uint256 reqId = rewardEscrow.submitDisbursementRequest(
            id, keccak256("fuzz-req"), creator, requestAmount
        );

        vm.prank(resolver);
        rewardEscrow.approveAndDisburse(id, reqId, keccak256("fuzz-req"));

        T.CampaignView memory c = rewardEscrow.campaign(id);
        assertEq(
            token.balanceOf(address(rewardEscrow)),
            c.available,
            "Escrow token balance must match available pool"
        );
        assertEq(
            c.available + c.grossPaid, c.contributed, "Contributed must equal available + grossPaid"
        );
    }
}
