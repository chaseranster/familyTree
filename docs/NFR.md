# Non-Functional Requirements — Family Tree App

**Status:** Draft v1.0 · **Last updated:** 2026-07-19

## 1. Performance

- Tree visualization should render within ~1s for trees up to ~500 people, and
  remain usable (even if slower) up to ~1,000 people, on a typical broadband
  connection.
- All tree-scoped API queries are filtered by an indexed `treeId` (`DATA_MODEL.md`
  §3) — no query should scale with total platform data, only with one tree's size.

## 2. Availability

- Hobby/small-scale target: no formal SLA. Aim for the practical uptime that
  comes "for free" from Vercel + a managed Postgres provider (Neon/Supabase),
  without additional redundancy engineering for MVP.

## 3. Security

- No password storage — Google OAuth only.
- All authorization checks (tree membership, role, consent gating) are
  enforced server-side on every request; the client never makes a trust
  decision (`ARCHITECTURE.md` §8).
- Secrets (OAuth client secret, DB URL, storage keys) live only in the hosting
  platform's environment variables, never in the repo.
- File storage buckets are private with signed, time-limited URLs — no public
  listing or guessable-URL access to uploaded photos/documents.

## 4. Privacy & Data Minimization

- Photo, full name, and date of birth are hidden by default on every person
  record and only exposed via explicit, revocable consent
  (`adr/0003-consent-gated-sensitive-fields.md`).
- No document or biometric identity verification is ever collected — identity
  claims are verified socially via peer approval (`adr/0004`).
- Minors: default to name + relationship only; no photos/detailed bios even if
  a guardian adds them (deferred design detail — full rule TBD before
  minors' data is entered in practice).
- No cross-tree data path exists — a tree's data is never visible to, or
  queryable from, another tree, even by an admin of a different tree.

## 5. Auditability

- Every create/update/delete on `Person`, `ParentChild`, `Union`, and
  `TreeMember` produces a `Revision` row in the same transaction as the
  change — no code path can mutate data without leaving a history entry.
- History is append-only; reverting creates a new revision rather than
  deleting prior ones.

## 6. Accessibility

- Target WCAG 2.1 AA for core flows (sign-in, tree CRUD, profile viewing).
- Tree visualization (a canvas/SVG-heavy view) should have a text/list-based
  fallback view of the same data for screen-reader users.

## 7. Compatibility

- Responsive layout supporting modern desktop and mobile browsers (last 2
  versions of Chrome, Safari, Firefox, Edge).
- No IE11 or legacy-browser support required.

## 8. Observability

- Structured error logging on all API handlers (hosting platform's built-in
  logging is sufficient for MVP; a dedicated error tracker can be added
  later without architectural change).
- The `Revision` log doubles as a lightweight audit trail for admin actions —
  no separate audit-logging subsystem needed at this scale.

## 9. Backup & Recovery

- Rely on the managed Postgres provider's automated backups (point-in-time
  recovery where available on the chosen tier).
- Because edit history is preserved in `Revision`, most "recovery" scenarios
  (a bad edit, an accidental deletion) are handled at the application layer
  via revert rather than requiring a database restore.

## 10. Cost

- Target: stay within free/low-cost tiers of Vercel, Neon/Supabase, and
  object storage for the expected scale (a handful of trees, hundreds of
  people each) through MVP and V2.
