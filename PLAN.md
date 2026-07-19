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
  role (MEMBER | ADMIN | FOUNDER)     // ADMIN/FOUNDER = fallback approvers + moderation authority

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
  requestType (NEW_PERSON | CLAIM_EXISTING),
  claimedPersonId (nullable),          // set when requestType = CLAIM_EXISTING
  newPersonDraft (JSON, nullable),     // set when requestType = NEW_PERSON
  anchorPersonId, relationshipType,
  requiredApprovals (int),             // 1 for NEW_PERSON, 2 for CLAIM_EXISTING
  status (PENDING | APPROVED | REJECTED),
  createdAt, resolvedAt

MembershipApproval                     // one row per approver on a request
  id, requestId, approverUserId, approvedAt

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
2. **Request to join** — two request types with different stakes:
   - **`NEW_PERSON`**: "I'm not in the tree yet; I'm the child/spouse/etc. of anchor
     person X." Lower risk — it's an addition, not a takeover. **1 approval required.**
   - **`CLAIM_EXISTING`**: "This existing `Person` node someone else already added
     *is me*." Higher risk — that node may already carry data (photos, bio, edges)
     other people contributed, so a false claim is effectively identity takeover of
     an existing record. **2 independent approvals required**, from two different
     already-linked members connected to that person (not just one relative) — or a
     single ADMIN/FOUNDER override.
3. **Route the approval(s)** — delegated, not centralized:
   - If the anchor/claimed person already has linked, active member(s) among their
     close relatives, those members are asked to approve — the people best placed to
     confirm the claim is real.
   - If no linked member can be found for that branch (deceased anchor, nobody's
     joined yet), it falls to whoever currently manages that branch (anyone with that
     `Person` in their visible/edit radius).
   - If still no one can be found (orphan branch, first request ever), it falls to an
     **ADMIN or FOUNDER** (`User.role`).
4. **On approval** (once `requiredApprovals` is met): the `Person` node/edge is
   created or confirmed, `User.linkedPersonId` is set, and every approval is logged
   as a `Revision` (each approver recorded as a vouching party). The new member's own
   5-generation visibility now computes from their newly linked node.
5. **On rejection**: requester is notified and can appeal to an admin/founder.

**Admin delegation**: the founder isn't a permanent single point of failure — a
founder can promote trusted members to `ADMIN`, who then share fallback-approval and
moderation authority. Promotions/demotions are themselves logged as `Revision`s
(entityType `USER`) for auditability, same as any other sensitive action in the app.

Routing approval to the *nearest verified relatives* rather than one central admin
avoids a bottleneck as the tree grows, while requiring real, already-trusted people to
vouch for every new connection — and requiring two of them specifically when someone
is claiming to *be* an already-documented person, since that's a stronger, riskier
claim than simply being added as a new relative.

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

## 7. Legal / Policy Considerations & Privacy Risk Register

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

### Privacy risk register

The thing that makes this app's privacy posture different from a normal app: **most
of the people whose data lives in it never signed up and never agreed to anything.**
Relatives get added by other relatives. That single fact drives most of the risk
below.

| Risk | Why it applies here | Mitigation already in plan / needed |
|---|---|---|
| **Non-consenting data subjects** | Most `Person` records belong to people who never created an account or agreed to a ToS — you're a de facto data controller for people who aren't your users. | Restricted-by-default living-person privacy (§4); public takedown/opt-out process; privacy policy that addresses non-users explicitly, not just registered members. |
| **Sensitive inferences from relationship structure alone** | Family-graph data can reveal adoption status, same-sex partnerships (sexual orientation — a GDPR "special category"), estrangement, or non-paternity events, even without anyone stating them directly. | Treat `Union.type`, adoption `ParentChild.type`, and any free-text `bio` as sensitive-by-default, not just birthdate/photo. |
| **Minors' data** | Relatives will enter names/photos/birthdates of children who can't consent themselves. | Name + relationship only for minors by default; no photos/bios; minors not `CLAIM_EXISTING`-able until they can consent. |
| **Verification-data creep** | The new 2-approval flow for `CLAIM_EXISTING` solves identity risk *without* documents — resist the temptation to "just ask for an ID photo" later; ID/biometric verification is a much higher liability tier (e.g. Illinois BIPA carries statutory damages per violation). | Keep verification social (multi-approver), not document- or biometric-based. |
| **Cross-border data transfer** | If any relative lives outside the US, their data sits on US infrastructure — GDPR (and similar laws) applies based on the *data subject's* location, not yours. | No EU legal entity needed at hobby scale, but honor access/delete requests promptly and say so in the privacy policy. |
| **Breach exposure & notification** | A breach here leaks names, birthdates, relationships, and photos of possibly thousands of people — many with no contact info on file, making legally-required breach notification hard. | Encrypt at rest, least-privilege DB access, private-by-default photo storage, don't collect anything beyond what the tree needs (no IDs/SSNs). |
| **Family-social harm (not just legal)** | Even where nothing is illegal, exposing biological parentage, estrangement, or a living person's location via listed relatives can cause real harm. | Restricted defaults + no indexing solve most of this; the takedown process is the backstop. |
| **Founder/admin power itself** | Founders/admins (§5) end up with override access to identity disputes and effectively see sensitive family facts others don't. | Log every promotion, approval, and override as a `Revision` so admin power is auditable, not just member edits. |

Practically: none of this needs a lawyer at Phase 0–2 (private beta, a handful of
relatives) — it needs to be *designed for* now so it isn't a scramble at Phase 3
(§10), which is exactly why it's already gating that phase's exit criteria.

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
- Any existing data source to seed the graph (a family GEDCOM export, spreadsheet)?
- Who should hold `FOUNDER`/`ADMIN` role at launch besides you, if anyone?
