// lib/authOptions.ts
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
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

        // 🔍 Check user in database (optimized: select only needed columns)
        const result = await query(
          "SELECT id, email, full_name, password_hash FROM users WHERE email = $1",
          [credentials.email]
        );

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
          throw new Error("Invalid password");
        }

        // ✅ Return minimal safe user object
        return {
          id: user.id,
          name: user.full_name,
          email: user.email,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],

  session: {
    strategy: "jwt",
  },

  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle Google OAuth sign-in
      if (account?.provider === "google") {
        try {
          // Check if user exists in database (optimized: select only id)
          const result = await query(
            "SELECT id FROM users WHERE email = $1",
            [user.email]
          );

          if (result.rowCount === 0) {
            // Create new user in database for Google OAuth
            const insertResult = await query(
              "INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
              [user.email, user.name || "", ""] // Empty password_hash for OAuth users
            );
            user.id = insertResult.rows[0].id.toString();
          } else {
            // User exists, use their ID
            user.id = result.rows[0].id.toString();
          }
        } catch (error) {
          console.error("Error handling Google sign-in:", error);
          return false; // Prevent sign-in on error
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.user = user;
        token.userId = user.id;
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as typeof session.user & {
          id: string;
          email?: string | null;
          name?: string | null;
        };
        user.id = (token.userId as string) || "";
        user.email = user.email || (token.email as string) || "";
        user.name = user.name || (token.name as string) || "";
      }
      return session;
    },
  },
};

//  {
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

