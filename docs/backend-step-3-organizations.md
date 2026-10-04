# Backend step 3 — Organization creation and membership

Updated: 2026-10-04

## Scope

This slice adds authenticated creation and listing of organization profiles.
It does not change campaign ownership, publish a campaign, verify a charity or
create/link a representative wallet. Representative-wallet selection was added
in [backend step 6](./backend-step-6-organization-wallet.md); this document describes
the initial organization slice. Membership currently supports OWNER only.
An account can create multiple organizations; names are not globally unique.

## NestJS request flow

```text
Request with ft_session cookie
  -> global BrowserOriginGuard (writes require WEB_ORIGIN)
  -> AuthGuard (load account from server session)
  -> OrganizationsController (parse body with strict Zod schema)
  -> OrganizationsService
  -> Drizzle / PostgreSQL transaction
```

- Module registers the controller/service and imports AuthModule.
- Controller handles HTTP and validation, taking userId from request.account.
- Service creates the organization and OWNER membership atomically. Failure to
  insert either row rolls back both; an organization cannot be left ownerless
  by a partially completed create request.
- Schema describes durable tables and constraints. Migration applies those
  schema changes to PostgreSQL; editing TypeScript alone does not update DB.

## API

### POST /organizations

Requires a valid session cookie and Origin equal to WEB_ORIGIN. Returns 201.

```json
{
  "name": "FundTogether Community",
  "description": "Community fundraising organization."
}
```

Name is trimmed, nonempty and at most 200 characters. Description is trimmed,
nonempty and at most 10,000 characters. Extra fields, including userId, role,
verificationStatus and walletAddress, are rejected with 400 and Zod issues.
Creator is the authenticated user, role is OWNER, and verificationStatus is
unverified. The response includes id, name, description, createdByUserId,
verificationStatus, createdAt, updatedAt and the current member's role.

### GET /organizations

Requires a valid session cookie. Returns 200 and an array with the same response
fields, limited by membership of the authenticated account. Empty list is [].
Results are ordered by createdAt then id descending. Anonymous requests are
rejected by AuthGuard; there is no public organization listing in this slice.

## Database

- organizations: UUID identity, profile, creator user FK, verification status,
  createdAt and updatedAt.
- organization_members: organization/user FKs, OWNER role and createdAt.
  Composite primary key prevents duplicate memberships; userId index supports
  the account's organization list. A check constraint limits roles to OWNER.
- Migration: backend/drizzle/0004_organizations.sql. No existing rows are
  backfilled and no existing campaign/account schema is changed.

## Verification and next step

Migration generation, local PostgreSQL migration application and backend build
succeeded. No automated tests or authenticated HTTP journey were run for this
slice. Frontend integration, invitations, editing, additional roles, organization
verification, representative wallets and campaign linkage remain future work.

## Frontend integration

The My organizations page at #/organizations now consumes these APIs through
the existing credentialed Axios client and TanStack Query. It is linked from
both public navigation and the organizer workspace. Anonymous users see a login
link; authenticated users can open a compact create form and view their list.

My organizations opens in the current user tab. Each organization card has an
Open Organization workspace link opening #/organizations/:id/workspace in a
new browser tab with noopener/noreferrer. The source user tab remains open.
The workspace loads membership-scoped organization context and has URL-based
campaign/milestone/evidence navigation. Profile information lives in the user
area at #/organizations/:id, accessed by a same-tab View profile link.
Anonymous visitors must sign in; nonmembers do not see organization details.

Organization campaign listing and creation now use organization-scoped APIs and
the existing wizard. Milestone/evidence sections remain pending. Personal draft
APIs are not queried as organization data. The legacy #/workspace remains available as the
personal workspace so existing drafts stay accessible until explicit migration.
Browser Back follows each tab's own history; workspace navigation does not
trap history. Return links lead to My organizations and the user feed.

The form validates trimmed name/description, disables inputs/submission while
pending, preserves input on errors and updates the account-scoped list after a
successful creation. Cards show OWNER as Chu so huu, unverified status and the
creation date. Query keys include userId; account changes clear organization
queries and remount the form so another account does not inherit entered data.

Frontend build and lint succeeded; Vite responded with HTTP 200. Browser visual
inspection encountered a blank in-app browser page without console errors, so
authenticated creation/list display and mobile layout are not verified yet.
No automated tests were added/run. Campaign organization linkage remains the
next backend slice, with explicit handling of existing personal drafts.

### Local blank-page recovery

On 2026-10-04, restarting Vite with forced dependency optimization resolved the
blank-page inspection blocker. Public feed and anonymous organization UI were
observed rendering afterward; authenticated creation remains unverified.

If dependencies change while an old dev server is still running, stop that
frontend server and run from the frontend directory:

```powershell
npm.cmd run dev -- --force --host localhost --port 5173 --strictPort
```

Reload the browser after Vite is ready. Successful production builds do not
prove that a long-running development server has refreshed its dependency cache.
