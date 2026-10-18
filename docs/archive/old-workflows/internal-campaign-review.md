# Internal campaign review — approved MVP slice (2026-10-04)

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


The user has moved the 2-of-3 committee to post-MVP. MVP uses the configured
permissioned resolver, with system checks before human review. ADMIN and
RESOLVER are separate application roles; neither grants contract authority.

## Delivery and checks

1. Persist staff roles and immutable review records. Check role revocation,
   linked resolver wallet, self-review denial and duplicate decisions.
2. Provide `/internal/campaigns` and detail: show committed dossier, technical
   checks and human review reason. Approval intent is not chain approval.
3. Show decisions to organizer. Request changes preserves the frozen plan;
   organizer cancels the old unpublished campaign, receives bond through the
   existing contract, then creates one linked editable draft with a new key.
   Organizer can also cancel any submitted unpublished DRAFT/APPROVED dossier
   to stop or recover from an expired deadline; resubmission gets a new review.
4. Verify API/DB/chain workflow on disposable Anvil, plus builds and unit tests.

## Authority and money

Funds remain in the contract; only the organizer signs cancellation and only
the configured resolver signs approval. The backend never transfers tokens.
Failed cancellation keeps the bond and blocks revision; confirmed cancellation
must also be indexed before creating the next draft. No second revision is
created on repeated requests. No frozen financial plan is edited.

Technical checks verify chain identity, commitments, token, budgets, criteria,
bond and deadline. They do not prove real-world charity claims. Human review
must assess the dossier and explain its decision. Decisions are append-only
per submission; canonical events determine financial state.

Dispute arbitration UI depends on the still undefined CHALLENGED exit and
verdict effects. This slice does not invent those financial rules. Committee,
staff management UI and assignment scheduling remain post-MVP.

## Local staff provisioning

From `backend`, an operator with database access can run:

```powershell
node scripts/staff-role.cjs huyteenpast10@gmail.com ADMIN RESOLVER
```

The account must already exist. Omitting roles revokes application staff access;
ADMIN alone cannot review/sign. There is no public self-promotion endpoint.
App role revocation prevents new API-authorized signing; it does not revoke the
immutable contract resolver key or cancel already submitted transactions.
The configured resolver remains a trusted financial actor, including direct
contract calls. System checks and audit records do not remove that trust.

Human dossier review in this slice covers the campaign plan, budgets and criteria.
Organization identity documents, case assignment and real-world verification
integrations are not yet implemented. A role holder affiliated with the organizer
cannot review that campaign; a fixed resolver conflict requires a different
organizer in the local demonstration, not bypassing the conflict guard.
