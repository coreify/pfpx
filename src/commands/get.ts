import { normalizeProfileUrl } from "../core/normalize-profile-url.js";
import { fetchPublicPage } from "../core/fetch-public-page.js";
import { extractCandidates } from "../core/extract-candidates.js";
import { verifyCandidates } from "../core/verify-image.js";
import { selectBest } from "../core/select-best.js";
import { NoImageFoundError, NetworkError } from "../utils/errors.js";
import type {
  ProfileImageResult,
  GetProfilePictureOptions,
} from "../core/types.js";

export type {
  ProfileImageResult,
  GetProfilePictureOptions,
} from "../core/types.js";

function detectLoginWall(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("log in to facebook") ||
    lower.includes("you must log in") ||
    lower.includes('id="loginform"') ||
    lower.includes('name="login"') ||
    (lower.includes("log in") &&
      lower.includes("create new account") &&
      html.length < 50_000)
  );
}

export async function getProfilePicture(
  rawUrl: string,
  options: GetProfilePictureOptions = {},
): Promise<ProfileImageResult> {
  const profileUrl = normalizeProfileUrl(rawUrl);
  const { timeoutMs, verbose, verifyImages = true } = options;

  const fetchOptions = { timeoutMs, verbose };

  let html: string;
  let finalUrl: string;
  try {
    const result = await fetchPublicPage(profileUrl, fetchOptions);
    html = result.html;
    finalUrl = result.finalUrl;
  } catch (err: unknown) {
    if (err instanceof Error) throw err;
    throw new NetworkError(String(err));
  }

  if (detectLoginWall(html)) {
    throw new NoImageFoundError(
      "Facebook returned a login page. The profile may require authentication to view.",
    );
  }

  let candidates = extractCandidates(html, finalUrl, { verbose });

  if (candidates.length === 0) {
    throw new NoImageFoundError(
      "No publicly accessible profile picture found. The profile may be locked or have no public photo.",
    );
  }

  if (verifyImages) {
    candidates = await verifyCandidates(candidates, fetchOptions);
  }

  const best = selectBest(candidates);
  if (!best) {
    throw new NoImageFoundError(
      "Could not select a valid profile picture from available candidates.",
    );
  }

  const warnings: string[] = [];
  if (!best.verified) {
    warnings.push(
      "Image dimensions could not be verified. URL may or may not be accessible.",
    );
  }
  warnings.push(
    "Facebook CDN URLs expire. Fetch again if the URL stops working.",
  );

  return {
    inputUrl: rawUrl,
    profileUrl: finalUrl,
    imageUrl: best.url,
    width: best.width ?? null,
    height: best.height ?? null,
    source: best.source,
    candidates,
    warning: warnings.join(" "),
  };
}
