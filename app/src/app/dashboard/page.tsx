import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createTree } from "@/app/actions/trees";
import { signOut } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();

  const memberships = await prisma.treeMember.findMany({
    where: { userId: user.id },
    include: { tree: true },
    orderBy: { joinedAt: "desc" },
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your trees</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-sm text-gray-500 hover:underline">
            Sign out
          </button>
        </form>
      </div>

      {memberships.length === 0 ? (
        <p className="text-gray-500">
          You&apos;re not part of any tree yet. Create one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memberships.map((m) => (
            <li key={m.id}>
              <Link
                href={`/trees/${m.treeId}`}
                className="block rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium">{m.tree.name}</span>{" "}
                <span className="text-sm text-gray-500">({m.role})</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-md border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Create a new tree</h2>
        <form action={createTree} className="flex gap-2">
          <input
            name="name"
            required
            placeholder="e.g. The Ranster Family"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
          >
            Create
          </button>
        </form>
      </section>
    </main>
  );
}
