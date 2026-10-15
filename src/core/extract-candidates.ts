import * as cheerio from "cheerio";
import type { ImageCandidate } from "./types.js";
import { isSafeFacebookCdnUrl } from "./normalize-profile-url.js";

export function removeCtpFromCdnUrl(rawUrl: string): string | null {
  const decoded = rawUrl.replace(/&amp;/g, "&").replace(/\\\//g, "/");
  try {
    const parsed = new URL(decoded);
    if (parsed.searchParams.has("ctp")) {
      parsed.searchParams.delete("ctp");
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function cleanCandidateUrl(rawUrl: string): string {
  return rawUrl
    .replace(/&amp;/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&");
}

function createCandidatePair(
  rawUrl: string,
  source: ImageCandidate["source"],
): ImageCandidate[] {
  const cleaned = cleanCandidateUrl(rawUrl);
  if (!isSafeFacebookCdnUrl(cleaned)) return [];
  const list: ImageCandidate[] = [];

  const highRes = removeCtpFromCdnUrl(cleaned);
  if (highRes && highRes !== cleaned) {
    list.push({ url: highRes, source, verified: false });
  }
  list.push({ url: cleaned, source, verified: false });
  return list;
}

function getCandidateDedupKey(url: string): string {
  try {
    const parsed = new URL(url);
    const ctp = parsed.searchParams.get("ctp") ?? "none";
    return `${parsed.pathname}?ctp=${ctp}`;
  } catch {
    return url;
  }
}

function deduplicateByUrl(candidates: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = getCandidateDedupKey(c.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyProfilePicture(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("cover") && !lower.includes("profile")) return false;
  if (lower.includes("ads/") || lower.includes("static/")) return false;
  return true;
}

function extractOgImage(html: string): ImageCandidate[] {
  const $ = cheerio.load(html);
  const content = $('meta[property="og:image"]').attr("content");
  if (!content) return [];
  return createCandidatePair(content, "og:image");
}

function extractTwitterImage(html: string): ImageCandidate[] {
  const $ = cheerio.load(html);
  const content =
    $('meta[name="twitter:image"]').attr("content") ??
    $('meta[name="twitter:image:src"]').attr("content");
  if (!content) return [];
  return createCandidatePair(content, "twitter:image");
}

function extractStructuredData(html: string): ImageCandidate[] {
  const $ = cheerio.load(html);
  const candidates: ImageCandidate[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html() ?? "";
    try {
      const data: unknown = JSON.parse(text);
      const extractImage = (obj: unknown): void => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach(extractImage);
          return;
        }
        const rec = obj as Record<string, unknown>;
        const imageField = rec["image"];
        if (
          typeof imageField === "string" &&
          isLikelyProfilePicture(imageField)
        ) {
          candidates.push(
            ...createCandidatePair(imageField, "structured-data"),
          );
        } else if (imageField && typeof imageField === "object") {
          const imgObj = imageField as Record<string, unknown>;
          const imgUrl = imgObj["url"];
          if (typeof imgUrl === "string") {
            candidates.push(...createCandidatePair(imgUrl, "structured-data"));
          }
        }
        for (const val of Object.values(rec)) {
          if (val && typeof val === "object") extractImage(val);
        }
      };
      extractImage(data);
    } catch {
      void 0;
    }
  });

  return candidates;
}

function extractPublicHtmlImages(
  html: string,
  profileUrl: string,
): ImageCandidate[] {
  const $ = cheerio.load(html);
  const candidates: ImageCandidate[] = [];

  const profileId = profileUrl.match(/profile\.php\?id=(\d+)/)?.[1];

  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    if (!isLikelyProfilePicture(src)) return;

    const alt = ($(el).attr("alt") ?? "").toLowerCase();
    const isProfileLike =
      alt.includes("profile") ||
      alt.includes("picture") ||
      alt.includes("photo") ||
      (profileId != null && src.includes(profileId));

    if (!isProfileLike) return;

    candidates.push(...createCandidatePair(src, "public-html"));
  });

  const cdnUrlRegex =
    /https:[^"'\\<>\s]+(?:fbcdn\.net|facebook\.com|fbsbx\.com)[^"'\\<>\s]+/g;
  const matches = html.match(cdnUrlRegex) ?? [];
  for (const m of matches) {
    const cleaned = cleanCandidateUrl(m);
    if (
      (cleaned.includes("-1/") ||
        cleaned.includes("t39.30808-1") ||
        cleaned.includes("t1.6435-1")) &&
      isLikelyProfilePicture(cleaned)
    ) {
      candidates.push(...createCandidatePair(cleaned, "public-html"));
    }
  }

  return candidates;
}

export interface ExtractCandidatesOptions {
  verbose?: boolean | undefined;
}

export function extractCandidates(
  html: string,
  profileUrl: string,
  options: ExtractCandidatesOptions = {},
): ImageCandidate[] {
  const all: ImageCandidate[] = [];
  const verbose = options.verbose ?? false;

  const ogList = extractOgImage(html);
  for (const og of ogList) {
    all.push(og);
    if (verbose) process.stderr.write(`[pfpx] Found og:image: ${og.url}\n`);
  }

  const twList = extractTwitterImage(html);
  for (const tw of twList) {
    all.push(tw);
    if (verbose)
      process.stderr.write(`[pfpx] Found twitter:image: ${tw.url}\n`);
  }

  const structured = extractStructuredData(html);
  for (const c of structured) {
    all.push(c);
    if (verbose)
      process.stderr.write(`[pfpx] Found structured-data image: ${c.url}\n`);
  }

  const htmlImages = extractPublicHtmlImages(html, profileUrl);
  for (const c of htmlImages) {
    all.push(c);
    if (verbose)
      process.stderr.write(`[pfpx] Found public-html image: ${c.url}\n`);
  }

  return deduplicateByUrl(all);
}
