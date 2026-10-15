import type { ImageCandidate } from "./types.js";

const SOURCE_PRIORITY: Record<string, number> = {
  "og:image": 4,
  "twitter:image": 3,
  "structured-data": 2,
  "public-html": 1,
};

function pixelCount(c: ImageCandidate): number {
  if (c.width != null && c.height != null) return c.width * c.height;
  return -1;
}

const AUTHORITATIVE_SOURCES = new Set([
  "og:image",
  "twitter:image",
  "structured-data",
]);

export function selectBest(
  candidates: ImageCandidate[],
): ImageCandidate | null {
  if (candidates.length === 0) return null;

  const authoritative = candidates.filter((c) =>
    AUTHORITATIVE_SOURCES.has(c.source),
  );
  const pool = authoritative.length > 0 ? authoritative : candidates;

  const sorted = [...pool].sort((a, b) => {
    const aVerified = a.verified ? 1 : 0;
    const bVerified = b.verified ? 1 : 0;
    if (bVerified !== aVerified) return bVerified - aVerified;

    const aPixels = pixelCount(a);
    const bPixels = pixelCount(b);
    if (aPixels !== bPixels) return bPixels - aPixels;

    const aPrio = SOURCE_PRIORITY[a.source] ?? 0;
    const bPrio = SOURCE_PRIORITY[b.source] ?? 0;
    return bPrio - aPrio;
  });

  return sorted[0] ?? null;
}
