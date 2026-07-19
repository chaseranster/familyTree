import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TreeRole } from "@/generated/prisma/client";

/**
 * Authentication only. Does NOT imply tree access -- see assertTreeMember.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }
  return session.user;
}

const roleRank: Record<TreeRole, number> = { MEMBER: 0, ADMIN: 1, FOUNDER: 2 };

export async function getTreeMembership(userId: string, treeId: string) {
  return prisma.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId } },
  });
}

/**
 * Enforces docs/ARCHITECTURE.md §6: every tree-scoped request must be
 * authorized against the caller's TreeMember row before any data access.
 *
 * Deliberately calls notFound() rather than a 403 for both "not a member"
 * and "tree doesn't exist" -- see docs/API_SPEC.md Error Conventions, which
 * requires the two cases to be indistinguishable so no endpoint can be used
 * to probe for the existence of a tree the caller doesn't belong to.
 */
export async function assertTreeMember(userId: string, treeId: string, minRole: TreeRole = "MEMBER") {
  const membership = await getTreeMembership(userId, treeId);
  if (!membership || roleRank[membership.role] < roleRank[minRole]) {
    notFound();
  }
  return membership;
}
