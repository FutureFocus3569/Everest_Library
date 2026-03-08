import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLibrary } from "@/context/LibraryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Copy,
  Pencil,
  Layers,
  MessageSquare,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { defaultBookTags, uniqueTags } from "@/data/defaultTags";

const BookDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    books,
    loanBook,
    returnBook,
    addNote,
    deleteBook,
    updateBook,
    canManageBooks,
    toggleReadStatus,
    currentlyReadingBookId,
    toggleCurrentlyReading,
  } = useLibrary();
  const book = books.find((b) => b.id === id);

  const [loanName, setLoanName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("Library User");
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editIsbn, setEditIsbn] = useState("");
  const [editCopies, setEditCopies] = useState(1);
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);

  useEffect(() => {
    if (!book) return;
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditIsbn(book.isbn ?? "");
    setEditCopies(book.copies ?? 1);
    setEditCoverUrl(book.coverUrl ?? "");
    setEditDescription(book.description ?? "");
    setEditTags(uniqueTags(book.tags ?? []));
  }, [book]);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();

        const profileName = [profile?.first_name, profile?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();

        if (profileName) {
          setCurrentUserName(profileName);
          return;
        }
      }

      const firstName = (user?.user_metadata?.first_name as string | undefined)?.trim();
      const lastName = (user?.user_metadata?.last_name as string | undefined)?.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

      if (fullName) {
        setCurrentUserName(fullName);
        return;
      }

      if (user?.email) {
        setCurrentUserName(user.email);
      }
    };

    loadUser();
  }, []);

  if (!book) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <BookOpen className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="font-display text-xl font-semibold">Book not found</h2>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
            Back to Library
          </Button>
        </div>
      </AppLayout>
    );
  }

  const handleLoan = async () => {
    if (!canManageBooks) {
      toast.error("Your account is in viewer mode.");
      return;
    }

    if (!loanName.trim()) return;

    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase
      .from("books")
      .update({ loaned_to: loanName.trim(), loan_date: today })
      .eq("id", book.id);

    if (error) {
      toast.error(error.message || "Could not update loan status.");
      return;
    }

    loanBook(book.id, loanName.trim());
    setLoanName("");
    setLoanDialogOpen(false);
    toast.success(`Loaned to ${loanName}`);
  };

  const handleReturn = async () => {
    if (!canManageBooks) {
      toast.error("Your account is in viewer mode.");
      return;
    }

    const { error } = await supabase
      .from("books")
      .update({ loaned_to: null, loan_date: null })
      .eq("id", book.id);

    if (error) {
      toast.error(error.message || "Could not update loan status.");
      return;
    }

    returnBook(book.id);
    toast.success("Book marked as returned!");
  };

  const handleAddNote = async () => {
    if (!canManageBooks) {
      toast.error("Your account is in viewer mode.");
      return;
    }

    if (!newNote.trim()) return;

    const { data: insertedNote, error } = await supabase
      .from("book_notes")
      .insert({
        book_id: book.id,
        content: newNote.trim(),
        author_name: currentUserName,
      })
      .select("id, content, author_name, created_at")
      .single();

    if (error || !insertedNote) {
      toast.error(error?.message || "Could not save note.");
      return;
    }

    addNote(
      book.id,
      insertedNote.content,
      insertedNote.author_name,
      insertedNote.id,
      insertedNote.created_at?.split("T")[0],
    );
    setNewNote("");
    toast.success("Note added!");
  };

  const handleDelete = async () => {
    if (!canManageBooks) {
      toast.error("Your account is in viewer mode.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please log in again before deleting books.");
      return;
    }

    const { error } = await supabase
      .from("books")
      .delete()
      .eq("id", book.id);

    if (error) {
      toast.error(error.message || "Could not delete book.");
      return;
    }

    deleteBook(book.id);
    toast.success("Book removed from library");
    navigate("/");
  };

  const toggleEditTag = (tag: string) => {
    setEditTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((currentTag) => currentTag !== tag);
      }
      return uniqueTags([...prev, tag]);
    });
  };

  const handleSaveEdit = async () => {
    if (!book) return;

    if (!canManageBooks) {
      toast.error("Your account is in viewer mode.");
      return;
    }

    if (!editTitle.trim() || !editAuthor.trim()) {
      toast.error("Title and author are required.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please log in again before editing books.");
      return;
    }

    setIsSavingEdit(true);

    const normalizedTags = uniqueTags(editTags);

    let { data, error } = await supabase
      .from("books")
      .update({
        title: editTitle.trim(),
        author: editAuthor.trim(),
        isbn: editIsbn.trim() || null,
        copies: Math.max(1, editCopies),
        cover_url: editCoverUrl.trim() || null,
        description: editDescription.trim() || null,
        category: "Uncategorized",
        tags: normalizedTags,
      })
      .eq("id", book.id)
      .select("id, title, author, isbn, category, tags, copies, description, cover_url, loaned_to, loan_date, added_date")
      .single();

    if (error && /tags/i.test(error.message)) {
      const fallbackUpdate = await supabase
        .from("books")
        .update({
          title: editTitle.trim(),
          author: editAuthor.trim(),
          isbn: editIsbn.trim() || null,
          copies: Math.max(1, editCopies),
          cover_url: editCoverUrl.trim() || null,
          description: editDescription.trim() || null,
          category: "Uncategorized",
        })
        .eq("id", book.id)
        .select("id, title, author, isbn, category, copies, description, cover_url, loaned_to, loan_date, added_date")
        .single();

      data = fallbackUpdate.data;
      error = fallbackUpdate.error;
    }

    if (error || !data) {
      setIsSavingEdit(false);
      toast.error(error?.message || "Could not update book.");
      return;
    }

    updateBook({
      ...book,
      id: data.id,
      title: data.title,
      author: data.author,
      isbn: data.isbn ?? "",
      category: data.category ?? "Uncategorized",
      tags: Array.isArray(data.tags) ? uniqueTags(data.tags) : normalizedTags,
      copies: data.copies ?? 1,
      description: data.description ?? undefined,
      coverUrl: data.cover_url ?? undefined,
      loanedTo: data.loaned_to ?? undefined,
      loanDate: data.loan_date ?? undefined,
      addedDate: data.added_date ?? book.addedDate,
    });

    setIsSavingEdit(false);
    setEditDialogOpen(false);
    toast.success("Book details updated.");
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <button
          onClick={() => navigate("/")}
          className="mb-4 flex items-center gap-1.5 text-sm font-body text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </button>

        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          {/* Cover */}
          <div className="flex-shrink-0">
            <div className="overflow-hidden rounded-xl shadow-book aspect-[2/3] bg-muted">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <BookOpen className="h-16 w-16 text-primary/30" />
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(book.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-body text-xs border-0">
                    {tag}
                  </Badge>
                ))}
              </div>
              <h1 className="font-display text-3xl font-bold text-foreground">{book.title}</h1>
              <p className="mt-1 font-body text-lg text-muted-foreground">{book.author}</p>
            </div>

            {book.description && (
              <p className="font-body text-sm text-muted-foreground leading-relaxed">
                {book.description}
              </p>
            )}

            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-sm font-body text-muted-foreground">
              {book.isbn && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> ISBN: {book.isbn}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> {book.copies} {book.copies === 1 ? "copy" : "copies"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Added {book.addedDate}
              </span>
            </div>

            {/* Loan Section */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-book">
              <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4" /> Reading Progress
              </h3>
              <Button
                type="button"
                variant={book.readByCurrentUser ? "default" : "outline"}
                onClick={() => void toggleReadStatus(book.id)}
                className="font-body"
              >
                {book.readByCurrentUser ? "Mark as Unread" : "Mark as Read"}
              </Button>
              <Button
                type="button"
                variant={currentlyReadingBookId === book.id ? "default" : "outline"}
                onClick={() => void toggleCurrentlyReading(book.id)}
                className="ml-2 font-body"
              >
                {currentlyReadingBookId === book.id ? "Currently Reading" : "Set Currently Reading"}
              </Button>
            </div>

            {/* Loan Section */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-book">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-foreground mb-3">
                <Users className="h-4 w-4" /> Loan Status
              </h3>
              {book.loanedTo ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-body text-sm text-foreground">
                      Loaned to <span className="font-semibold">{book.loanedTo}</span>
                    </p>
                    <p className="text-xs text-muted-foreground font-body">Since {book.loanDate}</p>
                  </div>
                  {canManageBooks ? (
                    <Button size="sm" variant="outline" onClick={handleReturn} className="gap-1 font-body">
                      <UserCheck className="h-3.5 w-3.5" /> Mark Returned
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground font-body">Available on shelf</p>
                  {canManageBooks ? (
                    <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 font-body">
                          <Users className="h-3.5 w-3.5" /> Loan Book
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="font-display">Loan "{book.title}"</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 pt-2">
                          <Input
                            placeholder="Friend's name"
                            value={loanName}
                            onChange={(e) => setLoanName(e.target.value)}
                            className="font-body"
                          />
                          <Button onClick={handleLoan} className="w-full font-body">
                            Confirm Loan
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-book">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-foreground mb-3">
                <MessageSquare className="h-4 w-4" /> Notes & Feedback
              </h3>
              {book.notes.length > 0 ? (
                <ul className="mb-4 space-y-2">
                  {book.notes.map((note) => (
                    <li key={note.id} className="rounded-lg bg-muted p-3 text-sm font-body text-foreground">
                      <p>{note.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.authorName} • {note.createdAt}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-muted-foreground font-body">No notes yet.</p>
              )}
              {canManageBooks ? (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Write a note or review..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="font-body text-sm"
                    rows={2}
                  />
                  <Button size="sm" onClick={handleAddNote} className="shrink-0 self-end gap-1 font-body">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Delete */}
            {canManageBooks ? (
            <div className="flex flex-wrap gap-2">
              <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-1.5 font-body">
                    <Pencil className="h-4 w-4" /> Edit Book
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-display">Edit Book</DialogTitle>
                    <DialogDescription className="font-body">
                      Update title, author, tags, and other details.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="font-body text-sm font-medium">Title *</label>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="mt-1 font-body"
                        placeholder="Book title"
                      />
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium">Author *</label>
                      <Input
                        value={editAuthor}
                        onChange={(e) => setEditAuthor(e.target.value)}
                        className="mt-1 font-body"
                        placeholder="Author name"
                      />
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium">ISBN</label>
                      <Input
                        value={editIsbn}
                        onChange={(e) => setEditIsbn(e.target.value)}
                        className="mt-1 font-body"
                        placeholder="e.g. 978..."
                      />
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium">Cover image URL</label>
                      <Input
                        value={editCoverUrl}
                        onChange={(e) => setEditCoverUrl(e.target.value)}
                        className="mt-1 font-body"
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium">Copies</label>
                      <Input
                        type="number"
                        min={1}
                        value={editCopies}
                        onChange={(e) => setEditCopies(parseInt(e.target.value, 10) || 1)}
                        className="mt-1 font-body"
                      />
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium">Tags</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {defaultBookTags.map((tag) => {
                          const isSelected = editTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleEditTag(tag)}
                              className={[
                                "rounded-full border px-3 py-1 text-xs font-body transition-colors",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-muted text-muted-foreground hover:text-foreground",
                              ].join(" ")}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium">Description</label>
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="mt-1 font-body"
                        rows={4}
                        placeholder="Optional description"
                      />
                    </div>
                    <Button onClick={handleSaveEdit} className="w-full font-body" disabled={isSavingEdit}>
                      {isSavingEdit ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={handleDelete} className="gap-1.5 font-body text-destructive hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 className="h-4 w-4" /> Remove Book
              </Button>
            </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
};

export default BookDetail;
