# Evidence Pipeline v0.1

> Updated: 2026-10-03
> Status: Data specifications and examples documented; backend pipeline not implemented.

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

1. Typed DTO/schema validation and tests for the documented fields and cases.
2. Authorized upload, immutable storage and manifest hashing with access tests.
3. Rule report generation and manual verifier workflow; optional analysis later.
4. Link decisions to the exact chain version and index events idempotently.

Before enabling upload, select documented file limits and access/redaction policy.
Before production, settle waiting-stage deadlines, fallback, retention and
bounded resubmissions. Provider/model and job infrastructure remain unselected.

No new backend API, storage service, AI integration or frontend journey is
claimed complete by these specifications.
