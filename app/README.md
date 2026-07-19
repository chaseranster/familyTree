# Family Tree App

Phase 0 walking skeleton. See `../docs/` for the full PRD, architecture,
data model, API spec, and ADRs; `../PLAN.md` for the design narrative.

## What's implemented so far

- Google sign-in (Auth.js), no tree access granted until a membership exists
  (`docs/ARCHITECTURE.md` §5.1).
- Create a tree → creator becomes `FOUNDER` (`docs/ARCHITECTURE.md` §5.2).
- Dashboard listing the trees you belong to.
- Invite a relative by email; they accept after signing in with that exact
  email (`docs/ARCHITECTURE.md` §5.3, simplified — invite links are shown in
  the UI rather than emailed, since there's no email provider wired up yet).
- Every tree page enforces membership server-side via `assertTreeMember`
  (`src/lib/authz.ts`), returning a 404 rather than a 403 for both "no
  access" and "doesn't exist" — see `docs/API_SPEC.md` Error Conventions.
- Every mutating action logs a `Revision` row in the same transaction.

Not yet built: person/relationship CRUD, tree visualization, consent-gating
UI, revert UI, admin delegation UI. That's Phase 1+ (`docs/PRD.md` §6).

## Setup

1. **Database**: point `DATABASE_URL` in `.env` at a Postgres instance (a
   local one works fine for development). Then run:

   ```bash
   npx prisma migrate dev
   ```

2. **Google OAuth**: create an OAuth 2.0 Client ID at
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (type: Web application). Add these authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://<your-vercel-domain>/api/auth/callback/google` (prod)

   Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `AUTH_SECRET` (generate with `openssl rand -base64 32`)

3. **Run it**:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Tech stack

Next.js (App Router) · Auth.js (Google provider) · Prisma + PostgreSQL ·
Tailwind CSS. Full rationale in `../docs/adr/`.
