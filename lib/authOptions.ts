// lib/authOptions.ts
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { query } from "@/lib/db"; // your DB helper

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        // 🔍 Check user in database
        const result = await query("SELECT * FROM users WHERE email = $1", [
          credentials.email,
        ]);

        if (result.rowCount === 0) {
          throw new Error("Invalid credentials");
        }

        const user = result.rows[0];

        // 🔒 Compare password
        const isValid = await bcrypt.compare(
          credentials.password,
          user.password_hash
        );

        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        // ✅ Return minimal safe user object
        return {
          id: user.id,
          name: user.full_name,
          email: user.email,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.user = user;
      return token;
    },
    async session({ session, token }) {
      session.user = token.user as any;
      return session;
    },
  },
};
