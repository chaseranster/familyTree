# User Stories — Family Tree App

**Status:** Draft v1.0 · **Last updated:** 2026-07-19
Format: `As a <role>, I want <goal>, so that <benefit>.` Each story is tagged
**MVP**, **V2**, or **V3** per `PRD.md` §6.

---

## Epic 1 — Authentication & Account

**US-1.1** (MVP) As a new user, I want to sign in with my Google account, so
that I don't need a separate password.
- AC: Clicking "Sign in with Google" redirects to Google's OAuth consent screen.
- AC: On success, a `User` is created/matched by `googleId`/email and I land on my dashboard.
- AC: Cancelling the Google flow returns me to the login page with no account created.

**US-1.2** (MVP) As a returning user, I want my session to persist across visits,
so that I don't have to sign in every time.
- AC: A valid session cookie keeps me logged in until it expires or I sign out.

**US-1.3** (MVP) As a user, I want to sign out, so that I can end my session on a shared device.
- AC: Signing out clears my session and returns me to the login page.

---

## Epic 2 — Tree Creation & Management

**US-2.1** (MVP) As a new user with no tree, I want to create a new tree, so
that I can start building my family's record.
- AC: Creating a tree makes me its `FOUNDER`.
- AC: I'm prompted to add myself as the first `Person` (or skip for now).

**US-2.2** (MVP) As a founder/admin, I want to rename my tree, so that it
reflects the family it represents.

**US-2.3** (MVP) As a user, I want to see a list of trees I belong to, so that
I can switch between them if I'm in more than one.

**US-2.4** (V3) As a user in multiple trees, I want an easy switcher between
them, so that navigating doesn't require signing out/in.

---

## Epic 3 — Membership: Direct Invites

**US-3.1** (MVP) As a founder/admin, I want to invite a relative by email, so
that they can join my tree directly.
- AC: An invite is tied to a specific email and, optionally, a specific `Person` record to link them to.
- AC: If the invited email doesn't match an existing Google account yet, the invite waits until they sign in with that email.

**US-3.2** (MVP) As an invitee, I want to accept an invite after signing in, so
that I become a member without a separate approval step.
- AC: Accepting an invite creates a `TreeMember` with role `MEMBER` and, if a `Person` was pre-linked, sets `linkedPersonId`.

**US-3.3** (MVP) As a founder/admin, I want to revoke a pending invite, so that
I can correct a mistake before it's accepted.

---

## Epic 4 — Membership: Self-Service Join Requests

**US-4.1** (MVP) As a requester who isn't yet a member, I want to request to
join a tree as a new person connected to someone already in it, so that I can
be added without needing a direct invite.
- AC: I select an anchor `Person` already in the tree and a relationship type (child/spouse/etc.), creating a `MembershipRequest` of type `NEW_PERSON` with `requiredApprovals = 1`.

**US-4.2** (MVP) As a requester, I want to claim an existing, unclaimed `Person`
record as myself, so that I don't create a duplicate.
- AC: This creates a `MembershipRequest` of type `CLAIM_EXISTING` with `requiredApprovals = 2`.

**US-4.3** (MVP) As an existing member connected to the claimed/anchor person, I
want to approve or reject a join request, so that only real relatives get in.
- AC: My approval is recorded as a `MembershipApproval`; once the required count is met, the request auto-resolves to `APPROVED`.
- AC: A single rejection from any eligible approver marks the request `REJECTED` (requester is notified and may appeal to an admin).

**US-4.4** (MVP) As a requester whose anchor/claimed person has no linked
member nearby, I want my request routed to a tree admin, so that it doesn't
stall with no one able to approve it.

**US-4.5** (MVP) As a tree admin, I want to directly approve a `CLAIM_EXISTING`
request myself (overriding the 2-approval requirement), so that I can unblock a
legitimate case where the second relative isn't reachable.

---

## Epic 5 — Admin Delegation

**US-5.1** (MVP) As a founder, I want to promote a member to admin, so that
approval/moderation work isn't bottlenecked on me alone.

**US-5.2** (MVP) As a founder, I want to demote an admin back to member, so
that I can correct a delegation decision.
- AC: Promotions and demotions are logged as `Revision`s (entity type `TREE_MEMBER`).

**US-5.3** (MVP) As an admin, I want the same approval/moderation authority as
the founder within this tree only, so that I can act without waiting on them,
while never having any authority in other trees.

---

## Epic 6 — Person Management

**US-6.1** (MVP) As a member, I want to add a new person to the tree, so that I
can record a relative not yet included.

**US-6.2** (MVP) As a member, I want to edit an existing person's details
(name, dates, place, bio), so that I can correct or complete their record.

**US-6.3** (MVP) As a member, I want to view a person's full profile, so that I
can see everything recorded about them (subject to consent gating, Epic 9).

**US-6.4** (MVP) As an admin, I want to remove a person record added in error,
so that mistakes don't stay in the tree permanently.
- AC: Removal is logged as a `Revision` (action `DELETE`) and is revertible.

---

## Epic 7 — Relationship Management

**US-7.1** (MVP) As a member, I want to add a parent-child relationship between
two people, so that the tree structure reflects reality.
- AC: I can specify the relationship type (biological, adopted, step, foster).

**US-7.2** (MVP) As a member, I want to add a spousal/partner relationship
(union) between two people, so that marriages/partnerships are represented.
- AC: I can specify type (marriage/partnership) and status (current, divorced, widowed).

**US-7.3** (MVP) As a member, I want to edit or end a union (e.g. add a divorce
date), so that the record stays accurate over time.

**US-7.4** (MVP) As a member, I want to remove an incorrectly-added
relationship, so that the tree structure can be corrected.
- AC: Removal is logged as a `Revision` and is revertible.

---

## Epic 8 — Tree Visualization

**US-8.1** (MVP) As a member, I want to see the whole tree rendered as an
interactive chart, so that I can understand the family's structure at a glance.

**US-8.2** (MVP) As a member, I want to click a person node to open their
profile, so that I can see/edit their details from the visualization.

**US-8.3** (V2) As a member, I want a "focus view" centered on myself with
distant branches faded, so that a large tree is easier to navigate visually.
- AC: This is a display-only filter; it does not change what data I'm permitted to see (§ARCHITECTURE.md).

---

## Epic 9 — Consent-Gated Sensitive Fields

**US-9.1** (MVP) As any tree member viewing a person without granted consent, I
want their photo, full name, and date of birth hidden, so that no one's
sensitive details are exposed without their say.
- AC: Masked profiles show first name only, tree position/relationships, and living/deceased status — no photo (placeholder avatar shown instead), no last/maiden name, no birth date (not even the year).

**US-9.2** (MVP) As a member with a linked account, I want to grant consent to
reveal my own photo/full name/DOB to other tree members, so that I control my
own exposure.
- AC: Only I can grant or revoke this for my own linked person — not even an admin can toggle it for me.

**US-9.3** (MVP) As the person who added a deceased relative (or a tree admin),
I want to grant proxy consent to reveal their photo/full name/DOB, so that
historical ancestor data isn't needlessly hidden forever.
- AC: Proxy consent is only available when the target person's `isLiving = false` and they have no linked account.

**US-9.4** (MVP) As a member, I want to be blocked from granting proxy consent
for a living person with no account, so that a relative can't reveal someone's
details before that person has had a chance to join and decide for themselves.
- AC: The consent toggle is unavailable/disabled for any `isLiving = true` person with no `linkedPersonId`, with an explanatory message.

**US-9.5** (MVP) As a member or proxy-grantor, I want to revoke previously
granted consent at any time, so that a person's details can be re-hidden if
circumstances change.

---

## Epic 10 — Revision History & Revert

**US-10.1** (MVP) As a member, I want to view the edit history of any person or
relationship, so that I can see who changed what and when.

**US-10.2** (MVP) As a member, I want to revert a specific past edit with one
click, so that mistakes or bad edits are easy to undo.
- AC: Reverting itself creates a new `Revision` entry (the history is append-only; nothing is destroyed).

---

## Epic 11 — Moderation (within a tree)

**US-11.1** (MVP) As an admin, I want to revert any member's edit, not just my
own, so that I can correct problems in the tree.

**US-11.2** (MVP) As an admin, I want to remove a member from the tree, so that
I can address misuse or a mistaken addition.
- AC: Removal does not delete the person's data they may be linked to; it revokes their `TreeMember` access.

**US-11.3** (MVP) As a founder/admin, I want to see a simple activity log for
the tree, so that I can spot unusual editing activity without a full
moderation-queue system.

---

## Epic 12 — Merge Duplicates (V2)

**US-12.1** (V2) As a member adding a new person, I want the app to suggest
possible existing duplicates by name/dates, so that I don't accidentally
create a second record for someone already in the tree.

**US-12.2** (V2) As a member, I want to propose merging two person records I
believe are duplicates, so that the tree stays clean.

**US-12.3** (V2) As another connected member, I want to review and
approve/reject a proposed merge, so that merges aren't unilateral.

---

## Epic 13 — Media & Life Events (V2)

**US-13.1** (V2) As a member, I want to upload a photo or document to a
person's profile, so that the tree includes richer records.
- AC: Uploaded media respects the same consent gating as the profile photo where applicable.

**US-13.2** (V2) As a member, I want to add life events (e.g. graduation,
military service) to a person's timeline, so that more than birth/death is captured.

---

## Epic 14 — Search (V2)

**US-14.1** (V2) As a member, I want to search for a person by name within my
tree, so that I can find them quickly in a large tree.

---

## Epic 15 — GEDCOM Import/Export (V2)

**US-15.1** (V2) As a founder/admin, I want to import a GEDCOM file into a new
or existing tree, so that I can bring in data from another genealogy tool.

**US-15.2** (V2) As a founder/admin, I want to export my tree as a GEDCOM file,
so that the data isn't locked into this app.

---

## Epic 16 — Mobile & Multi-Tree UX (V3)

**US-16.1** (V3) As a member, I want a responsive/PWA experience on mobile, so
that I can view and edit the tree from my phone.

**US-16.2** (V3) As a user in multiple trees (e.g. managing one for in-laws),
I want a clear switcher and no cross-tree data bleed, so that each tree stays
fully separate in the UI as well as the backend.
