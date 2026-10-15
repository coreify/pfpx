import {
  NetworkError,
  RateLimitedError,
  TimeoutError,
} from "../utils/errors.js";
import {
  isFacebookHost,
  isSafeFacebookCdnUrl,
} from "./normalize-profile-url.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const CRAWLER_USER_AGENT =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const USER_AGENT = BROWSER_HEADERS["User-Agent"]!;

function isSafeProfilePageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isFacebookHost(parsed.hostname);
  } catch {
    return false;
  }
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive integer");
  }
  return AbortSignal.timeout(timeoutMs);
}

export interface FetchPublicPageOptions {
  timeoutMs?: number | undefined;
  verbose?: boolean | undefined;
}

export interface FetchResult {
  html: string;
  finalUrl: string;
  status: number;
}

export async function fetchPublicPage(
  url: string,
  options: FetchPublicPageOptions = {},
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const verbose = options.verbose ?? false;

  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    if (!isSafeProfilePageUrl(currentUrl)) {
      throw new NetworkError(`Unsafe redirect target: ${currentUrl}`);
    }

    let response: Response;
    try {
      if (verbose) {
        process.stderr.write(`[pfpx] GET ${currentUrl}\n`);
      }
      response = await fetch(currentUrl, {
        signal: timeoutSignal(timeoutMs),
        headers: BROWSER_HEADERS,
        redirect: "manual",
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError")
      ) {
        throw new TimeoutError(currentUrl);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(`Fetch failed: ${msg}`);
    }
    if (response.status === 400) {
      if (verbose) {
        process.stderr.write(
          `[pfpx] Received 400 with browser headers, retrying with crawler UA...\n`,
        );
      }
      try {
        await response.body?.cancel();
        const crawlerResponse = await fetch(currentUrl, {
          signal: timeoutSignal(timeoutMs),
          headers: {
            "User-Agent": CRAWLER_USER_AGENT,
            Accept: "*/*",
          },
          redirect: "manual",
        });
        if (
          crawlerResponse.ok ||
          (crawlerResponse.status >= 301 && crawlerResponse.status <= 308)
        ) {
          response = crawlerResponse;
        }
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError")
        ) {
          throw new TimeoutError(currentUrl);
        }
      }
    }

    if (verbose) {
      process.stderr.write(
        `[pfpx] Status: ${response.status} for ${currentUrl}\n`,
      );
    }

    if (response.status >= 301 && response.status <= 308) {
      const location = response.headers.get("location");
      if (!location) throw new NetworkError("Redirect with no Location header");
      const next = new URL(location, currentUrl).toString();

      if (next.includes("login.") || next.includes("/login/")) {
        try {
          const orig = new URL(url);
          const mobileUrl = `https://m.facebook.com${orig.pathname}${orig.search}`;
          const mobileRes = await fetch(mobileUrl, {
            signal: timeoutSignal(timeoutMs),
            headers: {
              "User-Agent":
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
            redirect: "manual",
          });
          if (mobileRes.ok) {
            response = mobileRes;
            currentUrl = mobileUrl;
          } else {
            currentUrl = next;
            redirectCount++;
            continue;
          }
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            (error.name === "AbortError" || error.name === "TimeoutError")
          ) {
            throw new TimeoutError(currentUrl);
          }
          currentUrl = next;
          redirectCount++;
          continue;
        }
      } else {
        currentUrl = next;
        redirectCount++;
        continue;
      }
    }

    if (response.status === 429) throw new RateLimitedError();
    if (response.status === 403 || response.status === 401) {
      throw new NetworkError(
        `Access denied (HTTP ${response.status}): ${currentUrl}`,
      );
    }
    if (response.status === 404) {
      throw new NetworkError(`Profile not found (HTTP 404): ${currentUrl}`);
    }
    if (!response.ok) {
      throw new NetworkError(`HTTP ${response.status}: ${currentUrl}`);
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new NetworkError("Facebook response exceeds 5 MiB limit");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { html: text, finalUrl: currentUrl, status: response.status };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new NetworkError("Facebook response exceeds 5 MiB limit");
        }
        chunks.push(value);
      }
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder().decode(combined);

    return { html, finalUrl: currentUrl, status: response.status };
  }

  throw new NetworkError(`Too many redirects for: ${url}`);
}

export interface ImageFetchResult {
  width: number;
  height: number;
  contentType: string;
}

const MAX_IMAGE_BYTES = 512 * 1024;
const DEFAULT_DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function fetchImageDimensions(
  url: string,
  options: FetchPublicPageOptions = {},
): Promise<ImageFetchResult | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!isSafeFacebookCdnUrl(url)) return null;

  try {
    const response = await fetchSafeImage(url, timeoutMs);

    if (!response) return null;

    const contentType = response.headers.get("content-type") ?? "";
    const mimeBase = contentType.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIME_TYPES.has(mimeBase)) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total >= MAX_IMAGE_BYTES) {
          const allowed = Math.max(
            0,
            value.byteLength - (total - MAX_IMAGE_BYTES),
          );
          if (allowed > 0) chunks.push(value.subarray(0, allowed));
          total = MAX_IMAGE_BYTES;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }

    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }

    const dims = parseImageDimensions(buf, mimeBase);
    if (!dims) return null;
    return { ...dims, contentType: mimeBase };
  } catch {
    return null;
  }
}

async function fetchSafeImage(
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  let currentUrl = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!isSafeFacebookCdnUrl(currentUrl)) return null;
    const response = await fetch(currentUrl, {
      signal: timeoutSignal(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://www.facebook.com/",
      },
      redirect: "manual",
    });
    if (response.status >= 301 && response.status <= 308) {
      const location = response.headers.get("location");
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return response.ok ? response : null;
  }
  return null;
}

export interface DownloadImageOptions extends FetchPublicPageOptions {
  maxBytes?: number | undefined;
}

export interface DownloadedImage {
  data: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}

export async function downloadFacebookImage(
  url: string,
  options: DownloadImageOptions = {},
): Promise<DownloadedImage> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_DOWNLOAD_LIMIT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new NetworkError("Image byte limit must be a positive integer");
  }

  let response: Response | null;
  try {
    response = await fetchSafeImage(url, timeoutMs);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new TimeoutError(url);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new NetworkError(`Image download failed: ${message}`);
  }
  if (!response) throw new NetworkError("Image download failed");

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    await response.body?.cancel();
    throw new NetworkError(`Unsupported image content type: ${contentType}`);
  }

  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new NetworkError(`Image exceeds ${maxBytes} byte limit`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new NetworkError("Image response has no body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new NetworkError(`Image exceeds ${maxBytes} byte limit`);
    }
    chunks.push(value);
  }

  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const dimensions = parseImageDimensions(data, contentType);
  if (!dimensions) {
    throw new NetworkError("Image data does not match its content type");
  }
  return {
    data,
    contentType,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function parseImageDimensions(
  buf: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  if (mime === "image/jpeg") return parseJpegDimensions(buf);
  if (mime === "image/png") return parsePngDimensions(buf);
  if (mime === "image/webp") return parseWebpDimensions(buf);
  if (mime === "image/gif") return parseGifDimensions(buf);
  return null;
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] ?? 0) << 8) | (buf[offset + 1] ?? 0);
}
function readUint16LE(buf: Uint8Array, offset: number): number {
  return (buf[offset] ?? 0) | ((buf[offset + 1] ?? 0) << 8);
}
function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (((buf[offset] ?? 0) << 24) |
      ((buf[offset + 1] ?? 0) << 16) |
      ((buf[offset + 2] ?? 0) << 8) |
      (buf[offset + 3] ?? 0)) >>>
    0
  );
}

function parsePngDimensions(
  buf: Uint8Array,
): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) return null;
  }
  const width = readUint32BE(buf, 16);
  const height = readUint32BE(buf, 20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function parseJpegDimensions(
  buf: Uint8Array,
): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1] ?? 0;
    if (marker === 0xff || marker === 0x00) {
      i++;
      continue;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = readUint16BE(buf, i + 5);
      const width = readUint16BE(buf, i + 7);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    const len = readUint16BE(buf, i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function parseWebpDimensions(
  buf: Uint8Array,
): { width: number; height: number } | null {
  if (buf.length < 25) return null;
  if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46)
    return null;
  if (
    buf[8] !== 0x57 ||
    buf[9] !== 0x45 ||
    buf[10] !== 0x42 ||
    buf[11] !== 0x50
  )
    return null;
  if (
    buf[12] === 0x56 &&
    buf[13] === 0x50 &&
    buf[14] === 0x38 &&
    buf[15] === 0x58
  ) {
    if (buf.length < 30) return null;
    const width =
      (buf[24] ?? 0) | ((buf[25] ?? 0) << 8) | ((buf[26] ?? 0) << 16);
    const height =
      (buf[27] ?? 0) | ((buf[28] ?? 0) << 8) | ((buf[29] ?? 0) << 16);
    return { width: width + 1, height: height + 1 };
  }
  if (
    buf[12] === 0x56 &&
    buf[13] === 0x50 &&
    buf[14] === 0x38 &&
    buf[15] === 0x4c
  ) {
    if (buf.length < 25) return null;
    const b0 = buf[21] ?? 0,
      b1 = buf[22] ?? 0,
      b2 = buf[23] ?? 0,
      b3 = buf[24] ?? 0;
    const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (
    buf[12] === 0x56 &&
    buf[13] === 0x50 &&
    buf[14] === 0x38 &&
    buf[15] === 0x20
  ) {
    if (buf.length < 30) return null;
    const width = readUint16LE(buf, 26) & 0x3fff;
    const height = readUint16LE(buf, 28) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }
  return null;
}

function parseGifDimensions(
  buf: Uint8Array,
): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  const signature = String.fromCharCode(...buf.subarray(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  const width = readUint16LE(buf, 6);
  const height = readUint16LE(buf, 8);
  return width > 0 && height > 0 ? { width, height } : null;
}
