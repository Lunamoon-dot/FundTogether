pragma solidity 0.8.24;

import { FundTogether } from "../../../src/FundTogether.sol";
import { MockUSDC } from "../../mocks/MockUSDC.sol";
import { Test } from "forge-std/Test.sol";
import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract DonorActor {
    function approveAndDonate(
        MockUSDC token,
        FundTogether fundTogether,
        uint256 campaignId,
        uint256 amount
    ) external {
        token.approve(address(fundTogether), amount);
        fundTogether.donate(campaignId, amount);
    }
}

contract FundTogetherErc20Test is Test {
    function _publish(FundTogether fundTogether, MockUSDC token, uint256 campaignId) internal {
        token.mint(address(this), 500_000);
        token.approve(address(fundTogether), 500_000);
        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);
    }

    event CampaignCreated(
        uint256 indexed campaignId,
        string name,
        address donationToken,
        uint256 goal,
        uint256 requiredBond
    );
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount);

    function testCreateCampaignEmitsEvent() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();

        vm.expectEmit(true, false, false, true, address(fundTogether));
        emit CampaignCreated(0, "Clean water", address(token), 1_000_000, 500_000);
        fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
    }

    function testDonateEmitsEvent() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        uint256 donation = 250_000;
        token.mint(address(this), 750_000);
        token.approve(address(fundTogether), 750_000);
        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);

        vm.expectEmit(true, true, false, true, address(fundTogether));
        emit DonationReceived(campaignId, address(this), donation);
        fundTogether.donate(campaignId, donation);
    }

    function testCreateCampaignRejectsInvalidConfiguration() public {
        FundTogether fundTogether = new FundTogether();
        MockUSDC token = new MockUSDC();

        try fundTogether.createCampaign(
            "", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        ) {
            revert("empty name did not revert");
        } catch { }
        try fundTogether.createCampaign(
            "Clean water", address(0), 1_000_000, 500_000, block.timestamp + 7 days
        ) {
            revert("zero token did not revert");
        } catch { }
        try fundTogether.createCampaign(
            "Clean water", address(token), 0, 500_000, block.timestamp + 7 days
        ) {
            revert("zero goal did not revert");
        } catch { }
    }

    function testDonateTransfersTokensAndUpdatesAccounting() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        uint256 donation = 250_000;

        token.mint(address(this), 750_000);
        token.approve(address(fundTogether), 750_000);
        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);
        fundTogether.donate(campaignId, donation);

        (, address campaignToken,,,,,, uint256 totalContributed) =
            fundTogether.campaigns(campaignId);
        require(campaignToken == address(token), "token mismatch");
        require(totalContributed == donation, "accounting mismatch");
        require(token.balanceOf(address(this)) == 0, "donor balance mismatch");
        require(token.balanceOf(address(fundTogether)) == 750_000, "escrow balance mismatch");
    }

    function testDonateWithoutAllowanceReverts() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        uint256 donation = 250_000;

        _publish(fundTogether, token, campaignId);
        token.mint(address(this), donation);

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(fundTogether), 0, donation
            )
        );
        fundTogether.donate(campaignId, donation);
    }

    function testDonationCannotExceedAllowance() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );
        uint256 donation = 250_000;

        _publish(fundTogether, token, campaignId);
        token.mint(address(this), donation);
        token.approve(address(fundTogether), donation - 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector,
                address(fundTogether),
                donation - 1,
                donation
            )
        );
        fundTogether.donate(campaignId, donation);
    }

    function testMultipleDonorsKeepSeparateBalancesAndSharedAccounting() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        DonorActor donorA = new DonorActor();
        DonorActor donorB = new DonorActor();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );

        token.mint(address(this), 500_000);
        token.approve(address(fundTogether), 500_000);
        fundTogether.lockBond(campaignId);
        fundTogether.approveCampaign(campaignId);
        fundTogether.publishCampaign(campaignId);
        token.mint(address(donorA), 100_000);
        token.mint(address(donorB), 250_000);
        donorA.approveAndDonate(token, fundTogether, campaignId, 100_000);
        donorB.approveAndDonate(token, fundTogether, campaignId, 250_000);

        (,,,,,,, uint256 totalContributed) = fundTogether.campaigns(campaignId);
        require(totalContributed == 350_000, "shared accounting mismatch");
        require(token.balanceOf(address(donorA)) == 0, "donor A balance mismatch");
        require(token.balanceOf(address(donorB)) == 0, "donor B balance mismatch");
        require(token.balanceOf(address(fundTogether)) == 850_000, "escrow mismatch");
    }

    function testRevertedTransferLeavesAccountingUnchanged() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );

        _publish(fundTogether, token, campaignId);
        token.approve(address(fundTogether), 250_000);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, 250_000
            )
        );
        fundTogether.donate(campaignId, 250_000);

        (,,,,,,, uint256 totalContributed) = fundTogether.campaigns(campaignId);
        require(totalContributed == 0, "accounting changed after revert");
        require(token.balanceOf(address(fundTogether)) == 500_000, "escrow changed after revert");
        assertEq(fundTogether.contributions(campaignId, address(this)), 0);
    }

    function testCampaignTokenCannotBeSubstituted() public {
        MockUSDC campaignToken = new MockUSDC();
        MockUSDC otherToken = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(campaignToken), 1_000_000, 500_000, block.timestamp + 7 days
        );
        uint256 donation = 250_000;

        _publish(fundTogether, campaignToken, campaignId);
        otherToken.mint(address(this), donation);
        otherToken.approve(address(fundTogether), donation);

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(fundTogether), 0, donation
            )
        );
        fundTogether.donate(campaignId, donation);
    }

    function testZeroDonationReverts() public {
        MockUSDC token = new MockUSDC();
        FundTogether fundTogether = new FundTogether();
        uint256 campaignId = fundTogether.createCampaign(
            "Clean water", address(token), 1_000_000, 500_000, block.timestamp + 7 days
        );

        try fundTogether.donate(campaignId, 0) {
            revert("zero donation did not revert");
        } catch { }
    }
}
