export const defaultBookTags = [
  "Self-Help",
  "Personal Development",
  "Psychology",
  "Business",
  "Entrepreneurship",
  "Innovation",
  "Leadership",
  "Productivity",
  "Mindset",
  "Finance",
  "Biography",
  "Memoir",
  "History",
  "Science",
  "Technology",
  "Philosophy",
  "Health",
  "Parenting",
  "Education",
  "Fiction",
] as const;

const toCanonicalMap = new Map(defaultBookTags.map((tag) => [tag.toLowerCase(), tag]));

export const normalizeTag = (tag: string): string => {
  const trimmed = tag.trim();
  if (!trimmed) return "";
  return toCanonicalMap.get(trimmed.toLowerCase()) ?? trimmed;
};

export const uniqueTags = (tags: string[]): string[] => {
  const seen = new Set<string>();

  return tags
    .map(normalizeTag)
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};