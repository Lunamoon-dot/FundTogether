pragma solidity 0.8.24;

import { MockUSDC } from "./MockUSDC.sol";

contract SettlementCallbackToken is MockUSDC {
    address public target;
    bytes public callback;
    bool public attempted;
    bool public nestedSucceeded;
    bytes public nestedError;
    uint256 public transfers;
    uint256 public failOnTransfer;

    function arm(address target_, bytes calldata callback_, uint256 failOnTransfer_) external {
        target = target_;
        callback = callback_;
        failOnTransfer = failOnTransfer_;
        transfers = 0;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        ++transfers;
        if (transfers == failOnTransfer) return false;
        if (callback.length > 0 && !attempted) {
            attempted = true;
            (nestedSucceeded, nestedError) = target.call(callback);
        }
        return super.transfer(to, amount);
    }
}
