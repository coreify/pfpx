import { describe, it, expect } from "vitest";
import {
  normalizeProfileUrl,
  normalizeProfileInput,
  isFacebookHost,
  isAllowedProfileHost,
  isSafeFacebookCdnUrl,
} from "../src/core/normalize-profile-url.js";
import {
  InvalidUrlError,
  NotFacebookError,
  UnsupportedUrlError,
} from "../src/utils/errors.js";

describe("normalizeProfileUrl", () => {
  it("normalizes www.facebook.com username URL", () => {
    const result = normalizeProfileUrl("https://www.facebook.com/example.user");
    expect(result).toBe("https://www.facebook.com/example.user");
  });

  it("normalizes m.facebook.com URL", () => {
    const result = normalizeProfileUrl("https://m.facebook.com/example.user");
    expect(result).toBe("https://www.facebook.com/example.user");
  });

  it("normalizes web.facebook.com URL and strips comment_id query params", () => {
    const result = normalizeProfileUrl(
      "https://web.facebook.com/jannatul.ferdows.0918?comment_id=Y29tbWVudDoxNDQ4ODk2NTk5NTI5MzA1Xzc5OTQ2ODgxNjIyNzYzMQ%3D%3D",
    );
    expect(result).toBe("https://www.facebook.com/jannatul.ferdows.0918");
  });

  it("normalizes facebook.com without subdomain", () => {
    const result = normalizeProfileUrl("https://facebook.com/example.user");
    expect(result).toBe("https://www.facebook.com/example.user");
  });

  it("normalizes profile.php?id=123 URL and preserves id", () => {
    const result = normalizeProfileUrl(
      "https://www.facebook.com/profile.php?id=100012345678&sk=photos",
    );
    expect(result).toBe("https://www.facebook.com/profile.php?id=100012345678");
  });

  it("adds https:// scheme if missing", () => {
    const result = normalizeProfileUrl("www.facebook.com/example.user");
    expect(result).toBe("https://www.facebook.com/example.user");
  });

  it("strips tracking params from profile.php URL", () => {
    const result = normalizeProfileUrl(
      "https://www.facebook.com/profile.php?id=123&mibextid=xyz",
    );
    expect(result).toBe("https://www.facebook.com/profile.php?id=123");
  });

  it("strips trailing slash", () => {
    const result = normalizeProfileUrl("https://www.facebook.com/user/");
    expect(result).not.toMatch(/\/$/);
  });

  it("normalizes friends suggestions with profile_id param", () => {
    const result = normalizeProfileUrl(
      "https://www.facebook.com/friends/suggestions/?profile_id=61567168861894",
    );
    expect(result).toBe(
      "https://www.facebook.com/profile.php?id=61567168861894",
    );
  });

  it("normalizes /people/name/id format", () => {
    const result = normalizeProfileUrl(
      "https://www.facebook.com/people/Jannatul-Ferdows/61567168861894/",
    );
    expect(result).toBe(
      "https://www.facebook.com/profile.php?id=61567168861894",
    );
  });

  it("normalizes /p/name-id and /p/id formats", () => {
    expect(
      normalizeProfileUrl(
        "https://www.facebook.com/p/Jannatul-Ferdows-61567168861894/",
      ),
    ).toBe("https://www.facebook.com/profile.php?id=61567168861894");

    expect(
      normalizeProfileUrl("https://www.facebook.com/p/61567168861894/"),
    ).toBe("https://www.facebook.com/profile.php?id=61567168861894");
  });

  it("strips vanity profile tabs like /about and /photos", () => {
    expect(normalizeProfileUrl("https://www.facebook.com/zuck/about")).toBe(
      "https://www.facebook.com/zuck",
    );
    expect(normalizeProfileUrl("https://www.facebook.com/zuck/photos")).toBe(
      "https://www.facebook.com/zuck",
    );
  });

  it("throws UnsupportedUrlError for non-profile URLs", () => {
    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/groups/reactjs"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/watch/?v=12345678"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/reel/12345678"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/photo.php?fbid=12345"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/photo.php?id=12345"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/events/12345"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/marketplace/item/12345"),
    ).toThrow(UnsupportedUrlError);

    expect(() =>
      normalizeProfileUrl("https://www.facebook.com/friends/suggestions/"),
    ).toThrow(UnsupportedUrlError);
  });

  it("throws InvalidUrlError for garbage input", () => {
    expect(() => normalizeProfileUrl("not a url at all !!!")).toThrow(
      InvalidUrlError,
    );
  });

  it("throws NotFacebookError for non-Facebook domain", () => {
    expect(() => normalizeProfileUrl("https://twitter.com/user")).toThrow(
      NotFacebookError,
    );
  });

  it("throws InvalidUrlError for deceptive domain", () => {
    expect(() =>
      normalizeProfileUrl("https://facebook.com.attacker.example/user"),
    ).toThrow(NotFacebookError);
  });

  it("throws InvalidUrlError for localhost", () => {
    expect(() => normalizeProfileUrl("https://localhost/user")).toThrow(
      InvalidUrlError,
    );
  });

  it("throws InvalidUrlError for private IP", () => {
    expect(() => normalizeProfileUrl("https://192.168.1.1/user")).toThrow(
      InvalidUrlError,
    );
  });
});

describe("normalizeProfileInput", () => {
  it("accepts a bare username", () => {
    expect(normalizeProfileInput("@zuck")).toBe(
      "https://www.facebook.com/zuck",
    );
  });

  it("extracts a Facebook URL from surrounding text", () => {
    expect(
      normalizeProfileInput(
        "Please fetch https://m.facebook.com/zuck/photos, thanks",
      ),
    ).toBe("https://www.facebook.com/zuck");
  });

  it("removes credentials and custom ports", () => {
    expect(
      normalizeProfileInput("https://user:pass@facebook.com:8443/zuck"),
    ).toBe("https://www.facebook.com/zuck");
  });
});

describe("isFacebookHost", () => {
  it("accepts www.facebook.com", () => {
    expect(isFacebookHost("www.facebook.com")).toBe(true);
  });

  it("accepts m.facebook.com", () => {
    expect(isFacebookHost("m.facebook.com")).toBe(true);
  });

  it("rejects facebook.com.evil.example", () => {
    expect(isFacebookHost("facebook.com.evil.example")).toBe(false);
  });

  it("rejects twitter.com", () => {
    expect(isFacebookHost("twitter.com")).toBe(false);
  });
});

describe("isAllowedProfileHost", () => {
  it("accepts Facebook", () => {
    expect(isAllowedProfileHost("www.facebook.com")).toBe(true);
  });

  it("rejects other hosts", () => {
    expect(isAllowedProfileHost("twitter.com")).toBe(false);
    expect(isAllowedProfileHost("instagram.com")).toBe(false);
  });
});

describe("isSafeFacebookCdnUrl", () => {
  it("accepts fbcdn.net URL", () => {
    expect(
      isSafeFacebookCdnUrl("https://scontent.xx.fbcdn.net/v/img.jpg?oe=abc"),
    ).toBe(true);
  });

  it("accepts fbsbx.com URL", () => {
    expect(
      isSafeFacebookCdnUrl(
        "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=123",
      ),
    ).toBe(true);
  });

  it("rejects http:// URL", () => {
    expect(isSafeFacebookCdnUrl("http://scontent.xx.fbcdn.net/v/img.jpg")).toBe(
      false,
    );
  });

  it("rejects non-CDN URL", () => {
    expect(isSafeFacebookCdnUrl("https://evil.example.com/img.jpg")).toBe(
      false,
    );
  });

  it("rejects private IP CDN URL", () => {
    expect(isSafeFacebookCdnUrl("https://192.168.1.1/img.jpg")).toBe(false);
  });
});
