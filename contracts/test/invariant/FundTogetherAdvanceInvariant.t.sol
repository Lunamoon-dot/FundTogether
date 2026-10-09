pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { IAdvanceFunding } from "../helpers/AdvanceFixtures.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { AdvanceTypes as T } from "../../src/advance/AdvanceTypes.sol";

// Independent cash-flow ledger in the test harness; production never enumerates donors.
contract AdvanceHandler is Test {
    IAdvanceFunding public target;
    MockUSDC public token;
    address private constant ORGANIZER = address(0xA11CE);
    address private constant RESOLVER = address(0xE11);
    bytes32 private constant PLAN = keccak256("invariant gift plan");
    bytes32 private constant REASON = keccak256("invariant decision");
    uint256 public unsolicited;
    uint256[4] public contributed;
    uint256[4] public advanced;
    uint256[4] public returned;
    uint256[4] public refunded;
    uint256[4] public basePool;
    uint256[4] public supplementPool;
    bool[4] public snapshotted;
    mapping(uint256 => mapping(uint256 => uint256)) public weight;
    mapping(uint256 => mapping(uint256 => uint256)) public received;
    mapping(uint256 => mapping(uint256 => bool)) public consumed;
    mapping(uint256 => mapping(uint256 => uint256)) public paidSupplement;
    mapping(uint256 => mapping(uint256 => uint256)) public releasedStage;
    mapping(uint256 => mapping(uint256 => uint256)) public returnedStage;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bytes32))) public committed;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bytes32))) public reviewedDigest;

    constructor() {
        token = new MockUSDC();
        target = IAdvanceFunding(deployCode("FundTogetherAdvance.sol:FundTogetherAdvance",
            abi.encode(address(token), RESOLVER, keccak256("invariant B"))));
        vm.prank(ORGANIZER);
        token.approve(address(target), type(uint256).max);
        for (uint256 id; id < 4; ++id) {
            uint256[] memory budgets = new uint256[](3);
            bytes32[] memory criteria = new bytes32[](3);
            for (uint256 s; s < 3; ++s) {
                budgets[s] = 100 + 7 * id + 11 * s;
                criteria[s] = keccak256(abi.encode("criterion", id, s));
            }
            vm.prank(ORGANIZER);
            target.submitCampaignForDraft(bytes32(id + 1), PLAN, 1 days, budgets, criteria);
            vm.prank(RESOLVER);
            target.approveCampaign(id, PLAN, REASON, REASON);
            vm.prank(ORGANIZER);
            target.publishCampaign(id, PLAN);
            uint256 total = budgets[0] + budgets[1] + budgets[2];
            for (uint256 i; i < 6; ++i) _donate(id, i, i + 1);
            if (id < 3) {
                _donate(id, 0, total - 21);
                vm.prank(RESOLVER);
                target.confirmFirstAdvance(id, PLAN, REASON, REASON);
                if (id < 2) claimAdvance(id);
            }
        }
        stop(0); // A funded, advanced, zero-refund-paid campaign plus live neighbors.
        unexpectedTokens(17);
    }

    function donor(uint256 i) public pure returns (address) { return address(uint160(0x1000 + i)); }

    function _donate(uint256 id, uint256 i, uint256 amount) private {
        token.mint(donor(i), amount);
        vm.startPrank(donor(i));
        token.approve(address(target), amount);
        target.donate(id, amount);
        vm.stopPrank();
        weight[id][i] += amount;
        contributed[id] += amount;
    }

    function donate(uint256 seed, uint256 donorSeed, uint256 amountSeed) external {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        if (c.state != T.CampaignState.FUNDING || block.timestamp >= c.fundingEnd) return;
        _donate(id, donorSeed % 6, bound(amountSeed, 1, c.goal - contributed[id]));
    }

    function claimAdvance(uint256 seed) public {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        if (c.state == T.CampaignState.FIRST_REVIEW && block.timestamp < c.firstReviewEnd) {
            vm.prank(RESOLVER);
            target.confirmFirstAdvance(id, PLAN, REASON, REASON);
            c = target.campaign(id);
        }
        if (c.state != T.CampaignState.ADVANCE_AVAILABLE || block.timestamp >= c.claimEnd) return;
        uint256 budget = target.stage(id, c.currentStage).budget;
        assertEq(releasedStage[id][c.currentStage], 0);
        uint256 beforeBalance = token.balanceOf(ORGANIZER);
        vm.prank(ORGANIZER);
        target.claimAdvance(id, c.currentStage, PLAN);
        assertEq(token.balanceOf(ORGANIZER) - beforeBalance, budget);
        releasedStage[id][c.currentStage] = budget;
        advanced[id] += budget;
    }

    function submit(uint256 seed) external {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        if (c.state != T.CampaignState.EXECUTING && c.state != T.CampaignState.SUPPLEMENT_DUE) return;
        T.StageView memory s = target.stage(id, c.currentStage);
        if (block.timestamp >= s.submissionEnd || block.timestamp >= s.hardStop) return;
        uint256 version = s.latestVersion + 1;
        bytes32 hash = keccak256(abi.encode("evidence", id, c.currentStage, version));
        vm.prank(ORGANIZER);
        target.submitEvidence(id, c.currentStage, version, hash);
        assertEq(committed[id][c.currentStage][version], bytes32(0));
        committed[id][c.currentStage][version] = hash;
    }

    function review(uint256 seed, uint256 outcomeSeed, uint256 spentSeed) external {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        T.StageView memory s = target.stage(id, c.currentStage);
        if (c.state != T.CampaignState.EVIDENCE_REVIEW || block.timestamp >= s.reviewEnd) return;
        T.EvidenceRef memory ref = _ref(id, c.currentStage, s.latestVersion);
        uint256 outcome = outcomeSeed % 4;
        if (outcome == 0 && block.timestamp + 3 days >= s.hardStop) return;
        vm.startPrank(RESOLVER);
        if (outcome == 0) target.approveEvidence(ref, REASON, REASON, bound(spentSeed, 0, s.budget));
        else if (outcome == 2) target.rejectEvidence(ref, REASON);
        else target.requestSupplement(ref, T.ReviewOutcome(outcome), REASON);
        vm.stopPrank();
        reviewedDigest[id][c.currentStage][s.latestVersion] = keccak256(abi.encode(target.submission(id, c.currentStage, s.latestVersion)));
        _snapshot(id);
    }

    function challenge(uint256 seed, uint256 donorSeed) external {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        T.StageView memory s = target.stage(id, c.currentStage);
        if (c.state != T.CampaignState.CHALLENGE_WINDOW || block.timestamp >= s.challengeEnd) return;
        if (target.challengeCase(id, c.currentStage, s.latestVersion).caseUsed) return;
        vm.prank(donor(donorSeed % 6));
        target.openCase(_ref(id, c.currentStage, s.latestVersion), REASON);
    }

    function resolve(uint256 seed, uint256 outcomeSeed) external {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        if (c.state != T.CampaignState.CASE_OPEN) return;
        T.StageView memory s = target.stage(id, c.currentStage);
        T.CaseView memory cs = target.challengeCase(id, c.currentStage, s.latestVersion);
        if (block.timestamp < cs.responseEnd || block.timestamp >= cs.resolutionEnd) return;
        T.Resolution outcome = T.Resolution(1 + outcomeSeed % 3);
        if (outcome == T.Resolution.CONTINUE && block.timestamp + 3 days >= s.hardStop) return;
        vm.prank(RESOLVER);
        target.resolveCase(_ref(id, c.currentStage, s.latestVersion), outcome, REASON);
        _snapshot(id);
    }

    function finalize(uint256 seed) external {
        uint256 id = seed % 4;
        T.CampaignView memory c = target.campaign(id);
        T.StageView memory s = target.stage(id, c.currentStage);
        if (c.state != T.CampaignState.CHALLENGE_WINDOW || block.timestamp < s.challengeEnd
            || block.timestamp >= s.finalizeEnd || s.returned < s.declaredUnused) return;
        uint256 beforeBalance = token.balanceOf(ORGANIZER);
        target.finalizeStage(_ref(id, c.currentStage, s.latestVersion));
        assertEq(token.balanceOf(ORGANIZER), beforeBalance);
        _snapshot(id);
    }

    function stop(uint256 seed) public {
        if (seed % 31 != 0) return;
        uint256 id = seed % 4;
        if (snapshotted[id]) return;
        vm.prank(RESOLVER);
        target.stopCampaign(id, PLAN, REASON);
        _snapshot(id);
    }

    function timeout(uint256 seed, uint256 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 0, 2 days));
        uint256 id = seed % 4;
        if (snapshotted[id]) return;
        try target.finalizeTimeout(id) { _snapshot(id); } catch {}
    }

    function returnFunds(uint256 seed, uint256 stageSeed, uint256 amountSeed) external {
        uint256 id = seed % 4;
        uint256 index = stageSeed % 3;
        uint256 remaining = releasedStage[id][index] - returnedStage[id][index];
        if (remaining == 0) return;
        uint256 amount = bound(amountSeed, 1, remaining);
        vm.prank(ORGANIZER);
        target.returnFunds(id, index, amount);
        returnedStage[id][index] += amount;
        returned[id] += amount;
        if (snapshotted[id]) supplementPool[id] += amount;
    }

    function claim(uint256 seed, uint256 donorSeed) external {
        uint256 id = seed % 4;
        uint256 i = donorSeed % 6;
        if (!snapshotted[id]) return;
        uint256 base = consumed[id][i] ? 0 : weight[id][i] * basePool[id] / contributed[id];
        uint256 cumulative = weight[id][i] * supplementPool[id] / contributed[id];
        uint256 amount = base + cumulative - paidSupplement[id][i];
        if (consumed[id][i] && amount == 0) return;
        uint256 beforeBalance = token.balanceOf(donor(i));
        vm.prank(donor(i));
        target.claimRefund(id);
        assertEq(token.balanceOf(donor(i)) - beforeBalance, amount);
        consumed[id][i] = true;
        paidSupplement[id][i] = cumulative;
        refunded[id] += amount;
        received[id][i] += amount;
    }

    function unexpectedTokens(uint256 seed) public {
        uint256 amount = bound(seed, 1, 1000);
        token.mint(address(target), amount);
        unsolicited += amount;
    }

    function _snapshot(uint256 id) private {
        if (!snapshotted[id] && target.campaign(id).refundSnapshotted) {
            snapshotted[id] = true;
            basePool[id] = contributed[id] + returned[id] - advanced[id] - refunded[id];
        }
    }

    function _ref(uint256 id, uint256 index, uint256 version) private view returns (T.EvidenceRef memory) {
        return T.EvidenceRef(id, index, version, committed[id][index][version]);
    }
}

contract FundTogetherAdvanceInvariantTest is Test {
    AdvanceHandler private handler;
    IAdvanceFunding private target;

    function setUp() public {
        handler = new AdvanceHandler();
        target = handler.target();
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.donate.selector;
        selectors[1] = handler.claimAdvance.selector;
        selectors[2] = handler.submit.selector;
        selectors[3] = handler.review.selector;
        selectors[4] = handler.challenge.selector;
        selectors[5] = handler.resolve.selector;
        selectors[6] = handler.finalize.selector;
        selectors[7] = handler.stop.selector;
        selectors[8] = handler.timeout.selector;
        selectors[9] = handler.returnFunds.selector;
        selectors[10] = handler.claim.selector;
        selectors[11] = handler.unexpectedTokens.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
        targetContract(address(handler));
    }

    function invariant_cashAndRightsMatchIndependentLedger() public view {
        uint256 custody;
        for (uint256 id; id < 4; ++id) {
            T.CampaignView memory c = target.campaign(id);
            assertEq(c.contributed, handler.contributed(id));
            assertEq(c.advanced, handler.advanced(id));
            assertEq(c.returned, handler.returned(id));
            assertEq(c.refunded, handler.refunded(id));
            assertEq(c.contributed + c.returned, c.advanced + c.refunded + c.custody);
            assertEq(c.refundSnapshotted, handler.snapshotted(id));
            assertEq(c.basePool, handler.basePool(id));
            assertEq(c.supplementPool, handler.supplementPool(id));
            assertLe(c.refunded, c.basePool + c.supplementPool);
            custody += c.custody;
            for (uint256 i; i < 6; ++i) {
                uint256 weight = handler.weight(id, i);
                assertEq(target.contributions(id, handler.donor(i)), weight);
                (uint256 base, uint256 supplement, bool consumed, uint256 paid) = target.refundClaimable(id, handler.donor(i));
                assertEq(consumed, handler.consumed(id, i));
                assertEq(paid, handler.paidSupplement(id, i));
                if (c.refundSnapshotted) {
                    uint256 baseRight = weight * c.basePool / c.contributed;
                    uint256 supplementRight = weight * c.supplementPool / c.contributed;
                    assertEq(base, consumed ? 0 : baseRight);
                    assertEq(supplement + paid, supplementRight);
                    assertEq(handler.received(id, i), (consumed ? baseRight : 0) + paid);
                } else { assertEq(base + supplement + paid, 0); }
            }
            for (uint256 index; index < 3; ++index) {
                T.StageView memory s = target.stage(id, index);
                assertTrue(s.advanced == 0 || s.advanced == s.budget);
                assertEq(s.advanced, handler.releasedStage(id, index));
                assertEq(s.returned, handler.returnedStage(id, index));
                assertLe(s.returned, s.advanced);
                assertLe(s.latestVersion, 3);
                for (uint256 version = 1; version <= s.latestVersion; ++version) {
                    T.SubmissionView memory v = target.submission(id, index, version);
                    assertEq(v.evidenceHash, handler.committed(id, index, version));
                    assertEq(v.parentVersion, version - 1);
                    bytes32 digest = handler.reviewedDigest(id, index, version);
                    if (digest != bytes32(0)) assertEq(keccak256(abi.encode(v)), digest);
                }
            }
        }
        assertEq(handler.token().balanceOf(address(target)), custody + handler.unsolicited());
    }
}
