# ADR-0003: Consent-gated sensitive fields (photo, full name, date of birth)

**Status:** Accepted · **Date:** 2026-07-19

## Context

Even within a private, invite-only tree, most people represented are added by
someone other than themselves and never explicitly agree to how their photo,
full name, or birth date are shown to other members. The product requirement
was to hide these fields by default and reveal them only with explicit
consent.

Two hard cases needed resolving:
1. Most ancestors are deceased and can never create an account to consent.
2. A living person who hasn't joined yet also can't consent — but unlike a
   deceased person, they *could* join later and decide for themselves.

## Decision

- `Person.sensitiveDetailsVisible` defaults to `false` for every profile,
  gating `photoUrl`, `lastName`/`maidenName`, and `birthDate` together.
- If the person has a linked account, **only they** can grant or revoke
  consent — not an admin, not whoever added them.
- If the person is **deceased** and has no linked account, the person who
  added them, or any tree admin, may grant proxy consent on their behalf.
- If the person is **living** and has no linked account, **no one** may grant
  proxy consent — the fields stay masked until that person joins and decides
  for themselves.
- While masked, a profile still shows first name, tree position/relationships,
  and living/deceased status, so the tree remains navigable without exposing
  the gated fields.

## Consequences

- Deceased ancestors — the core historical data a family tree exists to
  preserve — aren't permanently and needlessly hidden.
- Living relatives retain full control over their own exposure, with no proxy
  path that could reveal their details before they've had a chance to decide.
- Adds real product complexity (three different consent-eligibility rules
  depending on `isLiving` and account-linkage state) — considered justified
  given the alternative is either over-exposing living people or permanently
  hiding deceased ones.
