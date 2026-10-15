import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPublicPage } from "../src/core/fetch-public-page.js";
import {
  NetworkError,
  TimeoutError,
  RateLimitedError,
} from "../src/utils/errors.js";

function makeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/html", ...headers },
  });
}

function makeRedirect(status: number, location: string): Response {
  return new Response(null, {
    status,
    headers: { location },
  });
}

describe("fetchPublicPage", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("returns HTML for 200 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, "<html>ok</html>"),
    );
    const result = await fetchPublicPage("https://www.facebook.com/user");
    expect(result.html).toContain("ok");
    expect(result.status).toBe(200);
  });

  it("follows redirect to safe URL", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeRedirect(301, "https://www.facebook.com/user2"),
      )
      .mockResolvedValueOnce(makeResponse(200, "<html>redirected</html>"));
    const result = await fetchPublicPage("https://www.facebook.com/user");
    expect(result.html).toContain("redirected");
  });

  it("throws NetworkError for unsafe redirect to private IP", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeRedirect(301, "http://192.168.1.1/steal"),
    );
    await expect(
      fetchPublicPage("https://www.facebook.com/user"),
    ).rejects.toThrow(NetworkError);
  });

  it("throws RateLimitedError on 429", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(429, "Rate limited"));
    await expect(
      fetchPublicPage("https://www.facebook.com/user"),
    ).rejects.toThrow(RateLimitedError);
  });

  it("throws NetworkError on 403", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(403, "Forbidden"));
    await expect(
      fetchPublicPage("https://www.facebook.com/user"),
    ).rejects.toThrow(NetworkError);
  });

  it("throws NetworkError on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(404, "Not Found"));
    await expect(
      fetchPublicPage("https://www.facebook.com/user"),
    ).rejects.toThrow(NetworkError);
  });

  it("throws TimeoutError when fetch aborts", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => {
      const err = new DOMException("Aborted", "AbortError");
      return Promise.reject(err);
    });
    await expect(
      fetchPublicPage("https://www.facebook.com/user", { timeoutMs: 100 }),
    ).rejects.toThrow(TimeoutError);
  });

  it("throws NetworkError when redirect has no location", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 301 }));
    await expect(
      fetchPublicPage("https://www.facebook.com/user"),
    ).rejects.toThrow(NetworkError);
  });

  it("throws NetworkError after too many redirects", async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeRedirect(301, "https://www.facebook.com/loop"),
    );
    await expect(
      fetchPublicPage("https://www.facebook.com/loop"),
    ).rejects.toThrow(NetworkError);
  });
});
