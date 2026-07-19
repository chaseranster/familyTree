# Family Tree App — Project Plan

## 1. Goal

A web app where family members sign in with their Google account and collaboratively
build, browse, and maintain a shared family tree: people, relationships (parents,
children, spouses/partners), photos, and life events.

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React + TypeScript, App Router) | SSR for fast first load, file-based routing, one deploy target with the backend |
| Auth | Auth.js (NextAuth) — Google provider | Purpose-built for "Sign in with Google" in Next.js, handles OAuth + sessions/JWT out of the box |
| Database | PostgreSQL (Neon or Supabase, free tier) | Family-tree data is inherently relational (people ↔ relationships); Postgres models this cleanly |
| ORM | Prisma | Type-safe schema/migrations, pairs well with Next.js + Postgres |
| Tree visualization | `family-chart` (D3-based) or a custom D3 layout | Purpose-built for genealogy charts (handles spouses + multiple children + generations), unlike generic org-chart libs |
| File storage | Supabase Storage or Cloudflare R2 | Profile photos / document uploads |
| Hosting | Vercel | Native Next.js support, free tier, zero-config previews |

**Simpler alternative (fewer moving parts, good for a small personal project):**
Firebase (Firebase Auth for Google sign-in, Firestore for data, Firebase Storage,
Firebase Hosting) — everything in one console, generous free tier, but relationship
queries (e.g. "all descendants of X") are more awkward in a NoSQL document store than
in Postgres.

Recommendation: start with **Next.js + Auth.js + Postgres/Prisma + Vercel** — it scales
better as the tree and relationship logic grow, and Prisma migrations keep the schema
auditable.

## 3. Data Model

```
User
  id, googleId, email, name, avatarUrl, createdAt
  -> memberships: FamilyMember[]

Family                       // one row per family tree
  id, name, createdAt
  -> members: FamilyMember[]
  -> people: Person[]

FamilyMember                 // join table: who can access which tree, and how
  id, userId, familyId, role (OWNER | ADMIN | EDITOR | VIEWER)
  linkedPersonId (nullable)  // ties the logged-in user to their own Person node

Person
  id, familyId, firstName, lastName, maidenName, gender,
  birthDate, deathDate, birthPlace, bio, photoUrl,
  createdBy, createdAt, updatedAt

Relationship                 // parent-child edges
  id, familyId, parentId, childId, type (BIOLOGICAL | ADOPTED | STEP | FOSTER)

Union                        // spouse / partner edges
  id, familyId, person1Id, person2Id, type (MARRIAGE | PARTNERSHIP),
  startDate, endDate, status (CURRENT | DIVORCED | WIDOWED)

Media
  id, personId, url, caption, uploadedBy, uploadedAt

Invite
  id, familyId, email, role, token, invitedBy, expiresAt, acceptedAt
```

Notes:
- Modeling parent/child and spouse relationships as separate edge tables (rather than
  a fixed "father/mother" pair on Person) supports same-sex parents, remarriage,
  adoption, and multiple generations without schema changes.
- `Person` is decoupled from `User` — most ancestors won't ever log in. A `Person` is
  only linked to a `User` via `FamilyMember.linkedPersonId` when that individual joins.

## 4. Auth & Access Flow

1. User visits the app → "Sign in with Google" (Auth.js Google provider).
2. First-time login with no family membership → prompt to **create a new family tree**
   or **accept a pending invite** (matched by email).
3. Every request is scoped to `familyId`; a middleware/helper checks the caller's
   `FamilyMember` role before allowing reads/writes.
4. Roles:
   - **Owner** — created the tree; full control, can delete the family, manage all roles.
   - **Admin** — manage members/invites, edit all data.
   - **Editor** — add/edit people, relationships, photos.
   - **Viewer** — read-only browsing.
5. Invites: an Owner/Admin enters an email → app creates an `Invite` row + sends a
   sign-in link (or just tells them to log in with Google using that email, which
   auto-attaches on first login).

## 5. Core Features (MVP → later)

**MVP**
- Google sign-in, family tree creation, invite family members by email
- Add/edit/delete people with core fields (name, dates, photo, bio)
- Add parent-child and spouse/partner relationships
- Interactive tree visualization (pan/zoom, click a node to see details)
- Role-based permissions

**V2**
- Photo/document uploads per person, simple life-event timeline
- Search people by name
- GEDCOM import/export (standard genealogy file format, so people can pull in
  existing trees from Ancestry/MyHeritage or export theirs)
- Multiple named trees per user (e.g. maternal vs. paternal side) with the option to
  eventually merge/link them

**V3 / polish**
- Mobile-responsive layout, offline-friendly PWA
- Comments/stories on a person's profile
- Audit log of edits (who changed what — useful since it's multi-editor)
- Duplicate-person detection when merging branches

## 6. High-Level Architecture

```
Browser (Next.js React app)
   |
   |  Google OAuth redirect
   v
Auth.js (Next.js API routes) --- Google OAuth ---> Google Identity
   |
   | session (JWT/cookie)
   v
Next.js Server (API routes / Server Actions)
   |--- Prisma ---> PostgreSQL (people, relationships, families, users)
   |--- Storage SDK ---> Supabase/R2 (photos)
   v
Vercel deployment (frontend + API in one)
```

## 7. Security Considerations
- All data access scoped by `familyId` + role check server-side (never trust client-side role checks alone).
- Google OAuth only — no password storage.
- Signed, expiring invite tokens; invites bound to a specific email.
- Rate-limit invite creation to prevent abuse.
- Photo uploads: validate file type/size, store behind signed URLs if the tree should stay private (recommended default: private, invite-only).

## 8. Suggested Build Phases
1. **Scaffold**: Next.js + TypeScript project, Prisma + Postgres, Auth.js with Google provider, deploy a "Hello, {name}" page to Vercel to validate the auth loop end-to-end.
2. **Data layer**: Prisma schema for Family/Person/Relationship/Union/FamilyMember, migrations, seed script.
3. **CRUD UI**: forms to add/edit people and relationships; family member list + invite flow.
4. **Tree visualization**: integrate `family-chart` (or custom D3), render from the relationship data, click-through to person detail/edit.
5. **Media**: photo upload + display on person profile.
6. **Permissions polish**: role checks everywhere, invite acceptance flow, tests.
7. **Nice-to-haves**: GEDCOM import/export, search, mobile pass, PWA.

## 9. Open Questions for You
- Is this for **one** family tree shared by everyone, or should the app support multiple independent trees (e.g. if extended family branches want separate trees that can later link)?
- Roughly how many people/generations are you expecting to track (affects whether GEDCOM import is worth prioritizing early)?
- Any existing data source (a spreadsheet, an old GEDCOM file, Ancestry export) you'd want to import from day one?
