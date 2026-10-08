# Account → campaign publication workflow audit — 2026-10-05

> Later updates on 2026-10-05: Anvil reset erased the initial deployment. The user
> authorized clearing the database and recreated the two application accounts.
> A new atomic-capable deployment is now running; backend/public API return 200
> and indexer is ready at block 2/2. The persistent chain launcher restores
> `.local/anvil/state.json`; genesis, block hash, receipt and contract code were
> verified across restart. The campaign/bond state below is historical: the old
> `sadas` record was removed during cleanup. Repeat the workflow from account,
> wallet linking and organization setup instead of resuming its old approval.

## Scope and verified boundaries

This audit covers account login, SIWE wallet linking, organization representative
selection, frozen submission, bond custody, human review, resolver transaction,
organizer publication and indexing. It does not certify the complete donor,
evidence, challenge or dispute UI journey.

Application roles and human reviews live in PostgreSQL. Wallet ownership requires
SIWE. The contract owns approval, publication and escrow. Public visibility
requires the canonical publication event processed by the indexer.

## Repairs

- Wallet linking pins the signing address and checks account/address/chain before
  and after the nonce/signature requests. A hung signing request expires after
  90 seconds; late signatures cannot continue to the linking API.
- Account actions and review decisions have synchronous duplicate-click guards.
- API requests expire after 20 seconds with a message that a timed-out write may
  have completed. File transfers use 120 seconds. Requests are not retried
  automatically as writes.
- Submission receipt tracking retains replacement hashes, preserves a pending
  hash after RPC timeout and rejects wallet cancellation even when the replacement
  receipt succeeds. The wallet is checked again after simulation before sending.
- Submission synchronization reads one confirmed block and checks its hash again
  before updating the database, including the absent-draft-mapping branch.
- Account UI shows the full connected address and configured resolver address.
  Review history identifies the actual reviewing account separately from the
  configured resolver wallet; saving a human review does not prove wallet control.
- The auth smoke fixture now includes the budget required by the current draft API.

## Verification

- Frontend: 57 tests pass; TypeScript/Vite build and lint pass.
- Backend: 14 suites / 73 tests pass; Nest build passes.
- Contracts: 13 suites / 185 tests pass, including fuzz, bond/refund boundaries,
  authorization, atomic submission rollback and reentrancy.
- Isolated port-9545 Anvil/HTTP/PostgreSQL/indexer smoke: 197 checks pass, including
  SIWE, role revocation, self-review prevention, approval/publication, bond return,
  duplicate replay, restarts, RPC/database failure and reorg recovery.
- Auth HTTP/PostgreSQL smoke: 40 response checks pass.
- Organization wallet HTTP/PostgreSQL smoke: 32 checks pass.
- Active backend health returns 200; public API reports indexer ready at block 22.
- A browser fixture using the actual account component and a mock provider that
  never answers `personal_sign` sent exactly one nonce request. After 90 seconds,
  its link/logout buttons were enabled and the timeout recovery message appeared.
  No linking request was sent; the temporary fixture/tab was removed afterward.

Tests use their own disposable accounts and remove their own rows. The integration
chain uses port 9545; application chain 8545 and existing campaign funds stay live.

## Application state at the initial audit (historical)

| Item | State checked during this audit |
|---|---|
| Organizer account | `huyteenpast10@gmail.com`, application USER |
| Representative wallet | `0x0922f90e92b9e87748be804f390497a9183d7619`, chain 31337 |
| Spendable bond token | 878 MockUSDC |
| Resolver account | `abc@gmail.com`, role RESOLVER, no linked wallet |
| Configured resolver | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| `sadas` | ID 2, 122 MockUSDC locked, human approve saved, chain DRAFT |
| `ádfas` | ID 1, no bond locked, incomplete submission |

Values above are a dated snapshot, not a replacement for live readback.

## Repeat the workflow

1. Confirm that opening MetaMask alone remains stable. An extension crash outside
   FundTogether remains an external blocker; application tests do not certify its
   recovery.
2. Sign in to the organizer account at `#/account`. Connect its representative
   address on chain 31337. The stored linked wallet and currently connected wallet
   must match when sending organizer transactions.
3. Open `#/organizations`, select the organization, then its campaign workspace.
   Its representative is already bound. For a new campaign, use a largest
   milestone budget no greater than the live spendable token balance; ETH pays
   gas and does not pay the MockUSDC bond.
4. Complete campaign details/budgets/criteria, confirm the review step, select a
   future funding deadline and submit. Wait for the explicit bond-in-escrow state.
   A successful create/criteria/allowance transaction alone is incomplete.
5. Sign in to `abc@gmail.com`. To read and save a human review, role RESOLVER is
   sufficient; it does not require a connected wallet. Open `#/internal/campaigns`
   and inspect the exact campaign title and chain ID before recording a decision.
6. For blockchain approval, connect the exact configured resolver address above
   and explicitly link it using SIWE on `#/account`. Return to that campaign and
   click “Duyệt campaign bằng ví resolver”. Confirm the transaction, then wait for
   APPROVED and indexed state. A different Anvil account cannot sign this action.
7. Return to the organizer account and connect its representative wallet. Open the
   organization's campaign detail and click “Công bố campaign bằng ví tổ chức”.
   Confirm and wait for indexed FUNDING plus the public campaign link.
8. Open that public link or the explore feed. It becomes public after publication
   and indexing, not after saving a human decision or locking bond.

To continue existing `sadas`, start at step 6; its human review and bond are already
present. Do not create another campaign merely to repeat those steps.

## Remaining constraints

- The active deployment still uses separate create, per-milestone criteria,
  allowance and bond transactions. The atomic implementation passes isolated
  tests but is not active; switching deployments would affect access to the
  existing 122 MockUSDC escrow and needs a deliberate recovery/cutover decision.
- A wallet signing timeout cannot close an extension popup. Close its old request
  before retrying. SIWE late results are ignored by the application.
- Transaction receipt timeouts retain their hashes. Reconcile or replace/cancel
  the transaction in the wallet before issuing another attempt.
- Native MetaMask signing and the user's full browser workflow still need their
  manual confirmation; no user account's signature or on-chain approval was forged.
