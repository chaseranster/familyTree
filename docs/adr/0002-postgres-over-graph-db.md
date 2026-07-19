# ADR-0002: PostgreSQL over a graph database

**Status:** Accepted · **Date:** 2026-07-19

## Context

Family-tree data is graph-shaped (parent/child/spouse edges), which naturally
suggests a graph database (e.g. Neo4j) for efficient traversal. Under the
earlier global-graph design (ADR-0001, superseded), visibility required a
bounded-depth traversal (5 generations up/down) across a potentially huge
graph, which was a real argument for a graph database.

## Decision

Use PostgreSQL with Prisma, not a graph database, and reconsider only if a
specific tree's queries are measured to be a bottleneck.

## Consequences

- With isolated per-tree data (ADR-0001) and no per-viewer visibility radius
  (every member sees the whole tree they belong to), every query is a plain
  `WHERE treeId = ?` scan — there is no unbounded or cross-tenant graph
  traversal left to justify a graph database's complexity.
- One database technology to operate, back up, and reason about.
- If a future feature reintroduces deep traversal (e.g. an optional
  "cousin-branch" expansion), recursive CTEs remain available in Postgres for
  the same bounded-depth pattern originally designed for the global graph.
