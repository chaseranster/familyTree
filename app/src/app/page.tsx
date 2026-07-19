import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold">Family Tree</h1>
      <p className="max-w-md text-gray-600">
        Build and maintain your family&apos;s tree together. Each tree is
        private to the people you invite.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-black px-5 py-2.5 text-white hover:bg-gray-800"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
