"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, assertTreeMember } from "@/lib/authz";
import { logRevision } from "@/lib/revisions";
import type { Gender } from "@/generated/prisma/client";

const GENDERS: readonly Gender[] = ["FEMALE", "MALE", "OTHER", "UNKNOWN"];

function parseDate(value: FormDataEntryValue | null): Date | undefined {
  const s = String(value ?? "").trim();
  return s ? new Date(s) : undefined;
}

export async function createPerson(treeId: string, formData: FormData) {
  const user = await requireUser();
  await assertTreeMember(user.id, treeId);

  const firstName = String(formData.get("firstName") ?? "").trim();
  if (!firstName) {
    throw new Error("First name is required");
  }
  const lastName = String(formData.get("lastName") ?? "").trim() || undefined;
  const genderRaw = String(formData.get("gender") ?? "UNKNOWN");
  const gender: Gender = GENDERS.includes(genderRaw as Gender)
    ? (genderRaw as Gender)
    : "UNKNOWN";
  const isLiving = formData.get("isLiving") === "on";
  const birthDate = parseDate(formData.get("birthDate"));
  const deathDate = parseDate(formData.get("deathDate"));
  const bio = String(formData.get("bio") ?? "").trim() || undefined;

  await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        treeId,
        firstName,
        lastName,
        gender,
        isLiving,
        birthDate,
        deathDate,
        bio,
        createdBy: user.id,
      },
    });
    await logRevision(tx, {
      treeId,
      entityType: "PERSON",
      entityId: person.id,
      editedBy: user.id,
      action: "CREATE",
      snapshot: person,
    });
  });

  revalidatePath(`/trees/${treeId}`);
}
