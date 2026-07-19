"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, assertTreeMember } from "@/lib/authz";
import { logRevision } from "@/lib/revisions";

const INVITE_TTL_DAYS = 14;

export async function createInvite(treeId: string, formData: FormData) {
  const user = await requireUser();
  await assertTreeMember(user.id, treeId, "ADMIN");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Email is required");
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.invite.create({
    data: {
      treeId,
      email,
      token,
      invitedBy: user.id,
      expiresAt,
    },
  });

  redirect(`/trees/${treeId}`);
}

export async function acceptInvite(token: string) {
  const user = await requireUser();

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    throw new Error("This invite is no longer valid.");
  }
  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error(
      `This invite was sent to ${invite.email}. Sign in with that Google account to accept it.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const member = await tx.treeMember.create({
      data: {
        treeId: invite.treeId,
        userId: user.id,
        role: invite.role,
        linkedPersonId: invite.linkedPersonId,
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await logRevision(tx, {
      treeId: invite.treeId,
      entityType: "TREE_MEMBER",
      entityId: member.id,
      editedBy: user.id,
      action: "CREATE",
      snapshot: member,
    });
  });

  redirect(`/trees/${invite.treeId}`);
}
