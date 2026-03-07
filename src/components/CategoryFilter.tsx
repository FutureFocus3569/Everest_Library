import { useLibrary } from "@/context/LibraryContext";
import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";
import { defaultBookTags } from "@/data/defaultTags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const CategoryFilter = () => {
  const {
    selectedCategory,
    setSelectedCategory,
    selectedAuthor,
    setSelectedAuthor,
    books,
    readFilter,
    setReadFilter,
  } = useLibrary();
  const readCount = books.filter((book) => book.readByCurrentUser).length;
  const unreadCount = books.length - readCount;
  const availableAuthors = Array.from(
    new Set(
      books
        .map((book) => book.author?.trim())
        .filter((author): author is string => Boolean(author))
    )
  ).sort((a, b) => a.localeCompare(b));
  const tagCounts = books.reduce<Record<string, number>>((acc, book) => {
    const uniqueBookTags = Array.from(new Set(book.tags ?? []));
    uniqueBookTags.forEach((tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
    });
    return acc;
  }, {});

  const availableTags = Array.from(new Set([...defaultBookTags, ...Object.keys(tagCounts)]));

  return (
    <div className="mb-6">
      <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Author</h2>
      <div className="mb-4 max-w-xs">
        <Select
          value={selectedAuthor ?? "all-authors"}
          onValueChange={(value) => setSelectedAuthor(value === "all-authors" ? null : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All authors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-authors">All authors</SelectItem>
            {availableAuthors.map((author) => (
              <SelectItem key={author} value={author}>
                {author}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Reading</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setReadFilter("all")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-body font-medium transition-all",
            readFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          All ({books.length})
        </button>
        <button
          onClick={() => setReadFilter("read")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-body font-medium transition-all",
            readFilter === "read"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          Read ({readCount})
        </button>
        <button
          onClick={() => setReadFilter("unread")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-body font-medium transition-all",
            readFilter === "unread"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          Unread ({unreadCount})
        </button>
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Tags</h2>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-body font-medium transition-all",
            !selectedCategory
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          All ({books.length})
        </button>
        {availableTags
          .filter((tag) => (tagCounts[tag] ?? 0) > 0)
          .sort((a, b) => a.localeCompare(b))
          .map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedCategory(tag)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-body font-medium transition-all",
                selectedCategory === tag
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              #{tag} ({tagCounts[tag] ?? 0})
            </button>
          ))}
      </div>
    </div>
  );
};
