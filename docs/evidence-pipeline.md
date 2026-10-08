# Evidence Pipeline v0.1

> Updated: 2026-10-05
> Status: Private draft/upload and frozen manifest are implemented locally. On-chain evidence submission remains pending; the separate verifier workflow is deferred to post-MVP.

The user approved [resolver-led MVP completion](./mvp-milestone-completion.md)
on 2026-10-05. The new `FundTogetherMvp` source has admission and bounded disputes;
the current deployed prototype still uses assigned verifier admission. Public
redacted packages, resolver original-file access and case/API/indexer/UI wiring
are required before exposing the new signing journey.

## Source documents

The design corpus now lives in this repository at `v0.2/`.

- [Evidence Schema v0.1](../v0.2/FundTogether_Evidence_Schema_v0.1.md)
- [Verification Report v0.1](../v0.2/FundTogether_Verification_Report_v0.1.md)
- [Worked example and acceptance cases](../v0.2/FundTogether_Evidence_Example_v0.1.md)
- [Verifier authority](../v0.2/FundTogether_Verifier_Specification_v0.1.md)

## Boundaries

```text
Organizer draft -> mandatory file/schema checks -> frozen package/manifest
  -> authenticated wallet commitment -> confirmed event -> indexed projection
Frozen package -> rule checks -> optional OCR/AI -> versioned report
MVP resolver -> on-chain admission -> 72-hour donor review
Donor case -> 7-day response -> 7-day resolver decision / permissionless timeout
```

Original files and manifests are immutable after freeze. Reports can be rerun
with a new pipeline version without changing the package hash. New organizer
evidence creates a new package/version. Reports cannot overwrite chain decisions.
Logic/system integrity and criteria checks precede admission. Evidence and
challenge each have verification; organizer response and re-verification should
resolve correctable issues before unresolved/deadline-escalated disputes go to
the resolver. Rule/AI flags do not authorize funds movement. Resolver also
approves campaign dossiers after prior system checks; that campaign workflow is
specified in [Verification and resolver workflow](./verification-and-disputes.md).

Use integer strings with explicit currency/units. Do not mix VND and USDC or
infer release amounts from expense totals. Duplicate documents are warnings
requiring context, not automatic fraud findings. Checklist changes must not be
applied retroactively to approved criteria.

SHA-256 exact UTF-8 frozen manifest bytes is the specified commitment format;
the current contract stores opaque bytes32 and does not verify files. Reports
and expiring download URLs are excluded from the organizer manifest.

Restricted originals and public redacted derivatives have separate hashes and
access rules. Public viewers cannot necessarily verify restricted source bytes.
Optional OCR/AI failure produces a partial report and manual review path;
mandatory safety/integrity checks remain required.

## Next implementation steps

1. Authenticated browser verification of the private upload and frozen-manifest flow.
2. Add donor-readable redacted packages and authorized resolver access to restricted originals, with immutable version/hash binding.
3. Integrate the approved new contract, organizer-signed submission, resolver admission/cases, version matching and idempotent indexing before enabling transactions.
4. Post-MVP: authorized verifier access, report generation and manual verifier decisions.

## Local implementation checkpoint — 2026-10-05

- The organizer can save a private draft, upload restricted originals, and freeze a package for the current milestone while the campaign is funded, or after activation before the evidence deadline. Freeze validates the live campaign identity, approved criteria, current draft revision, and stored file hashes.
- PostgreSQL stores the exact manifest UTF-8 bytes and SHA-256 commitment. The organizer-only download returns those bytes after checking the stored hash; no public evidence or on-chain submission is created by freeze.
- At this checkpoint the published campaign was `FUNDED` with milestone 0 pending. Freeze works before activation; authenticated browser use still needs confirmation. Evidence admission/challenge/settlement integration remains pending. Refund lifecycle has its own implementation checkpoint in [Refund lifecycle](./refund-lifecycle.md).

## Backend implementation checkpoint — 2026-10-03

This checkpoint describes local implementation work. Backend source is committed
separately from the documentation publication.

- Added private campaign and evidence draft routes with JSONB content,
  schema-version storage, organizer authorization and optimistic revisions; see
  [Backend Step 2](./backend-step-2-drafts.md).
- Added wallet-based SIWE session endpoints and a protected campaign ownership
  example; see [Backend Step 1](./backend-auth-step-1.md).

- Added a strict Zod parser for Evidence Schema v0.1, including supported
  document MIME types, EVM addresses/hashes, integer strings, unique IDs and
  document/expense references.
- Added a campaign metadata ownership guard service for authenticated user IDs.
- Campaign chain ownership projection, evidence routes/persistence, criteria
  hash/version verification, upload, freeze and manifest hashing are not
  implemented by this checkpoint. SIWE nonce storage is in process memory.
- Verification: backend Nest build succeeds. Automated evidence schema and
  access tests have not yet been added.

Before enabling upload, select documented file limits and access/redaction policy.
Before production, settle waiting-stage deadlines, fallback, retention and
bounded resubmissions. Provider/model and job infrastructure remain unselected.

No new backend API, storage service, AI integration or frontend journey is
claimed complete by these specifications.
