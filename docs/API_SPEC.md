# API Specification — Family Tree App

**Status:** Draft v1.0 · **Last updated:** 2026-07-19
**Related documents:** `ARCHITECTURE.md`, `DATA_MODEL.md`

Presented as REST-style endpoints for clarity; implementation may back these
with Next.js Route Handlers or Server Actions interchangeably — the contract
below is what matters, not the transport. Every endpoint except auth requires
a valid session. Every tree-scoped endpoint additionally requires the caller
to be a `TreeMember` of the `treeId` in the path (`ARCHITECTURE.md` §6); role
requirements are noted per endpoint where stricter than "any member."

## Auth

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/signin/google` | Begin Google OAuth flow |
| GET | `/api/auth/callback/google` | OAuth callback, issues session |
| POST | `/api/auth/signout` | Ends session |
| GET | `/api/me` | Current user + list of tree memberships |

## Trees

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trees` | any user | Create a tree; caller becomes `FOUNDER` |
| GET | `/api/trees` | any user | List trees the caller belongs to |
| GET | `/api/trees/:treeId` | member | Tree metadata |
| PATCH | `/api/trees/:treeId` | `FOUNDER`/`ADMIN` | Rename tree |

## Tree Membership

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trees/:treeId/invites` | `FOUNDER`/`ADMIN` | Invite by email, optional `linkedPersonId` |
| DELETE | `/api/trees/:treeId/invites/:inviteId` | `FOUNDER`/`ADMIN` | Revoke a pending invite |
| POST | `/api/invites/:inviteId/accept` | invitee (authenticated) | Accept an invite → creates `TreeMember` |
| GET | `/api/trees/:treeId/members` | member | List members + roles |
| PATCH | `/api/trees/:treeId/members/:memberId` | `FOUNDER` (promote/demote), `FOUNDER`/`ADMIN` (remove) | Change role or remove a member |

## Membership Requests (self-service join)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trees/:treeId/membership-requests` | any authenticated user | Create a `NEW_PERSON` or `CLAIM_EXISTING` request |
| GET | `/api/trees/:treeId/membership-requests` | member | List requests (pending ones routed to caller are flagged) |
| POST | `/api/membership-requests/:id/approvals` | eligible approver (see `ARCHITECTURE.md` §5.3) | Record an approval; auto-resolves when threshold met |
| POST | `/api/membership-requests/:id/reject` | eligible approver or `ADMIN` | Reject the request |

## People

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trees/:treeId/people` | member | Create a person |
| GET | `/api/trees/:treeId/people` | member | List people in the tree (consent-gated fields stripped per viewer, `ARCHITECTURE.md` §5.5) |
| GET | `/api/trees/:treeId/people/:personId` | member | Get one person (consent-gated) |
| PATCH | `/api/trees/:treeId/people/:personId` | member | Update fields; logs a `Revision` |
| DELETE | `/api/trees/:treeId/people/:personId` | `ADMIN` | Remove a person; logs a `Revision` (revertible) |
| POST | `/api/trees/:treeId/people/:personId/consent` | self (if linked) or eligible proxy (deceased, no account) | Grant `sensitiveDetailsVisible = true` |
| DELETE | `/api/trees/:treeId/people/:personId/consent` | same as grant | Revoke consent |

## Relationships

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trees/:treeId/parent-child` | member | Create a `ParentChild` edge |
| PATCH | `/api/trees/:treeId/parent-child/:id` | member | Update type |
| DELETE | `/api/trees/:treeId/parent-child/:id` | member | Remove edge; logs a `Revision` |
| POST | `/api/trees/:treeId/unions` | member | Create a `Union` edge |
| PATCH | `/api/trees/:treeId/unions/:id` | member | Update dates/status |
| DELETE | `/api/trees/:treeId/unions/:id` | member | Remove edge; logs a `Revision` |

## Revisions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/trees/:treeId/revisions?entityType=&entityId=` | member | History for a specific person/relationship |
| POST | `/api/trees/:treeId/revisions/:id/revert` | member | Revert to the state captured in that revision; itself logs a new `Revision` |

## Merge Requests (V2)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trees/:treeId/merge-requests` | member | Propose merging two people |
| GET | `/api/trees/:treeId/merge-requests` | member | List pending merge requests |
| POST | `/api/merge-requests/:id/approve` | member connected to either person | Approve and execute the merge |
| POST | `/api/merge-requests/:id/reject` | same | Reject |

## Media (V2)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/people/:personId/media` | member | Upload photo/document, private storage |
| GET | `/api/people/:personId/media` | member | List media (photo respects consent gating) |
| DELETE | `/api/media/:id` | member | Remove media |

## Error Conventions

| Status | Meaning |
|---|---|
| 401 | No valid session |
| 403 | Authenticated but not a member of the target tree, or role insufficient |
| 404 | Resource not found *or* exists in a tree the caller can't see (never distinguish the two — avoids leaking tree existence) |
| 409 | Conflicting state (e.g. approving an already-resolved membership request) |
| 422 | Validation error (e.g. `parentId == childId`) |

Note the 404 policy: a cross-tenant lookup and a genuinely missing resource
return the identical response, so no endpoint can be used to probe for the
existence of data in a tree the caller doesn't belong to.
