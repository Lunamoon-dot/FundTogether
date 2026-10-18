# Refund lifecycle — local MVP

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Implemented on 2026-10-05. Contract accounting is unchanged; this slice adds authenticated reads, wallet actions and indexed history.

That checkpoint describes the deployed prototype. New MVP [financial recovery](./financial-recovery.md)
separates bond credit/claim and adds O(1) paid/consumed-contribution counters.
Source compiles but is not deployed or integrated into claim UI/indexing. The
rounding/entitlement policy below is unchanged; atomic bond-return blocking is
removed only in the new variant.

## States and actions

```text
FUNDING → organizer cancelCampaign → CANCELLED
FUNDING + deadline reached + goal not met
        → anyone finalizeFundingFailure → FUNDING_FAILED
FUNDED / MILESTONE_SETTLED + activation deadline reached
        → anyone finalizeMilestoneTimeout(current index) → FAILED
MILESTONE_ACTIVE + evidence deadline reached
        → anyone finalizeMilestoneTimeout(current index) → FAILED

Terminal transaction → RefundPoolSnapshotted + separate BondReturned
Donor claimRefund → receipt + RefundClaimed → canonical indexer → history
```

The UI requires a signed-in account with a SIWE-linked wallet for these actions. The contract allows permissionless finalization; no RESOLVER app role is needed. Organizer cancellation is available only while the public campaign is FUNDING. FUNDED cannot be cancelled through this action.

## Money and authority

- Recorded donor contributions are held by the contract. Backend/API never holds a signing key or transfers funds.
- A refund opens only after a successful terminal contract transaction snapshots the pool. Passing a deadline alone does not open it.
- Before any release, pool = totalContributed. After a timeout following releases, pool = totalContributed − totalReleased. The organizer bond is separate and returned to the organizer by the terminal transaction.
- Each contributing wallet can call `claimRefund` once. The contract transfers only to `msg.sender`; there is no editable recipient or API-supplied payout amount.
- Entitlement is `floor(contribution × snapshotPool / totalContributed)`, using integer units. Multiple donations by the same wallet are accumulated. Pool is immutable and does not decrease as claims are paid.
- A token transfer revert rolls back the claim flag and event, preserving the right to retry. A second successful claim and a non-donor claim revert.
- Zero-rounded entitlements remain claimable under the existing contract. The UI explains that signing records completion without receiving tokens and still costs gas. No token approval or token balance is required for refunds; native ETH pays local gas.
- Dust remains in escrow. Persistent token transfer failure can block payouts; failure to return bond can also block the atomic terminal transition. No sweep or alternate recipient policy is introduced.

## Fixed MVP rounding and conservation policy

For a snapshotted campaign, use token base units throughout:

```text
T = total successful donor contributions
R = donor funds already released to the organizer
P = immutable refund snapshot = T - R
E_i = floor(C_i * P / T), when T > 0
S = sum of successful claim payouts
U = sum of entitlements belonging to wallets that have not claimed
D = P - sum(E_i), across every contributing wallet

S <= sum(E_i) <= P
P = S + U + D
0 <= D < N base units, where N is the number of contributing wallets
```

With no contributors, P, S, U and D are zero and no wallet may claim. Before
any release, P = T, each entitlement is exactly its contribution and D = 0.
After a partial release, OpenZeppelin `Math.mulDiv` computes the full-precision
floor even when the intermediate product exceeds uint256. Contributions and
the denominator cannot change after the snapshot.

Claims have no expiry. Each wallet has one successful claim, including a
zero-rounded payout; a reverted transfer preserves its claim right. Claim
order does not alter any entitlement. The last claimant receives no bonus.
Dust remains in escrow indefinitely under the MVP: no organizer, resolver or
admin sweep exists. Introducing a future destination would require a separately
approved protocol change, not an API/UI rule or an admin transfer.

P - S is **not** automatically dust: it also contains unclaimed obligations U.
The contract's overall token balance can also include other campaigns' funds,
bonds and unsolicited transfers. None of those enter this campaign's pool.
Canonical events support off-chain accounting. The prototype has no aggregate
payout counter; the new variant records paid/claimed-contribution totals without
enumerating donors and exposes finalDust only after all claims. The UI
explains the policy without labelling an unmeasured escrow balance as dust.

## API and synchronization

`GET /refunds` returns only campaigns with canonical donations from the account's linked wallets. `GET /refunds/:metadataId` returns a valid published campaign and refund rights for the same account's linked wallets. Both require account authentication; neither accepts a wallet address as proof of ownership.

Reads use the verified deployment and one canonical indexed checkpoint. Response amounts are decimal integer strings: contribution, entitlement, unclaimed amount, pool, released amount. Responses include checked block/hash, chain timestamp, current milestone/deadline, finalization eligibility, snapshot transaction and canonical claim transaction/block. Chain flags must agree with indexed events. A missing checkpoint, deployment mismatch, rebuild or changed checkpoint returns an error rather than a false zero balance/success.

The frontend checks fresh session links, connector/account/network identity, application RPC and wallet RPC deployment identity, live campaign state and deadline, and simulation before asking for a signature. Transactions are tracked separately as wallet request, hash, confirmed receipt, then indexed event. Receipt checks include contract, campaign, donor/amount or current milestone, transaction sender/destination and canonical block hash.

Pending hashes persist per deployment, metadata ID, account and wallet. Reloading resumes receipt checks. Wallet cancellation/revert clears the failed hash; timeout retains it. Replacement hashes and late wallet responses are retained. Dropping tracking does not cancel a transaction; the UI explains the extra-gas risk and rechecks chain rights before another signature.

## Manual browser check

1. Create a separate campaign, obtain resolver approval, then publish. Donate less than its goal from a different SIWE-linked wallet. A new application account is optional if the donor wallet can be linked to the existing account.
2. On its public detail page, the organizer confirms and signs **Ký hủy campaign**. Alternatively let its short funding deadline pass and sign **Chốt gây quỹ thất bại và mở hoàn tiền**.
3. Return as the donor. Open **Đóng góp của tôi** → campaign → **Hoàn tiền**. Check the wallet and amount, then sign **Nhận hoàn tiền**.
4. Reload while receipt/indexing is pending. It should resume checking without another signature. The token balance should increase by the entitlement, and history should contain the canonical refund transaction.
5. The same wallet should have no second claim button. Other non-donor wallets must have no claim right.

Do not cancel or time-warp the existing funded campaign to test this. Local Anvil with automining advances its chain timestamp when a new block is mined; a wall-clock deadline alone may not appear reached on an idle chain. UI eligibility follows the indexed chain clock. The isolated smoke script mines its own deadline blocks and never resets the application's chain.

## Campaign guidance and transaction feedback

The campaign page shows who acts next and which wallet is required. Deadlines
and remaining time use the timestamp of the indexed block, not the PC clock.
After funding, the next organizer action is milestone activation; once the
activation/evidence deadline is reached, linked wallets can finalize timeout to
open the refund snapshot. Terminal states then direct donors to their own claim.
Verifier review and challenged recovery are explicitly marked as unavailable in
the current MVP interface.

Refund controls list the contributing wallets linked to the signed-in account,
with each wallet's claimable amount and whether it has already claimed. Select
that exact wallet in the wallet selector. Disabled controls state whether the
blocker is wallet linking, chain, gas, deadline, missing snapshot or prior claim.
No token approval is required to claim.

Transaction progress is:

```text
Waiting for wallet → Submitted hash → Verified successful receipt → Indexed event
```

A receipt does not finish the application action. The canonical indexed event
must match the operation/hash/amount. The indexer recheck button only reloads
data; it never asks for another signature. An approval receipt still requires a
separate donation transaction. Private claim amounts are not exposed by the public
campaign workflow response.

Manual checks: choose an unlinked/wrong wallet, wrong chain, zero gas, before/at
deadline and already-claimed wallet; verify a specific reason appears alongside
each disabled action. Reject a signature, reload after receiving a hash, and
check receipt/index lag without signing twice. Preserve the funded campaign;
use separate campaigns for cancellation/timeout experiments.

## Automated verification

From `backend/`, after a backend build and a current `forge build`:

```powershell
node scripts/refund-lifecycle-smoke.cjs
```

The script owns Anvil port 9545, ephemeral accounts/deployment and disposable database fixtures. It verifies real HTTP/SIWE, two donors and repeated donations, cancellation and separate bond return, funding expiry, receipt/index lag, replay, API restart, orphaned claims after reorg, partial refunds after release, zero-rounded claims, dust and rejected duplicate/non-donor claims. It removes its fixtures and stops its chain.

Replay verification rewinds only the disposable stream's checkpoint and rereads
the same logs three times. It compares event rows, canonical contribution and
refund counts/sums, campaign financial projections, contribution history and
refund rights, including after restart and reorg. Observation blocks may advance
when a wider batch is replayed; financial state and event identities must not.
Two independent worker instances exercise the database stream lock. An injected
failure after event upserts checks that events, projections and the checkpoint
roll back together before retry. A caught-up `runOnce()` alone is not treated
as evidence of log replay.

Contract hardening checks, from the repository root:

```powershell
wsl.exe --cd "$((Get-Location).Path)\contracts" -- bash -lc 'FOUNDRY_INVARIANT_RUNS=128 FOUNDRY_INVARIANT_DEPTH=128 FOUNDRY_INVARIANT_FAIL_ON_REVERT=true ~/.foundry/bin/forge test --fuzz-runs 1024 --match-contract "FundTogether(Refund|Timeout|RefundInvariant)Test" -vv'
```

The stateful harness interleaves claims, rejected duplicate/non-donor claims,
failed transfers followed by retry, deposits/cancellation/refunds of another
campaign and unsolicited tokens. It checks entitlement bounds, immutable pools and escrow
conservation after every action. Separate fuzz cases vary 2–32 contributors,
release/pool amounts and claim order; a 2-versus-128 donor gas check guards
against adding donor enumeration to claims. Harness donor loops and ghost
accounting never execute in the deployed contract.

Actual browser extension signing remains a manual check. Separate verifier UX, challenge/misconduct decisions and their slash/refund rules remain outside this slice. The smoke script uses existing verifier contract methods only to produce a settled milestone fixture for proportional-refund accounting.
