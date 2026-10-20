# FundTogether VNext — Threat Model

> **Status:** Accepted-risk model for the pure-decentralized target. This file
> identifies what the protocol accepts, what must fail closed and which tests
> provide evidence. It does not claim Sybil resistance, factual evidence
> verification or public-chain safety.

**Reference:** [Protocol Specification V1](FUNDTOGETHER_VNEXT_PROTOCOL_SPEC_V1.md)
**Parameters:** [Parameter Registry V1](parameters-v1.md)

## 1. Trust boundaries

```text
Wallets/signers
  → Campaign/Jury contracts: canonical custody and transitions
  → Events: canonical history
  → Idempotent indexer: derived projection
  → PostgreSQL/API: searchable read model
  → MinIO: private evidence/PDF bytes
  → UI: presentation and transaction requests
```

The contract does not trust a backend verdict, database row, uploaded filename,
UI role label or submitted transaction hash. The backend does not hold a key
that can redirect campaign funds.

## 2. Assets and security properties

| Asset | Required property | Failure consequence |
| --- | --- | --- |
| Backer contribution escrow | No unauthorized release and no double claim | Financial loss |
| Milestone payout budget | Exact frozen amount and one payout | Over-release or creator dispute |
| Judge stake | Reservation, slash and unlock are bounded | Judge asset loss or locked funds |
| Appeal bond/review fee | Separate accounting and deterministic settlement | Griefing or stuck review |
| Evidence commitment | Revision/hash cannot mutate after enrollment | Review of different bytes |
| Final ruling | Immutable after finality | Reopened or conflicting payout |
| Refund pool | Snapshot solvency and claim uniqueness | Double refund or insolvency |
| Event history | Canonical identifiers and replay idempotency | False UI/accounting state |

## 3. Threat catalogue

### T01 — Sybil wallet concentration

**Attacker:** One actor controls multiple wallets and stakes each one.
**Effect:** More seats and greater court influence.
**Protocol response:** Uniform wallet selection, minimum case stake and public
assignment.
**Accepted limitation:** Wallet selection is not human selection; no one-human
identity is required in V1.
**Tests:** assignment concentration simulation; no vote-weight multiplication.

### T02 — Creator self-review or identity splitting

**Attacker:** Creator's campaign wallet enrolls as a Judge or uses another
wallet controlled by the same person.
**Effect:** Biased review.
**Protocol response:** Exclude the exact Creator address and record the
limitation that a second Sybil wallet cannot be proven as the same human.
**Tests:** creator address rejected; second wallet remains an accepted risk.

### T03 — Court collusion

**Attacker:** A group controls enough seats to determine court or multi-court
majority.
**Effect:** Incorrect payout/refund verdict.
**Protocol response:** Random assignment, one vote per seat, stake exposure,
commit–reveal and public events.
**Accepted limitation:** Staking is not collusion resistance.
**Tests:** adversarial court simulations and false PASS/FAIL metrics.

### T04 — Bribery and vote coercion

**Attacker:** Pays or pressures a Judge before or after reveal.
**Effect:** Vote deviates from the Judge's independent assessment.
**Protocol response:** Commit–reveal hides plaintext before reveal.
**Accepted limitation:** Reveal makes a vote observable and does not eliminate
off-system bribery.
**Tests:** commitment hiding, reveal binding and no plaintext commit event.

### T05 — Judge no-show / liveness attack

**Attacker:** Assigned Judge does not commit or reveal.
**Effect:** Review cannot reach a valid court and may delay payout/refund.
**Protocol response:** V1 invalid-court rule, bounded retries, timeout and
`PROTOCOL_FAIL`.
**Required property:** No-show never silently becomes PASS.
**Tests:** missing commit, missing reveal, retry exhaustion and terminal caller.

### T06 — Appeal pool exhaustion

**Attacker:** Opens or causes appeals when fresh Judges are scarce.
**Effect:** Delay or terminal protocol failure.
**Protocol response:** Appeal bond/fee, maximum rounds and non-overlapping pool.
**Accepted limitation:** A valid appeal can still fail for lack of liveness.
**Tests:** exhausted pool, accepted appeal with no quorum and final failure.

### T07 — Evidence withholding or unavailable storage

**Attacker:** Storage operator withholds private bytes or Creator submits an
unavailable reference.
**Effect:** Judges cannot inspect the committed evidence.
**Protocol response:** Hash/revision identity, authenticated retrieval and an
explicit availability timeout.
**Accepted limitation:** Hash proves byte integrity, not availability or truth.
**Tests:** expired ticket, missing object, hash mismatch and retry behavior.

### T08 — Replay or revision confusion

**Attacker:** Reuses a vote, commitment, evidence hash or payout call in another
round/milestone.
**Effect:** Wrong case gets a financial right.
**Protocol response:** Bind chain, policy, campaign, milestone, revision, case,
round, court and Judge in IDs/commitments; one-time settlement flags.
**Tests:** same commitment in another round, same revision twice and duplicate
payout/refund.

### T09 — Front-running permissionless settlement

**Attacker:** Submits the same eligible payout/refund/timeout first.
**Effect:** Race for execution or another user's claim.
**Protocol response:** Any caller may trigger only a state-eligible transition;
recipient and amount come from frozen state.
**Tests:** two callers, one successful transition, no recipient redirection.

### T10 — ERC20 transfer failure / malicious token behavior

**Attacker:** Token transfer returns false, reverts or behaves unexpectedly.
**Effect:** State and balance diverge.
**Protocol response:** Safe transfer, state update ordering, revert atomicity
and pilot token allowlist.
**Tests:** failing token mock and post-revert accounting equality.

### T11 — Gas and unbounded iteration

**Attacker:** Creates enough Judges/courts to make finalization impossible.
**Effect:** Funds or stake become stuck.
**Protocol response:** Bounded batches and pull-claim settlement; explicit local
supported limit.
**Tests:** 1/2/10/configured maximum courts and partial batches.

### T12 — Indexer or database forgery

**Attacker:** Duplicate, reordered or fabricated API/database event.
**Effect:** UI shows a payout/refund that did not happen.
**Protocol response:** Contract event identity, canonical receipt, idempotent
replay and no financial inference from projections.
**Tests:** replay block range twice, missing event, fabricated row and stale UI.

### T13 — Rounding and surplus leakage

**Attacker:** Exploits pro-rata rounding or overfunding accounting.
**Effect:** Refund pool exceeds escrow or hidden extra creator payout.
**Protocol response:** Integer math, fixed snapshot, deterministic dust rule and
explicit surplus policy.
**Tests:** contribution sets with remainders and overfunded campaigns.

## 4. Fail-closed requirements

The protocol must fail without payout when:

- no valid final PASS exists;
- evidence revision does not match the case;
- court assignment is duplicated or invalid;
- appeal is active or challenge condition has not passed;
- escrow is insufficient;
- token transfer fails;
- randomness or evidence availability exceeds its frozen timeout;
- a duplicate payout/refund/settlement is attempted.

The protocol must preserve a caller-triggerable terminal path after frozen retry
and deadline limits. Terminal failure must not be reinterpreted as proof of
Creator misconduct.

## 5. Security evidence required at Gate Z

- [ ] Foundry access-control, replay, reentrancy and integer tests pass.
- [ ] I1–I10 invariant suite passes with generated sequences.
- [ ] Assignment and commitment identities are independently recomputable.
- [ ] Indexer replay produces no duplicate financial claim.
- [ ] Fresh runtime demonstrates payout/refund conservation.
- [ ] Accepted risks are reported with measured false PASS/FAIL and liveness
  results, not only prose.
