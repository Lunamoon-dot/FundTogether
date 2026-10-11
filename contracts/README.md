# FundTogether HED contracts

The executable protocol is `FundTogetherDisbursement`: donors fund a campaign,
the resolver reserves one evidence-backed vendor request at a time, the vendor
accepts immutable terms, and delivery/outcome evidence controls payment and
campaign wind-down. `MockUSDC` is only a local test token.

The old milestone and Workflow B contracts are intentionally absent from this
working product. Their deployments and applied data remain historical records;
they are not migrated or reused by HED.

## Verify locally

```bash
cd /mnt/c/Users/dell/Desktop/FundTogether/contracts
forge test --match-path test/unit/Disbursement/FundingAndReservation.t.sol -vv
```

The HED test suite exercises reserve custody, vendor payment limits, evidence
hash binding, challenges, takeover windows, wind-down and refunds.
