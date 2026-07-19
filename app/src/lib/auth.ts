import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Authentication only: upsert a User row keyed by Google's stable
    // account id. This does NOT grant access to any tree -- that's a
    // separate membership flow (see docs/ARCHITECTURE.md §5.2-5.3).
    async signIn({ user, account }) {
      if (!user.email || !account?.providerAccountId) return false;

      await prisma.user.upsert({
        where: { googleId: account.providerAccountId },
        update: {
          email: user.email,
          name: user.name ?? "",
          avatarUrl: user.image ?? null,
        },
        create: {
          googleId: account.providerAccountId,
          email: user.email,
          name: user.name ?? "",
          avatarUrl: user.image ?? null,
        },
      });

      return true;
    },
    async jwt({ token, account }) {
      if (account?.providerAccountId) {
        const dbUser = await prisma.user.findUnique({
          where: { googleId: account.providerAccountId },
        });
        if (dbUser) token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
