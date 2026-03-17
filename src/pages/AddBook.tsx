import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IScannerControls } from "@zxing/browser";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLibrary } from "@/context/LibraryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScanBarcode, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defaultBookTags, uniqueTags } from "@/data/defaultTags";

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim();

const tagSynonyms: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: "Self-Help", patterns: [/\bself[\s-]?help\b/, /\bself[\s-]?improvement\b/] },
  { tag: "Personal Development", patterns: [/\bpersonal development\b/, /\bpersonal growth\b/] },
  { tag: "Psychology", patterns: [/\bpsycholog/, /\bmental health\b/, /\bbehavior\b/, /\bbehaviour\b/] },
  { tag: "Business", patterns: [/\bbusiness\b/, /\bmanagement\b/, /\beconomics?\b/] },
  { tag: "Entrepreneurship", patterns: [/\bentrepreneur/, /\bstartup\b/, /\bfounder\b/] },
  { tag: "Innovation", patterns: [/\binnovation\b/, /\bcreative thinking\b/, /\binvent\w*\b/] },
  { tag: "Leadership", patterns: [/\bleadership\b/, /\bleader\w*\b/] },
  { tag: "Productivity", patterns: [/\bproductivity\b/, /\btime management\b/, /\befficiency\b/] },
  { tag: "Mindset", patterns: [/\bmindset\b/, /\bgrowth mindset\b/] },
  { tag: "Finance", patterns: [/\bfinance\b/, /\binvesting\b/, /\bmoney\b/, /\bwealth\b/] },
  { tag: "Biography", patterns: [/\bbiograph/] },
  { tag: "Memoir", patterns: [/\bmemoir\b/, /\bautobiograph/] },
  { tag: "History", patterns: [/\bhistory\b/, /\bhistorical\b/] },
  { tag: "Science", patterns: [/\bscience\b/, /\bphysics\b/, /\bchemistry\b/, /\bbiology\b/] },
  { tag: "Technology", patterns: [/\btechnology\b/, /\btech\b/, /\bcomputing\b/, /\bsoftware\b/] },
  { tag: "Philosophy", patterns: [/\bphilosophy\b/, /\bethics\b/, /\bstoic/] },
  { tag: "Health", patterns: [/\bhealth\b/, /\bwellness\b/, /\bnutrition\b/, /\bfitness\b/] },
  { tag: "Parenting", patterns: [/\bparenting\b/, /\bparent\w*\b/, /\bchild\w*\b/] },
  { tag: "Education", patterns: [/\beducation\b/, /\blearning\b/, /\bstudy\b/, /\bteaching\b/] },
  { tag: "Workbook", patterns: [/\bworkbook\b/, /\bwork book\b/, /\bstudy guide\b/, /\bpractice\b/] },
  { tag: "Fiction", patterns: [/\bfiction\b/, /\bnovel\b/] },
];

const pickTagsFromSubjects = (subjects: string[]): string[] => {
  const normalizedSubjects = subjects.map(normalizeText).filter(Boolean);
  const subjectText = normalizedSubjects.join(" ");
  const matchedTags: string[] = [];

  for (const defaultTag of defaultBookTags) {
    const normalizedTag = normalizeText(defaultTag);
    if (normalizedTag && normalizedSubjects.some((subject) => subject.includes(normalizedTag))) {
      matchedTags.push(defaultTag);
    }
  }

  for (const synonym of tagSynonyms) {
    if (synonym.patterns.some((pattern) => pattern.test(subjectText))) {
      matchedTags.push(synonym.tag);
    }
  }

  return uniqueTags(matchedTags);
};

const buildFallbackDescription = (title: string, author: string, subjects: string[]): string => {
  const cleanedSubjects = uniqueTags(subjects.map((subject) => subject.trim()).filter(Boolean)).slice(0, 4);
  const titlePart = title.trim() ? `"${title.trim()}"` : "This book";
  const authorPart = author.trim() ? ` by ${author.trim()}` : "";

  if (cleanedSubjects.length === 0) {
    return `${titlePart}${authorPart} is available in your library. Add notes or tags to capture what it's about.`;
  }

  return `${titlePart}${authorPart} explores themes of ${cleanedSubjects.join(", ")}.`;
};

const extractDescription = (bookData: Record<string, unknown>): string => {
  const directDescription =
    typeof bookData.description === "string"
      ? bookData.description
      : typeof (bookData.description as { value?: unknown } | undefined)?.value === "string"
        ? ((bookData.description as { value?: string }).value ?? "")
        : "";

  if (directDescription) {
    return directDescription;
  }

  const notes =
    typeof bookData.notes === "string"
      ? bookData.notes
      : typeof (bookData.notes as { value?: unknown } | undefined)?.value === "string"
        ? ((bookData.notes as { value?: string }).value ?? "")
        : "";

  if (notes) {
    return notes;
  }

  const excerptArray = Array.isArray(bookData.excerpts) ? bookData.excerpts : [];
  const firstExcerpt = excerptArray[0] as { excerpt?: string | { value?: string } } | undefined;
  if (firstExcerpt) {
    if (typeof firstExcerpt.excerpt === "string") {
      return firstExcerpt.excerpt;
    }
    if (typeof firstExcerpt.excerpt?.value === "string") {
      return firstExcerpt.excerpt.value;
    }
  }

  return "";
};

const lookupGoogleBooksByIsbn = async (
  isbn: string,
): Promise<{ description: string; coverUrl: string; title: string; author: string; tags: string[] }> => {
  const emptyResult = { description: "", coverUrl: "", title: "", author: "", tags: [] as string[] };

  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
    if (!response.ok) return emptyResult;

    const payload = (await response.json()) as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          description?: string;
          categories?: string[];
          imageLinks?: { thumbnail?: string; smallThumbnail?: string };
        };
      }>;
    };

    const volumeInfo = payload.items?.[0]?.volumeInfo;
    if (!volumeInfo) return emptyResult;

    const normalizedCover = volumeInfo.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? "";
    const fallbackCover = volumeInfo.imageLinks?.smallThumbnail?.replace(/^http:/, "https:") ?? "";
    const derivedTags = pickTagsFromSubjects(volumeInfo.categories ?? []);

    return {
      description: volumeInfo.description ?? "",
      coverUrl: normalizedCover || fallbackCover,
      title: volumeInfo.title ?? "",
      author: volumeInfo.authors?.[0] ?? "",
      tags: derivedTags,
    };
  } catch {
    return emptyResult;
  }
};

const AddBook = () => {
  const navigate = useNavigate();
  const { addBook, canManageBooks } = useLibrary();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannerReaderRef = useRef<{ reset: () => void } | null>(null);
  const scannerHandledRef = useRef(false);

  const [isbn, setIsbn] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [copies, setCopies] = useState("1");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const stopScannerSafely = () => {
    try {
      scannerControlsRef.current?.stop();
    } catch {
      // no-op
    }
    scannerControlsRef.current = null;

    try {
      scannerReaderRef.current?.reset();
    } catch {
      // no-op
    }
    scannerReaderRef.current = null;
  };

  useEffect(() => {
    if (!scannerOpen) {
      scannerHandledRef.current = false;
      stopScannerSafely();
      setScannerLoading(false);
      return;
    }

    let cancelled = false;

    const waitForVideoElement = async (): Promise<HTMLVideoElement | null> => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (cancelled) return null;
        if (videoRef.current) return videoRef.current;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return null;
    };

    const startScanner = async () => {
      const videoElement = await waitForVideoElement();
      if (!videoElement) {
        setScannerError("Camera preview could not start. Please close and reopen scanner.");
        return;
      }

      setScannerError(null);
      setScannerLoading(true);

      try {
        const zxingModule = await import("@zxing/browser");
        const reader = new zxingModule.BrowserMultiFormatReader();
        scannerReaderRef.current = reader;

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        mediaStream.getTracks().forEach((track) => track.stop());

        const devices = await zxingModule.BrowserMultiFormatReader.listVideoInputDevices();
        const preferredDevice =
          devices.find((device) => /back|rear|environment/i.test(device.label)) ?? devices[0];

        if (!preferredDevice) {
          setScannerError("No camera found on this device.");
          setScannerLoading(false);
          return;
        }

        const controls = await reader.decodeFromVideoDevice(
          preferredDevice.deviceId,
          videoElement,
          (result) => {
            try {
              if (!result) return;
              if (scannerHandledRef.current) return;

              const scannedValue = result.getText().trim();
              if (!scannedValue) return;

              scannerHandledRef.current = true;
              stopScannerSafely();

              setIsbn(scannedValue);
              void lookupISBN(scannedValue);
              toast.success(`Barcode scanned: ${scannedValue}`);
              setScannerOpen(false);
            } catch {
              scannerHandledRef.current = true;
              stopScannerSafely();
              setScannerError("Scan completed, but preview could not close cleanly. Please reopen scanner.");
              setScannerOpen(false);
            }
          },
        );

        if (!cancelled) {
          scannerControlsRef.current = controls;
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unknown camera error";
          const isIosHomeScreenMode =
            /iPad|iPhone|iPod/.test(navigator.userAgent) &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window.navigator as any).standalone === true;

          if (isIosHomeScreenMode) {
            setScannerError(
              "Camera access failed in Home Screen mode. Open the site in Safari and try scanning there.",
            );
          } else {
            setScannerError(`Could not access camera: ${message}`);
          }
        }
      } finally {
        if (!cancelled) {
          setScannerLoading(false);
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScannerSafely();
    };
  }, [scannerOpen]);

  const lookupISBN = async (rawIsbn?: string) => {
    const isbnValue = (rawIsbn ?? isbn).trim();
    if (!isbnValue) return;
    setLookupLoading(true);
    try {
      const cleanIsbn = isbnValue;
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
      const data = await res.json();
      const bookData = data[`ISBN:${cleanIsbn}`];
      if (bookData) {
        setTitle(bookData.title || "");
        setAuthor(bookData.authors?.[0]?.name || "");

        const subjectNames = Array.isArray(bookData.subjects)
          ? bookData.subjects
              .map((subject: { name?: string }) => subject?.name)
              .filter((name: string | undefined): name is string => Boolean(name))
          : [];
        const matchedTags = pickTagsFromSubjects(subjectNames);
        if (matchedTags.length > 0) {
          setSelectedTags((prev) => uniqueTags([...prev, ...matchedTags]));
        }

        const extractedDescription = extractDescription(bookData as Record<string, unknown>);

        const apiCover =
          bookData.cover?.large ||
          bookData.cover?.medium ||
          bookData.cover?.small ||
          (cleanIsbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : "");

        let nextDescription = extractedDescription || "";
        let nextCoverUrl = apiCover || "";

        if (!nextDescription) {
          const googleFallback = await lookupGoogleBooksByIsbn(cleanIsbn);

          if (!title.trim() && googleFallback.title) {
            setTitle(googleFallback.title);
          }
          if (!author.trim() && googleFallback.author) {
            setAuthor(googleFallback.author);
          }
          if (googleFallback.tags.length > 0) {
            setSelectedTags((prev) => uniqueTags([...prev, ...googleFallback.tags]));
          }

          if (googleFallback.description) {
            nextDescription = googleFallback.description;
          }
          if (!nextCoverUrl && googleFallback.coverUrl) {
            nextCoverUrl = googleFallback.coverUrl;
          }
        }

        if (!nextDescription) {
          nextDescription = buildFallbackDescription(
            bookData.title || "",
            bookData.authors?.[0]?.name || "",
            subjectNames,
          );
        }

        setDescription(nextDescription);
        if (nextCoverUrl) {
          setCoverUrl(nextCoverUrl);
        }

        toast.success("Book found! Details loaded.");
      } else {
        const googleFallback = await lookupGoogleBooksByIsbn(cleanIsbn);

        if (googleFallback.title || googleFallback.author || googleFallback.description || googleFallback.coverUrl) {
          if (googleFallback.title) setTitle(googleFallback.title);
          if (googleFallback.author) setAuthor(googleFallback.author);
          if (googleFallback.description) {
            setDescription(googleFallback.description);
          } else {
            setDescription(buildFallbackDescription(googleFallback.title, googleFallback.author, googleFallback.tags));
          }
          if (googleFallback.coverUrl) setCoverUrl(googleFallback.coverUrl);
          if (googleFallback.tags.length > 0) {
            setSelectedTags((prev) => uniqueTags([...prev, ...googleFallback.tags]));
          }
          toast.success("Book found via fallback source.");
        } else {
          toast.error("Book not found. Enter details manually.");
        }
      }
    } catch {
      toast.error("Lookup failed. Enter details manually.");
    }
    setLookupLoading(false);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((currentTag) => currentTag !== tag);
      }
      return uniqueTags([...prev, tag]);
    });
  };

  const handleCoverUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = () => {
      if (typeof fileReader.result === "string") {
        setCoverUrl(fileReader.result);
        toast.success("Cover image uploaded. You can still replace it.");
      }
    };
    fileReader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) {
      toast.error("Title and author are required.");
      return;
    }

    setSaveLoading(true);

    let user: { id: string } | null = null;

    try {
      const authResponse = await withTimeout(
        supabase.auth.getUser(),
        15000,
        "Request timed out while checking your login. Please try again.",
      );
      user = authResponse.data.user;
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not verify login. Please try again.";
      toast.error(message);
      setSaveLoading(false);
      return;
    }

    if (!user) {
      toast.error("Please log in again before adding books.");
      setSaveLoading(false);
      return;
    }

    const normalizedTags = uniqueTags(selectedTags);
    const normalizedCopies = Math.max(1, Number.parseInt(copies, 10) || 1);

    const bookPayload = {
      user_id: user.id,
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim() || null,
      category: "Uncategorized",
      tags: normalizedTags,
      copies: normalizedCopies,
      description: description.trim() || null,
      cover_url: coverUrl.trim() || null,
    };

    let data: {
      id: string;
      title: string;
      author: string;
      isbn: string | null;
      category: string | null;
      tags?: string[] | null;
      copies: number | null;
      description: string | null;
      cover_url: string | null;
      loaned_to: string | null;
      loan_date: string | null;
      added_date: string | null;
    } | null = null;
    let error: { message: string } | null = null;

    try {
      const insertResult = await withTimeout(
        supabase
          .from("books")
          .insert(bookPayload)
          .select("id, title, author, isbn, category, tags, copies, description, cover_url, loaned_to, loan_date, added_date")
          .single(),
        15000,
        "Saving timed out. Supabase may be unavailable right now.",
      );

      data = insertResult.data;
      error = insertResult.error;
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not save book.";
      toast.error(message);
      setSaveLoading(false);
      return;
    }

    if (error && /tags/i.test(error.message)) {
      try {
        const fallbackInsert = await withTimeout(
          supabase
            .from("books")
            .insert({
              user_id: user.id,
              title: title.trim(),
              author: author.trim(),
              isbn: isbn.trim() || null,
              category: "Uncategorized",
              copies: normalizedCopies,
              description: description.trim() || null,
              cover_url: coverUrl.trim() || null,
            })
            .select("id, title, author, isbn, category, copies, description, cover_url, loaned_to, loan_date, added_date")
            .single(),
          15000,
          "Saving timed out. Supabase may be unavailable right now.",
        );

        data = fallbackInsert.data;
        error = fallbackInsert.error;
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : "Could not save book.";
        toast.error(message);
        setSaveLoading(false);
        return;
      }
    }

    if (error || !data) {
      toast.error(error?.message ?? "Could not save book.");
      setSaveLoading(false);
      return;
    }

    addBook({
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
      notes: [],
      addedDate: data.added_date ?? new Date().toISOString().split("T")[0],
    });

    toast.success(`"${title}" added to your library!`);
    setSaveLoading(false);
    navigate("/");
  };

  if (!canManageBooks) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 shadow-book">
          <h1 className="font-display text-2xl font-bold text-foreground">View-only access</h1>
          <p className="mt-2 font-body text-muted-foreground">
            Your account is currently in viewer mode, so adding books is disabled.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg"
      >
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-foreground">Add a Book</h1>
          <p className="mt-1 font-body text-muted-foreground">
            Scan a barcode or enter details manually
          </p>
        </div>

        {/* ISBN Lookup */}
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-book">
          <Label className="font-body text-sm font-medium text-foreground">ISBN / Barcode</Label>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="e.g. 9780061120084"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              className="font-body"
            />
            <Button onClick={lookupISBN} disabled={lookupLoading} variant="outline" className="shrink-0 gap-1.5">
              <ScanBarcode className="h-4 w-4" />
              {lookupLoading ? "Looking..." : "Lookup"}
            </Button>
            <Button type="button" onClick={() => setScannerOpen(true)} variant="outline" className="shrink-0 gap-1.5">
              <ScanBarcode className="h-4 w-4" />
              Scan
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground font-body">
            Enter an ISBN to auto-fill book details from Open Library
          </p>
        </div>

        {/* Manual form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-book space-y-4">
            <div>
              <Label className="font-body text-sm font-medium">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 font-body" placeholder="Book title" />
            </div>
            <div>
              <Label className="font-body text-sm font-medium">Author *</Label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} className="mt-1 font-body" placeholder="Author name" />
            </div>
            <div>
              <Label className="font-body text-sm font-medium">Cover image URL</Label>
              <Input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                className="mt-1 font-body"
                placeholder="https://..."
              />
              <div className="mt-2">
                <Label className="font-body text-sm font-medium">Or upload cover image</Label>
                <Input type="file" accept="image/*" onChange={handleCoverUpload} className="mt-1 font-body" />
              </div>
              {coverUrl ? (
                <div className="mt-3 h-40 w-28 overflow-hidden rounded-md border border-border bg-muted">
                  <img src={coverUrl} alt="Cover preview" className="h-full w-full object-cover" />
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label className="font-body text-sm font-medium">Copies</Label>
                <Input
                  type="number"
                  min={1}
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                  className="mt-1 font-body"
                />
              </div>
            </div>
            <div>
              <Label className="font-body text-sm font-medium">Tags</Label>
              <p className="mt-1 text-xs font-body text-muted-foreground">
                Select multiple tags to better organize your books
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {defaultBookTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
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
              <Label className="font-body text-sm font-medium">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 font-body"
                placeholder="Optional description or summary"
                rows={3}
              />
            </div>
          </div>

          <Button type="submit" className="w-full gap-2 font-body" size="lg" disabled={saveLoading}>
            <Plus className="h-4 w-4" />
            {saveLoading ? "Saving..." : "Add to Library"}
          </Button>
        </form>
      </motion.div>

      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan barcode</DialogTitle>
            <DialogDescription>
              Point your camera at the book barcode. We’ll fill ISBN automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <video ref={videoRef} className="h-64 w-full rounded-lg bg-black object-cover" autoPlay muted playsInline />
            {scannerLoading ? <p className="text-sm text-muted-foreground">Starting camera...</p> : null}
            {scannerError ? <p className="text-sm text-destructive">{scannerError}</p> : null}
            {scannerError ? (
              <p className="text-xs text-muted-foreground">
                Tip: click the camera icon in your browser address bar and allow camera access for localhost.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AddBook;
