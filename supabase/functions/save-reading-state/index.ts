import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SaveReadingPayload = {
  action?: "set_read" | "set_currently_reading";
  bookId?: string | null;
  isRead?: boolean;
  title?: string | null;
};

const readBookIdsFromMetadata = (metadata: Record<string, unknown> | null | undefined): Set<string> => {
  const raw = metadata?.read_book_ids;
  if (!Array.isArray(raw)) return new Set<string>();
  return new Set<string>(raw.filter((value): value is string => typeof value === "string"));
};

Deno.serve(async (req: Request) => {
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

    if (!supabaseUrl || !serviceRoleKey) {
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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(accessToken);

    if (userError || !user?.id) {
      return new Response(JSON.stringify({ error: userError?.message ?? "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as SaveReadingPayload;

    if (payload.action === "set_read") {
      const bookId = payload.bookId;
      const isRead = Boolean(payload.isRead);

      if (!bookId || typeof bookId !== "string") {
        return new Response(JSON.stringify({ error: "bookId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let tableSyncError: string | null = null;
      if (isRead) {
        const { error } = await adminClient.from("user_book_reads").upsert(
          {
            user_id: user.id,
            book_id: bookId,
          },
          { onConflict: "user_id,book_id" },
        );

        tableSyncError = error?.message ?? null;
      } else {
        const { error } = await adminClient
          .from("user_book_reads")
          .delete()
          .eq("user_id", user.id)
          .eq("book_id", bookId);

        tableSyncError = error?.message ?? null;
      }

      const nextReadBookIds = readBookIdsFromMetadata(user.user_metadata ?? {});
      if (isRead) {
        nextReadBookIds.add(bookId);
      } else {
        nextReadBookIds.delete(bookId);
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          read_book_ids: Array.from(nextReadBookIds),
        },
      });

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          tableSyncOk: !tableSyncError,
          tableSyncError,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (payload.action === "set_currently_reading") {
      const nextBookId = payload.bookId ?? null;
      const nextTitle = payload.title ?? null;

      const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          currently_reading_book_id: nextBookId,
          currently_reading_title: nextTitle,
        },
      });

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
