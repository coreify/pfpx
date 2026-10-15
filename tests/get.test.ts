import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCoverPictureImage,
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
    expect(result.identifier).toBe("testuser");
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

  it("uses numeric profile ID as identifier when username is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)),
    );
    const result = await getProfilePicture(
      "https://www.facebook.com/profile.php?id=123456789",
      { verifyImages: false },
    );
    expect(result.identifier).toBe("123456789");
  });

  it("uses the username from the resolved profile URL", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/actual.username" },
        }),
      )
      .mockResolvedValueOnce(makeResponseStream(makeHtmlWithOg(PROFILE_IMAGE)));

    const result = await getProfilePicture(
      "https://www.facebook.com/profile.php?id=123456789",
      { verifyImages: false },
    );
    expect(result.profileUrl).toBe("https://www.facebook.com/actual.username");
    expect(result.identifier).toBe("actual.username");
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

describe("getCoverPictureImage", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("returns original landscape cover bytes", async () => {
    const coverUrl = `${CDN}/cover.jpg?cstp=mx2048x2048&ctp=s851x315`;
    const jpegBytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x70, 0x06, 0x68,
    ]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeResponseStream(
          `<img alt="Cover photo" src="${coverUrl.replaceAll("&", "&amp;")}">`,
        ),
      )
      .mockResolvedValueOnce(
        new Response(jpegBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const result = await getCoverPictureImage("testuser");
    expect(result.data).toEqual(jpegBytes);
    expect(result.width).toBe(1640);
    expect(result.height).toBe(624);
    expect(result.imageUrl).not.toContain("ctp=");
  });

  it("rejects pages without public cover data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponseStream(`<img alt="Profile photo" src="${PROFILE_IMAGE}">`),
    );

    await expect(getCoverPictureImage("testuser")).rejects.toThrow(
      NoImageFoundError,
    );
  });

  it("rejects display-sized cover images", async () => {
    const coverUrl = `${CDN}/cover.jpg?oe=abc`;
    const jpegBytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x3b, 0x03, 0x53,
    ]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeResponseStream(`<img alt="Cover photo" src="${coverUrl}">`),
      )
      .mockResolvedValueOnce(
        new Response(jpegBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );

    await expect(getCoverPictureImage("testuser")).rejects.toThrow(
      NoImageFoundError,
    );
  });
});
