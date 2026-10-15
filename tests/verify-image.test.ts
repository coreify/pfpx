import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  downloadFacebookImage,
  fetchImageDimensions,
} from "../src/core/fetch-public-page.js";
import { verifyCandidates } from "../src/core/verify-image.js";
import type { ImageCandidate } from "../src/core/types.js";

const CDN_URL =
  "https://scontent.xx.fbcdn.net/v/t1.6435-1/photo.jpg?_nc_oe=123";

function createPngBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  buf[16] = (width >> 24) & 0xff;
  buf[17] = (width >> 16) & 0xff;
  buf[18] = (width >> 8) & 0xff;
  buf[19] = width & 0xff;
  buf[20] = (height >> 24) & 0xff;
  buf[21] = (height >> 16) & 0xff;
  buf[22] = (height >> 8) & 0xff;
  buf[23] = height & 0xff;
  return buf;
}

function createJpegBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(17);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xc0;
  buf[4] = 0x00;
  buf[5] = 0x11;
  buf[6] = 0x08;
  buf[7] = (height >> 8) & 0xff;
  buf[8] = height & 0xff;
  buf[9] = (width >> 8) & 0xff;
  buf[10] = width & 0xff;
  return buf;
}

function createAvifBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0, 0, 0, 20, 0x69, 0x73, 0x70, 0x65], 0);
  buf[12] = (width >> 24) & 0xff;
  buf[13] = (width >> 16) & 0xff;
  buf[14] = (width >> 8) & 0xff;
  buf[15] = width & 0xff;
  buf[16] = (height >> 24) & 0xff;
  buf[17] = (height >> 16) & 0xff;
  buf[18] = (height >> 8) & 0xff;
  buf[19] = height & 0xff;
  return buf;
}

function createWebpVP8LBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(26);
  buf[0] = 0x52;
  buf[1] = 0x49;
  buf[2] = 0x46;
  buf[3] = 0x46;
  buf[8] = 0x57;
  buf[9] = 0x45;
  buf[10] = 0x42;
  buf[11] = 0x50;
  buf[12] = 0x56;
  buf[13] = 0x50;
  buf[14] = 0x38;
  buf[15] = 0x4c;
  const w = (width - 1) & 0x3fff;
  const h = (height - 1) & 0x3fff;
  const bits = w | (h << 14);
  buf[21] = bits & 0xff;
  buf[22] = (bits >> 8) & 0xff;
  buf[23] = (bits >> 16) & 0xff;
  buf[24] = (bits >> 24) & 0xff;
  return buf;
}

function createWebpVP8Bytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(32);
  buf[0] = 0x52;
  buf[1] = 0x49;
  buf[2] = 0x46;
  buf[3] = 0x46;
  buf[8] = 0x57;
  buf[9] = 0x45;
  buf[10] = 0x42;
  buf[11] = 0x50;
  buf[12] = 0x56;
  buf[13] = 0x50;
  buf[14] = 0x38;
  buf[15] = 0x20;
  buf[26] = width & 0xff;
  buf[27] = (width >> 8) & 0xff;
  buf[28] = height & 0xff;
  buf[29] = (height >> 8) & 0xff;
  return buf;
}

function createGifBytes(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(10);
  buf.set(new TextEncoder().encode("GIF89a"));
  buf[6] = width & 0xff;
  buf[7] = (width >> 8) & 0xff;
  buf[8] = height & 0xff;
  buf[9] = (height >> 8) & 0xff;
  return buf;
}

function makeStreamResponse(
  bytes: Uint8Array,
  contentType: string,
  status = 200,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": contentType },
  });
}

describe("fetchImageDimensions", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("parses JPEG dimensions", async () => {
    const bytes = createJpegBytes(640, 480);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/jpeg"),
    );

    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toEqual({ width: 640, height: 480, contentType: "image/jpeg" });
  });

  it("parses PNG dimensions", async () => {
    const bytes = createPngBytes(800, 600);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/png"),
    );

    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toEqual({ width: 800, height: 600, contentType: "image/png" });
  });

  it("parses WebP VP8L dimensions", async () => {
    const bytes = createWebpVP8LBytes(320, 240);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/webp"),
    );

    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toEqual({ width: 320, height: 240, contentType: "image/webp" });
  });

  it("parses WebP VP8 dimensions", async () => {
    const bytes = createWebpVP8Bytes(500, 500);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/webp"),
    );

    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toEqual({ width: 500, height: 500, contentType: "image/webp" });
  });

  it("parses GIF dimensions", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(createGifBytes(320, 200), "image/gif"),
    );
    await expect(fetchImageDimensions(CDN_URL)).resolves.toEqual({
      width: 320,
      height: 200,
      contentType: "image/gif",
    });
  });

  it("returns null for non-safe redirect URL", async () => {
    const res = await fetchImageDimensions("http://192.168.1.1/test.jpg");
    expect(res).toBeNull();
  });

  it("returns null for HTTP error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toBeNull();
  });

  it("returns null for disallowed MIME type", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(new Uint8Array([1, 2, 3]), "text/html"),
    );
    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toBeNull();
  });

  it("returns null for corrupted image buffer", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(new Uint8Array([0, 0, 0]), "image/jpeg"),
    );
    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toBeNull();
  });

  it("handles fetch network failure gracefully", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network failed"));
    const res = await fetchImageDimensions(CDN_URL);
    expect(res).toBeNull();
  });
});

describe("verifyCandidates", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("verifies candidates and attaches width and height", async () => {
    const bytes = createJpegBytes(960, 960);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/jpeg"),
    );

    const candidates: ImageCandidate[] = [
      { url: CDN_URL, source: "og:image", verified: false },
    ];
    const verified = await verifyCandidates(candidates);
    expect(verified[0]!.verified).toBe(true);
    expect(verified[0]!.width).toBe(960);
    expect(verified[0]!.height).toBe(960);
  });

  it("skips non-CDN candidates and leaves them unverified", async () => {
    const candidates: ImageCandidate[] = [
      {
        url: "https://evil.com/image.jpg",
        source: "public-html",
        verified: false,
      },
    ];
    const verified = await verifyCandidates(candidates);
    expect(verified[0]!.verified).toBe(false);
  });

  it("keeps candidate unverified when dimension fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    const candidates: ImageCandidate[] = [
      { url: CDN_URL, source: "og:image", verified: false },
    ];
    const verified = await verifyCandidates(candidates);
    expect(verified[0]!.verified).toBe(false);
    expect(verified[0]!.width).toBeUndefined();
  });

  it("preserves candidates beyond verification limit", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    const candidates: ImageCandidate[] = Array.from({ length: 7 }, (_, i) => ({
      url: `${CDN_URL}&candidate=${i}`,
      source: "public-html",
      verified: false,
    }));
    const verified = await verifyCandidates(candidates);
    expect(verified).toHaveLength(7);
    expect(verified.map((candidate) => candidate.url)).toEqual(
      candidates.map((candidate) => candidate.url),
    );
  });
});

describe("downloadFacebookImage", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("downloads a validated image and returns dimensions", async () => {
    const bytes = createPngBytes(640, 480);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/png"),
    );
    const result = await downloadFacebookImage(CDN_URL);
    expect(result.data).toEqual(bytes);
    expect(result.contentType).toBe("image/png");
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it("downloads Facebook AVIF covers and returns dimensions", async () => {
    const bytes = createAvifBytes(2553, 945);
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(bytes, "image/avif"),
    );
    const result = await downloadFacebookImage(CDN_URL);
    expect(result.contentType).toBe("image/avif");
    expect(result.width).toBe(2553);
    expect(result.height).toBe(945);
  });

  it("follows safe CDN redirects", async () => {
    const redirected = `${CDN_URL}&redirected=1`;
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: redirected } }),
      )
      .mockResolvedValueOnce(
        makeStreamResponse(createJpegBytes(300, 200), "image/jpeg"),
      );
    const result = await downloadFacebookImage(CDN_URL);
    expect(result.width).toBe(300);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe URLs and invalid limits", async () => {
    await expect(
      downloadFacebookImage("https://example.com/image.jpg"),
    ).rejects.toThrow("Image download failed");
    await expect(
      downloadFacebookImage(CDN_URL, { maxBytes: 0 }),
    ).rejects.toThrow("positive integer");
    await expect(
      downloadFacebookImage(CDN_URL, { maxBytes: 1.5 }),
    ).rejects.toThrow("positive integer");
  });

  it("maps download failures and timeouts to package errors", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    await expect(downloadFacebookImage(CDN_URL)).rejects.toThrow(
      "socket closed",
    );
    await expect(downloadFacebookImage(CDN_URL)).rejects.toBeInstanceOf(Error);
  });

  it("rejects unsupported MIME types", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(new Uint8Array([1]), "text/html"),
    );
    await expect(downloadFacebookImage(CDN_URL)).rejects.toThrow(
      "Unsupported image content type",
    );
  });

  it("rejects image data that does not match its MIME type", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse(new Uint8Array([1, 2, 3]), "image/png"),
    );
    await expect(downloadFacebookImage(CDN_URL)).rejects.toThrow(
      "does not match",
    );
  });

  it("rejects declared and streamed oversized images", async () => {
    const declaredOversized = makeStreamResponse(
      createPngBytes(1, 1),
      "image/png",
    );
    declaredOversized.headers.set("content-length", "100");
    vi.mocked(fetch)
      .mockResolvedValueOnce(declaredOversized)
      .mockResolvedValueOnce(
        makeStreamResponse(createPngBytes(2, 2), "image/png"),
      );
    await expect(
      downloadFacebookImage(CDN_URL, { maxBytes: 50 }),
    ).rejects.toThrow("exceeds 50 byte limit");
    await expect(
      downloadFacebookImage(CDN_URL, { maxBytes: 10 }),
    ).rejects.toThrow("exceeds 10 byte limit");
  });
});
