import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = [
  "super_admin",
  "admin",
  "custom",
  "fulfilment",
  "customer_service",
  "analyst",
  "content_manager",
];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Caller authorization (defense-in-depth) ---
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      return json(401, { error: "Not authenticated" });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) {
      return json(401, { error: "Not authenticated" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerAdmin, error: callerAdminError } = await admin
      .from("admin_users")
      .select("role, is_active")
      .eq("auth_user_id", callerData.user.id)
      .maybeSingle();

    if (callerAdminError) {
      console.error("[invite-admin-user] caller lookup failed:", callerAdminError);
      return json(403, { error: "Not authorized" });
    }
    if (!callerAdmin || !["super_admin", "admin"].includes(callerAdmin.role)) {
      return json(403, { error: "Not authorized" });
    }

    // --- Body validation ---
    const body = await req.json().catch(() => null) as
      | { email?: string; display_name?: string; role?: string }
      | null;
    if (!body) return json(400, { error: "Invalid request body" });

    const email = (body.email || "").trim();
    const display_name = (body.display_name || "").trim();
    const role = (body.role || "").trim();

    if (!email || !display_name || !role) {
      return json(400, { error: "email, display_name, and role are required" });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return json(400, { error: "Invalid role" });
    }

    // 1. Check if email already exists in admin_users
    const { data: existingAdmin, error: existingErr } = await admin
      .from("admin_users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingErr) {
      console.error("[invite-admin-user] existing check failed:", existingErr);
      return json(400, { error: existingErr.message });
    }
    if (existingAdmin) {
      return json(400, { error: "This user is already an admin" });
    }

    // 2. Invite via Supabase Admin API
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: "https://bundledmum.com/admin/set-password",
        data: { display_name, role },
      },
    );

    if (inviteError || !inviteData?.user) {
      const msg = inviteError?.message || "Failed to send invite";
      if (/already.*registered|already been registered|already exists/i.test(msg)) {
        return json(400, { error: "A user with this email already exists" });
      }
      return json(400, { error: msg });
    }

    // 3. Insert into admin_users (do NOT roll back invite on failure)
    const { error: insertError } = await admin.from("admin_users").insert({
      email,
      display_name,
      role,
      is_active: true,
      auth_user_id: inviteData.user.id,
    });

    if (insertError) {
      console.error("[invite-admin-user] admin_users insert failed:", insertError);
      return json(400, { error: insertError.message });
    }

    return json(200, { success: true, email });
  } catch (err) {
    console.error("[invite-admin-user] error:", err);
    return json(500, { error: "Internal server error" });
  }
});
