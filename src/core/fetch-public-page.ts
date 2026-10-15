import {
  NetworkError,
  RateLimitedError,
  TimeoutError,
} from "../utils/errors.js";

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

function isPrivateIp(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    hostname === "::1"
  );
}

function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return false;
    if (isPrivateIp(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
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
    if (!isSafeRedirectUrl(currentUrl)) {
      throw new NetworkError(`Unsafe redirect target: ${currentUrl}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      if (verbose) {
        process.stderr.write(`[pfpx] GET ${currentUrl}\n`);
      }
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
        redirect: "manual",
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TimeoutError(currentUrl);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(`Fetch failed: ${msg}`);
    }
    clearTimeout(timer);

    if (response.status === 400) {
      if (verbose) {
        process.stderr.write(
          `[pfpx] Received 400 with browser headers, retrying with crawler UA...\n`,
        );
      }
      try {
        const crawlerResponse = await fetch(currentUrl, {
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
      } catch {
        void 0;
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
            headers: {
              "User-Agent":
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });
          if (mobileRes.ok) {
            response = mobileRes;
            currentUrl = mobileUrl;
            break;
          }
        } catch {
          void 0;
        }
      }

      currentUrl = next;
      redirectCount++;
      continue;
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
          reader.cancel().catch(() => undefined);
          break;
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

  if (!isSafeRedirectUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timer);

    if (!response.ok) return null;

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
        chunks.push(value);
        if (total >= MAX_IMAGE_BYTES) {
          reader.cancel().catch(() => undefined);
          break;
        }
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
    clearTimeout(timer);
    return null;
  }
}

function parseImageDimensions(
  buf: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  if (mime === "image/jpeg") return parseJpegDimensions(buf);
  if (mime === "image/png") return parsePngDimensions(buf);
  if (mime === "image/webp") return parseWebpDimensions(buf);
  return null;
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] ?? 0) << 8) | (buf[offset + 1] ?? 0);
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
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1] ?? 0;
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
    const width = readUint16BE(buf, 26) & 0x3fff;
    const height = readUint16BE(buf, 28) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }
  return null;
}
