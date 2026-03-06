import { useLibrary } from "@/context/LibraryContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { BookCard } from "@/components/BookCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { StatsBar } from "@/components/StatsBar";
import { BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { filteredBooks, books } = useLibrary();

  const escapeCsvCell = (value: string) => {
    if (value.includes(",") || value.includes("\n") || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const exportCsv = () => {
    const headers = [
      "title",
      "author",
      "isbn",
      "tags",
      "copies",
      "loaned_to",
      "loan_date",
      "added_date",
      "description",
    ];

    const rows = books.map((book) => [
      book.title,
      book.author,
      book.isbn,
      (book.tags ?? []).join("; "),
      String(book.copies ?? 1),
      book.loanedTo ?? "",
      book.loanDate ?? "",
      book.addedDate ?? "",
      book.description ?? "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsvCell(value ?? "")).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStamp = new Date().toISOString().split("T")[0];

    link.href = url;
    link.setAttribute("download", `everest-library-${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            My Library
          </h1>
          <p className="mt-1 font-body text-muted-foreground">
            Your personal book collection at a glance
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={exportCsv} disabled={books.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <StatsBar />
      <CategoryFilter />

      {filteredBooks.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredBooks.map((book, i) => (
            <BookCard key={book.id} book={book} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h3 className="font-display text-lg font-semibold text-foreground">No books found</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Try adjusting your search or tag filter
          </p>
        </div>
      )}
    </AppLayout>
  );
};

export default Index;
