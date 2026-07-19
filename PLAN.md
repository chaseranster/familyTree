# Family Tree App — Project Plan

## 1. Goal

A **public, global genealogy graph** (think WikiTree/Geni, not a private family
scrapbook): anyone can sign in with Google, add themselves and their relatives, and
separate family trees merge together automatically wherever they connect (shared
ancestor, marriage, etc.), forming one giant connected graph of people.

Each logged-in user's default view is centered on themselves and shows:
- up to **5 generations of ancestors** (parents → … → great-great-great-grandparents)
- up to **5 generations of descendants** (children → … → great-great-great-grandchildren)
- the **spouses/partners and siblings** of every person on those direct lines

This is a significantly bigger build than a single private family tree — it's closer
to building a small-scale version of an existing genealogy platform. The plan below
still gets you to a usable v1 without needing all of Geni's feature set on day one.

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React + TypeScript, App Router) | SSR, file-based routing, one deploy target with the backend |
| Auth | Auth.js (NextAuth) — Google provider, open signup | Anyone with a Google account can register |
| Database | PostgreSQL (Neon or Supabase) | Relational modeling + **recursive CTEs** are a good fit for bounded-depth graph traversal (5 up / 5 down) |
| ORM | Prisma | Type-safe schema/migrations |
| Tree visualization | `family-chart` (D3-based) or custom D3 | Renders generational trees with spouses/siblings |
| File storage | Supabase Storage or Cloudflare R2 | Profile photos/documents |
| Hosting | Vercel | Native Next.js support |

**On graph database (Neo4j) vs. Postgres:** a global "everyone" graph sounds like a
natural fit for a graph database, and it's worth revisiting later — but because every
visibility query is *depth-bounded* (max ~10 hops: 5 up, 5 down, +1 lateral for
spouses/siblings), Postgres recursive CTEs handle it well without adding a second
database to operate. Start on Postgres; migrate the traversal layer to Neo4j only if
it becomes a measured bottleneck at scale.

## 3. Data Model

```
User
  id, googleId, email, name, avatarUrl, createdAt
  linkedPersonId (nullable, unique)   // which Person node is "me"
  isFounder (bool)                    // fallback approver for orphaned join requests

Person                                 // ONE global table — not scoped to a family
  id, firstName, lastName, maidenName, gender,
  birthDate, deathDate, birthPlace,
  isLiving (bool), privacyLevel (PUBLIC | RESTRICTED),
  bio, photoUrl, createdBy, createdAt, updatedAt

ParentChild                            // directed edge: parent -> child
  id, parentId, childId, type (BIOLOGICAL | ADOPTED | STEP | FOSTER),
  addedBy, createdAt

Union                                  // spouse / partner edge
  id, person1Id, person2Id, type (MARRIAGE | PARTNERSHIP),
  startDate, endDate, status (CURRENT | DIVORCED | WIDOWED),
  addedBy, createdAt

Revision                               // wiki-style edit history — required for open editing
  id, entityType (PERSON | PARENT_CHILD | UNION), entityId,
  editedBy, action (CREATE | UPDATE | DELETE), snapshot (JSON),
  editedAt

MergeRequest                           // resolving duplicate profiles (inevitable on an open graph)
  id, sourcePersonId, targetPersonId, proposedBy,
  status (PENDING | APPROVED | REJECTED), resolvedBy, resolvedAt

Report                                 // abuse/vandalism/incorrect-info flagging
  id, personId, reportedBy, reason, status, createdAt

MembershipRequest                      // gate between "authenticated" and "trusted member"
  id, requesterUserId,
  claimedPersonId (nullable),          // claiming an existing unclaimed node
  newPersonDraft (JSON, nullable),     // proposing a brand-new person
  anchorPersonId, relationshipType,
  status (PENDING | APPROVED | REJECTED),
  approverUserId, resolvedAt, createdAt

Media
  id, personId, url, caption, uploadedBy, uploadedAt
```

Why no `Family` table this time: with a global open graph, "family" isn't a fixed
boundary — it's just whichever people happen to be connected. Access control is now
computed per-viewer (see §4), not per-group.

## 4. Visibility Model (the core hard problem)

For a viewing user linked to `Person P`, the visible set is:

1. **Ascending**: walk `ParentChild` edges upward from P, up to 5 generations
   (P's parents, grandparents, … great-great-great-grandparents).
2. **Descending**: walk `ParentChild` edges downward from P, up to 5 generations
   (children, grandchildren, … great-great-great-grandchildren).
3. **Lateral, one hop, at every node included above (plus P)**: that node's spouses/
   partners (`Union`) and siblings (other children of the same parent).

This is implemented as a **recursive CTE**, bounded to depth 5 in each direction, run
per-request (or cached briefly, invalidated when an edge near that user changes).
Note this definition intentionally does **not** pull in cousins' descendants or
in-laws' extended families — only direct-line ancestors/descendants plus their
immediate siblings/spouses. That's a reasonable v1 scope; "expand to full cousin
branches" is a natural v2 toggle.

**Enforcement**: every read AND every write endpoint must check "is this Person in my
visible set?" server-side before returning data or accepting an edit — never trust a
client-side check.

**Privacy for living people**: default `RESTRICTED` for anyone marked `isLiving`.
Restricted profiles show only name + relationship (no birthdate/location/bio/photo)
to viewers beyond a tight radius (e.g. 1–2 hops), even if they're within the general
5-generation visible set. Only the person themselves (once they claim their profile)
can loosen this.

## 5. Membership & Join Flow

Authentication (Google sign-in) and membership (trusted access to view/edit the tree)
are deliberately separate. Signing in with Google only creates a `User` — it does not
grant a `linkedPersonId` or any tree access. Access is earned through a **web-of-trust
join flow**, approved by whichever existing member is closest to the claim, not by one
central gatekeeper for the whole graph:

1. **Authenticate**: Google sign-in creates a `User` with no tree access yet.
2. **Request to join**: onboarding asks the new user to either claim an existing
   unclaimed `Person` node (someone already listed them), or propose themselves as a
   new `Person` connected by a relationship to an existing anchor person (e.g. "I'm
   the child of John Doe"). This creates a `MembershipRequest`.
3. **Route the approval** — delegated, not centralized:
   - If the anchor person already has a linked, active member, **that member
     approves** — the person best placed to confirm the claim is real.
   - If the anchor person has no linked member yet (e.g. deceased, or hasn't joined),
     it falls to whoever currently manages that branch (anyone with that `Person` in
     their visible/edit radius).
   - If no one can be found (orphan branch, first request ever), it falls to the
     **founder** (`User.isFounder`) — the original seed member acts as the permanent
     fallback approver, not the default path.
4. **On approval**: the `Person` node/edge is created or confirmed, `User.linkedPersonId`
   is set, and the approval is logged as a `Revision` (approver recorded as the
   vouching party). The new member's own 5-generation visibility now computes from
   their newly linked node.
5. **On rejection**: requester is notified and can appeal to the founder.

Routing approval to the *nearest verified relative* rather than one central admin
avoids a bottleneck as the tree grows, while still requiring a real, already-trusted
person to vouch for every new connection — the core safeguard against identity fraud
(someone falsely claiming to be a specific living relative).

## 6. Editing Model

Per your direction: **anyone within their visible radius can edit** any person/
relationship they can currently see.

- Every write creates a `Revision` row (who changed what, when, before/after
  snapshot) — this is what makes open editing survivable. Every profile needs a
  visible "history" tab and one-click revert.
- **Conflict handling (v1)**: last-write-wins, but nothing is destroyed — history
  keeps every prior version, so bad edits are always recoverable.
- **Duplicate people are inevitable** on an open graph (two cousins each add the same
  grandparent as a new node). Ship a **merge tool** early: search suggests possible
  duplicates when adding a person; either party can propose a `MergeRequest`; the
  other connected editors can review before it's finalized.
- **Abuse/vandalism**: since anyone-in-radius can edit real people's data, add a
  `Report` flow from day one and a lightweight moderation queue (e.g. auto-flag mass
  deletions or edits to many people in a short window).

## 7. Legal / Policy Considerations (real, not optional, for an open public platform)

Because this now involves data about real people — including living people who never
signed up — plan for:
- A **Terms of Service + Privacy Policy** before public launch.
- A **takedown / "right to be forgotten"** process: a living person (or their proxy)
  can request their profile be restricted or removed even if someone else added them.
- **Minors**: avoid collecting detailed data on children beyond name + relationship;
  no photos/bios for minors by default.
- **No public search-engine indexing** of person profiles by default (`noindex`),
  and rate-limit/guard against bulk scraping of the graph.
- Decide early whether registration is fully open at launch or gated behind an
  invite/waitlist while moderation tooling matures — open-with-no-moderation is the
  highest-risk configuration.

## 8. Core Features

**MVP**
- Google sign-in (open registration)
- Membership join flow: request → nearest-relative (or founder) approval → linked `Person`
- Add/edit people and `ParentChild`/`Union` relationships, scoped to your visible set
- Recursive-CTE visibility engine (5 up / 5 down / siblings & spouses)
- Interactive tree visualization scoped to the viewer
- Revision history + revert on every profile
- Living-person privacy restriction

**V2**
- Merge-duplicates tool
- Reporting/moderation queue
- Photo/document uploads, life-event timeline
- Search (name search, restricted results outside your visible set)
- GEDCOM import/export

**V3**
- Configurable visibility radius (extend beyond siblings/spouses to full cousin
  branches)
- Mobile-responsive/PWA
- Stronger identity verification for claiming a living profile

## 9. High-Level Architecture

```
Browser (Next.js React app)
   |  Google OAuth
   v
Auth.js (Next.js API routes) <---> Google Identity
   |  session (JWT/cookie)
   v
Next.js Server (API routes / Server Actions)
   |-- visibility engine (recursive CTE, per-viewer) --> PostgreSQL
   |-- Prisma (Person / ParentChild / Union / Revision / MergeRequest / Report)
   |-- Storage SDK --> Supabase/R2 (photos)
   v
Vercel deployment
```

## 10. Suggested Build Phases

Sequenced to de-risk the hardest technical bet first (the visibility engine), then
build the trust-and-safety tooling *before* opening access, rather than after an
incident. Each phase has an exit criterion — not just a feature list.

| Phase | Goal | Exit criteria |
|---|---|---|
| **0. Walking skeleton** | Prove auth + schema + visibility query work end-to-end | Seed a ~30-person test tree with tricky cases (remarriage, half-siblings, adoption); the recursive CTE returns the correct visible set, hand-verified |
| **1. Private data entry** | You + a few relatives build a real tree, using the membership join flow (§5) at small scale | Real family data entered via request/approve, tree renders correctly, revisions logged on every write |
| **2. Trust & safety** | Build the tooling open editing and open joining require | You can resolve a simulated bad edit (revert), a duplicate profile (merge), and an orphan-branch join request (founder fallback) entirely through the UI |
| **3. Legal & public-readiness** | Clear non-engineering blockers | ToS/privacy policy + takedown process exist; noindex + scraping guards in place; decide whether join requests stay approval-gated indefinitely or open up further |
| **4. Soft public launch** | Open to a wider circle, watch real usage | Stable for a few weeks with acceptable moderation/approval load |
| **5. Enrichment (v2)** | Photos, search, GEDCOM import/export, configurable visibility radius | — |

## 11. Open Questions
- Should "claiming" an existing profile someone else created require any verification beyond nearest-relative approval, or is that approval enough for v1?
- Should founder approval authority ever transfer/delegate to additional permanent admins as the tree grows, to avoid a single point of failure?
- Any existing data source to seed the graph (a family GEDCOM export, spreadsheet)?
