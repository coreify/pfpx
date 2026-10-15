import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProfilePicture,
  getProfilePictureImage,
} from "../src/commands/get.js";
import { NoImageFoundError } from "../src/utils/errors.js";

const CDN = "https://scontent.xx.fbcdn.net/v/t1.6435-1";
const PROFILE_IMAGE = `${CDN}/profile_pic.jpg?oe=abc`;

function makeHtmlWithOg(imageUrl: string): string {
  return `<html>
<head>
  <meta property="og:image" content="${imageUrl}" />
</head>
<body><div>Public profile</div></body>
</html>`;
}

function makeLoginWall(): string {
  return `<html>
<head><title>Facebook</title></head>
<body>Log in to Facebook<div id="loginform"></div></body>
</html>`;
}

function makeResponseStream(body: string, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/html" },
  });
}

describe("getProfilePicture", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("returns profile picture for public profile with og:image", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)))
      .mockResolvedValue(new Response(null, { status: 404 }));

    const result = await getProfilePicture(
      "https://www.facebook.com/testuser",
      { verifyImages: false },
    );
    expect(result.imageUrl).toBe(PROFILE_IMAGE);
    expect(result.source).toBe("og:image");
    expect(result.warning).toContain("Facebook CDN URLs expire.");
  });

  it("throws NoImageFoundError for login wall page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponseStream(makeLoginWall()));
    await expect(
      getProfilePicture("https://www.facebook.com/lockeduser", {
        verifyImages: false,
      }),
    ).rejects.toThrow(NoImageFoundError);
  });

  it("throws NoImageFoundError when no image in HTML", async () => {
    const emptyHtml = "<html><head></head><body>No photos here</body></html>";
    vi.mocked(fetch).mockResolvedValueOnce(makeResponseStream(emptyHtml));
    await expect(
      getProfilePicture("https://www.facebook.com/user", {
        verifyImages: false,
      }),
    ).rejects.toThrow(NoImageFoundError);
  });

  it("throws for invalid URL", async () => {
    await expect(getProfilePicture("not-a-url")).rejects.toThrow();
  });

  it("throws for non-Facebook URL", async () => {
    await expect(
      getProfilePicture("https://twitter.com/user"),
    ).rejects.toThrow();
  });

  it("sets inputUrl and profileUrl correctly", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)))
      .mockResolvedValue(new Response(null, { status: 404 }));

    const result = await getProfilePicture(
      "https://www.facebook.com/testuser?mibextid=abc",
      {
        verifyImages: false,
      },
    );
    expect(result.inputUrl).toBe(
      "https://www.facebook.com/testuser?mibextid=abc",
    );
    expect(result.profileUrl).not.toContain("mibextid");
  });

  it("includes warning about CDN expiry", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)))
      .mockResolvedValue(new Response(null, { status: 404 }));

    const result = await getProfilePicture("https://www.facebook.com/user", {
      verifyImages: false,
    });
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("expire");
  });

  it("verifies dimensions when verifyImages is true", async () => {
    const jpegBytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x01, 0x90,
    ]);
    const imageStream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(jpegBytes);
        c.close();
      },
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)))
      .mockResolvedValueOnce(
        new Response(imageStream, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const result = await getProfilePicture("https://www.facebook.com/user", {
      verifyImages: true,
      verbose: true,
    });
    expect(result.width).toBe(400);
    expect(result.height).toBe(400);
    expect(result.candidates?.[0]?.verified).toBe(true);
  });
});

describe("getProfilePictureImage", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("accepts username input and returns downloaded bytes", async () => {
    const jpegBytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x01, 0x90,
    ]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)))
      .mockResolvedValueOnce(
        new Response(jpegBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const result = await getProfilePictureImage("testuser");
    expect(result.profileUrl).toBe("https://www.facebook.com/testuser");
    expect(result.data).toEqual(jpegBytes);
    expect(result.width).toBe(400);
    expect(result.height).toBe(400);
    expect(result.contentType).toBe("image/jpeg");
  });
});
