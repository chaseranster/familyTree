import type { Prisma, RevisionAction, RevisionEntityType } from "@/generated/prisma/client";

export async function logRevision(
  tx: Prisma.TransactionClient,
  params: {
    treeId: string;
    entityType: RevisionEntityType;
    entityId: string;
    editedBy: string;
    action: RevisionAction;
    snapshot: unknown;
  },
) {
  return tx.revision.create({
    data: {
      treeId: params.treeId,
      entityType: params.entityType,
      entityId: params.entityId,
      editedBy: params.editedBy,
      action: params.action,
      snapshot: params.snapshot as Prisma.InputJsonValue,
    },
  });
}
