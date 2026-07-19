# ADR-0004: Two-tier membership approval (NEW_PERSON vs. CLAIM_EXISTING)

**Status:** Accepted · **Date:** 2026-07-19

## Context

Anyone who isn't yet a tree member can request to join. Two fundamentally
different claims are possible: "I'm a relative not yet in the tree" (purely
additive) versus "this existing person record — possibly already containing
data other members contributed — *is me*" (an identity claim on a shared
record). Treating both the same either under- or over-verifies one of them.

## Decision

Split join requests into two types with different approval thresholds:
- `NEW_PERSON`: adding oneself as a new relative connected to an anchor
  person. **1 approval** required, from a member connected to that anchor (or
  an admin as fallback).
- `CLAIM_EXISTING`: claiming an already-existing person record as oneself.
  **2 independent approvals** required from members connected to that person,
  or a single admin override.

Approval routing is delegated to the nearest connected member rather than
centralized on the tree founder, to avoid a bottleneck as the tree grows.

## Consequences

- Verification stays entirely social (peer approval) — deliberately avoids
  document or biometric identity verification, which would introduce
  disproportionate liability for a private family app (see `NFR.md` §4).
- `CLAIM_EXISTING` is harder to push through by design, which is the correct
  trade-off given it's effectively an identity takeover of a record others may
  have already built out.
- Small added complexity: the approval-routing logic must find *connected*
  members for a given person, not just any tree member, and fall back
  correctly when none exist.
