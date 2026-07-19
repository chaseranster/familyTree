# ADR-0001: Isolated private trees instead of a global public graph

**Status:** Accepted · **Date:** 2026-07-19

## Context

The project initially explored a single global genealogy graph (like
WikiTree/Geni), where anyone could sign up, add relatives, and separate
family trees would merge automatically wherever they connected. This scoped
in significant complexity: cross-family duplicate-profile detection and
merge disputes, public-platform moderation, and privacy exposure for people
who never agreed to be included.

## Decision

Replace the global graph with a multi-tenant model: any user can create a
private `Tree`; membership is invite- or approval-gated; each tree is fully
isolated from every other tree. Trees never merge or link, even when
real-world families overlap — a person may exist as separate records in two
different trees, and that's an accepted limitation, not a bug.

## Consequences

- Removes the hardest problems from the previous design: cross-tree
  duplicate detection, merge disputes, and most public-platform legal/privacy
  exposure.
- Removes the need for a recursive-CTE or graph-database visibility engine —
  see ADR-0002.
- Trade-off: two overlapping real families (e.g. in-laws) will maintain
  separate, non-synchronized records of the same people if each keeps their
  own tree. Considered acceptable given the complexity avoided.
