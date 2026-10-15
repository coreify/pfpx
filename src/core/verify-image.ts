import { fetchImageDimensions } from "./fetch-public-page.js";
import type { FetchPublicPageOptions } from "./fetch-public-page.js";
import type { ImageCandidate } from "./types.js";
import { isSafeFacebookCdnUrl } from "./normalize-profile-url.js";

const MAX_VERIFY_CANDIDATES = 5;

export async function verifyCandidates(
  candidates: ImageCandidate[],
  options: FetchPublicPageOptions = {},
): Promise<ImageCandidate[]> {
  const toVerify = candidates.slice(0, MAX_VERIFY_CANDIDATES);
  const verified = await Promise.all(
    toVerify.map(async (candidate): Promise<ImageCandidate> => {
      if (!isSafeFacebookCdnUrl(candidate.url)) {
        return candidate;
      }
      const dims = await fetchImageDimensions(candidate.url, options);
      if (dims) {
        return {
          ...candidate,
          width: dims.width,
          height: dims.height,
          verified: true,
        };
      }
      return candidate;
    }),
  );

  return [...verified, ...candidates.slice(MAX_VERIFY_CANDIDATES)];
}
