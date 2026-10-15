import { fetchImageDimensions } from "./fetch-public-page.js";
import type { FetchPublicPageOptions } from "./fetch-public-page.js";
import type { ImageCandidate } from "./types.js";
import { isSafeFacebookCdnUrl } from "./normalize-profile-url.js";

const MAX_VERIFY_CANDIDATES = 5;

export async function verifyCandidates(
  candidates: ImageCandidate[],
  options: FetchPublicPageOptions = {},
): Promise<ImageCandidate[]> {
  const verified: ImageCandidate[] = [];
  const toVerify = candidates.slice(0, MAX_VERIFY_CANDIDATES);

  await Promise.all(
    toVerify.map(async (candidate) => {
      if (!isSafeFacebookCdnUrl(candidate.url)) {
        verified.push(candidate);
        return;
      }
      const dims = await fetchImageDimensions(candidate.url, options);
      if (dims) {
        verified.push({
          ...candidate,
          width: dims.width,
          height: dims.height,
          verified: true,
        });
      } else {
        verified.push(candidate);
      }
    }),
  );

  const urlToVerified = new Map(verified.map((c) => [c.url, c]));
  return toVerify.map((c) => urlToVerified.get(c.url) ?? c);
}
