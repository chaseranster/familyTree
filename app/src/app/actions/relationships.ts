"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, assertTreeMember } from "@/lib/authz";
import { logRevision } from "@/lib/revisions";
import type { ParentChildType, UnionType } from "@/generated/prisma/client";

const PARENT_CHILD_TYPES: readonly ParentChildType[] = [
  "BIOLOGICAL",
  "ADOPTED",
  "STEP",
  "FOSTER",
];
const UNION_TYPES: readonly UnionType[] = ["MARRIAGE", "PARTNERSHIP"];

async function assertSameTree(treeId: string, personIds: string[]) {
  const count = await prisma.person.count({
    where: { treeId, id: { in: personIds } },
  });
  if (count !== new Set(personIds).size) {
    throw new Error("Selected people must belong to this tree");
  }
}

export async function createParentChild(treeId: string, formData: FormData) {
  const user = await requireUser();
  await assertTreeMember(user.id, treeId);

  const parentId = String(formData.get("parentId") ?? "");
  const childId = String(formData.get("childId") ?? "");
  const typeRaw = String(formData.get("type") ?? "BIOLOGICAL");
  const type: ParentChildType = PARENT_CHILD_TYPES.includes(
    typeRaw as ParentChildType,
  )
    ? (typeRaw as ParentChildType)
    : "BIOLOGICAL";

  if (!parentId || !childId) {
    throw new Error("Both a parent and a child must be selected");
  }
  if (parentId === childId) {
    throw new Error("A person cannot be their own parent");
  }
  await assertSameTree(treeId, [parentId, childId]);

  await prisma.$transaction(async (tx) => {
    const edge = await tx.parentChild.create({
      data: { treeId, parentId, childId, type, addedBy: user.id },
    });
    await logRevision(tx, {
      treeId,
      entityType: "PARENT_CHILD",
      entityId: edge.id,
      editedBy: user.id,
      action: "CREATE",
      snapshot: edge,
    });
  });

  revalidatePath(`/trees/${treeId}`);
}

export async function createUnion(treeId: string, formData: FormData) {
  const user = await requireUser();
  await assertTreeMember(user.id, treeId);

  const person1Id = String(formData.get("person1Id") ?? "");
  const person2Id = String(formData.get("person2Id") ?? "");
  const typeRaw = String(formData.get("type") ?? "MARRIAGE");
  const type: UnionType = UNION_TYPES.includes(typeRaw as UnionType)
    ? (typeRaw as UnionType)
    : "MARRIAGE";

  if (!person1Id || !person2Id) {
    throw new Error("Two people must be selected");
  }
  if (person1Id === person2Id) {
    throw new Error("A person cannot be partnered with themselves");
  }
  await assertSameTree(treeId, [person1Id, person2Id]);

  await prisma.$transaction(async (tx) => {
    const edge = await tx.union.create({
      data: { treeId, person1Id, person2Id, type, addedBy: user.id },
    });
    await logRevision(tx, {
      treeId,
      entityType: "UNION",
      entityId: edge.id,
      editedBy: user.id,
      action: "CREATE",
      snapshot: edge,
    });
  });

  revalidatePath(`/trees/${treeId}`);
}
