import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const parseJwtPayload = (token: string): { sub?: string } | null => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(`${normalized}${padding}`);
    return JSON.parse(json) as { sub?: string };
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminEmail = (Deno.env.get("ADMIN_EMAIL") ?? "").toLowerCase();

  if (!supabaseUrl || !serviceRoleKey || !adminEmail) {
    return new Response(JSON.stringify({ error: "Server secrets are not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing auth token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const tokenPayload = parseJwtPayload(accessToken);
  const requesterUserId = tokenPayload?.sub;

  if (!requesterUserId) {
    return new Response(JSON.stringify({ error: "Invalid auth token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.admin.getUserById(requesterUserId);

  if (userError || !user?.email) {
    return new Response(JSON.stringify({ error: userError?.message ?? "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (user.email.toLowerCase() !== adminEmail) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profileRows, error: profileError } = await adminClient
    .from("profiles")
    .select("id, first_name, last_name, role");

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const profilesById = new Map(
    (profileRows ?? []).map((row) => [
      row.id,
      {
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
      },
    ]),
  );

  const { data: userList, error: listError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    return new Response(JSON.stringify({ error: listError.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const users = userList.users
    .map((listUser) => {
      const profile = profilesById.get(listUser.id);
      const metadataFirstName = (listUser.user_metadata?.first_name as string | undefined) ?? null;
      const metadataLastName = (listUser.user_metadata?.last_name as string | undefined) ?? null;

      return {
        id: listUser.id,
        email: listUser.email,
        first_name: profile?.first_name ?? metadataFirstName,
        last_name: profile?.last_name ?? metadataLastName,
        role: profile?.role ?? "user",
        confirmed: Boolean(listUser.email_confirmed_at),
        last_sign_in_at: listUser.last_sign_in_at,
        created_at: listUser.created_at,
      };
    })
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));

  return new Response(JSON.stringify({ users }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
