import Link from "next/link";
import { requireUser, assertTreeMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createInvite } from "@/app/actions/invites";

export default async function TreePage({
  params,
}: {
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;
  const user = await requireUser();
  const membership = await assertTreeMember(user.id, treeId);

  const tree = await prisma.tree.findUniqueOrThrow({ where: { id: treeId } });
  const members = await prisma.treeMember.findMany({
    where: { treeId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  const pendingInvites =
    membership.role !== "MEMBER"
      ? await prisma.invite.findMany({ where: { treeId, status: "PENDING" } })
      : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
          ← Your trees
        </Link>
        <h1 className="text-2xl font-semibold">{tree.name}</h1>
        <p className="text-sm text-gray-500">Your role: {membership.role}</p>
      </div>

      <section>
        <h2 className="mb-3 font-medium">Members</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm"
            >
              {m.user.name} ({m.user.email}) — {m.role}
            </li>
          ))}
        </ul>
      </section>

      {membership.role !== "MEMBER" && (
        <section className="rounded-md border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">Invite a relative</h2>
          <form
            action={createInvite.bind(null, treeId)}
            className="flex gap-2"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="relative@example.com"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
            >
              Invite
            </button>
          </form>

          {pendingInvites.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-gray-500">
              {pendingInvites.map((inv) => (
                <li key={inv.id}>
                  {inv.email} — pending — share link:{" "}
                  <code className="rounded bg-gray-100 px-1">
                    /invite/{inv.token}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        Adding people and relationships is next (Phase 1 — see
        docs/USER_STORIES.md Epics 6–7).
      </section>
    </main>
  );
}
