import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isDev = import.meta.env.DEV;

const projectRef = (() => {
	if (!supabaseUrl) return null;

	try {
		const hostname = new URL(supabaseUrl).hostname;
		const [ref] = hostname.split(".");
		return ref || null;
	} catch {
		return supabaseUrl?.match(/^https:\/\/([^.]+)\.supabase\.co\/?$/)?.[1] ?? null;
	}
})();
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : "sb-everest-library-auth-token";

const supabaseClientUrl =
	isDev && typeof window !== "undefined"
		? `${window.location.origin}/supabase`
		: (supabaseUrl ?? "");

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const clearSupabaseAuthStorage = () => {
	if (typeof window === "undefined") {
		return;
	}

	const keyPrefix = projectRef ? `sb-${projectRef}-` : "sb-everest-library-";
	const keysToRemove: string[] = [];

	for (let i = 0; i < window.localStorage.length; i += 1) {
		const key = window.localStorage.key(i);
		if (!key) continue;
		if (key === authStorageKey || key.startsWith(keyPrefix)) {
			keysToRemove.push(key);
		}
	}

	for (let i = 0; i < window.sessionStorage.length; i += 1) {
		const key = window.sessionStorage.key(i);
		if (!key) continue;
		if (key === authStorageKey || key.startsWith(keyPrefix)) {
			keysToRemove.push(key);
		}
	}

	keysToRemove.forEach((key) => {
		window.localStorage.removeItem(key);
		window.sessionStorage.removeItem(key);
	});
};

export const supabase = createClient(supabaseClientUrl, supabaseAnonKey ?? "", {
	auth: {
		storageKey: authStorageKey,
	},
});
