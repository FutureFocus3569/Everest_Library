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
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
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
      data: { user: requester },
      error: requesterError,
    } = await adminClient.auth.admin.getUserById(requesterUserId);

    if (requesterError || !requester?.id || !requester?.email) {
      return new Response(JSON.stringify({ error: requesterError?.message ?? "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: requesterProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", requester.id)
      .single();

    const isAdminByEmail = requester.email.toLowerCase() === adminEmail;
    const isAdminByRole = requesterProfile?.role === "admin";

    if (!isAdminByEmail && !isAdminByRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as { userId?: string; email?: string };
    const targetUserId = payload.userId?.trim();

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetUserId === requester.id) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user: targetUser },
      error: targetLookupError,
    } = await adminClient.auth.admin.getUserById(targetUserId);

    if (targetLookupError || !targetUser) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((targetUser.email ?? "").toLowerCase() === adminEmail) {
      return new Response(JSON.stringify({ error: "Cannot delete the primary admin account." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("user_book_reads").delete().eq("user_id", targetUserId);
    await adminClient.from("profiles").delete().eq("id", targetUserId);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId, true);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `User ${targetUser.email ?? targetUserId} deleted. You can invite this email again anytime.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
