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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminEmail = (Deno.env.get("ADMIN_EMAIL") ?? "").toLowerCase();
  const inviteRedirectUrl = Deno.env.get("INVITE_REDIRECT_URL") ?? "http://localhost:8080";

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

  const payload = (await req.json()) as {
    email?: string;
    firstName?: string;
    lastName?: string;
    resend?: boolean;
  };
  const inviteEmail = payload.email?.trim().toLowerCase();
  const firstName = payload.firstName?.trim();
  const lastName = payload.lastName?.trim();
  const resend = Boolean(payload.resend);

  if (!inviteEmail || !inviteEmail.includes("@")) {
    return new Response(JSON.stringify({ error: "Email is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!resend && (!firstName || !lastName)) {
    return new Response(JSON.stringify({ error: "Email, first name, and last name are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (resend) {
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingUser = listData.users.find((u) => u.email?.toLowerCase() === inviteEmail);

    if (!existingUser?.email) {
      return new Response(JSON.stringify({ error: "No user found with this email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const linkType = existingUser.email_confirmed_at ? "magiclink" : "invite";

    const { error: linkError } = await adminClient.auth.admin.generateLink({
      type: linkType,
      email: inviteEmail,
      options: {
        redirectTo: inviteRedirectUrl,
      },
    });

    if (linkError) {
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message:
          linkType === "invite"
            ? `Invite resent to ${inviteEmail}.`
            : `Sign-in link sent to ${inviteEmail}.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
    redirectTo: inviteRedirectUrl,
    data: {
      first_name: firstName,
      last_name: lastName,
    },
  });

  if (inviteError) {
    return new Response(JSON.stringify({ error: inviteError.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, message: `Invite sent to ${inviteEmail}.` }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
