# Workflow B preparation tools

The offline `fixtures.cjs` / `accounting.cjs` tools cover steps 1–2 of
[the delivery plan](../../../docs/workflow-b-delivery-plan.md), under
[GOAL.md](../../../GOAL.md). Those two tools have no RPC, DB, storage, account or wallet
connection and must not be imported into production financial/action gating.

The user approved B-D01–B-D10 for the local pilot on 2026-10-09. Frozen files
generated earlier retain their historical DRAFT status and hashes; they are not
silently upgraded or regenerated as on-chain artifacts. The approved policy is
in the linked B specification/financial rules. The code plan has been approved;
the separate contract/artifact/deployment tools in this folder implement C1–C6.
The offline tools described below remain synthetic preparation only. Runtime
helpers now cover the approved C/B/F/I work; use the
[local runbook](../../../docs/workflow-b-local-runbook.md) for startup/seed,
HTTP journeys, isolated recovery, A/B comparison and neutral reviewer fixtures.
They touch the guarded B environment or an owned disposable fork as documented.

Run from the repository root with Node (verified with v24.21.0):

```powershell
node --test backend/scripts/workflow-b/fixtures.test.cjs
node backend/scripts/workflow-b/fixtures.cjs
```

The generator writes `docs/examples/fixtures/workflow-b/`: two plans/checklists,
a DRAFT policy proposal, 12 synthetic evidence packages (original/public), a
catalog with SHA-256 hashes of persisted bytes, separate reference labels and
eight traces in MockUSDC base units. Runs are deterministic. Existing different
bytes cause an error; they are not overwritten. For experiments/changes, call
`buildFixtures(outputDir)` from another script with a new dedicated folder and
keep the old manifests. No dependencies or environment variables are needed.

`accounting.cjs` uses bigint for C/R/A/F/E conservation, one budget per stage and
proportional immutable-base plus cumulative supplemental refunds. This is a
calculation of a **proposed** policy. `accept` assumes all review conditions were
met; `note` is a descriptive annotation with no effect. No deadlines, signer,
transfer failure, reentrancy, receipt or indexer are simulated. Numeric PASS is
not contract/integration/MetaMask acceptance.

All identities and receipts are fictional; SVG images are labeled illustrations,
not field photos. JSON/SVG files and offline context are not the existing
production upload formats or evidence DTOs. Production-format PDF/PNG fixtures
and upload/access verification are available separately in the runtime helpers.
`original`/`public` directories model redaction, not enforced filesystem access.
Never publish genuine private material by relying on those names.

Reference labels are predetermined from the authored synthetic rubric, with no
independent field reviewer. Keys such as `wrong-signer` reveal the variant;
the separate `reviewer-fixtures.py` produces new bundles with neutral IDs and new
hashes. Withhold the key mapping/reference labels and record actual reviewer
results separately using `reviewer-results.py`. Fixture creation is not a human experiment.

Review [the B specification](../../../docs/workflow-b-spec.md) and
[financial proposal](../../../docs/workflow-b-financial-rules.md) before approving
or implementing funds/authority changes. The unchanged A deployment remains the
baseline. No B contract, ABI, migration or deployment has been created by this tool.
