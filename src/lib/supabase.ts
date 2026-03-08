import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isDev = import.meta.env.DEV;

const projectRef = supabaseUrl?.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1] ?? null;
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : "sb-everest-library-auth-token";

const supabaseClientUrl =
	isDev && typeof window !== "undefined"
		? `${window.location.origin}/supabase`
		: (supabaseUrl ?? "");

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseClientUrl, supabaseAnonKey ?? "", {
	auth: {
		storageKey: authStorageKey,
	},
});
