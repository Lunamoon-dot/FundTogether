# Evidence Pipeline v0.1

> Updated: 2026-10-03
> Status: Specifications documented; schema/metadata ownership foundation exists; upload, storage, auth and report workflow not implemented.

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
Assigned verifier -> on-chain admission -> 72-hour donor review
```

Original files and manifests are immutable after freeze. Reports can be rerun
with a new pipeline version without changing the package hash. New organizer
evidence creates a new package/version. Reports cannot overwrite chain decisions.
Rule/AI flags do not authorize funds movement; disputed merits go to resolver.

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

1. ~~Typed DTO/schema validation~~ (schema parser implemented; route-level API
   integration and automated test coverage remain).
2. Authorized upload, immutable storage and manifest hashing with access tests.
3. Rule report generation and manual verifier workflow; optional analysis later.
4. Link decisions to the exact chain version and index events idempotently.

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
