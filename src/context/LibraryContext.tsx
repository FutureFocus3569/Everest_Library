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
  toggleReadStatus: (bookId: string) => Promise<void>;
  toggleCurrentlyReading: (bookId: string) => Promise<void>;
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
    const loadBooksForCurrentUser = async () => {
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

      setCurrentUserId(user?.id ?? null);
      const metadataCurrentlyReadingBookId =
        typeof user?.user_metadata?.currently_reading_book_id === "string"
          ? user.user_metadata.currently_reading_book_id
          : null;
      setCurrentlyReadingBookId(metadataCurrentlyReadingBookId);
      setBooks([]);

      if (user?.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
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

        const payload = (await response.json()) as Array<Record<string, unknown>>;
        return Array.isArray(payload) ? payload : null;
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

      const accessToken = session?.access_token ?? "";

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
        setBooks([]);
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

      let readBookIds = new Set<string>();
      if (user?.id) {
        const { data: readData, error: readError } = await supabase
          .from("user_book_reads")
          .select("book_id")
          .eq("user_id", user.id);

        if (!readError && readData) {
          readBookIds = new Set(readData.map((row) => row.book_id));
        }
      }

      const mappedBooks: Book[] = data.map((row) => ({
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
        readByCurrentUser: readBookIds.has(row.id),
        currentlyReadingByCurrentUser: metadataCurrentlyReadingBookId === row.id,
        addedDate: row.added_date ?? new Date().toISOString().split("T")[0],
        description: row.description ?? undefined,
      }));

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

  const toggleReadStatus = async (bookId: string) => {
    if (!currentUserId) {
      return;
    }

    const book = books.find((b) => b.id === bookId);
    if (!book) {
      return;
    }

    if (book.readByCurrentUser) {
      const { error } = await supabase
        .from("user_book_reads")
        .delete()
        .eq("user_id", currentUserId)
        .eq("book_id", bookId);

      if (error) {
        return;
      }

      setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, readByCurrentUser: false } : b)));
      return;
    }

    const { error } = await supabase.from("user_book_reads").upsert(
      {
        user_id: currentUserId,
        book_id: bookId,
      },
      { onConflict: "user_id,book_id" },
    );

    if (error) {
      return;
    }

    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, readByCurrentUser: true } : b)));
  };

  const toggleCurrentlyReading = async (bookId: string) => {
    if (!currentUserId) {
      return;
    }

    const nextBookId = currentlyReadingBookId === bookId ? null : bookId;
    const nextBookTitle = nextBookId ? books.find((book) => book.id === nextBookId)?.title ?? null : null;

    const { error } = await supabase.auth.updateUser({
      data: {
        currently_reading_book_id: nextBookId,
        currently_reading_title: nextBookTitle,
      },
    });

    if (error) {
      return;
    }

    setCurrentlyReadingBookId(nextBookId);
    setBooks((prev) =>
      prev.map((book) => ({
        ...book,
        currentlyReadingByCurrentUser: nextBookId === book.id,
      })),
    );
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
