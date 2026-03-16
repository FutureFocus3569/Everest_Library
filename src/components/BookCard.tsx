import { Book } from "@/types/book";
import { Link } from "react-router-dom";
import { BookOpen, Users, Copy, BookMarked } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface BookCardProps {
  book: Book;
  index: number;
}

export const BookCard = ({ book, index }: BookCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link
        to={`/book/${book.id}`}
        className="group block overflow-hidden rounded-xl border border-border bg-card shadow-book transition-all duration-300 hover:shadow-book-hover hover:-translate-y-1"
      >
        {/* Cover */}
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10">
              <BookOpen className="h-12 w-12 text-primary/40" />
            </div>
          )}

          {/* Loaned badge */}
          {book.loanedTo && (
            <div className="absolute left-2 top-2">
              <Badge className="bg-accent text-accent-foreground border-0 gap-1 text-xs font-body">
                <Users className="h-3 w-3" />
                Loaned
              </Badge>
            </div>
          )}

          {/* Copies badge */}
          {book.copies > 1 && (
            <div className="absolute right-2 top-2">
              <Badge variant="secondary" className="gap-1 text-xs font-body border-0">
                <Copy className="h-3 w-3" />
                ×{book.copies}
              </Badge>
            </div>
          )}

          {book.readByCurrentUser && (
            <div className="absolute left-2 bottom-2">
              <Badge className="border-0 bg-primary text-primary-foreground text-xs font-body">
                Read
              </Badge>
            </div>
          )}

          {book.currentlyReadingByCurrentUser && (
            <div className="absolute right-2 bottom-2">
              <Badge className="border-0 bg-accent text-accent-foreground text-xs font-body">
                Currently Reading
              </Badge>
            </div>
          )}

          {book.toReadByCurrentUser && !book.currentlyReadingByCurrentUser && (
            <div className="absolute right-2 bottom-2">
              <Badge className="border-0 bg-secondary text-secondary-foreground gap-1 text-xs font-body">
                <BookMarked className="h-3 w-3" />
                To Read
              </Badge>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="font-display text-sm font-semibold leading-tight text-card-foreground line-clamp-2">
            {book.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground font-body">{book.author}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(book.tags ?? []).slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] font-body border-0">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </Link>
    </motion.div>
  );
};
