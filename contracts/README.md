# FundTogether contracts

The current target is the VNext permissionless crowdfunding protocol:

- `CampaignEscrowVNext.sol` owns campaign terms, MockUSDC escrow, milestone
  payout and refunds;
- `JuryRegistry.sol` owns Judge stake, reservations, rewards and settlement;
- `JuryReview.sol` owns assignment, commit–reveal, court aggregation,
  appeal/retry and final rulings.

Historical Campaign contracts remain in the repository for regression and
compatibility tests. They are not authority for new VNext behavior.

## Verify locally

```powershell
git submodule update --init --recursive
cd contracts
forge build
forge test --summary
```

Production contracts must preserve escrow conservation, unique payout/refund,
stake coverage, Judge uniqueness and canonical review authorization. The local
MockUSDC deployment is research-only and not approved for public-chain or
real-money use.
