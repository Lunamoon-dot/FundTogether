pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { FundTogetherHistoricalCampaign } from "../../../src/campaigns/FundTogetherHistoricalCampaign.sol";
import { HistoricalCampaignTypes as T } from "../../../src/campaigns/HistoricalCampaignTypes.sol";

contract HistoricalCampaignFundingAndFulfillmentTest is Test {
    MockUSDC private token;
    FundTogetherHistoricalCampaign private historicalCampaign;
    address private creator = makeAddr("creator");
    address private resolver = makeAddr("resolver");
    address private backupResolver = makeAddr("backup-resolver");
    address private backer1 = makeAddr("backer1");
    address private backer2 = makeAddr("backer2");

    function setUp() public {
        token = new MockUSDC();
        historicalCampaign = new FundTogetherHistoricalCampaign(
            address(token), resolver, backupResolver, keccak256("campaign-pivot-v1")
        );
        token.mint(backer1, 10_000e6);
        token.mint(backer2, 10_000e6);
        vm.prank(backer1);
        token.approve(address(historicalCampaign), type(uint256).max);
        vm.prank(backer2);
        token.approve(address(historicalCampaign), type(uint256).max);
    }

    function _createSampleCampaign(uint256 goal) internal returns (uint256 id) {
        T.TierView[] memory tiers = new T.TierView[](2);
        tiers[0] = T.TierView({ price: 50e6, maxQuantity: 40, pledgedQuantity: 0, isDigital: true }); // Digital Tier
        tiers[1] =
            T.TierView({ price: 100e6, maxQuantity: 30, pledgedQuantity: 0, isDigital: false }); // Book Tier
        bytes32 sampleTiersHash = historicalCampaign.tiersHash(tiers);
        vm.prank(resolver);
        historicalCampaign.approveCampaign(
            creator,
            keccak256("comic-campaign"),
            goal,
            30 days,
            sampleTiersHash
        );
        vm.prank(creator);
        id = historicalCampaign.createCampaign(keccak256("comic-campaign"), goal, 30 days, tiers);
    }

    function test_revertWhenCampaignIsNotResolverApproved() public {
        T.TierView[] memory tiers = new T.TierView[](1);
        tiers[0] = T.TierView({ price: 50e6, maxQuantity: 1, pledgedQuantity: 0, isDigital: true });

        vm.prank(creator);
        vm.expectRevert(FundTogetherHistoricalCampaign.NotApproved.selector);
        historicalCampaign.createCampaign(keccak256("unapproved"), 50e6, 1 days, tiers);
    }

    function test_campaignCreationAndPledgeWithTiers() public {
        uint256 id = _createSampleCampaign(4_000e6);
        assertEq(historicalCampaign.tierCount(id), 2);

        // Backer 1 pledges 2 digital tiers = 100 USDC
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 2);
        assertEq(historicalCampaign.contributions(id, backer1), 100e6);
        assertEq(historicalCampaign.tierPledges(id, 0, backer1), 2);

        T.TierView memory tier0 = historicalCampaign.tier(id, 0);
        assertEq(tier0.pledgedQuantity, 2);

        // Backer 2 pledges 1 physical book tier = 100 USDC
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 1);
        assertEq(historicalCampaign.contributions(id, backer2), 100e6);
        assertEq(historicalCampaign.tierPledges(id, 1, backer2), 1);

        T.CampaignView memory c = historicalCampaign.campaign(id);
        assertEq(c.contributed, 200e6);
        assertEq(c.available, 200e6);
        assertEq(token.balanceOf(address(historicalCampaign)), 200e6);
    }

    function test_revertWhenTierSoldOut() public {
        uint256 id = _createSampleCampaign(4_000e6);
        // Tier 1 maxQuantity = 30
        vm.prank(backer1);
        historicalCampaign.pledge(id, 1, 30);

        // Next pledge should revert
        vm.prank(backer2);
        vm.expectRevert(FundTogetherHistoricalCampaign.TierSoldOut.selector);
        historicalCampaign.pledge(id, 1, 1);
    }

    function test_revertWhenDisbursementRequestExceeds50PercentGoal() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);

        // Fully fund campaign
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 40); // 2,000 USDC
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 20); // 2,000 USDC

        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility-proof"));

        // Creator attempts to request 2,001 USDC (> 50% of 4,000 USDC)
        vm.prank(creator);
        vm.expectRevert(FundTogetherHistoricalCampaign.InvalidInput.selector);
        historicalCampaign.submitDisbursementRequest(id, keccak256("excessive-req"), creator, 2_001e6);
    }

    function test_underfundedCampaignAllows100PercentRefund() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);

        // Backer 1 pledges 500 USDC (not reaching 4,000 goal)
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 10);

        // Fast forward past funding deadline
        vm.warp(block.timestamp + 31 days);

        historicalCampaign.finalizeFundingFailure(id);

        uint256 balanceBefore = token.balanceOf(backer1);
        vm.prank(backer1);
        historicalCampaign.claimRefund(id);
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
        historicalCampaign.pledge(id, 0, 40); // 2,000 USDC
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 20); // 2,000 USDC

        // 2. Resolver activates campaign
        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("comic-eligibility"));

        // 3. Creator requests print deposit 1,500 USDC (37.5% <= 50%)
        bytes32 reqHash = keccak256("req-print-deposit");
        vm.prank(creator);
        uint256 reqId = historicalCampaign.submitDisbursementRequest(id, reqHash, creator, 1_500e6);

        // 4. Resolver approves and disburses
        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, reqId, reqHash);
        assertEq(token.balanceOf(creator), 1_500e6);

        // 5. Creator submits candidate expenditure with invoice hash
        bytes32 invoiceHash = keccak256("vat-invoice-printing-press");
        vm.prank(resolver);
        historicalCampaign.candidateExpenditure(id, reqId, 1_500e6, invoiceHash);

        // 6. Challenge window passes -> finalize expenditure
        vm.warp(block.timestamp + 3 days + 1);
        historicalCampaign.finalizeExpenditure(id, reqId);

        // The historical contract may complete only after every escrowed token has
        // gone through an explicit disbursement path; no residual beneficiary is invented.
        bytes32 secondReqHash = keccak256("req-print-balance");
        vm.prank(creator);
        uint256 secondReqId = historicalCampaign.submitDisbursementRequest(id, secondReqHash, creator, 2_000e6);
        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, secondReqId, secondReqHash);
        vm.prank(resolver);
        historicalCampaign.candidateExpenditure(id, secondReqId, 2_000e6, keccak256("balance-invoice"));
        vm.warp(block.timestamp + 3 days + 1);
        historicalCampaign.finalizeExpenditure(id, secondReqId);

        bytes32 finalReqHash = keccak256("req-final-balance");
        vm.prank(creator);
        uint256 finalReqId = historicalCampaign.submitDisbursementRequest(id, finalReqHash, creator, 500e6);
        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, finalReqId, finalReqHash);
        vm.prank(resolver);
        historicalCampaign.candidateExpenditure(id, finalReqId, 500e6, keccak256("final-invoice"));
        vm.warp(block.timestamp + 3 days + 1);
        historicalCampaign.finalizeExpenditure(id, finalReqId);
        assertEq(historicalCampaign.campaign(id).available, 0);

        // 7. Books are printed -> Resolver records production verified
        bytes32 proofOfPrint = keccak256("proof-of-printed-comics-batch");
        vm.prank(resolver);
        historicalCampaign.recordProductionVerified(id, proofOfPrint);

        T.CampaignView memory c = historicalCampaign.campaign(id);
        assertEq(uint8(c.state), uint8(T.CampaignState.PRODUCTION_VERIFIED));
        assertEq(c.productionReportHash, proofOfPrint);

        // 8. Attempting to complete campaign prematurely (before fulfillment verified) must revert!
        vm.prank(creator);
        vm.expectRevert(FundTogetherHistoricalCampaign.WrongState.selector);
        historicalCampaign.completeCampaign(id);

        // 9. Resolver verifies physical delivery & fulfillment completion
        bytes32 proofOfFulfillment = keccak256("proof-of-all-books-shipped-and-delivered");
        vm.prank(resolver);
        historicalCampaign.recordFulfillmentComplete(id, proofOfFulfillment);

        c = historicalCampaign.campaign(id);
        assertEq(uint8(c.state), uint8(T.CampaignState.FULFILLMENT_COMPLETE));
        assertEq(c.fulfillmentReportHash, proofOfFulfillment);

        // 10. Now campaign can be finalized/completed
        vm.prank(creator);
        historicalCampaign.completeCampaign(id);
        assertEq(uint8(historicalCampaign.campaign(id).state), uint8(T.CampaignState.COMPLETED));
    }

    function test_backupTakeoversAndStaleRequestExpiryPreserveRefundReachability() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 40);
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 20);

        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility"));

        bytes32 firstRequestHash = keccak256("request-one");
        vm.prank(creator);
        uint256 firstRequestId = historicalCampaign.submitDisbursementRequest(
            id, firstRequestHash, creator, 1_000e6
        );
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(backupResolver);
        historicalCampaign.takeOverRequestApproval(id, firstRequestId, keccak256("approval-timeout"));
        vm.prank(backupResolver);
        vm.expectRevert(FundTogetherHistoricalCampaign.WrongState.selector);
        historicalCampaign.takeOverRequestApproval(id, firstRequestId, keccak256("duplicate"));
        vm.prank(backupResolver);
        historicalCampaign.approveAndDisburse(id, firstRequestId, firstRequestHash);

        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(backupResolver);
        historicalCampaign.takeOverExpenditureReview(id, firstRequestId, keccak256("expenditure-timeout"));
        vm.prank(backupResolver);
        historicalCampaign.candidateExpenditure(id, firstRequestId, 1_000e6, keccak256("invoice"));

        vm.prank(backer1);
        historicalCampaign.openDisputeCase(id, firstRequestId, keccak256("dispute"));
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(backupResolver);
        historicalCampaign.takeOverDisputeCase(id, firstRequestId, keccak256("dispute-timeout"));
        vm.prank(backupResolver);
        historicalCampaign.upholdDisputeCase(id, firstRequestId, keccak256("decision"));
        vm.warp(block.timestamp + 3 days + 1);
        historicalCampaign.finalizeExpenditure(id, firstRequestId);

        bytes32 staleRequestHash = keccak256("stale-request");
        vm.prank(creator);
        uint256 staleRequestId = historicalCampaign.submitDisbursementRequest(
            id, staleRequestHash, creator, 500e6
        );
        vm.warp(block.timestamp + historicalCampaign.EXECUTION_HORIZON() + 1);
        historicalCampaign.expireDisbursementRequest(id, staleRequestId, keccak256("request-expired"));
        assertEq(uint8(historicalCampaign.request(id, staleRequestId).state), uint8(T.RequestState.CANCELLED));
        assertFalse(historicalCampaign.hasOpenRequest(id));

        historicalCampaign.startWindDown(id);
        assertEq(uint8(historicalCampaign.campaign(id).state), uint8(T.CampaignState.STOPPED));
        vm.prank(backer1);
        historicalCampaign.claimRefund(id);
        vm.prank(backer2);
        historicalCampaign.claimRefund(id);
        assertEq(token.balanceOf(address(historicalCampaign)), 0);
    }

    function test_completeCampaignRejectsResidualEscrow() public {
        uint256 id = _createSampleCampaign(4_000e6);
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 40);
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 20);
        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility"));
        vm.prank(resolver);
        historicalCampaign.recordProductionVerified(id, keccak256("production"));
        vm.prank(resolver);
        historicalCampaign.recordFulfillmentComplete(id, keccak256("fulfillment"));

        vm.prank(creator);
        vm.expectRevert(FundTogetherHistoricalCampaign.WrongState.selector);
        historicalCampaign.completeCampaign(id);
    }

    function test_disputeDuringChallengeBlocksSettlementUntilResolverUphold() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 40);
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 20);

        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility"));

        bytes32 reqHash = keccak256("req-1");
        vm.prank(creator);
        uint256 reqId = historicalCampaign.submitDisbursementRequest(id, reqHash, creator, 1_000e6);
        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, reqId, reqHash);

        vm.prank(resolver);
        historicalCampaign.candidateExpenditure(id, reqId, 1_000e6, keccak256("receipt"));

        // Backer 1 opens dispute during challenge window
        vm.prank(backer1);
        historicalCampaign.openDisputeCase(id, reqId, keccak256("dispute-invalid-print-cost"));

        // Warp past original challenge window
        vm.warp(block.timestamp + 4 days);

        // Finalize expenditure must revert while dispute is open
        vm.expectRevert(FundTogetherHistoricalCampaign.WrongState.selector);
        historicalCampaign.finalizeExpenditure(id, reqId);

        // Resolver upholds case
        vm.prank(resolver);
        historicalCampaign.upholdDisputeCase(id, reqId, keccak256("resolver-settlement"));

        // Warp past new challenge window
        vm.warp(block.timestamp + 4 days);

        // Now finalize succeeds
        historicalCampaign.finalizeExpenditure(id, reqId);
        assertEq(
            uint8(historicalCampaign.request(id, reqId).state), uint8(T.RequestState.FINANCIALLY_SETTLED)
        );
    }

    function test_surplusReturnFundsIncreasesCustody() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 40);
        vm.prank(backer2);
        historicalCampaign.pledge(id, 1, 20);

        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility"));

        bytes32 reqHash = keccak256("req-1");
        vm.prank(creator);
        uint256 reqId = historicalCampaign.submitDisbursementRequest(id, reqHash, creator, 1_000e6);
        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, reqId, reqHash);

        // Creator spent only 800 USDC, returns 200 USDC surplus
        vm.prank(creator);
        token.approve(address(historicalCampaign), 200e6);
        vm.prank(creator);
        historicalCampaign.returnFunds(id, reqId, 200e6);

        T.CampaignView memory c = historicalCampaign.campaign(id);
        assertEq(c.available, 3_200e6, "Available must be 3,000 + 200 returned = 3,200 USDC");
        assertEq(historicalCampaign.request(id, reqId).returned, 200e6);
    }

    function test_windDownAfterExecutionHorizonRefundsProportionalCustody() public {
        uint256 goal = 4_000e6;
        uint256 id = _createSampleCampaign(goal);
        // Backer 1: 3,000 USDC (75%), Backer 2: 1,000 USDC (25%)
        vm.prank(backer1);
        historicalCampaign.pledge(id, 1, 30); // 3,000 USDC
        vm.prank(backer2);
        historicalCampaign.pledge(id, 0, 20); // 1,000 USDC

        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility"));

        // Creator disbursed 1,000 USDC (leaving 3,000 in Escrow)
        bytes32 reqHash = keccak256("req-1");
        vm.prank(creator);
        uint256 reqId = historicalCampaign.submitDisbursementRequest(id, reqHash, creator, 1_000e6);
        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, reqId, reqHash);
        vm.prank(resolver);
        historicalCampaign.candidateExpenditure(id, reqId, 1_000e6, keccak256("receipt"));
        vm.warp(block.timestamp + 4 days);
        historicalCampaign.finalizeExpenditure(id, reqId);

        // Fast forward past execution horizon (180 days)
        vm.warp(block.timestamp + 181 days);

        historicalCampaign.startWindDown(id);

        // Backer 1 claims 75% of remaining 3,000 USDC = 2,250 USDC
        uint256 b1Before = token.balanceOf(backer1);
        vm.prank(backer1);
        historicalCampaign.claimRefund(id);
        uint256 b1After = token.balanceOf(backer1);
        assertEq(b1After - b1Before, 2_250e6);

        // Backer 2 claims 25% of remaining 3,000 USDC = 750 USDC
        uint256 b2Before = token.balanceOf(backer2);
        vm.prank(backer2);
        historicalCampaign.claimRefund(id);
        uint256 b2After = token.balanceOf(backer2);
        assertEq(b2After - b2Before, 750e6);
    }

    function testFuzz_historicalCampaignMaintainsExactCustody(uint96 rawGoal, uint96 rawRequest) public {
        uint256 goal = bound(uint256(rawGoal), 4e6, 4_000e6);
        uint256 requestAmount = bound(uint256(rawRequest), 1, goal / 2);

        token.mint(backer1, goal);
        T.TierView[] memory tiers = new T.TierView[](1);
        tiers[0] = T.TierView({ price: goal, maxQuantity: 1, pledgedQuantity: 0, isDigital: true });

        bytes32 fuzzTiersHash = historicalCampaign.tiersHash(tiers);
        vm.prank(resolver);
        historicalCampaign.approveCampaign(
            creator,
            keccak256("fuzz-campaign"),
            goal,
            1 days,
            fuzzTiersHash
        );
        vm.prank(creator);
        uint256 id = historicalCampaign.createCampaign(keccak256("fuzz-campaign"), goal, 1 days, tiers);

        vm.prank(backer1);
        historicalCampaign.pledge(id, 0, 1);

        vm.prank(resolver);
        historicalCampaign.activateCampaign(id, keccak256("eligibility"));

        vm.prank(creator);
        uint256 reqId = historicalCampaign.submitDisbursementRequest(
            id, keccak256("fuzz-req"), creator, requestAmount
        );

        vm.prank(resolver);
        historicalCampaign.approveAndDisburse(id, reqId, keccak256("fuzz-req"));

        T.CampaignView memory c = historicalCampaign.campaign(id);
        assertEq(
            token.balanceOf(address(historicalCampaign)),
            c.available,
            "Escrow token balance must match available pool"
        );
        assertEq(
            c.available + c.grossPaid, c.contributed, "Contributed must equal available + grossPaid"
        );
    }
}
