pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { FundTogetherBase } from "../../../src/modules/FundTogetherBase.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { CampaignFixtures } from "../../helpers/CampaignFixtures.sol";
import { Test } from "forge-std/Test.sol";

contract FundingCaller {
    function approve(FundTogether fundTogether, uint256 campaignId) external {
        fundTogether.approveCampaign(campaignId);
    }

    function finalizeFailure(FundTogether fundTogether, uint256 campaignId) external {
        fundTogether.finalizeFundingFailure(campaignId);
    }
}

contract FundTogetherFundingTest is Test {
    event CampaignApproved(uint256 indexed campaignId, address indexed resolver);
    event CampaignPublished(uint256 indexed campaignId, uint256 fundingDeadline);
    event FundingFinalized(uint256 indexed campaignId, FundTogetherBase.CampaignState state);
    event CampaignCancelled(uint256 indexed campaignId, address indexed organizer);

    function _newCampaign(FundTogether fundTogether, MockUSDC token, uint256 deadline)
        internal
        returns (uint256 campaignId)
    {
        campaignId = fundTogether.createCampaign(
            "Clean water", address(token), deadline, CampaignFixtures.equalBudgets(2, 500_000)
        );
    }

    function _publish(FundTogether fundTogether, MockUSDC token, uint256 campaignId) internal {
        token.mint(address(this), 500_000);
        token.approve(address(fundTogether), 500_000);
        fundTogether.lockBond(campaignId);
        CampaignFixtures.configureCriteria(fundTogether, campaignId);
        fundTogether.approveCampaign(campaignId);
        vm.expectEmit(true, false, false, true, address(fundTogether));
        emit CampaignPublished(campaignId, fundTogether.fundingDeadlines(campaignId));
        fundTogether.publishCampaign(campaignId);
    }

    function testCampaignStartsDraftAndResolverCanApprove() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);

        require(
            fundTogether.campaignState(campaignId) == FundTogetherBase.CampaignState.DRAFT, "not draft"
        );
        CampaignFixtures.configureCriteria(fundTogether, campaignId);
        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit CampaignApproved(campaignId, address(this));
        fundTogether.approveCampaign(campaignId);
        require(
            fundTogether.campaignState(campaignId) == FundTogetherBase.CampaignState.APPROVED,
            "not approved"
        );
    }

    function testPublishRequiresApprovalAndLockedBond() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);

        try fundTogether.publishCampaign(campaignId) {
            revert("unapproved campaign published");
        } catch { }

        CampaignFixtures.configureCriteria(fundTogether, campaignId);
        fundTogether.approveCampaign(campaignId);
        try fundTogether.publishCampaign(campaignId) {
            revert("unbonded campaign published");
        } catch { }
    }

    function testPublishedCampaignEntersFundingAndCanReceiveDonation() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);
        _publish(fundTogether, token, campaignId);

        require(
            fundTogether.campaignState(campaignId) == FundTogetherBase.CampaignState.FUNDING,
            "not funding"
        );

        token.mint(address(this), 100_000);
        token.approve(address(fundTogether), 100_000);
        fundTogether.donate(campaignId, 100_000);
    }

    function testDonationBeforePublishReverts() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);
        token.mint(address(this), 100_000);
        token.approve(address(fundTogether), 100_000);

        try fundTogether.donate(campaignId, 100_000) {
            revert("draft campaign accepted donation");
        } catch { }
    }

    function testGoalReachedMovesCampaignToFunded() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);
        _publish(fundTogether, token, campaignId);
        token.mint(address(this), 1_000_000);
        token.approve(address(fundTogether), 1_000_000);

        vm.expectEmit(true, false, false, true, address(fundTogether));
        emit FundingFinalized(campaignId, FundTogetherBase.CampaignState.FUNDED);
        fundTogether.donate(campaignId, 1_000_000);

        require(
            fundTogether.campaignState(campaignId) == FundTogetherBase.CampaignState.FUNDED,
            "not funded"
        );
    }

    function testDonationCannotExceedRemainingGoal() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);
        _publish(fundTogether, token, campaignId);
        token.mint(address(this), 1_000_001);
        token.approve(address(fundTogether), 1_000_001);

        try fundTogether.donate(campaignId, 1_000_001) {
            revert("over-goal donation accepted");
        } catch { }
    }

    function testOrganizerCanCancelDuringFunding() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);
        _publish(fundTogether, token, campaignId);

        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit CampaignCancelled(campaignId, address(this));
        fundTogether.cancelCampaign(campaignId);
        require(
            fundTogether.campaignState(campaignId) == FundTogetherBase.CampaignState.CANCELLED,
            "not cancelled"
        );
    }

    function testAnyoneCanFinalizeFundingFailureAfterDeadline() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();
        uint256 campaignId = _newCampaign(fundTogether, token, block.timestamp + 7 days);
        _publish(fundTogether, token, campaignId);
        FundingCaller caller = new FundingCaller();
        vm.warp(block.timestamp + 7 days + 1);

        caller.finalizeFailure(fundTogether, campaignId);
        require(
            fundTogether.campaignState(campaignId) == FundTogetherBase.CampaignState.FUNDING_FAILED,
            "not funding failed"
        );
    }
}
