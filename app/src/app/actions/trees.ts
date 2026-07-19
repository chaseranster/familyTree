"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertTreeMember } from "@/lib/authz";
import { logRevision } from "@/lib/revisions";

export async function createTree(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Tree name is required");
  }

  const tree = await prisma.$transaction(async (tx) => {
    const tree = await tx.tree.create({
      data: { name, createdBy: user.id },
    });
    const member = await tx.treeMember.create({
      data: { treeId: tree.id, userId: user.id, role: "FOUNDER" },
    });
    await logRevision(tx, {
      treeId: tree.id,
      entityType: "TREE_MEMBER",
      entityId: member.id,
      editedBy: user.id,
      action: "CREATE",
      snapshot: member,
    });
    return tree;
  });

  redirect(`/trees/${tree.id}`);
}

export async function renameTree(treeId: string, formData: FormData) {
  const user = await requireUser();
  await assertTreeMember(user.id, treeId, "ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Tree name is required");
  }

  await prisma.tree.update({
    where: { id: treeId },
    data: { name },
  });

  redirect(`/trees/${treeId}`);
}
