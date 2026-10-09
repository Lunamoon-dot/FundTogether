pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { AdvanceTypes as T } from "../../src/advance/AdvanceTypes.sol";

interface IAdvanceFunding {
    error InvalidInput();
    error WrongCaller();
    error WrongState();
    error WrongPlan();
    error Expired();
    error InvalidReference();
    error NonExactTransfer();
    error NoEntitlement();

    function campaign(uint256 id) external view returns (T.CampaignView memory);
    function stage(uint256 id, uint256 index) external view returns (T.StageView memory);
    function stageCount(uint256 id) external view returns (uint256);
    function campaignForDraft(address organizer, bytes32 key) external view returns (uint256);
    function contributions(uint256 id, address donor) external view returns (uint256);
    function nextCampaignId() external view returns (uint256);
    function submitCampaignForDraft(bytes32 key, bytes32 plan, uint256 duration,
        uint256[] calldata budgets, bytes32[] calldata criteria) external returns (uint256);
    function approveCampaign(uint256 id, bytes32 plan, bytes32 verification, bytes32 reason) external;
    function publishCampaign(uint256 id, bytes32 plan) external;
    function cancelCampaign(uint256 id, bytes32 plan) external;
    function donate(uint256 id, uint256 amount) external;
    function finalizeTimeout(uint256 id) external;
    function confirmFirstAdvance(uint256 id, bytes32 plan, bytes32 verification, bytes32 reason) external;
    function claimAdvance(uint256 id, uint256 index, bytes32 plan) external;
    function stopCampaign(uint256 id, bytes32 plan, bytes32 reason) external;
    function submitEvidence(uint256 id, uint256 index, uint256 nextVersion, bytes32 hash) external;
    function submission(uint256 id, uint256 index, uint256 version) external view returns (T.SubmissionView memory);
    function approveEvidence(T.EvidenceRef calldata ref, bytes32 publicHash, bytes32 reportHash, uint256 spent) external;
    function requestSupplement(T.EvidenceRef calldata ref, T.ReviewOutcome outcome, bytes32 reportHash) external;
    function rejectEvidence(T.EvidenceRef calldata ref, bytes32 reportHash) external;
    function finalizeStage(T.EvidenceRef calldata ref) external;
    function returnFunds(uint256 id, uint256 index, uint256 amount) external;
    function openCase(T.EvidenceRef calldata ref, bytes32 reason) external;
    function addCaseMaterial(T.EvidenceRef calldata ref, bytes32 materialHash) external;
    function submitCaseResponse(T.EvidenceRef calldata ref, bytes32 responseHash) external;
    function resolveCase(T.EvidenceRef calldata ref, T.Resolution outcome, bytes32 reason) external;
    function challengeCase(uint256 id, uint256 index, uint256 version) external view returns (T.CaseView memory);
    function refundClaimable(uint256 id, address donor) external view returns
        (uint256 base, uint256 supplement, bool baseConsumed, uint256 supplementPaid);
    function claimRefund(uint256 id) external;
}

abstract contract AdvanceFixtures is Test {
    bytes32 internal constant PLAN = keccak256("synthetic gift plan");
    bytes32 internal constant VERIFICATION = keccak256("synthetic organization verification");
    bytes32 internal constant REASON = keccak256("synthetic reason");
    MockUSDC internal token;
    IAdvanceFunding internal advance;
    address internal organizer;
    address internal resolver;
    address internal donorA;
    address internal donorB;
    uint256 private keyNonce;

    function setUp() public virtual {
        organizer = makeAddr("organizer");
        resolver = makeAddr("resolver");
        donorA = makeAddr("donorA");
        donorB = makeAddr("donorB");
        token = new MockUSDC();
        advance = IAdvanceFunding(deployCode("FundTogetherAdvance.sol:FundTogetherAdvance",
            abi.encode(address(token), resolver, keccak256("isolated B"))));
        token.mint(donorA, 10_000e6);
        token.mint(donorB, 10_000e6);
        vm.prank(donorA);
        token.approve(address(advance), type(uint256).max);
        vm.prank(donorB);
        token.approve(address(advance), type(uint256).max);
    }

    function budgets(uint256 count, uint256 amount) internal pure returns (uint256[] memory b) {
        b = new uint256[](count);
        for (uint256 i; i < count; ++i) b[i] = amount;
    }

    function criteria(uint256 count) internal pure returns (bytes32[] memory c) {
        c = new bytes32[](count);
        for (uint256 i; i < count; ++i) c[i] = keccak256(abi.encode("gift criteria", i));
    }

    function create(uint256 count, uint256 amount) internal returns (uint256 id) {
        uint256[] memory b = budgets(count, amount);
        bytes32[] memory c = criteria(count);
        bytes32 key = bytes32(++keyNonce);
        vm.prank(organizer);
        id = advance.submitCampaignForDraft(key, PLAN, 1 days, b, c);
    }

    function approve(uint256 id) internal {
        vm.prank(resolver);
        advance.approveCampaign(id, PLAN, VERIFICATION, REASON);
    }

    function publish(uint256 id) internal {
        approve(id);
        vm.prank(organizer);
        advance.publishCampaign(id, PLAN);
    }

    function fund(uint256 id, uint256 a, uint256 b) internal {
        vm.prank(donorA);
        advance.donate(id, a);
        if (b != 0) {
            vm.prank(donorB);
            advance.donate(id, b);
        }
    }

    function executing(uint256 count) internal returns (uint256 id) {
        id = create(count, count == 1 ? 2_200e6 : 1_100e6);
        publish(id);
        if (count == 1) fund(id, 1_320e6, 880e6);
        else fund(id, 1_980e6, 1_320e6);
        vm.prank(resolver);
        advance.confirmFirstAdvance(id, PLAN, VERIFICATION, REASON);
        vm.prank(organizer);
        advance.claimAdvance(id, 0, PLAN);
    }

    function evidence(uint256 id, uint256 index, uint256 version) internal returns (T.EvidenceRef memory ref) {
        bytes32 hash = keccak256(abi.encode("synthetic evidence", id, index, version));
        vm.prank(organizer);
        advance.submitEvidence(id, index, version, hash);
        ref = T.EvidenceRef(id, index, version, hash);
    }

    function met(T.EvidenceRef memory ref, uint256 spent) internal {
        vm.prank(resolver);
        advance.approveEvidence(ref, VERIFICATION, REASON, spent);
    }
}
