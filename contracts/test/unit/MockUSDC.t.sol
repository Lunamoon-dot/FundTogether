pragma solidity 0.8.24;

import { MockUSDC } from "../mocks/MockUSDC.sol";

contract TokenSpender {
    function pull(MockUSDC token, address from, address to, uint256 amount) external {
        token.transferFrom(from, to, amount);
    }
}

contract MockUSDCTest {
    function testTokenMetadataAndDecimals() public {
        MockUSDC token = new MockUSDC();

        require(keccak256(bytes(token.name())) == keccak256(bytes("Mock USDC")), "name mismatch");
        require(keccak256(bytes(token.symbol())) == keccak256(bytes("mUSDC")), "symbol mismatch");
        require(token.decimals() == 6, "decimals mismatch");
    }

    function testMintCreatesBalanceAndSupply() public {
        MockUSDC token = new MockUSDC();
        uint256 amount = 1_000_000;

        token.mint(address(this), amount);

        require(token.balanceOf(address(this)) == amount, "balance mismatch");
        require(token.totalSupply() == amount, "supply mismatch");
    }

    function testApproveAndTransferFromMoveTokens() public {
        MockUSDC token = new MockUSDC();
        TokenSpender spender = new TokenSpender();
        address recipient = address(0xBEEF);
        uint256 amount = 250_000;

        token.mint(address(this), amount);
        token.approve(address(spender), amount);
        spender.pull(token, address(this), recipient, amount);

        require(token.balanceOf(address(this)) == 0, "sender balance mismatch");
        require(token.balanceOf(recipient) == amount, "recipient balance mismatch");
        require(token.allowance(address(this), address(spender)) == 0, "allowance mismatch");
    }
}
