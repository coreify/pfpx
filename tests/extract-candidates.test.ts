import { describe, it, expect } from "vitest";
import { extractCandidates } from "../src/core/extract-candidates.js";

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
