// lib/authOptions.ts
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { query } from "@/lib/db"; // DB helper

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
      if (user) {
        token.user = user;
        token.userId = user.id; // Store user ID in token
      }
      return token;
    },
    async session({ session, token }) {
      if (token.user && session.user) {
        // Extend session.user with id from token
        const user = session.user as any;
        const tokenUser = token.user as any;
        user.id = token.userId as string;
        if (tokenUser?.name) user.name = tokenUser.name;
        if (tokenUser?.email) user.email = tokenUser.email;
      }
      return session;
    },
  },
};

// {
//   providers: [
//     EmailProvider({
//       server: process.env.EMAIL_SERVER || "",
//       from: process.env.EMAIL_FROM || "no-reply@example.com",
//     }),
//     // Add other providers (Google, GitHub) as needed
//   ],

//   session: {
//     strategy: "jwt", // use JWT so we can hand compact token to client
//     maxAge: 30 * 24 * 60 * 60, // 30 days
//   },

//   jwt: {
//     // NextAuth will sign JWT using NEXTAUTH_SECRET by default (HS256)
//     // Keep tokens small, store only minimal identity claims
//   },

//   callbacks: {
//     // Called when JWT is created or updated
//     async jwt({ token, user, account, profile }): Promise<JWT> {
//       // On initial sign-in `user` will be available.
//       if (user) {
//         // Persist minimal info in token
//         token.id = (user as any).id ?? token.sub;
//         token.email = (user as any).email ?? token.email;
//         // You may add role if you map it from your adapter or provider
//         // token.role = 'passenger' | 'driver' etc.
//       }
//       return token;
//     },

//     // Controls what is returned by /api/auth/session to client
//     async session({ session, token }) {
//       // Expose minimal claims to client session object
//       (session as any).user = session.user || {};
//       (session as any).user.id = token.id ?? token.sub;
//       (session as any).user.email = token.email ?? session.user?.email;
//       // Do NOT place sensitive info here
//       return session;
//     },
//   },

//   // Optional: use an adapter to persist users (recommended)
//   // adapter: YourAdapterHere(),

//   // Secret used to sign tokens
//   secret: process.env.NEXTAUTH_SECRET,
// }
