// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IEscrowV2Types} from "../../../src/reward/IEscrowV2Types.sol";
import {IFundTogetherProgressiveEscrow} from "../../../src/reward/IFundTogetherProgressiveEscrow.sol";
import {IFundTogetherRefundVault} from "../../../src/reward/IFundTogetherRefundVault.sol";

/// @notice Scaffolding test verifying compilation and interface consistency for H1
contract ProgressiveEscrowInterfacesTest is Test, IEscrowV2Types {
    function testInterfaceImportsAndTypes() public pure {
        // Verify enum representations
        CampaignState cState = CampaignState.ACTIVE;
        assertEq(uint8(cState), 2);

        RequestState rState = RequestState.DISBURSED;
        assertEq(uint8(rState), 5);

        ChallengeState chState = ChallengeState.ADMITTED;
        assertEq(uint8(chState), 1);

        ChallengeTargetType tType = ChallengeTargetType.FUNDING_REQUEST;
        assertEq(uint8(tType), 0);
    }

    function testH1InterfacesExposeCanonicalRiskAndVaultTrustBoundaries() public pure {
        IEscrowV2Types.CampaignFinancialConfig memory config = IEscrowV2Types.CampaignFinancialConfig({
            refundVault: address(0xBEEF),
            perRequestCapBps: 2500,
            unreconciledCapBps: 5000,
            outcomeExposureCapBps: 5000,
            reviewWindowDuration: 12 hours,
            mainRoundDuration: 7 days
        });
        assertEq(config.refundVault, address(0xBEEF));

        assertEq(IFundTogetherProgressiveEscrow.getRiskExposure.selector, bytes4(keccak256("getRiskExposure(uint256)")));
        assertEq(
            IFundTogetherProgressiveEscrow.getTargetKey.selector,
            bytes4(keccak256("getTargetKey(uint256,uint8,uint256)"))
        );
        assertEq(
            IFundTogetherRefundVault.registerSourceEscrow.selector,
            bytes4(keccak256("registerSourceEscrow(address,address)"))
        );
        assertEq(
            IFundTogetherRefundVault.registeredPaymentToken.selector,
            bytes4(keccak256("registeredPaymentToken(address)"))
        );
    }
}
