import { Webhook } from "svix";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const payload = await req.text();

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

  let evt: { type: string; data: unknown };
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as { type: string; data: unknown };
  } catch (err) {
    console.error("❌ Webhook verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const { type, data } = evt;

  if (type === "user.created" || type === "user.updated") {
    try {
      const { id, email_addresses, first_name, last_name, image_url } = data as { id: string; email_addresses: { email_address: string }[]; first_name: string; last_name: string; image_url: string };

      const { error } = await supabaseAdmin.from("user_profiles").upsert(
        {
          clerk_id: id,
          email: email_addresses?.[0]?.email_address || null,
          full_name: `${first_name || ""} ${last_name || ""}`.trim() || null,
          avatar_url: image_url || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clerk_id" }
      );

      if (error) {
        console.error("❌ Supabase upsert error:", error);
        return new Response("DB upsert failed", { status: 500 });
      }
    } catch (err) {
      console.error("❌ Error syncing profile:", err);
      return new Response("Error", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}
