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

describe("advanced CLI", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns one JSON document and partial results with --both", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(
        new Response(
          '<meta property="og:title" content="Public name"><meta property="og:image" content="https://scontent.xx.fbcdn.net/avatar.jpg">',
        ),
      );
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    expect(await main(["testuser", "--both", "--no-verify", "--json"])).toBe(0);
    const result = JSON.parse(output) as {
      profile: unknown;
      cover: unknown;
      metadata: { name: string };
    };
    expect(result.profile).not.toBeNull();
    expect(result.cover).toBeNull();
    expect(result.metadata.name).toBe("Public name");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("prints details on stderr while stdout retains the image URL", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(
        new Response(
          '<meta property="og:title" content="Public name"><meta property="og:description" content="Public bio"><meta property="og:image" content="https://scontent.xx.fbcdn.net/avatar.jpg">',
        ),
      );
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["testuser", "--info", "--no-verify"])).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      "https://scontent.xx.fbcdn.net/avatar.jpg",
    );
    expect(stderr.mock.calls.flat().join("")).toContain("Public bio");
  });

  it.each(["100oops", "1.5", "0", "2147483648"])(
    "rejects invalid timeout %s before fetching",
    async (timeout) => {
      vi.mocked(fetch).mockReset();
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      expect(await main(["testuser", "--timeout", timeout])).toBe(1);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects conflicting image modes", async () => {
    vi.mocked(fetch).mockReset();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["testuser", "--both", "--cover"])).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a nonzero status if neither image exists", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(new Response("<title>Empty profile</title>"));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await main(["testuser", "--both", "--json"])).toBe(4);
  });
});
