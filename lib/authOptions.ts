// lib/authOptions.ts
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcrypt";
import { query } from "@/lib/db";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const providers: AuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: {
        label: "Email",
        type: "text",
        placeholder: "you@example.com",
      },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const normalizedEmail = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password;

      if (!normalizedEmail || !password) {
        throw new Error("Email and password are required");
      }

      const result = await query(
        "SELECT id, email, full_name, password_hash FROM users WHERE LOWER(email) = $1 LIMIT 1",
        [normalizedEmail]
      );

      if (!result.rowCount) {
        throw new Error("Invalid email or password");
      }

      const user = result.rows[0];

      if (!user.password_hash) {
        throw new Error("Use Google sign-in for this account");
      }

      let isValid = false;
      try {
        isValid = await bcrypt.compare(password, user.password_hash);
      } catch {
        throw new Error("Invalid email or password");
      }

      if (!isValid) {
        throw new Error("Invalid email or password");
      }

      return {
        id: String(user.id),
        name: user.full_name,
        email: user.email,
      };
    },
  }),
];

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    })
  );
}

export const authOptions: AuthOptions = {
  providers,

  session: {
    strategy: "jwt",
  },

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) {
          return false;
        }

        const normalizedEmail = user.email.trim().toLowerCase();

        try {
          const result = await query(
            "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
            [normalizedEmail]
          );

          if (!result.rowCount) {
            const insertResult = await query(
              "INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
              [normalizedEmail, user.name || "", ""]
            );
            user.id = insertResult.rows[0].id.toString();
          } else {
            user.id = result.rows[0].id.toString();
          }

          user.email = normalizedEmail;
        } catch (error) {
          console.error("Error handling Google sign-in:", error);
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.userId = String(user.id);
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const nextUser = session.user as typeof session.user & {
          id: string;
          email?: string | null;
          name?: string | null;
        };

        nextUser.id = (token.userId as string) || (token.sub as string) || "";
        nextUser.email = nextUser.email || (token.email as string) || "";
        nextUser.name = nextUser.name || (token.name as string) || "";
      }

      return session;
    },
  },
};
