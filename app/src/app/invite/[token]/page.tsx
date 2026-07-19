import { notFound } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acceptInvite } from "@/app/actions/invites";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { tree: true },
  });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    notFound();
  }

  const session = await auth();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-xl font-semibold">
        You&apos;ve been invited to join &quot;{invite.tree.name}&quot;
      </h1>
      <p className="text-sm text-gray-500">Invited email: {invite.email}</p>

      {!session?.user ? (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invite/${token}` });
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-black px-5 py-2.5 text-white hover:bg-gray-800"
          >
            Sign in with Google to accept
          </button>
        </form>
      ) : (
        <form action={acceptInvite.bind(null, token)}>
          <button
            type="submit"
            className="rounded-md bg-black px-5 py-2.5 text-white hover:bg-gray-800"
          >
            Accept invite
          </button>
        </form>
      )}
    </main>
  );
}
