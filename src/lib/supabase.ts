import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const projectRef = supabaseUrl?.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1] ?? null;
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : "sb-everest-library-auth-token";

const isLocalhost =
	typeof window !== "undefined" &&
	(window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1" ||
		window.location.hostname === "::1");

const supabaseClientUrl =
	isLocalhost && typeof window !== "undefined"
		? `${window.location.origin}/supabase`
		: (supabaseUrl ?? "");

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseClientUrl, supabaseAnonKey ?? "", {
	auth: {
		storageKey: authStorageKey,
	},
});
