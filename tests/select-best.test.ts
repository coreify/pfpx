import { describe, it, expect } from "vitest";
import { selectBest } from "../src/core/select-best.js";
import type { ImageCandidate } from "../src/core/types.js";

const cdn = "https://scontent.xx.fbcdn.net/v/t1.6435-1";

describe("selectBest", () => {
  it("returns null for empty array", () => {
    expect(selectBest([])).toBeNull();
  });

  it("prefers verified over unverified", () => {
    const candidates: ImageCandidate[] = [
      { url: `${cdn}/a.jpg`, source: "og:image", verified: false },
      {
        url: `${cdn}/b.jpg`,
        source: "og:image",
        verified: true,
        width: 200,
        height: 200,
      },
    ];
    expect(selectBest(candidates)!.url).toContain("b.jpg");
  });

  it("prefers larger pixel count among verified", () => {
    const candidates: ImageCandidate[] = [
      {
        url: `${cdn}/small.jpg`,
        source: "og:image",
        verified: true,
        width: 100,
        height: 100,
      },
      {
        url: `${cdn}/large.jpg`,
        source: "og:image",
        verified: true,
        width: 480,
        height: 480,
      },
    ];
    expect(selectBest(candidates)!.url).toContain("large.jpg");
  });

  it("prefers og:image over public-html when pixels equal", () => {
    const candidates: ImageCandidate[] = [
      {
        url: `${cdn}/html.jpg`,
        source: "public-html",
        verified: true,
        width: 100,
        height: 100,
      },
      {
        url: `${cdn}/og.jpg`,
        source: "og:image",
        verified: true,
        width: 100,
        height: 100,
      },
    ];
    expect(selectBest(candidates)!.source).toBe("og:image");
  });

  it("prefers og:image over public-html even if public-html has larger pixels", () => {
    const candidates: ImageCandidate[] = [
      {
        url: `${cdn}/friend_larger.jpg`,
        source: "public-html",
        verified: true,
        width: 960,
        height: 960,
      },
      {
        url: `${cdn}/user_actual_profile.jpg`,
        source: "og:image",
        verified: true,
        width: 821,
        height: 825,
      },
    ];
    expect(selectBest(candidates)!.url).toContain("user_actual_profile.jpg");
  });

  it("returns single candidate", () => {
    const candidates: ImageCandidate[] = [
      { url: `${cdn}/only.jpg`, source: "og:image", verified: false },
    ];
    expect(selectBest(candidates)!.url).toContain("only.jpg");
  });
});
