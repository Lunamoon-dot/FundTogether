# Pure Decentralized Protocol Implementation Plan

> **Status:** Target implementation plan. No task in this file is evidence that
> the new protocol is already deployed.

**Goal:** Replace the current Resolver-controlled Campaign lifecycle with a
permissionless stake-backed Judge protocol while preserving escrow conservation,
idempotent indexing and the digital-comics/PDF product boundary.

The detailed acceptance contract for this plan is
[FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md](../../protocol/FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md).
The complete A–Z execution sequence is tracked in
[2026-10-20-vnext-a-z-build-roadmap.md](2026-10-20-vnext-a-z-build-roadmap.md).

## Work order

1. **Freeze the protocol policy**
   - Record risk-adjusted minimum stake, lock/unlock rules, enrollment/commit/
     reveal/appeal/correction deadlines, selection randomness, review fee,
     rewards/slashing, non-reveal, no-quorum behavior, challenge cost,
     evidence availability and multi-court aggregation.
   - Verify that every rule has a fund owner, failure path and timeout.

2. **Specify the contract state machine**
   - Define publication, funding, milestone, base review, appeal, challenge,
     correction, payout, protocol-failure and refund cases.
   - Define exact transitions, authorization, events and conservation invariants.
   - Remove Resolver/Admin financial authority from the target ABI.
   - Bind payout authorization to the exact evidence revision and `FINAL_PASS`.

3. **Implement and test the Campaign contract**
   - Add eligibility snapshots, random three-Judge courts, stake locks,
     one-vote-per-seat and two-of-three court resolution.
   - Add commit–reveal, invalid/tie handling and versioned multi-court
     aggregation.
   - Add isolated Base/Appeal pools and bounded appeal rounds.
   - Add milestone evidence commitments, challenge windows and exact payouts.
   - Add bounded correction, `FINAL_PASS`, `VERDICT_FAIL` and `PROTOCOL_FAIL`.
   - Add permissionless timeout and refund actions.
   - Add unit, fuzz and invariant tests for unauthorized, duplicate, failed,
     replayed, underfunded and non-reveal actions.

4. **Build the canonical indexer projection**
   - Index snapshots, court assignments, stake, commits/reveals, resolutions,
     appeals, revisions, challenges, payouts and refunds using event identity.
   - Replay events and prove that duplicates do not create duplicate claims.

5. **Update backend and storage boundaries**
   - Keep SIWE, input validation, private evidence storage and API projections.
   - Remove database-only Resolver approval gates.
   - Grant Judge dossier access from canonical assignment, not a role label.

6. **Build Creator, Backer and Judge journeys**
   - Creator: proposal, evidence, case status, milestone submission and payout
     status.
   - Backer: pledge, observe cases, challenge where eligible and refund.
   - Judge: stake, eligibility, assigned cases, one vote, commit/reveal,
     lock/reward/slash status.
   - Admin: read-only operational and indexer health views.

7. **Reset disposable local runtime and verify**
   - Deploy fresh Anvil state and MockUSDC/Campaign contracts.
   - Migrate the isolated database and seed separate Creator, Backer and Judge
     wallets.
   - Run contract, backend, indexer, frontend and browser acceptance.

## Explicit non-goals

- physical fulfilment, shipping or inventory;
- centralized Resolver fallback;
- backend custody of campaign funds;
- claims that hashes or majority votes prove real-world truth;
- public-chain or real-money launch acceptance.
