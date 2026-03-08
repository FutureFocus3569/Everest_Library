import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LibraryProvider } from "@/context/LibraryContext";
import { AuthGate } from "@/components/AuthGate";
import Index from "./pages/Index";
import AddBook from "./pages/AddBook";
import BookDetail from "./pages/BookDetail";
import AdminUsers from "./pages/AdminUsers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGate>
          <LibraryProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/add" element={<AddBook />} />
              <Route path="/book/:id" element={<BookDetail />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </LibraryProvider>
        </AuthGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
