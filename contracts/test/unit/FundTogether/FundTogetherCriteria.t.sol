pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { Test } from "forge-std/Test.sol";

contract FundTogetherCriteriaTest is Test {
    FundTogether internal fundTogether;
    MockUSDC internal token;
    address internal organizer = address(0xA11CE);
    address internal donor = address(0xB0B);
    uint256 internal campaignId;
    bytes32 internal constant CRITERIA = keccak256("Deliver the agreed supplies with receipts");

    event MilestoneCriteriaConfigured(
        uint256 indexed campaignId, uint256 indexed milestoneIndex, bytes32 criteriaHash
    );

    function setUp() public {
        fundTogether = new FundTogether();
        token = new MockUSDC();
        vm.prank(organizer);
        campaignId = fundTogether.createCampaign(
            "Clean water",
            address(token),
            block.timestamp + 7 days,
            CampaignFixtures.equalBudgets(2, 2_000_000)
        );
    }

    function _configure() internal {
        vm.startPrank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, CRITERIA);
        fundTogether.configureMilestoneCriteria(campaignId, 1, CRITERIA);
        vm.stopPrank();
    }

    function testOrganizerCommitsCriteriaBeforeApproval() public {
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit MilestoneCriteriaConfigured(campaignId, 0, CRITERIA);
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, CRITERIA);
        bytes32 criteria = fundTogether.milestoneCriteria(campaignId, 0);
        assertEq(criteria, CRITERIA);
    }

    function testNonOrganizerCannotConfigureCriteria() public {
        vm.expectRevert("only organizer");
        vm.prank(donor);
        fundTogether.configureMilestoneCriteria(campaignId, 0, CRITERIA);
    }

    function testZeroCriteriaCannotBeCommitted() public {
        vm.expectRevert("criteria required");
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, bytes32(0));
    }

    function testApprovalRequiresCriteriaForEveryMilestone() public {
        vm.expectRevert("criteria not configured");
        fundTogether.approveCampaign(campaignId);
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, CRITERIA);
        vm.expectRevert("criteria not configured");
        fundTogether.approveCampaign(campaignId);
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 1, CRITERIA);
        fundTogether.approveCampaign(campaignId);
    }

    function testCriteriaCannotChangeAfterApproval() public {
        _configure();
        fundTogether.approveCampaign(campaignId);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, keccak256("Changed criteria"));
    }

    function testDraftCriteriaCanBeCorrectedWithoutMovingFunds() public {
        _configure();
        bytes32 replacement = keccak256("Corrected acceptance criteria");
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, replacement);
        assertEq(fundTogether.milestoneCriteria(campaignId, 0), replacement);
        assertEq(fundTogether.milestoneCriteria(campaignId, 1), CRITERIA);
        assertEq(token.balanceOf(address(fundTogether)), 0);
    }

    function testUnknownCampaignCannotReceiveCriteria() public {
        vm.expectRevert("unknown campaign");
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(999, 0, CRITERIA);
    }

    function testUnknownMilestoneCannotReceiveCriteria() public {
        vm.expectRevert("unknown milestone");
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 2, CRITERIA);
        assertEq(fundTogether.milestoneCriteria(campaignId, 2), bytes32(0));
    }

    function testCancelledCampaignCannotReceiveCriteria() public {
        vm.prank(organizer);
        fundTogether.cancelCampaign(campaignId);
        vm.expectRevert("invalid state");
        vm.prank(organizer);
        fundTogether.configureMilestoneCriteria(campaignId, 0, CRITERIA);
    }
}
