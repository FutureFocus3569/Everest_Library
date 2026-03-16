import { supabase } from "./supabase";

export type LibraryActivityAction = "added" | "edited" | "loaned" | "returned";

interface LogLibraryActivityInput {
  action: LibraryActivityAction;
  bookId: string;
  bookTitle: string;
  details?: string;
}

const getActorName = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (profileName) {
    return profileName;
  }

  const firstName = (user.user_metadata?.first_name as string | undefined)?.trim();
  const lastName = (user.user_metadata?.last_name as string | undefined)?.trim();
  const metadataName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return metadataName || user.email || null;
};

export const logLibraryActivity = async ({ action, bookId, bookTitle, details }: LogLibraryActivityInput) => {
  const actorName = await getActorName();
  if (!actorName) {
    return;
  }

  const { error } = await supabase.from("library_activity").insert({
    actor_name: actorName,
    action,
    book_id: bookId,
    book_title: bookTitle,
    details: details ?? null,
  });

  if (error) {
    return;
  }
};
