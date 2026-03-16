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

const withPasswordSetupFlag = (url: string): string => {
  if (!url) return url;
  const hasQuery = url.includes("?");
  const hasFlag = /(?:\?|&)setup=password(?:&|$)/.test(url);
  if (hasFlag) return url;
  return `${url}${hasQuery ? "&" : "?"}setup=password`;
};

const normalizeRole = (role: string | undefined): "admin" | "editor" => {
  if (role === "admin") return "admin";
  return "editor";
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
    const rawInviteRedirectUrl = Deno.env.get("INVITE_REDIRECT_URL") ?? "http://localhost:8080";
    const inviteRedirectUrl = withPasswordSetupFlag(rawInviteRedirectUrl);

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

    if (userError || !user?.id || !user?.email) {
      return new Response(JSON.stringify({ error: userError?.message ?? "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdminByEmail = user.email.toLowerCase() === adminEmail;
    const isAdminByRole = userProfile?.role === "admin";

    if (!isAdminByEmail && !isAdminByRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      desiredRole?: string;
      resend?: boolean;
      linkOnly?: boolean;
    };
    const inviteEmail = payload.email?.trim().toLowerCase();
    const firstName = payload.firstName?.trim();
    const lastName = payload.lastName?.trim();
    const desiredRole = normalizeRole(payload.desiredRole?.trim().toLowerCase());
    const resend = Boolean(payload.resend);
    const linkOnly = Boolean(payload.linkOnly);

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

      await adminClient
        .from("profiles")
        .upsert(
          {
            id: existingUser.id,
            first_name: firstName ?? null,
            last_name: lastName ?? null,
            role: desiredRole,
          },
          { onConflict: "id" },
        );

      await adminClient.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          role: desiredRole,
        },
      });

      const linkType = existingUser.email_confirmed_at ? "recovery" : "invite";

      if (linkOnly) {
        const { data: manualLinkData, error: manualLinkError } = await adminClient.auth.admin.generateLink({
          type: linkType,
          email: inviteEmail,
          options: {
            redirectTo: inviteRedirectUrl,
          },
        });

        if (manualLinkError || !manualLinkData?.properties?.action_link) {
          return new Response(
            JSON.stringify({ error: manualLinkError?.message ?? "Could not generate setup link." }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            message: "Setup link generated. Copy and send it to the user.",
            actionLink: manualLinkData.properties.action_link,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const sendEmailResult = existingUser.email_confirmed_at
        ? await adminClient.auth.resetPasswordForEmail(inviteEmail, {
            redirectTo: inviteRedirectUrl,
          })
        : await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
            redirectTo: inviteRedirectUrl,
          });

      const { data: manualLinkData } = await adminClient.auth.admin.generateLink({
        type: linkType,
        email: inviteEmail,
        options: {
          redirectTo: inviteRedirectUrl,
        },
      });

      const sendEmailError = sendEmailResult.error;

      if (sendEmailError) {
        const message = /rate limit/i.test(sendEmailError.message)
          ? "Email provider rate limit reached. Copy and send the secure link below."
          : `Could not send resend email (${sendEmailError.message}). Copy and send the secure link below.`;

        return new Response(
          JSON.stringify({
            ok: true,
            message,
            actionLink: manualLinkData?.properties?.action_link ?? null,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message:
            linkType === "invite"
              ? `Invite resent to ${inviteEmail}.`
              : `Password setup link sent to ${inviteEmail}.`,
          actionLink: manualLinkData?.properties?.action_link ?? null,
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
        role: desiredRole,
      },
    });

    if (inviteError) {
      const inviteErrorMessage = inviteError.message ?? "Invite failed.";
      const isRateLimited = /rate limit/i.test(inviteErrorMessage);

      if (isRateLimited) {
        const { data: generatedLinkData, error: generatedLinkError } =
          await adminClient.auth.admin.generateLink({
            type: "invite",
            email: inviteEmail,
            options: {
              redirectTo: inviteRedirectUrl,
            },
          });

        if (!generatedLinkError && generatedLinkData?.properties?.action_link) {
          return new Response(
            JSON.stringify({
              ok: true,
              message:
                "Email provider rate limit reached. Copy and send this secure invite link manually.",
              actionLink: generatedLinkData.properties.action_link,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: manualLinkData } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: inviteEmail,
      options: {
        redirectTo: inviteRedirectUrl,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Invite sent to ${inviteEmail}. If no email arrives, use the manual invite link below.`,
        actionLink: manualLinkData?.properties?.action_link ?? null,
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
