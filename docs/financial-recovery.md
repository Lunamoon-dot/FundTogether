# Financial recovery and local chain lifecycle

Updated: 2026-10-06. The new MVP deployment passes combined contract and isolated
HTTP/SIWE/storage/indexer verification. See [milestone lifecycle](./milestone-lifecycle.md)
for coverage and remaining browser/worker checks. This is not a claim of
production or Arc readiness. Update 2026-10-07: the user authorized discarding
the local prototype test chain/campaigns; the application now deploys FundTogetherMvp.

## 1. Token rejection and isolated obligations

The prototype atomically transfers bond while creating the refund snapshot.
An organizer blocklist can therefore block donor refunds. `FundTogetherMvp`
overrides bond return to create `claimableBond[campaignId]` without calling the
token. This changes payment timing, not ownership or amount:

```text
STOP / timeout / cancel -> terminal state + refund snapshot + bond credit
COMPLETED              -> final milestone transfer + bond credit
organizer claimBond    -> token transfer to the same organizer wallet
donor claimRefund      -> token transfer to that donor wallet
```

- Bond remains the organizer's separate obligation. No resolver/admin can claim,
  redirect, slash or sweep it. It never enters the donor refund pool.
- `BondReturnCredited` means money remains in escrow and can be claimed;
  `BondReturned` means a successful bond payout. An indexer/UI must distinguish
  these. The MVP milestone UI exposes organizer-only bond credit/claim and waits
  for the matching canonical BondReturned event before showing completion.
- `claimBond` and `claimRefund` use the common non-reentrancy guard. A false return
  or revert restores credit/claim rights and counters. Another wallet can still
  claim its own obligation. A successful claim cannot be executed twice.
- Rejected bond deposits roll back creation, criteria and draft-key consumption
  in atomic submission. Standalone lock failure does not create a locked bond.
- Retry goes to the same beneficiary after the token permits transfer. No new
  recipient or administrator bypass of a token blocklist is introduced.
- The token issuer can freeze all transfers or the escrow address. A contract
  cannot guarantee liquidity or bypass that restriction. Rights remain recorded;
  an issuer-approved recovery path/qualified token is required before real funds.
  Milestone budget transfer remains atomic and also requires a transferable token.

Financial state comes from the contract; failed API calls or token transfers do
not authorize database edits to mark payouts complete.

## 2. Timeout liveness

Deadlines use chain time. A deadline becoming due does not execute a transaction.
Each supported timeout remains permissionless and has an exact state/version
guard; a competing or duplicate call cannot produce a second financial transition.

`backend/scripts/local-timeout-worker.cjs` scans at most 64 campaign IDs per pass,
never donors. It covers funding failure, activation/evidence timeout, admission
expiry and the new MVP challenge timeout. It does not decide cases, settle
milestones, claim bond or claim donor refunds. No caller fee/reward is paid.

```powershell
# Read-only scan of the current local deployment.
node backend/scripts/local-timeout-worker.cjs

# For the later combined check, use a separate Anvil on 9545.
# This does not overwrite application ABI/configuration or touch Anvil 8545.
node backend/scripts/deploy-local.cjs --mvp --isolated
node backend/scripts/local-timeout-worker.cjs --deployment .local/mvp-deployment/deployment.local.json

# Enable only after reviewing the scan and running the combined verification.
node backend/scripts/local-timeout-worker.cjs --deployment .local/mvp-deployment/deployment.local.json --execute --watch
```

The worker accepts only loopback HTTP Anvil chain 31337 and an unlocked caller.
Gas is paid from that caller's ETH, separately from escrow. It rechecks code,
genesis, mined deployment anchor and MVP policy/instance, then simulates before
writing. A funded/running worker or a manual caller is still required; offline
worker, stopped RPC or insufficient gas does not extend deadlines or erase rights.
Watch mode retries temporary RPC failures; a verified identity mismatch stops
signing instead of adopting a reset. Local startup now mines a block every 5
seconds and mines submitted transactions immediately, so idle Anvil can reach
deadlines without slowing wallet confirmations. With on-demand mining only,
the last block timestamp does not advance while idle; never substitute wall time.

Intent is persisted before RPC write in `.local/timeout-worker/`, keyed by
deployment fingerprint. Hash, canonical receipt, confirmation depth, sender,
destination and the exact campaign/milestone/version event are reconciled. A
lost response without a hash or an unresolved/replaced transaction is retained,
not blindly resent. Inspect the sender's canonical transaction history before
resolving that record. A receipt is not an indexed application result.
Run one worker per deployment/sender; this local utility is not a production HA keeper.

## 3. Reorg, restoration and reset

These are different operations:

| Situation | Behavior |
|---|---|
| RPC unavailable | Keep committed checkpoint and obligations; reads fail explicitly |
| Same deployment, checkpoint orphaned | Mark old events noncanonical, rebuild only derived projection, replay canonical logs |
| Saved Anvil state restored | Verify genesis/code/anchor and continue from the last canonical checkpoint |
| Fresh reset or new deployment | Reject old manifest/plans; adopt a new verified stream, never transfer old entitlements in DB |

New manifests record the deployment receipt block number/hash. New MVP contracts
also require a nonzero public `deploymentId`; deployment tooling generates a new
random ID. It is an identity nonce, not a credential. The immutable ID changes
runtime code identity even if Anvil reuses addresses/nonces/genesis on a fresh reset.

Submission plans bind the mined anchor. Indexer stream IDs include it for new
manifests; association, evidence freeze and wallet checks reject a different
incarnation. Pending-action keys include the anchor. Existing unanchored manifests
retain their old stream/tracking keys and code/genesis/checkpoint protections;
they are not silently upgraded or given the new nonce guarantee.

Indexer rechecks deployment identity before commit. Events/projections/checkpoint
roll back together on drift. Replay uses the existing unique log identity and
canonical block hash, not another contribution/refund insert. Orphans are kept
for audit. Source records, evidence and private drafts are not deleted by replay.

Before replacing configuration, deployment tooling archives the previous manifest
and ABIs in `.local/deployment-history/`. It refuses replacement when the verified
old escrow still holds tokens, including credits/dust/unexpected inventory.
Use a separate deployment for new testing. A destroyed local chain's funds and
rights cannot be recreated from PostgreSQL; restore the saved chain or start a
new campaign explicitly. `backend/scripts/start-local-chain.ps1` persists state
periodically; use a graceful shutdown and retain that state file.

If the restored local node's clock is behind real time, interval mining alone
may retain the offset. The startup script detects a lag on an existing node;
the campaign UI also warns. After deciding to make elapsed deadlines effective,
run `node backend/scripts/configure-local-mining.cjs --sync-clock` from the root.
This verifies the deployment and synchronizes forward to current machine UTC,
without reset or deadline edits. It refuses a chain ahead of the machine clock.
Finalization and claims still require transactions; the clock repair sends none.

## 4. Rounding, zero payouts and inventory

Amounts use token base units and full-precision `Math.mulDiv`:

```text
C = total contributions; R = settled milestone budgets
P = immutable refundPool = C - R
E_i = floor(contribution_i * P / C)
S = refundPaid = sum of successful payouts
0 <= S <= P
```

Claims have no expiry. A zero entitlement can be claimed once without a token
call, and counts as consumed. Claim order does not change the entitlement; no
last-claimant bonus, loop over donors or administrative dust sweep exists.

`refundAccounting` returns paid, remaining, allClaimed and finalDust. Until the
sum of successfully claimed contribution amounts equals C, remaining also
contains unclaimed rights and finalDust is zero. Only after all rights have been
consumed is `P - S` final retained dust. This needs O(1) counters, not donor enumeration.
With C = 0, P and dust are zero and no donor can claim.

Dust stays in escrow indefinitely under the already selected policy. Unexpected
token/native transfers create no campaign contribution, bond, refund entitlement
or withdrawable surplus. Raw contract balance is not a campaign's refund pool.
For an exact-transfer token, recorded token inventory covers:

```text
unreleased donor escrow - successful refunds + locked bonds + credited unpaid bonds
```

Fee-on-transfer/rebasing tokens are not a supported accounting assumption.

## 5. Combined verification — 2026-10-06

- Contract: token false/revert at deposit/bond/refund, isolated claim failure,
  double claim, deadline equality, immutable case/versions, release rollback,
  credit ownership, random deployment identity and fuzzed one-unit dust with
  extreme contribution imbalance/full-precision multiplication.
- Worker: chain-time boundaries, current milestone/version, legacy challenge
  prohibition, terminal/review states, durable pending intent, RPC loss and
  canonical receipt/event reconciliation. Unit cases are in
  `backend/scripts/local-timeout-worker.test.cjs` (8 pass). The milestone smoke
  also runs the actual worker on an isolated chain through RPC outage, retained
  unknown-send intent, restart and policy mismatch. Continuous/HA operation is TODO.
- Backend/frontend: anchor mismatch, stale plan/wallet identity, batch drift
  rollback; the isolated publication smoke adds actual full-chain reset rejection.
  Publication (202 checks) and refund (377 checks) smokes were rerun successfully.
- Contract regression: 200 tests pass with fuzz/invariant; milestone smoke:
  467 HTTP/SIWE/storage/receipt/index checks pass. Backend 96 tests and frontend
  88 tests pass; builds/typecheck and FE lint pass. See PROJECT_PROGRESS.
  The application prototype was not reset/redeployed. Actual browser wallet
  interactions remain to be checked on a separately planned MVP deployment.
