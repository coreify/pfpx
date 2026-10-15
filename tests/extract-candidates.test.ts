import { describe, it, expect } from "vitest";
import {
  extractCandidates,
  extractCoverCandidates,
} from "../src/core/extract-candidates.js";

const CDN = "https://scontent.xx.fbcdn.net/v/t1.6435-1";

const withOgImage = (url: string) => `
<html>
<head>
<meta property="og:image" content="${url}" />
<meta name="twitter:image" content="${url}" />
</head>
<body></body>
</html>
`;

const withJsonLd = (imageUrl: string) => `
<html>
<head></head>
<body>
<script type="application/ld+json">
{"@type":"Person","image":{"url":"${imageUrl}"}}
</script>
</body>
</html>
`;

const loginWall = `
<html>
<head><title>Facebook - Log in or sign up</title></head>
<body><div id="loginform">Log in to Facebook</div></body>
</html>
`;

const withTwitterImage = (url: string) => `
<html>
<head>
<meta name="twitter:image" content="${url}" />
</head>
<body></body>
</html>
`;

describe("extractCandidates", () => {
  it("extracts og:image", () => {
    const url = `${CDN}/photo.jpg?_nc_oe=abc`;
    const candidates = extractCandidates(
      withOgImage(url),
      "https://www.facebook.com/user",
    );
    const og = candidates.find((c) => c.source === "og:image");
    expect(og).toBeDefined();
    expect(og!.url).toBe(url);
  });

  it("extracts twitter:image", () => {
    const url = `${CDN}/photo.jpg?_nc_oe=abc`;
    const candidates = extractCandidates(
      withTwitterImage(url),
      "https://www.facebook.com/user",
    );
    const tw = candidates.find((c) => c.source === "twitter:image");
    expect(tw).toBeDefined();
    expect(tw!.url).toBe(url);
  });

  it("deduplicates same URL from og and twitter", () => {
    const url = `${CDN}/photo.jpg?_nc_oe=abc`;
    const candidates = extractCandidates(
      withOgImage(url),
      "https://www.facebook.com/user",
    );
    const byBase = candidates.filter(
      (c) => c.url.split("?")[0] === url.split("?")[0],
    );
    expect(byBase.length).toBe(1);
  });

  it("extracts structured data image", () => {
    const url = `${CDN}/profile.jpg?oe=def`;
    const candidates = extractCandidates(
      withJsonLd(url),
      "https://www.facebook.com/user",
    );
    const sd = candidates.find((c) => c.source === "structured-data");
    expect(sd).toBeDefined();
  });

  it("ignores non-CDN URLs in og:image", () => {
    const html = `<html><head><meta property="og:image" content="https://evil.com/img.jpg"/></head></html>`;
    const candidates = extractCandidates(html, "https://www.facebook.com/user");
    expect(candidates).toHaveLength(0);
  });

  it("returns empty array for login wall page", () => {
    const candidates = extractCandidates(
      loginWall,
      "https://www.facebook.com/user",
    );
    expect(candidates).toHaveLength(0);
  });

  it("removes ctp=s480x480 to produce high resolution candidate", () => {
    const lowResUrl = `${CDN}/photo.jpg?stp=dst-jpg_tt6&cstp=mx2048x2048&ctp=s480x480&oe=abc`;
    const html = `<html><head><meta property="og:image" content="${lowResUrl}"/></head></html>`;
    const candidates = extractCandidates(html, "https://www.facebook.com/user");

    expect(candidates.length).toBe(2);
    expect(candidates[0]!.url).not.toContain("ctp=s480x480");
    expect(candidates[0]!.url).toContain("cstp=mx2048x2048");
    expect(candidates[1]!.url).toContain("ctp=s480x480");
  });
});

describe("extractCoverCandidates", () => {
  it("extracts a cover image and prefers the ctp-free URL", () => {
    const url = `${CDN}/cover.jpg?cstp=mx2048x2048&ctp=s851x315&oe=abc`;
    const candidates = extractCoverCandidates(
      `<img alt="Cover photo" src="${url.replaceAll("&", "&amp;")}">`,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.source).toBe("cover-html");
    expect(candidates[0]!.url).not.toContain("ctp=");
    expect(candidates[1]!.url).toContain("ctp=s851x315");
  });

  it("extracts cover data from JSON scripts", () => {
    const url = `${CDN}/cover.jpg?oe=abc`;
    const candidates = extractCoverCandidates(
      `<script type="application/json">${JSON.stringify({ cover_photo: { image: { uri: url } } })}</script>`,
    );

    expect(candidates).toContainEqual({
      url,
      source: "cover-data",
      verified: false,
    });
  });

  it("extracts escaped cover URLs from JavaScript payloads", () => {
    const url = `${CDN}/cover.jpg?oe=abc`;
    const escaped = url.replaceAll("/", "\\/");
    const candidates = extractCoverCandidates(
      `<script>requireLazy({"cover_photo":{"uri":"${escaped}"}});</script>`,
    );

    expect(candidates.some((candidate) => candidate.url === url)).toBe(true);
  });

  it("does not confuse an ordinary image with a cover", () => {
    const url = `${CDN}/profile.jpg?oe=abc`;
    expect(
      extractCoverCandidates(`<img alt="Profile photo" src="${url}">`),
    ).toHaveLength(0);
  });
});
