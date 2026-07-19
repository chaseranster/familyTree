# Family Tree App — Project Plan

## 1. Goal

A multi-tenant app where anyone can sign in with Google and either **create their own
private family tree** or **join one they're invited to**. Each tree is a fully
isolated, private group — like a shared document, not a public graph. Trees never
merge or connect to each other, even if two real families overlap; each tree's
founder and delegated admins manage membership and moderation for that tree only.

This replaces an earlier "one global public graph" direction. That model made every
new join a potential identity claim on a shared record and every family overlap a
merge dispute — real, hard problems that aren't worth it for what this app needs to
do. Isolated private trees sidestep both: there's nothing to merge, and only invited
people ever see a tree's data.

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React + TypeScript, App Router) | SSR, file-based routing, one deploy target with the backend |
| Auth | Auth.js (NextAuth) — Google provider, open signup | Anyone can create an account; tree access is separately gated (§4) |
| Database | PostgreSQL (Neon or Supabase) | Straightforward relational modeling — all queries are scoped to one `treeId`, no unbounded graph traversal needed |
| ORM | Prisma | Type-safe schema/migrations |
| Tree visualization | `family-chart` (D3-based) or custom D3 | Renders a full generational tree with spouses/siblings |
| File storage | Supabase Storage or Cloudflare R2 | Profile photos/documents, private per tree |
| Hosting | Vercel | Native Next.js support |

No graph database and no recursive-CTE visibility engine are needed anymore — every
query is naturally bounded to "everyone in tree X," which a normal indexed
`WHERE tree_id = ?` handles.

## 3. Data Model

```
User
  id, googleId, email, name, avatarUrl, createdAt

Tree                                    // one private family tree
  id, name, createdBy, createdAt

TreeMember                              // per-tree membership + role
  id, treeId, userId, role (FOUNDER | ADMIN | MEMBER),
  linkedPersonId (nullable, unique per tree)   // which Person in THIS tree is "me"
  joinedAt

Person                                  // scoped to one tree — not shared globally
  id, treeId, firstName, lastName, maidenName, gender,
  birthDate, deathDate, birthPlace, isLiving (bool),
  bio, photoUrl, createdBy, createdAt, updatedAt

ParentChild                             // directed edge: parent -> child, within a tree
  id, treeId, parentId, childId, type (BIOLOGICAL | ADOPTED | STEP | FOSTER),
  addedBy, createdAt

Union                                   // spouse / partner edge, within a tree
  id, treeId, person1Id, person2Id, type (MARRIAGE | PARTNERSHIP),
  startDate, endDate, status (CURRENT | DIVORCED | WIDOWED),
  addedBy, createdAt

Revision                                // edit history, scoped to a tree
  id, treeId, entityType (PERSON | PARENT_CHILD | UNION | TREE_MEMBER), entityId,
  editedBy, action (CREATE | UPDATE | DELETE), snapshot (JSON), editedAt

MergeRequest                            // duplicate people WITHIN the same tree
  id, treeId, sourcePersonId, targetPersonId, proposedBy,
  status (PENDING | APPROVED | REJECTED), resolvedBy, resolvedAt

MembershipRequest                       // request to join a specific tree
  id, treeId, requesterUserId,
  requestType (NEW_PERSON | CLAIM_EXISTING),
  claimedPersonId (nullable), newPersonDraft (JSON, nullable),
  anchorPersonId, relationshipType,
  requiredApprovals (int),              // 1 for NEW_PERSON, 2 for CLAIM_EXISTING
  status (PENDING | APPROVED | REJECTED), createdAt, resolvedAt

MembershipApproval
  id, requestId, approverUserId, approvedAt

Media
  id, personId, url, caption, uploadedBy, uploadedAt
```

A person can legitimately exist as separate records in two different trees if real
families overlap (e.g. in-laws each keep their own tree) — that's an accepted
limitation of "trees never merge," not a bug to solve.

## 4. Membership & Join Flow

Two ways a `Tree` gets new members:

**A. Direct invite** (the common case): a `FOUNDER`/`ADMIN` invites someone by email.
The invitee signs in with Google, the invite auto-attaches them as a `TreeMember`,
and they either link to a `Person` the inviter already created for them or add
themselves.

**B. Self-service join request** (someone finds/hears about a tree and asks in): same
two-tier flow as before, now scoped to one tree instead of a global graph:
- **`NEW_PERSON`** — "I'm not in this tree yet; I'm the child/spouse of anchor person
  X." Lower risk, purely additive. **1 approval required**, from an existing member
  connected to that anchor (or an admin if no linked member is close enough).
- **`CLAIM_EXISTING`** — "This `Person` record already in the tree *is me*." Higher
  risk — it's a claim on a record others may have already contributed to.
  **2 independent approvals required** from members connected to that person, or a
  single `ADMIN`/`FOUNDER` override.

**Admin delegation**: a tree's `FOUNDER` can promote any `TreeMember` to `ADMIN`.
Admins share approval and moderation authority for that tree only — authority never
extends across trees. Promotions/demotions are logged as `Revision`s for
auditability, same as any other tree change.

## 5. Visibility

Within a tree, **every member sees the whole tree** — there's no per-member computed
radius. The tree itself is the privacy boundary (only members see it at all), so a
second layer of intra-tree visibility restriction isn't needed for v1.

A "focus view" — centering the tree visualization on yourself and fading out distant
branches — is worth keeping as a **UI convenience** for large trees, not as an access
control mechanism: it's just a client-side filter over data the member can already
see in full.

## 6. Editing Model

Any `MEMBER` (not just admins) can add/edit people and relationships in a tree they
belong to.

- Every write creates a `Revision` (who changed what, when, before/after snapshot),
  with a visible history tab and one-click revert per profile.
- **Conflict handling**: last-write-wins, nothing destroyed — full history means bad
  edits are always recoverable.
- **Duplicates within a tree are still possible** (two cousins each add the same
  grandparent) even without cross-tree merging. Keep the `MergeRequest` flow, scoped
  to one tree: search suggests likely duplicates on add; either member can propose a
  merge; other connected members review before it's finalized.
- **Disputes/misuse within a tree**: since it's a small trusted group (not the open
  public), a lightweight path is enough for v1 — an `ADMIN` can revert any edit or
  remove a member; no global moderation queue needed.

## 7. Privacy Considerations

Much lighter than the "public platform" version of this plan, because access is now
bounded to an invited group per tree rather than the open internet — but it's still
real people's data, some of it entered by someone other than the person themselves:

- **Living people**: keep an `isLiving` flag; consider letting a person hide their
  own bio/photo once they've claimed their profile, even from other tree members.
- **Minors**: default to name + relationship only; skip photos/detailed bios unless
  a parent/guardian in the tree explicitly adds them.
- **Verification stays social, not document-based**: the 2-approver `CLAIM_EXISTING`
  flow (§4) is enough — avoid ever asking for ID uploads or biometric verification,
  which would introduce disproportionate liability (e.g. biometric privacy laws with
  per-violation statutory damages) for a private family app.
  - **Leave-a-tree / takedown**: a member should be able to leave a tree, and a
  living person should be able to ask to have their own profile restricted or
  removed even if someone else added them — simple in-app action, not a legal
  process, since it stays within one private group.
- A basic **Privacy Policy** covering what's stored and who can see it is still worth
  having before other people's data goes in, even at small scale.

## 8. Core Features

**MVP**
- Google sign-in
- Create a tree (become its founder) or join one via invite/request
- Add/edit people and `ParentChild`/`Union` relationships within a tree
- Full-tree visualization
- Revision history + revert on every profile
- Admin delegation (founder → admins) per tree

**V2**
- Merge-duplicates tool (within a tree)
- Photo/document uploads, life-event timeline
- Search within a tree
- GEDCOM import/export
- "Focus view" (center on self, fade distant branches) as a display filter

**V3**
- Mobile-responsive/PWA
- Multiple trees per user with an easy switcher (e.g. maternal vs. paternal side, or
  managing a tree for in-laws)

## 9. High-Level Architecture

```
Browser (Next.js React app)
   |  Google OAuth
   v
Auth.js (Next.js API routes) <---> Google Identity
   |  session (JWT/cookie)
   v
Next.js Server (API routes / Server Actions)
   |-- every query/write scoped by treeId + membership check --> PostgreSQL
   |-- Prisma (Tree / TreeMember / Person / ParentChild / Union / Revision / MergeRequest)
   |-- Storage SDK --> Supabase/R2 (photos, private per tree)
   v
Vercel deployment
```

## 10. Suggested Build Phases

| Phase | Goal | Exit criteria |
|---|---|---|
| **0. Walking skeleton** | Prove auth + tree creation + membership scoping work end-to-end | Create a tree, invite a second Google account, confirm they only see that tree's data |
| **1. Core data entry** | Build out a real tree with real relatives | People/relationships added, tree visualization renders correctly, revisions logged |
| **2. Trust & safety (lightweight)** | Handle the small-scale versions of open editing | Revert a bad edit, merge a duplicate person, promote an admin — all through the UI |
| **3. Privacy pass** | Cover the essentials before inviting people outside your immediate circle | Privacy policy exists; living-person hide option and leave-tree/takedown action work |
| **4. Multi-tree rollout** | Let other people create their own independent trees using the app | A second, unrelated tree can be created and used with zero interaction with the first |
| **5. Enrichment (v2)** | Photos, search, GEDCOM import/export, focus view | — |

## 11. Open Questions
- Any existing data source to seed your first tree (a family GEDCOM export, spreadsheet)?
- Should tree creation be open to anyone with a Google account, or should the very first tree (yours) be seeded by you directly with invites only, before deciding whether to let others spin up unrelated trees at all (Phase 4)?
