import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

const COVER_URL =
  "https://scontent.xx.fbcdn.net/v/t39.99422-6/cover.jpg?cstp=mx2048x800";

function createJpegBytes(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
  ]);
}

describe("CLI cover option", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes --cover through cover lookup", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          `<script type="application/json">${JSON.stringify({ cover_photo: { image: { uri: COVER_URL } } })}</script>`,
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(createJpegBytes(2048, 800).buffer as ArrayBuffer, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const exitCode = await main(["--cover", "testuser", "--json"]);

    expect(exitCode).toBe(0);
    expect(output.join("")).toContain('"source": "cover-data"');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
