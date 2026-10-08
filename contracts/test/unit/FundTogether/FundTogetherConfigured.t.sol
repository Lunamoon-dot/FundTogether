pragma solidity 0.8.24;
import { Test } from "forge-std/Test.sol";
import { FundTogetherConfigured } from "../../../src/FundTogetherConfigured.sol";
import { FundTogetherBase } from "../../../src/modules/FundTogetherBase.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";

contract SubmissionCallbackToken is MockUSDC {
    FundTogetherConfigured public target;
    bool public reentered;
    function setTarget(FundTogetherConfigured value) external { target = value; }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bytes32[] memory criteria = new bytes32[](1);
        criteria[0] = keccak256("callback-criterion");
        try target.submitCampaignForDraft(keccak256("callback-draft"), "Callback", block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(1, 1), criteria) { reentered = true; } catch {}
        return super.transferFrom(from, to, amount);
    }
}

contract FundTogetherConfiguredTest is Test {
    MockUSDC token;
    FundTogetherConfigured target;
    bytes32 key = keccak256("draft-1");
    function setUp() public { token = new MockUSDC(); target = new FundTogetherConfigured(address(token)); }
    function create() internal returns (uint256) {
        return target.createCampaignForDraft(key, "Water", block.timestamp + 7 days, CampaignFixtures.equalBudgets(2, 1000000));
    }
    function testDraftCannotBeCreatedTwice() public {
        uint256 id = create();
        assertEq(target.campaignForDraft(address(this), key), id + 1);
        vm.expectRevert("draft already created"); create();
        assertEq(target.nextCampaignId(), 1);
    }
    function testDraftKeysAreScopedToOrganizer() public {
        create();
        vm.prank(address(123));
        uint256 other = target.createCampaignForDraft(key, "Other", block.timestamp + 7 days, CampaignFixtures.equalBudgets(1, 1));
        assertEq(other, 1);
        assertEq(target.campaignForDraft(address(this), key), 1);
    }
    function testOnlyConfiguredTokenAccepted() public {
        MockUSDC fake = new MockUSDC();
        vm.expectRevert("unsupported token");
        target.createCampaign("Fake", address(fake), block.timestamp + 7 days, CampaignFixtures.equalBudgets(1, 1));
    }
    function testInvalidCreationDoesNotConsumeDraftKey() public {
        vm.expectRevert("deadline required");
        target.createCampaignForDraft(key, "Water", block.timestamp, CampaignFixtures.equalBudgets(1, 1));
        assertEq(target.campaignForDraft(address(this), key), 0);
        create();
    }
    function testApprovalThenWalletDrainCannotFakeBond() public {
        uint256 id = create();
        token.mint(address(this), 1000000);
        token.approve(address(target), 1000000);
        token.transfer(address(123), 1000000);
        vm.expectRevert(); target.lockBond(id);
        (,,,,, bool locked, uint256 amount,) = target.campaigns(id);
        assertFalse(locked); assertEq(amount, 0);
        CampaignFixtures.configureCriteria(target, id);
        target.approveCampaign(id);
        vm.expectRevert("bond not locked"); target.publishCampaign(id);
    }
    function testWalletDrainAfterLockPreservesEscrow() public {
        uint256 id = create();
        token.mint(address(this), 2000000);
        token.approve(address(target), 1000000);
        target.lockBond(id);
        token.transfer(address(123), 1000000);
        assertEq(token.balanceOf(address(this)), 0);
        assertEq(token.balanceOf(address(target)), 1000000);
        vm.expectRevert("bond already locked"); target.lockBond(id);
    }

    function hashes() internal pure returns (bytes32[] memory result) {
        result = new bytes32[](2);
        result[0] = keccak256("criterion-1");
        result[1] = keccak256("criterion-2");
    }

    function submit() internal returns (uint256) {
        return target.submitCampaignForDraft(key, "Water", block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(2, 1000000), hashes());
    }

    function assertEmpty() internal view {
        assertEq(target.nextCampaignId(), 0);
        assertEq(target.campaignForDraft(address(this), key), 0);
        assertEq(target.milestoneCriteria(0, 0), bytes32(0));
        assertEq(token.balanceOf(address(target)), 0);
    }

    function testAtomicSubmissionLocksExactBondAndAllCriteria() public {
        token.mint(address(this), 2000000);
        token.approve(address(target), 1000000);
        uint256 id = submit();
        (,,,uint256 required, address organizer, bool locked, uint256 amount,) = target.campaigns(id);
        assertEq(organizer, address(this));
        assertEq(required, 1000000);
        assertTrue(locked);
        assertEq(amount, required);
        assertEq(token.balanceOf(address(target)), required);
        assertEq(token.balanceOf(address(this)), 1000000);
        assertEq(target.milestoneCriteria(id, 0), hashes()[0]);
        assertEq(target.milestoneCriteria(id, 1), hashes()[1]);
        assertEq(uint256(target.campaignState(id)), uint256(FundTogetherBase.CampaignState.DRAFT));
        vm.expectRevert("draft already created"); submit();
        assertEq(token.balanceOf(address(target)), required);
    }

    function testInsufficientBalanceRollsBackEntireSubmissionThenCanRetry() public {
        token.mint(address(this), 999999);
        token.approve(address(target), 1000000);
        vm.expectRevert(); submit();
        assertEmpty();
        assertEq(token.allowance(address(this), address(target)), 1000000);
        token.mint(address(this), 1);
        assertEq(submit(), 0);
    }

    function testInsufficientAllowanceRollsBackEntireSubmission() public {
        token.mint(address(this), 1000000);
        token.approve(address(target), 999999);
        vm.expectRevert(); submit();
        assertEmpty();
        assertEq(token.balanceOf(address(this)), 1000000);
    }

    function testInvalidCriteriaRollBackCreation() public {
        bytes32[] memory criteria = hashes();
        criteria[1] = bytes32(0);
        vm.expectRevert("criteria required");
        target.submitCampaignForDraft(key, "Water", block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(2, 1000000), criteria);
        assertEmpty();
    }

    function testCriteriaLengthMismatchConsumesNoKey() public {
        vm.expectRevert("criteria length mismatch");
        target.submitCampaignForDraft(key, "Water", block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(1, 1000000), hashes());
        assertEmpty();
    }

    function testAtomicSubmissionRejectsTokenCallbackReentrancy() public {
        SubmissionCallbackToken callbackToken = new SubmissionCallbackToken();
        FundTogetherConfigured guarded = new FundTogetherConfigured(address(callbackToken));
        callbackToken.setTarget(guarded);
        callbackToken.mint(address(this), 1000000);
        callbackToken.approve(address(guarded), 1000000);
        guarded.submitCampaignForDraft(key, "Water", block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(2, 1000000), hashes());
        assertFalse(callbackToken.reentered());
        assertEq(guarded.nextCampaignId(), 1);
        assertEq(callbackToken.balanceOf(address(guarded)), 1000000);
    }
}
