# Architecture — Family Tree App

**Status:** Draft v1.0 · **Last updated:** 2026-07-19
**Related documents:** `PRD.md`, `DATA_MODEL.md`, `API_SPEC.md`, `NFR.md`, `adr/`

## 1. Overview

A server-rendered Next.js app backed by PostgreSQL, with Google OAuth for
authentication. The system is multi-tenant at the `Tree` level: every piece of
family data belongs to exactly one tree, and every request is authorized
against the caller's membership and role in that specific tree. There is no
cross-tenant data path anywhere in the system — this is the single most
important architectural invariant (see `adr/0001-isolated-private-trees.md`).

## 2. Architectural Principles

1. **Tree isolation is absolute.** No query, cache, or background job may
   return data from a tree the caller isn't a member of. Enforced server-side
   on every read and write — never trust a client-side check.
2. **Privacy-by-default at the field level.** Photo, full name, and date of
   birth are masked unless explicit consent is recorded, independent of tree
   membership (`adr/0003-consent-gated-sensitive-fields.md`). This is enforced
   in the same server-side layer as tree isolation, not left to the UI.
3. **Every mutation is auditable.** All writes to `Person`, `ParentChild`,
   `Union`, and `TreeMember` produce a `Revision` row. Nothing is hard-deleted
   in a way that can't be reconstructed from history.
4. **Bounded queries only.** Because trees are isolated and expected to stay in
   the hundreds-to-low-thousands of people, no query needs unbounded graph
   traversal — a plain relational model is sufficient
   (`adr/0002-postgres-over-graph-db.md`).

## 3. System Context

```
                    +-------------------+
                    |   Google Identity  |
                    |   (OAuth 2.0)      |
                    +---------+---------+
                              |
                              v
   +--------+        +-------+--------+        +----------------+
   | Browser| <----> |  Next.js App    | <----> |  PostgreSQL     |
   | (user) |  HTTPS |  (Vercel)       |  SQL   |  (Neon/Supabase)|
   +--------+        +-------+--------+        +----------------+
                              |
                              v
                    +-------------------+
                    | Object Storage     |
                    | (Supabase/R2)      |
                    | photos, documents   |
                    +-------------------+
```

## 4. Components

| Component | Responsibility |
|---|---|
| **Frontend** (Next.js App Router, React, TypeScript) | UI: tree visualization, person/relationship forms, membership/consent flows. |
| **Auth layer** (Auth.js, Google provider) | OAuth handshake, session issuance (JWT/cookie), maps Google identity → `User`. |
| **API layer** (Next.js Route Handlers / Server Actions) | All reads/writes. Every handler resolves the caller's `TreeMember` role for the target `treeId` before touching data. |
| **Authorization middleware** | Shared helper invoked by every handler: `assertTreeMember(userId, treeId, minRole)` and `applyConsentGating(person, viewer)`. |
| **Data layer** (Prisma + PostgreSQL) | Schema in `DATA_MODEL.md`; all tree-scoped tables carry `treeId` with an index. |
| **Storage** (Supabase Storage / Cloudflare R2) | Photos/documents, private per tree, served via signed URLs. |
| **Revision logger** | Wraps every mutating operation; writes a `Revision` row in the same transaction as the underlying change. |

## 5. Key Request Flows

### 5.1 Sign-in
1. Browser → Auth.js `/api/auth/signin/google` → Google consent screen.
2. Google redirects back with an auth code; Auth.js exchanges it, creates/matches a `User` by `googleId`.
3. Session cookie issued. No tree access is granted at this step — that's a separate flow (§5.3).

### 5.2 Create a tree
1. Authenticated user calls `createTree(name)`.
2. Server creates `Tree`, then `TreeMember{ role: FOUNDER, userId, treeId }` in one transaction.
3. `Revision` logged for the `TreeMember` creation.

### 5.3 Join-request approval (see `USER_STORIES.md` Epic 4)
1. Requester submits `MembershipRequest` (`NEW_PERSON` or `CLAIM_EXISTING`) scoped to one `treeId`.
2. Server computes eligible approvers: linked members connected to the anchor/claimed person → else any member who can edit that person → else tree admins.
3. Each approval writes a `MembershipApproval`; once `approvals.count >= requiredApprovals`, the request auto-resolves: creates/links the `Person`, sets `TreeMember.linkedPersonId`, logs a `Revision`.

### 5.4 Edit a person
1. Client calls `updatePerson(treeId, personId, fields)`.
2. Middleware asserts caller is a `TreeMember` of `treeId` (any role — editing is open to all members, per `PRD.md` FR4).
3. Handler applies the update and writes a `Revision` snapshot, both in one DB transaction.

### 5.5 Reading a person (consent gating)
1. Client requests a person's profile.
2. Middleware asserts tree membership (structural access).
3. Before returning the payload, the consent-gating filter checks `Person.sensitiveDetailsVisible`:
   - `true` → full fields returned.
   - `false` → `photoUrl`, `lastName`/`maidenName`, `birthDate` stripped from the response entirely (not just hidden client-side — the server never sends them).

## 6. Multi-Tenancy & Authorization Model

- Every tree-scoped table (`Person`, `ParentChild`, `Union`, `Revision`,
  `MergeRequest`, `MembershipRequest`) carries a `treeId` foreign key.
- Every API handler requires a resolved `treeId` and checks the caller's
  `TreeMember` row for that tree before any data access — there is no handler
  that queries across trees.
- Roles (`FOUNDER > ADMIN > MEMBER`) gate specific actions (invite, promote,
  revert others' edits, remove members) but **do not** gate ordinary
  read/edit access — any member can view and edit within their tree
  (`PRD.md` FR4, `adr/0001`).
- Consent gating (§5.5) is a second, independent authorization axis — orthogonal
  to tree role — applied to specific fields on `Person` regardless of the
  viewer's role.

## 7. Deployment Architecture

| Environment | Frontend/API | Database | Storage |
|---|---|---|---|
| Development | Local Next.js dev server | Local/dev Postgres (or a Neon dev branch) | Local mock or dev bucket |
| Preview (per PR) | Vercel preview deployment | Neon branch-per-PR (recommended) | Shared dev bucket, prefixed by branch |
| Production | Vercel production deployment | Neon/Supabase production instance | Production bucket, private ACLs |

Secrets (Google OAuth client secret, DB connection string, storage keys) are
held in Vercel environment variables, never committed to the repo.

## 8. Security Architecture

- **Authentication**: OAuth only via Google — no password storage, no custom
  credential handling.
- **Session**: signed, httpOnly session cookie (Auth.js default), short-lived
  with refresh, CSRF protection via framework defaults on all mutating routes.
- **Authorization**: enforced server-side on every handler (§6) — the frontend
  performs no authorization decisions, only UI affordance (hiding a button a
  user couldn't use anyway is UX, not security).
- **Auditability**: `Revision` log is the source of truth for "who did what,"
  used for both user-facing history/revert (US-10.1/10.2) and informal
  moderation (US-11.3).
- **File storage**: private buckets, signed URLs scoped per tree; no public
  bucket listing.
- **Consent enforcement is server-side and field-level**, not a UI toggle —
  masked fields are never included in the API response, so there's no
  client-side leak path.

## 9. Scalability Considerations

- Expected scale: many independent trees, each in the tens-to-low-thousands of
  people. Because trees never merge or cross-query, this scales horizontally
  by tenant — no query grows with total platform size, only with one tree's
  size.
- Indexes: `treeId` on every tree-scoped table; composite `(treeId, personId)`
  where relevant for `ParentChild`/`Union` lookups.
- No caching layer is required for MVP; add read caching per tree only if a
  specific tree's visualization query becomes measurably slow.

## 10. Observability

- Structured error logging (e.g. Vercel's built-in logging, or a lightweight
  error-tracking service) on all API handlers.
- Revision log doubles as a lightweight audit trail — no separate audit
  logging system needed for MVP.

## 11. Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend | Next.js (React + TypeScript, App Router) |
| Auth | Auth.js (NextAuth), Google provider |
| Database | PostgreSQL (Neon or Supabase) |
| ORM | Prisma |
| Tree visualization | `family-chart` (D3-based) or custom D3 |
| File storage | Supabase Storage or Cloudflare R2 |
| Hosting | Vercel |

See `adr/0002-postgres-over-graph-db.md` for why no graph database is used.
