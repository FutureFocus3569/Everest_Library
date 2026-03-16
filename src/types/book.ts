export interface BookNote {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  coverUrl?: string;
  category: string;
  tags?: string[];
  copies: number;
  loanedTo?: string;
  loanDate?: string;
  notes: BookNote[];
  readByCurrentUser?: boolean;
  currentlyReadingByCurrentUser?: boolean;
  toReadByCurrentUser?: boolean;
  addedDate: string;
  description?: string;
  pageCount?: number;
  publisher?: string;
  publishedYear?: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  bookCount: number;
}
