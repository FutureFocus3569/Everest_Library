import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LibraryProvider } from "@/context/LibraryContext";
import { AuthGate } from "@/components/AuthGate";

const Index = lazy(() => import("./pages/Index"));
const AddBook = lazy(() => import("./pages/AddBook"));
const BookDetail = lazy(() => import("./pages/BookDetail"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGate>
          <LibraryProvider>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/add" element={<AddBook />} />
                <Route path="/book/:id" element={<BookDetail />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </LibraryProvider>
        </AuthGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
