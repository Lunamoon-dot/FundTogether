pragma solidity 0.8.24;

import { MockUSDC } from "./MockUSDC.sol";

/// @dev Test-only faults/callbacks at the real ERC20 transfer boundary.
contract AdvanceCallbackToken is MockUSDC {
    enum Mode { NORMAL, FALSE_RETURN, REVERT, RECIPIENT_FEE, SENDER_FEE }
    Mode public incoming;
    Mode public outgoing;
    address public target;
    bytes public callback;
    bool public attempted;
    bool public nestedSucceeded;
    bytes public nestedError;

    function configure(Mode inMode, Mode outMode) external {
        incoming = inMode;
        outgoing = outMode;
    }

    function arm(address target_, bytes calldata callback_) external {
        target = target_;
        callback = callback_;
        attempted = false;
        nestedSucceeded = false;
        delete nestedError;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (outgoing == Mode.FALSE_RETURN) return false;
        if (outgoing == Mode.REVERT) revert("synthetic transfer failure");
        _callback();
        bool ok = super.transfer(to, amount);
        if (outgoing == Mode.RECIPIENT_FEE) _burn(to, 1);
        if (outgoing == Mode.SENDER_FEE) _burn(msg.sender, 1);
        return ok;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (incoming == Mode.FALSE_RETURN) return false;
        if (incoming == Mode.REVERT) revert("synthetic transfer failure");
        _callback();
        bool ok = super.transferFrom(from, to, amount);
        if (incoming == Mode.RECIPIENT_FEE) _burn(to, 1);
        if (incoming == Mode.SENDER_FEE) _burn(from, 1);
        return ok;
    }

    function _callback() private {
        if (target != address(0) && !attempted) {
            attempted = true;
            (nestedSucceeded, nestedError) = target.call(callback);
        }
    }
}
