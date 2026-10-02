pragma solidity 0.8.24;

import { MockUSDC } from "./MockUSDC.sol";

interface RefundAccounting {
    function contributions(uint256 campaignId, address donor) external view returns (uint256);
    function claimedRefund(uint256 campaignId, address donor) external view returns (bool);
    function refundPool(uint256 campaignId) external view returns (uint256);
    function refundSnapshotted(uint256 campaignId) external view returns (bool);
    function claimRefund(uint256 campaignId) external;
}

/// @dev Attempts a nested refund call during token transfer to exercise reentrancy protection.
contract RefundCallbackToken is MockUSDC {
    RefundAccounting public target;
    uint256 public campaignId;
    bool public attempted;
    bool public nestedSucceeded;
    bytes public nestedError;

    function arm(RefundAccounting target_, uint256 campaignId_) external {
        target = target_;
        campaignId = campaignId_;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (address(target) != address(0)) {
            attempted = true;
            (nestedSucceeded, nestedError) =
                address(target).call(abi.encodeCall(RefundAccounting.claimRefund, (campaignId)));
        }
        return super.transfer(to, amount);
    }
}
