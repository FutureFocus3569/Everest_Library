import { useLibrary } from "@/context/LibraryContext";
import { BookOpen, Users, Tags, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export const StatsBar = () => {
  const { books, readCount } = useLibrary();

  const totalBooks = books.length;
  const activeTags = new Set(books.flatMap((book) => book.tags ?? [])).size;
  const loanedOut = books.filter((b) => b.loanedTo).length;
  const stats = [
    { label: "Books", value: totalBooks, icon: BookOpen },
    { label: "Active Tags", value: activeTags, icon: Tags },
    { label: "On Loan", value: loanedOut, icon: Users },
    { label: "Read", value: readCount, icon: CheckCircle2 },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-border bg-card p-4 shadow-book"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <stat.icon className="h-4 w-4" />
            <span className="text-xs font-body font-medium">{stat.label}</span>
          </div>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{stat.value}</p>
        </motion.div>
      ))}
    </div>
  );
};
