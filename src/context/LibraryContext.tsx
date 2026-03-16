import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Book, Category } from "@/types/book";
import { categories as defaultCategories } from "@/data/mockData";
import { supabase } from "@/lib/supabase";
import { uniqueTags } from "@/data/defaultTags";

const useDevProxy = import.meta.env.DEV;

interface LibraryContextType {
  books: Book[];
  currentRole: "viewer" | "editor";
  canManageBooks: boolean;
  readCount: number;
  currentlyReadingBookId: string | null;
  readFilter: "all" | "read" | "unread";
  setReadFilter: (filter: "all" | "read" | "unread") => void;
  toggleReadStatus: (bookId: string) => Promise<SyncResult>;
  toggleCurrentlyReading: (bookId: string) => Promise<SyncResult>;
  toggleToReadStatus: (bookId: string) => Promise<SyncResult>;
  categories: Category[];
  selectedCategory: string | null;
  selectedAuthor: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: string | null) => void;
  setSelectedAuthor: (author: string | null) => void;
  addBook: (book: Book) => void;
  updateBook: (book: Book) => void;
  deleteBook: (id: string) => void;
  loanBook: (bookId: string, friendName: string) => void;
  returnBook: (bookId: string) => void;
  addNote: (bookId: string, note: string, authorName: string, noteId?: string, createdAt?: string) => void;
  filteredBooks: Book[];
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export type SyncResult = {
  ok: boolean;
  error?: string;
};

type ProxyWriteResult = {
  ok: boolean;
  error?: string;
};

export const LibraryProvider = ({ children }: { children: ReactNode }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentRole, setCurrentRole] = useState<"viewer" | "editor">("editor");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentlyReadingBookId, setCurrentlyReadingBookId] = useState<string | null>(null);
  const [categories] = useState<Category[]>(defaultCategories);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const resolveUserWithRetry = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let user = session?.user ?? null;

      if (!user) {
        const {
          data: { user: fetchedUser },
        } = await supabase.auth.getUser();
        user = fetchedUser ?? null;
      }

      if (!user) {
        await new Promise((resolve) => setTimeout(resolve, 250));

        const {
          data: { session: retriedSession },
        } = await supabase.auth.getSession();

        user = retriedSession?.user ?? null;
        if (!user) {
          const {
            data: { user: retriedUser },
          } = await supabase.auth.getUser();
          user = retriedUser ?? null;
        }

        return { session: retriedSession, user };
      }

      return { session, user };
    };

    const loadBooksForCurrentUser = async () => {
      const { session, user } = await resolveUserWithRetry();
      let activeSession = session;
      let activeUser = user;

      if (!activeUser?.id) {
        await new Promise((resolve) => setTimeout(resolve, 250));

        const {
          data: { session: retriedSession },
        } = await supabase.auth.getSession();

        if (retriedSession?.user?.id) {
          activeSession = retriedSession;
          activeUser = retriedSession.user;
        } else {
          const {
            data: { user: retriedUser },
          } = await supabase.auth.getUser();

          if (retriedUser?.id) {
            activeUser = retriedUser;
            activeSession = retriedSession ?? activeSession;
          }
        }
      }

      const accessToken = activeSession?.access_token ?? "";

      setCurrentUserId(activeUser?.id ?? null);
      let effectiveCurrentlyReadingBookId: string | null = null;

      const fetchTableFromLocalProxy = async <T,>(path: string): Promise<T | null> => {
        if (!useDevProxy || !accessToken) {
          return null;
        }

        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!anonKey) {
          return null;
        }

        try {
          const response = await fetch(path, {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          });

          if (!response.ok) return null;
          return (await response.json()) as T;
        } catch {
          return null;
        }
      };

      if (activeUser?.id) {
        let currentlyReadingRow: { book_id: string | null } | null = null;

        try {
          const { data, error } = await supabase
            .from("user_currently_reading")
            .select("book_id")
            .eq("user_id", activeUser.id)
            .maybeSingle();

          if (!error) {
            currentlyReadingRow = data;
          } else {
            const proxyRows = await fetchTableFromLocalProxy<Array<{ book_id: string | null }>>(
              `/supabase/rest/v1/user_currently_reading?select=book_id&user_id=eq.${encodeURIComponent(activeUser.id)}&limit=1`,
            );
            currentlyReadingRow = Array.isArray(proxyRows) && proxyRows.length > 0 ? proxyRows[0] : null;
          }
        } catch {
          const proxyRows = await fetchTableFromLocalProxy<Array<{ book_id: string | null }>>(
            `/supabase/rest/v1/user_currently_reading?select=book_id&user_id=eq.${encodeURIComponent(activeUser.id)}&limit=1`,
          );
          currentlyReadingRow = Array.isArray(proxyRows) && proxyRows.length > 0 ? proxyRows[0] : null;
        }

        effectiveCurrentlyReadingBookId =
          typeof currentlyReadingRow?.book_id === "string" ? currentlyReadingRow.book_id : null;
      }

      setCurrentlyReadingBookId(effectiveCurrentlyReadingBookId);

      if (activeUser?.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", activeUser.id)
          .single();

        setCurrentRole(profileData?.role === "viewer" ? "viewer" : "editor");
      } else {
        setCurrentRole("editor");
      }

      const selectColumnsWithTags =
        "id, title, author, isbn, category, tags, copies, description, cover_url, loaned_to, loan_date, added_date";
      const selectColumnsWithoutTags =
        "id, title, author, isbn, category, copies, description, cover_url, loaned_to, loan_date, added_date";

      const fetchBooksFromLocalProxy = async (selectColumns: string, accessToken?: string) => {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!anonKey) return null;

        const authToken = accessToken && accessToken.length > 0 ? accessToken : anonKey;

        try {
          const response = await fetch(
            `/supabase/rest/v1/books?select=${encodeURIComponent(selectColumns)}&order=created_at.desc`,
            {
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${authToken}`,
                Accept: "application/json",
              },
            },
          );

          if (!response.ok) {
            return null;
          }

          const rawText = await response.text().catch(() => "");
          if (!rawText.trim()) {
            return null;
          }

          const payload = JSON.parse(rawText) as Array<Record<string, unknown>>;
          return Array.isArray(payload) ? payload : null;
        } catch {
          return null;
        }
      };

      const fetchBooksFromLocalProxyWithAnonFallback = async (selectColumns: string) => {
        const withUserToken = await fetchBooksFromLocalProxy(selectColumns, accessToken);
        if (withUserToken && withUserToken.length > 0) {
          return withUserToken;
        }

        const withAnonToken = await fetchBooksFromLocalProxy(selectColumns);
        if (withAnonToken && withAnonToken.length > 0) {
          return withAnonToken;
        }

        return withUserToken ?? withAnonToken;
      };

      let data: Array<Record<string, unknown>> | null = null;
      let error: { message: string } | null = null;

      if (useDevProxy) {
        const proxyWithTags = await fetchBooksFromLocalProxyWithAnonFallback(selectColumnsWithTags);
        if (proxyWithTags && proxyWithTags.length > 0) {
          data = proxyWithTags;
        }
      }

      if (!data && useDevProxy) {
        const proxyWithoutTags = await fetchBooksFromLocalProxyWithAnonFallback(selectColumnsWithoutTags);
        if (proxyWithoutTags && proxyWithoutTags.length > 0) {
          data = proxyWithoutTags;
        }
      }

      if (!data) {
        const supabaseQuery = await supabase
          .from("books")
          .select(selectColumnsWithTags)
          .order("created_at", { ascending: false });

        data = (supabaseQuery.data as Array<Record<string, unknown>> | null) ?? null;
        error = supabaseQuery.error ? { message: supabaseQuery.error.message } : null;

        if (error && /tags/i.test(error.message)) {
          const fallbackQuery = await supabase
            .from("books")
            .select(selectColumnsWithoutTags)
            .order("created_at", { ascending: false });

          data = (fallbackQuery.data as Array<Record<string, unknown>> | null) ?? null;
          error = fallbackQuery.error ? { message: fallbackQuery.error.message } : null;
        }
      }

      if ((error || !data || data.length === 0) && useDevProxy) {
        const proxyWithTags = await fetchBooksFromLocalProxyWithAnonFallback(selectColumnsWithTags);
        if (proxyWithTags && proxyWithTags.length > 0) {
          data = proxyWithTags;
          error = null;
        }
      }

      if ((error || !data || data.length === 0) && useDevProxy) {
        const proxyWithoutTags = await fetchBooksFromLocalProxyWithAnonFallback(selectColumnsWithoutTags);
        if (proxyWithoutTags && proxyWithoutTags.length > 0) {
          data = proxyWithoutTags;
          error = null;
        }
      }

      if (error || !data) {
        return;
      }

      let notesByBookId: Record<string, Book["notes"]> = {};
      const { data: notesData, error: notesError } = await supabase
        .from("book_notes")
        .select("id, book_id, content, author_name, created_at")
        .order("created_at", { ascending: false });

      if (!notesError && notesData) {
        notesByBookId = notesData.reduce<Record<string, Book["notes"]>>((acc, noteRow) => {
          const bookId = noteRow.book_id;
          if (!bookId) return acc;

          if (!acc[bookId]) {
            acc[bookId] = [];
          }

          acc[bookId].push({
            id: noteRow.id,
            content: noteRow.content,
            authorName: noteRow.author_name,
            createdAt: noteRow.created_at?.split("T")[0] ?? new Date().toISOString().split("T")[0],
          });

          return acc;
        }, {});
      }

      const readBookIds = new Set<string>();
      if (activeUser?.id) {
        try {
          const { data: readData, error: readError } = await supabase
            .from("user_book_reads")
            .select("book_id")
            .eq("user_id", activeUser.id);

          if (!readError && readData) {
            readData.forEach((row) => {
              if (typeof row.book_id === "string") {
                readBookIds.add(row.book_id);
              }
            });
          } else {
            const proxyReadRows = await fetchTableFromLocalProxy<Array<{ book_id: string }>>(
              `/supabase/rest/v1/user_book_reads?select=book_id&user_id=eq.${encodeURIComponent(activeUser.id)}`,
            );

            if (Array.isArray(proxyReadRows)) {
              proxyReadRows.forEach((row) => {
                if (typeof row.book_id === "string") {
                  readBookIds.add(row.book_id);
                }
              });
            }
          }
        } catch {
          const proxyReadRows = await fetchTableFromLocalProxy<Array<{ book_id: string }>>(
            `/supabase/rest/v1/user_book_reads?select=book_id&user_id=eq.${encodeURIComponent(activeUser.id)}`,
          );

          if (Array.isArray(proxyReadRows)) {
            proxyReadRows.forEach((row) => {
              if (typeof row.book_id === "string") {
                readBookIds.add(row.book_id);
              }
            });
          }
        }
      }

      const toReadBookIds = new Set<string>();
      if (activeUser?.id) {
        try {
          const { data: toReadData, error: toReadError } = await supabase
            .from("user_to_read")
            .select("book_id")
            .eq("user_id", activeUser.id);

          if (!toReadError && toReadData) {
            toReadData.forEach((row) => {
              if (typeof row.book_id === "string") {
                toReadBookIds.add(row.book_id);
              }
            });
          } else {
            const proxyRows = await fetchTableFromLocalProxy<Array<{ book_id: string }>>(
              `/supabase/rest/v1/user_to_read?select=book_id&user_id=eq.${encodeURIComponent(activeUser.id)}`,
            );

            if (Array.isArray(proxyRows)) {
              proxyRows.forEach((row) => {
                if (typeof row.book_id === "string") {
                  toReadBookIds.add(row.book_id);
                }
              });
            }
          }
        } catch {
          const proxyRows = await fetchTableFromLocalProxy<Array<{ book_id: string }>>(
            `/supabase/rest/v1/user_to_read?select=book_id&user_id=eq.${encodeURIComponent(activeUser.id)}`,
          );

          if (Array.isArray(proxyRows)) {
            proxyRows.forEach((row) => {
              if (typeof row.book_id === "string") {
                toReadBookIds.add(row.book_id);
              }
            });
          }
        }
      }

      const mappedBooks: Book[] = data.map((row) => {
        const isCurrentlyReading = effectiveCurrentlyReadingBookId === row.id;
        const isRead = readBookIds.has(row.id) && !isCurrentlyReading;
        const isToRead = toReadBookIds.has(row.id) && !isCurrentlyReading && !isRead;

        return {
          id: row.id,
          title: row.title,
          author: row.author,
          isbn: row.isbn ?? "",
          coverUrl: row.cover_url ?? undefined,
          category: row.category ?? "Uncategorized",
          tags: uniqueTags(Array.isArray(row.tags) ? row.tags : []),
          copies: row.copies ?? 1,
          loanedTo: row.loaned_to ?? undefined,
          loanDate: row.loan_date ?? undefined,
          notes: notesByBookId[row.id] ?? [],
          readByCurrentUser: isRead,
          currentlyReadingByCurrentUser: isCurrentlyReading,
          toReadByCurrentUser: isToRead,
          addedDate: row.added_date ?? new Date().toISOString().split("T")[0],
          description: row.description ?? undefined,
        };
      });

      setBooks(mappedBooks);
    };

    loadBooksForCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadBooksForCurrentUser();
      } else {
        setCurrentUserId(null);
        setCurrentlyReadingBookId(null);
        setCurrentRole("editor");
        loadBooksForCurrentUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const canManageBooks = currentRole !== "viewer";
  const readCount = books.filter((book) => book.readByCurrentUser).length;

  const resolveActiveSession = async (): Promise<{
    userId: string | null;
    accessToken: string | null;
    user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null;
  }> => {
    const {
      data: { session: initialSession },
    } = await supabase.auth.getSession();

    let session = initialSession;

    if (!session?.access_token) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      session = refreshData.session ?? session;
    }

    let user = session?.user ?? null;

    if (!user) {
      const {
        data: { user: fetchedUser },
      } = await supabase.auth.getUser();
      user = fetchedUser ?? null;
    }

    if (!session?.access_token && user) {
      const {
        data: { session: retriedSession },
      } = await supabase.auth.getSession();
      session = retriedSession ?? session;
    }

    if (!user?.id) {
      return { userId: null, accessToken: null, user: null };
    }

    setCurrentUserId(user.id);

    return { userId: user.id, accessToken: session?.access_token ?? null, user };
  };

  const isDuplicateReadInsertError = (error: { code?: string; message?: string } | null) => {
    if (!error) return false;
    if (error.code === "23505") return true;
    return /duplicate key|already exists/i.test(error.message ?? "");
  };

  const writeReadStatusViaProxy = async (
    mode: "read" | "unread",
    userId: string,
    bookId: string,
    accessToken: string | null,
  ): Promise<ProxyWriteResult> => {
    if (!useDevProxy) {
      return { ok: false, error: "Dev proxy is disabled." };
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) {
      return { ok: false, error: "Missing anon key for proxy write." };
    }

    let token = accessToken;
    if (!token) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      token = session?.access_token ?? null;

      if (!token) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        token = refreshData.session?.access_token ?? null;
      }
    }

    if (!token) {
      return { ok: false, error: "No access token available for proxy write." };
    }

    if (mode === "read") {
      try {
        const response = await fetch("/supabase/rest/v1/user_book_reads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify([{ user_id: userId, book_id: bookId }]),
        });

        if (response.ok) return { ok: true };
        const body = await response.text().catch(() => "");
        return { ok: false, error: `Proxy read write failed (${response.status})${body ? `: ${body}` : ""}` };
      } catch (caughtError) {
        return {
          ok: false,
          error: caughtError instanceof Error ? caughtError.message : "Proxy read write request failed.",
        };
      }
    }

    try {
      const response = await fetch(
        `/supabase/rest/v1/user_book_reads?user_id=eq.${encodeURIComponent(userId)}&book_id=eq.${encodeURIComponent(bookId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
        },
      );

      if (response.ok) return { ok: true };
      const body = await response.text().catch(() => "");
      return { ok: false, error: `Proxy unread write failed (${response.status})${body ? `: ${body}` : ""}` };
    } catch (caughtError) {
      return {
        ok: false,
        error: caughtError instanceof Error ? caughtError.message : "Proxy unread write request failed.",
      };
    }
  };

  const writeCurrentlyReadingViaProxy = async (
    userId: string,
    bookId: string | null,
    accessToken: string | null,
  ): Promise<ProxyWriteResult> => {
    if (!useDevProxy) {
      return { ok: false, error: "Dev proxy is disabled." };
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) {
      return { ok: false, error: "Missing anon key for proxy write." };
    }

    let token = accessToken;
    if (!token) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      token = session?.access_token ?? null;

      if (!token) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        token = refreshData.session?.access_token ?? null;
      }
    }

    if (!token) {
      return { ok: false, error: "No access token available for proxy write." };
    }

    if (!bookId) {
      try {
        const response = await fetch(
          `/supabase/rest/v1/user_currently_reading?user_id=eq.${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
              Prefer: "return=minimal",
            },
          },
        );

        if (response.ok) return { ok: true };
        const body = await response.text().catch(() => "");
        return {
          ok: false,
          error: `Proxy clear currently reading failed (${response.status})${body ? `: ${body}` : ""}`,
        };
      } catch (caughtError) {
        return {
          ok: false,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Proxy clear currently reading request failed.",
        };
      }
    }

    try {
      const response = await fetch(`/supabase/rest/v1/user_currently_reading?on_conflict=user_id`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify([{ user_id: userId, book_id: bookId, updated_at: new Date().toISOString() }]),
      });

      if (response.ok) return { ok: true };
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Proxy save currently reading failed (${response.status})${body ? `: ${body}` : ""}`,
      };
    } catch (caughtError) {
      return {
        ok: false,
        error:
          caughtError instanceof Error ? caughtError.message : "Proxy save currently reading request failed.",
      };
    }
  };

  const writeToReadStatusViaProxy = async (
    mode: "add" | "remove",
    userId: string,
    bookId: string,
    accessToken: string | null,
  ): Promise<ProxyWriteResult> => {
    if (!useDevProxy) {
      return { ok: false, error: "Dev proxy is disabled." };
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) {
      return { ok: false, error: "Missing anon key for proxy write." };
    }

    let token = accessToken;
    if (!token) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      token = session?.access_token ?? null;

      if (!token) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        token = refreshData.session?.access_token ?? null;
      }
    }

    if (!token) {
      return { ok: false, error: "No access token available for proxy write." };
    }

    if (mode === "add") {
      try {
        const response = await fetch("/supabase/rest/v1/user_to_read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify([{ user_id: userId, book_id: bookId }]),
        });

        if (response.ok) return { ok: true };
        const body = await response.text().catch(() => "");
        return { ok: false, error: `Proxy to-read write failed (${response.status})${body ? `: ${body}` : ""}` };
      } catch (caughtError) {
        return {
          ok: false,
          error: caughtError instanceof Error ? caughtError.message : "Proxy to-read write request failed.",
        };
      }
    }

    try {
      const response = await fetch(
        `/supabase/rest/v1/user_to_read?user_id=eq.${encodeURIComponent(userId)}&book_id=eq.${encodeURIComponent(bookId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
        },
      );

      if (response.ok) return { ok: true };
      const body = await response.text().catch(() => "");
      return { ok: false, error: `Proxy to-read remove failed (${response.status})${body ? `: ${body}` : ""}` };
    } catch (caughtError) {
      return {
        ok: false,
        error: caughtError instanceof Error ? caughtError.message : "Proxy to-read remove request failed.",
      };
    }
  };

  const toggleReadStatus = async (bookId: string): Promise<SyncResult> => {
    const { userId: activeUserId, accessToken } = await resolveActiveSession();

    if (!activeUserId) {
      return { ok: false, error: "No active user session." };
    }

    const book = books.find((b) => b.id === bookId);
    if (!book) {
      return { ok: false, error: "Book not found in current state." };
    }

    const shouldMarkRead = !book.readByCurrentUser;

    if (shouldMarkRead) {
      try {
        const { error } = await supabase.from("user_book_reads").insert({
          user_id: activeUserId,
          book_id: bookId,
        });

        if (error && !isDuplicateReadInsertError(error)) {
          const proxyResult = await writeReadStatusViaProxy("read", activeUserId, bookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not save read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeReadStatusViaProxy("read", activeUserId, bookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not save read status."),
          };
        }
      }

      try {
        const { error } = await supabase
          .from("user_to_read")
          .delete()
          .eq("user_id", activeUserId)
          .eq("book_id", bookId);

        if (error) {
          const proxyResult = await writeToReadStatusViaProxy("remove", activeUserId, bookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not clear to-read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeToReadStatusViaProxy("remove", activeUserId, bookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not clear to-read status."),
          };
        }
      }

      if (currentlyReadingBookId === bookId) {
        try {
          const { error } = await supabase.from("user_currently_reading").delete().eq("user_id", activeUserId);
          if (error) {
            const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, null, accessToken);
            if (!proxyResult.ok) {
              return {
                ok: false,
                error: proxyResult.error ?? error.message ?? "Could not clear currently reading status.",
              };
            }
          }
        } catch (caughtError) {
          const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, null, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error:
                proxyResult.error ??
                (caughtError instanceof Error ? caughtError.message : "Could not clear currently reading status."),
            };
          }
        }
      }
    } else {
      try {
        const { error } = await supabase
          .from("user_book_reads")
          .delete()
          .eq("user_id", activeUserId)
          .eq("book_id", bookId);

        if (error) {
          const proxyResult = await writeReadStatusViaProxy("unread", activeUserId, bookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not remove read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeReadStatusViaProxy("unread", activeUserId, bookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not remove read status."),
          };
        }
      }
    }

    if (shouldMarkRead && currentlyReadingBookId === bookId) {
      setCurrentlyReadingBookId(null);
    }

    setBooks((prev) =>
      prev.map((b) => {
        if (b.id !== bookId) {
          return b;
        }

        if (shouldMarkRead) {
          return {
            ...b,
            readByCurrentUser: true,
            currentlyReadingByCurrentUser: false,
            toReadByCurrentUser: false,
          };
        }

        return {
          ...b,
          readByCurrentUser: false,
        };
      }),
    );

    return { ok: true };
  };

  const toggleCurrentlyReading = async (bookId: string): Promise<SyncResult> => {
    const { userId: activeUserId, accessToken } = await resolveActiveSession();

    if (!activeUserId) {
      return { ok: false, error: "No active user session." };
    }

    const nextBookId = currentlyReadingBookId === bookId ? null : bookId;

    if (!nextBookId) {
      try {
        const { error } = await supabase.from("user_currently_reading").delete().eq("user_id", activeUserId);
        if (error) {
          const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, null, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not clear currently reading.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, null, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not clear currently reading."),
          };
        }
      }
    } else {
      try {
        const { error } = await supabase.from("user_currently_reading").upsert(
          {
            user_id: activeUserId,
            book_id: nextBookId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        if (error) {
          const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, nextBookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not save currently reading.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, nextBookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not save currently reading."),
          };
        }
      }

      try {
        const { error } = await supabase
          .from("user_book_reads")
          .delete()
          .eq("user_id", activeUserId)
          .eq("book_id", nextBookId);

        if (error) {
          const proxyResult = await writeReadStatusViaProxy("unread", activeUserId, nextBookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not clear read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeReadStatusViaProxy("unread", activeUserId, nextBookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not clear read status."),
          };
        }
      }

      try {
        const { error } = await supabase
          .from("user_to_read")
          .delete()
          .eq("user_id", activeUserId)
          .eq("book_id", nextBookId);

        if (error) {
          const proxyResult = await writeToReadStatusViaProxy("remove", activeUserId, nextBookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not clear to-read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeToReadStatusViaProxy("remove", activeUserId, nextBookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not clear to-read status."),
          };
        }
      }
    }

    setCurrentlyReadingBookId(nextBookId);
    setBooks((prev) =>
      prev.map((book) => ({
        ...book,
        readByCurrentUser: nextBookId === book.id ? false : book.readByCurrentUser,
        currentlyReadingByCurrentUser: nextBookId === book.id,
        toReadByCurrentUser: nextBookId === book.id ? false : book.toReadByCurrentUser,
      })),
    );
    return {
      ok: true,
    };
  };

  const toggleToReadStatus = async (bookId: string): Promise<SyncResult> => {
    const { userId: activeUserId, accessToken } = await resolveActiveSession();

    if (!activeUserId) {
      return { ok: false, error: "No active user session." };
    }

    const book = books.find((b) => b.id === bookId);
    if (!book) {
      return { ok: false, error: "Book not found in current state." };
    }

    const shouldMarkToRead = !book.toReadByCurrentUser;

    if (shouldMarkToRead) {
      try {
        const { error } = await supabase.from("user_to_read").insert({
          user_id: activeUserId,
          book_id: bookId,
        });

        if (error && !isDuplicateReadInsertError(error)) {
          const proxyResult = await writeToReadStatusViaProxy("add", activeUserId, bookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not save to-read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeToReadStatusViaProxy("add", activeUserId, bookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not save to-read status."),
          };
        }
      }

      try {
        const { error } = await supabase
          .from("user_book_reads")
          .delete()
          .eq("user_id", activeUserId)
          .eq("book_id", bookId);

        if (error) {
          const proxyResult = await writeReadStatusViaProxy("unread", activeUserId, bookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not clear read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeReadStatusViaProxy("unread", activeUserId, bookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not clear read status."),
          };
        }
      }

      if (currentlyReadingBookId === bookId) {
        try {
          const { error } = await supabase.from("user_currently_reading").delete().eq("user_id", activeUserId);
          if (error) {
            const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, null, accessToken);
            if (!proxyResult.ok) {
              return {
                ok: false,
                error: proxyResult.error ?? error.message ?? "Could not clear currently reading status.",
              };
            }
          }
        } catch (caughtError) {
          const proxyResult = await writeCurrentlyReadingViaProxy(activeUserId, null, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error:
                proxyResult.error ??
                (caughtError instanceof Error ? caughtError.message : "Could not clear currently reading status."),
            };
          }
        }
      }
    } else {
      try {
        const { error } = await supabase
          .from("user_to_read")
          .delete()
          .eq("user_id", activeUserId)
          .eq("book_id", bookId);

        if (error) {
          const proxyResult = await writeToReadStatusViaProxy("remove", activeUserId, bookId, accessToken);
          if (!proxyResult.ok) {
            return {
              ok: false,
              error: proxyResult.error ?? error.message ?? "Could not remove to-read status.",
            };
          }
        }
      } catch (caughtError) {
        const proxyResult = await writeToReadStatusViaProxy("remove", activeUserId, bookId, accessToken);
        if (!proxyResult.ok) {
          return {
            ok: false,
            error:
              proxyResult.error ??
              (caughtError instanceof Error ? caughtError.message : "Could not remove to-read status."),
          };
        }
      }
    }

    if (shouldMarkToRead && currentlyReadingBookId === bookId) {
      setCurrentlyReadingBookId(null);
    }

    setBooks((prev) =>
      prev.map((b) => {
        if (b.id !== bookId) {
          return b;
        }

        if (shouldMarkToRead) {
          return {
            ...b,
            readByCurrentUser: false,
            currentlyReadingByCurrentUser: false,
            toReadByCurrentUser: true,
          };
        }

        return {
          ...b,
          toReadByCurrentUser: false,
        };
      }),
    );

    return { ok: true };
  };

  const addBook = (book: Book) => setBooks((prev) => [book, ...prev]);
  const updateBook = (book: Book) =>
    setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
  const deleteBook = (id: string) =>
    setBooks((prev) => prev.filter((b) => b.id !== id));

  const loanBook = (bookId: string, friendName: string) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId
          ? { ...b, loanedTo: friendName, loanDate: new Date().toISOString().split("T")[0] }
          : b
      )
    );
  };

  const returnBook = (bookId: string) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId ? { ...b, loanedTo: undefined, loanDate: undefined } : b
      )
    );
  };

  const addNote = (
    bookId: string,
    note: string,
    authorName: string,
    noteId?: string,
    createdAt?: string,
  ) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId
          ? {
              ...b,
              notes: [
                ...b.notes,
                {
                  id: noteId ?? crypto.randomUUID(),
                  content: note,
                  authorName,
                  createdAt: createdAt ?? new Date().toISOString().split("T")[0],
                },
              ],
            }
          : b
      )
    );
  };

  const filteredBooks = books.filter((book) => {
    const matchesCategory = selectedCategory
      ? book.category === selectedCategory || (book.tags ?? []).some((tag) => tag === selectedCategory)
      : true;
    const matchesAuthor = selectedAuthor ? book.author === selectedAuthor : true;
    const matchesSearch = searchQuery
      ? book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.isbn.includes(searchQuery) ||
        (book.tags ?? []).some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    const matchesReadFilter =
      readFilter === "all"
        ? true
        : readFilter === "read"
          ? Boolean(book.readByCurrentUser)
          : !book.readByCurrentUser;
    return matchesCategory && matchesAuthor && matchesSearch && matchesReadFilter;
  });

  return (
    <LibraryContext.Provider
      value={{
        books,
        currentRole,
        canManageBooks,
        readCount,
        currentlyReadingBookId,
        readFilter,
        setReadFilter,
        toggleReadStatus,
        toggleCurrentlyReading,
        toggleToReadStatus,
        categories,
        selectedCategory,
        selectedAuthor,
        searchQuery,
        setSearchQuery,
        setSelectedCategory,
        setSelectedAuthor,
        addBook,
        updateBook,
        deleteBook,
        loanBook,
        returnBook,
        addNote,
        filteredBooks,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
};

export const useLibrary = () => {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
};
