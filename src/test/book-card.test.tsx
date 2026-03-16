import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookCard } from "@/components/BookCard";
import { Book } from "@/types/book";

const baseBook: Book = {
  id: "book-1",
  title: "How to Do the Work",
  author: "Nicole LePera",
  isbn: "9781409197744",
  category: "Psychology",
  tags: ["Self-Help", "Personal Development"],
  copies: 2,
  notes: [],
  addedDate: "2026-03-06",
};

describe("BookCard", () => {
  it("renders title, author, and currently-reading badge", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BookCard
          book={{
            ...baseBook,
            readByCurrentUser: true,
            currentlyReadingByCurrentUser: true,
          }}
          index={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("How to Do the Work")).toBeInTheDocument();
    expect(screen.getByText("Nicole LePera")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Currently Reading")).toBeInTheDocument();
  });
});
