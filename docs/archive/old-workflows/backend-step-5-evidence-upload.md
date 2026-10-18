# Backend step 5 — Private evidence upload with local MinIO

> **ARCHIVED — historical evidence only. Not current FundTogether Campaign requirements.**


Updated: 2026-10-04

## Scope and data flow

```text
Saved milestone evidence draft
  -> authenticated account + campaign/organization permission
  -> multipart file and revision validation
  -> type detection + SHA-256
  -> MinIO private bucket / originals/<opaque UUID>
  -> conditional PostgreSQL document append + revision increment
```

This is draft file storage, not evidence submission or an on-chain commitment.
No funds move. Organization OWNER membership determines access; creator identity
does not bypass membership. Personal campaign access retains its existing rule.

The bucket has no anonymous policy. All objects use the originals/ prefix;
public redacted copies and publication need a separate pipeline, not an ACL
change exposing originals. The frontend receives document IDs/metadata, not
credentials, object URLs or presigned URLs.

## Local setup

MinIO Community is now source-only and its repository is no longer maintained.
The local image builds official RELEASE.2025-10-15T17-29-55Z commit
9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a, using a pinned Go builder image.
This choice is for local learning; a maintained production storage provider
must be selected separately. See the [official MinIO README](https://github.com/minio/minio).

From the repository root, with Docker Desktop running:

```powershell
node backend/scripts/setup-local-storage.cjs
docker compose --env-file backend/.env -f compose.storage.yaml up -d --build
```

The setup script preserves existing values and fills missing storage settings in
the ignored backend/.env. It generates local credentials without printing them.
Build the backend, then run from backend/:

```powershell
npm.cmd run build
node scripts/initialize-local-storage.cjs
npm.cmd run start:dev
```

API endpoint: http://127.0.0.1:9000. Console: http://127.0.0.1:9001.
Both Docker ports bind only to loopback. The named volume
fundtogether-storage_minio-data preserves objects across container restarts;
do not remove it with compose down -v unless deliberately discarding local data.
The container runs as UID 1000. Root credentials in backend/.env are a local
bootstrap choice; production needs dedicated application credentials.
The current backend runtime is Node 24, which loads the installed file-type ESM
package through require without changing Nest's CommonJS module configuration.

## API and limits

Base path:
/campaigns/:campaignId/milestones/:milestoneIndex/evidence-draft/documents

| Method | Request | Result |
|---|---|---|
| POST | multipart file, kind, expectedRevision | Updated evidence draft, appended server-generated document, incremented revision |
| GET /:documentId | authenticated session | Attachment stream of an authorized original |

Upload requires an already saved draft. Supported types: application/pdf,
image/jpeg, image/png. Limits: one file/request, 10 MiB/file, 20 files/draft
(therefore at most 200 MiB/draft). The interceptor enforces body/file bounds;
the service detects the file signature and requires agreement with the declared
MIME. This is signature detection, not malware scanning or proof of document
truth. Original names are sanitized metadata, never storage paths.

Guards check session and campaign access before accepting file bytes. The service
rechecks draft access and revision, computes byte size and SHA-256, and creates
opaque document/storage IDs. All uploads use RESTRICTED_ORIGINAL. Download uses
attachment disposition, application/octet-stream, nosniff and private/no-store.

Draft creation rejects documents supplied by the client. Report PATCH atomically
compares the immutable document metadata against stored data at expectedRevision;
client-provided hashes, IDs, visibility, names and MIME cannot replace uploaded
metadata. Existing document relationship arrays may still be edited subject to
the evidence schema. Removing files is not exposed in this slice. Previously
created metadata-only documents require separate migration/reconciliation before
they can be treated as real stored files.

## Failure and UI behavior

The object is stored before the database append. A competing save/access change
causes 409 and triggers deletion of this request's object. Storage/DB failures
also attempt cleanup. Cleanup failures log the opaque ID for reconciliation.
A process crash between storage and DB can leave an orphan: periodic storage
reconciliation remains TODO. An uncertain response should be followed by reading
the latest draft before retrying; do not assume upload succeeded.

The evidence editor shows upload/download after the report is saved. Unsaved
report changes block upload; report controls are disabled while file operations
run. Successful upload refreshes draft data and revision. Upload conflict retains
the form and requires loading the latest draft explicitly. Documents are attached
to the draft; linking them to individual results/expenses needs a later editor.

## Verification

- MinIO custom image built, container running with zero restarts after volume
  permissions were initialized; live health returns 200.
- Private evidence bucket initialized and confirmed to have no bucket policy.
- Backend build and frontend build/lint pass. Runtime OpenAPI lists upload and
  download routes.
- Follow-up verification: evidence-upload-smoke.cjs passes 63 HTTP checks against
  real PostgreSQL/MinIO using two temporary accounts. It covers exact PNG download
  bytes/hash, session/organization access, revoked creator access, anonymous S3
  denial, missing/stale/foreign milestone IDs, concurrent plan edits versus first
  evidence creation, MIME mismatch/unsupported type/empty/oversized files, 20-file
  quota, immutable metadata enforcement, persisted report edits after login,
  competing report saves and competing uploads (including loser-object cleanup).
  The script removes its own objects and account/campaign/organization rows.
- Backend unit suite passes 25 tests across 9 suites. Duplicate creation also
  recognizes Drizzle's wrapped PostgreSQL unique violation and returns 409.
- Authenticated browser form interactions remain unverified; HTTP races simulate
  concurrent clients, not actual browser tabs. PDF/JPEG acceptance, storage outages
  and process-crash recovery have not been exercised by this smoke script.
- Freeze, public redaction, deletion/retention, malware scanning and contract
  submission remain separate work. No migration was required: document metadata
  remains in the current evidence JSONB draft.
