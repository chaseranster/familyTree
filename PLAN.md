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

## 5. Editing Model

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

## 6. Legal / Policy Considerations (real, not optional, for an open public platform)

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

## 7. Core Features

**MVP**
- Google sign-in (open registration)
- Onboarding: create your own `Person`, or search + claim an existing profile someone
  else added
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

## 8. High-Level Architecture

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

## 9. Suggested Build Phases
1. **Scaffold**: Next.js + TypeScript, Prisma + Postgres, Auth.js Google provider, open signup, deploy skeleton to Vercel.
2. **Data layer**: `Person`, `ParentChild`, `Union`, `Revision` tables + migrations.
3. **Onboarding flow**: claim-or-create Person on first login.
4. **Visibility engine**: recursive CTE for 5-gen up/down + siblings/spouses; enforce on every read/write.
5. **CRUD UI**: add/edit people & relationships, all writes logged to `Revision`.
6. **Tree visualization**: render the viewer's visible subgraph.
7. **Privacy**: living-person restrictions.
8. **History/revert UI**.
9. **Merge tool + reporting/moderation** (needed before any real public launch).
10. **Legal**: ToS/Privacy Policy, takedown process.
11. **Media, search, GEDCOM** (stretch).

## 10. Open Questions
- Launch strategy: fully open signup from day one, or an invite/waitlist period while merge-tooling and moderation mature? (Open platforms without moderation tend to accumulate vandalism/duplicates fast.)
- Should "claiming" an existing profile someone else created require any verification, or is self-attestation ("this is me") enough for v1?
- Any existing data source to seed the graph (a family GEDCOM export, spreadsheet)?
