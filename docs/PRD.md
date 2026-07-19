# Product Requirements Document — Family Tree App

**Status:** Draft v1.0
**Last updated:** 2026-07-19
**Related documents:** `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_SPEC.md`, `USER_STORIES.md`, `NFR.md`, `adr/`

## 1. Executive Summary

A collaborative family-tree application. Anyone can sign in with Google, create a
private family tree, and invite relatives to build it together. Each tree is a
fully isolated, admin-managed private space — never a shared global graph — so
families never deal with cross-family merge conflicts or public exposure.
Sensitive personal fields (photo, full name, exact date of birth) are hidden by
default on every profile and only revealed with explicit consent — self-consent
for anyone with an account, or narrowly-scoped proxy consent for deceased people
who can never grant it themselves.

## 2. Problem Statement

Existing genealogy tools fall into two unsatisfying categories:
- **Private single-owner tools**, where only one person can edit, making
  collaborative family record-keeping hard.
- **Open public platforms** (WikiTree, Geni), which merge everyone into one graph
  — creating duplicate-profile disputes, moderation overhead, and privacy exposure
  for people who never agreed to be included.

There's no lightweight, privacy-respecting, collaborative option scoped to just
one family.

## 3. Goals & Objectives

- Let a family collaboratively build and maintain an accurate tree.
- Make joining and editing safe: identity claims are verified socially (peer
  approval), not by document/biometric upload.
- Protect the privacy of anyone in the tree who hasn't explicitly agreed to
  expose their photo, full name, or birth date — including people with no
  account at all.
- Keep each tree fully isolated — no cross-family data merging, ever.
- Ship a usable MVP quickly, with clear phase gates before expanding scope.

## 4. Non-Goals

- A global/public genealogy graph, or any cross-tree merging or linking.
- Document or biometric identity verification.
- DNA matching or historical-record search (Ancestry-style).
- Real-time chat/messaging between members.

## 5. Target Users / Personas

| Persona | Description |
|---|---|
| **Founder** | Creates a tree; its first admin; ultimate authority within that tree only. |
| **Admin** | Delegated by the founder; shares approval/moderation authority for that tree. |
| **Member** | Invited or approved relative; views the tree and adds/edits people & relationships within it. |
| **Requester** | Has a Google account, is trying to join a specific tree via invite or self-service request; not yet a member. |
| **Non-member data subject** | A real person represented in the tree who may never sign up (deceased ancestor, or a living relative who hasn't joined). No account, but the app still enforces their privacy defaults. |

## 6. Scope by Release

See `USER_STORIES.md` for full detail and `adr/` for the reasoning behind each
boundary.

- **MVP**: Google auth; tree creation & invites; self-service join requests
  (`NEW_PERSON` / `CLAIM_EXISTING`); person & relationship CRUD; full-tree
  visualization; consent-gated sensitive fields; revision history & revert;
  admin delegation.
- **V2**: merge-duplicates tool (within a tree); media/life-events; in-tree
  search; GEDCOM import/export; "focus view" display filter.
- **V3**: mobile/PWA; multiple trees per user with a switcher.

## 7. Functional Requirements (summary)

| ID | Requirement |
|---|---|
| FR1 | Google sign-in via Auth.js; no password storage. |
| FR2 | Tree lifecycle: create, rename a tree. |
| FR3 | Membership: invite by email; self-service join request with tiered approval (1 approval for `NEW_PERSON`, 2 for `CLAIM_EXISTING`); admin delegation. |
| FR4 | CRUD for `Person`, `ParentChild`, `Union`, all scoped to one tree. |
| FR5 | Full-tree visualization; focus-view filter (V2). |
| FR6 | Photo/full-name/DOB hidden by default; self- or proxy-consent (deceased only) to reveal; revocable any time. |
| FR7 | Every write logged as a revision; history view; one-click revert. |
| FR8 | Admins can revert edits, remove members, resolve merge requests. |
| FR9 | (V2) Merge duplicate people within a tree. |
| FR10 | (V2) Media uploads, in-tree search, GEDCOM import/export. |

## 8. Non-Functional Requirements (summary)

Privacy-by-default; per-tree data isolation enforced server-side on every
request; full auditability via revision log; acceptable performance on trees up
to ~1,000 people; hobby-scale hosting cost; WCAG AA accessibility target;
responsive layout. Full detail in `NFR.md`.

## 9. Success Metrics

- A tree with 3+ generations and 2+ active contributing members, maintained for
  30+ days (validates collaborative editing actually works in practice).
- Zero cross-tree data leaks — verified by access-control tests, not just
  informal review.
- 100% of writes have a corresponding revision record.
- Consent defaults are never bypassable — verified by tests asserting masked
  fields stay masked absent explicit consent.

## 10. Assumptions & Constraints

- Solo/small-team build, hobby-scale budget → free/low-cost hosting tiers.
- All users have a Google account.
- No dedicated legal/compliance function — privacy protections are designed
  conservatively to minimize risk rather than to satisfy one specific
  jurisdiction's statute.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Consent-model complexity confuses users | Clear UI messaging on why a field is masked and who can unlock it (see `USER_STORIES.md` Epic 9). |
| Admin authority abused within a tree | All admin actions are revision-logged, same as member edits. |
| Scope creep back toward a global/public graph | Explicitly a non-goal (§4); see `adr/0001-isolated-private-trees.md`. |

## 12. Open Questions

- What existing data source, if any, seeds the first tree (GEDCOM export, spreadsheet)?
- Should tree creation be open to any Google account from day one, or restricted initially while the founder's own tree is being built out?
