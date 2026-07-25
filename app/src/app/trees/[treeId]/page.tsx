import Link from "next/link";
import { requireUser, assertTreeMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createInvite } from "@/app/actions/invites";
import { createPerson } from "@/app/actions/people";
import { createParentChild, createUnion } from "@/app/actions/relationships";
import { buildFamilyForest, buildFocusView, personLabel } from "@/lib/family-tree";
import { FamilyTreeView } from "./FamilyTreeView";
import { FocusFamilyView } from "./FocusFamilyView";

export default async function TreePage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { treeId } = await params;
  const { focus: focusParam } = await searchParams;
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

  const [people, parentChildren, unions] = await Promise.all([
    prisma.person.findMany({ where: { treeId }, orderBy: { createdAt: "asc" } }),
    prisma.parentChild.findMany({ where: { treeId } }),
    prisma.union.findMany({ where: { treeId } }),
  ]);

  const forest = buildFamilyForest(people, parentChildren, unions);

  const focusId = focusParam ?? membership.linkedPersonId ?? people[0]?.id ?? null;
  const focusView = focusId
    ? buildFocusView(focusId, people, parentChildren, unions)
    : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:gap-8 sm:p-8">
      <div>
        <Link
          href="/dashboard"
          className="inline-block py-1 text-sm text-gray-500 hover:underline"
        >
          ← Your trees
        </Link>
        <h1 className="text-xl font-semibold break-words sm:text-2xl">
          {tree.name}
        </h1>
        <p className="text-sm text-gray-500">Your role: {membership.role}</p>
      </div>

      <section>
        <h2 className="mb-3 font-medium">Family tree</h2>

        {/* Mobile: a vertical, tap-to-recenter focus view -- a wide chart
            needs horizontal panning on a phone regardless of styling. */}
        <div className="sm:hidden">
          {focusView ? (
            <FocusFamilyView view={focusView} treeId={treeId} />
          ) : (
            <p className="text-sm text-gray-500">
              No one&apos;s been added yet — add the first person below.
            </p>
          )}
        </div>

        {/* Desktop/tablet: the full chart, where a wide diagram works fine. */}
        <div className="hidden overflow-x-auto rounded-md border border-gray-200 p-4 sm:block">
          <FamilyTreeView roots={forest} />
        </div>
      </section>

      <section className="rounded-md border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Add a person</h2>
        <form action={createPerson.bind(null, treeId)} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="firstName"
              required
              placeholder="First name"
              className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
            />
            <input
              name="lastName"
              placeholder="Last name"
              className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              name="gender"
              defaultValue="UNKNOWN"
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-base"
            >
              <option value="UNKNOWN">Gender unknown</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
            </select>
            <label className="flex min-h-11 items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" name="isLiving" defaultChecked />
              Living
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1 text-sm text-gray-600">
              Birth date
              <input
                type="date"
                name="birthDate"
                className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
              />
            </label>
            <label className="flex-1 text-sm text-gray-600">
              Death date
              <input
                type="date"
                name="deathDate"
                className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
              />
            </label>
          </div>
          <button
            type="submit"
            className="min-h-11 self-start rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 active:bg-gray-900"
          >
            Add person
          </button>
        </form>
      </section>

      {people.length >= 2 && (
        <section className="rounded-md border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">Add a relationship</h2>

          <form
            action={createParentChild.bind(null, treeId)}
            className="mb-4 flex flex-col gap-2"
          >
            <p className="text-sm text-gray-600">Parent → child</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                name="parentId"
                required
                defaultValue=""
                className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
              >
                <option value="" disabled>
                  Parent
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personLabel(p)}
                  </option>
                ))}
              </select>
              <select
                name="childId"
                required
                defaultValue=""
                className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
              >
                <option value="" disabled>
                  Child
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                name="type"
                defaultValue="BIOLOGICAL"
                className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-base"
              >
                <option value="BIOLOGICAL">Biological</option>
                <option value="ADOPTED">Adopted</option>
                <option value="STEP">Step</option>
                <option value="FOSTER">Foster</option>
              </select>
              <button
                type="submit"
                className="min-h-11 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 active:bg-gray-900"
              >
                Link parent/child
              </button>
            </div>
          </form>

          <form
            action={createUnion.bind(null, treeId)}
            className="flex flex-col gap-2"
          >
            <p className="text-sm text-gray-600">Spouses / partners</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                name="person1Id"
                required
                defaultValue=""
                className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
              >
                <option value="" disabled>
                  Person
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personLabel(p)}
                  </option>
                ))}
              </select>
              <select
                name="person2Id"
                required
                defaultValue=""
                className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
              >
                <option value="" disabled>
                  Partner
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                name="type"
                defaultValue="MARRIAGE"
                className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-base"
              >
                <option value="MARRIAGE">Marriage</option>
                <option value="PARTNERSHIP">Partnership</option>
              </select>
              <button
                type="submit"
                className="min-h-11 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 active:bg-gray-900"
              >
                Link spouses/partners
              </button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-medium">App members (account access)</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm"
            >
              <div className="font-medium">{m.user.name}</div>
              <div className="break-all text-gray-500">
                {m.user.email} — {m.role}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {membership.role !== "MEMBER" && (
        <section className="rounded-md border border-gray-200 p-4">
          <h2 className="mb-3 font-medium">Invite a relative</h2>
          <form
            action={createInvite.bind(null, treeId)}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="relative@example.com"
              className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
            />
            <button
              type="submit"
              className="min-h-11 rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800 active:bg-gray-900"
            >
              Invite
            </button>
          </form>

          {pendingInvites.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-gray-500">
              {pendingInvites.map((inv) => (
                <li key={inv.id} className="break-all">
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
    </main>
  );
}
