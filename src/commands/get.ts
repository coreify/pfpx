import {
  getProfileIdentifier,
  normalizeProfileInput,
} from "../core/normalize-profile-url.js";
import {
  downloadFacebookImage,
  fetchPublicPage,
} from "../core/fetch-public-page.js";
import {
  extractCandidates,
  extractCoverCandidates,
} from "../core/extract-candidates.js";
import { verifyCandidates } from "../core/verify-image.js";
import { selectBest } from "../core/select-best.js";
import { NoImageFoundError, NetworkError } from "../utils/errors.js";
import type {
  ProfileImageResult,
  GetProfilePictureOptions,
  GetProfilePictureImageOptions,
  ProfileImageDownloadResult,
} from "../core/types.js";

const MIN_HIGH_QUALITY_COVER_WIDTH = 1_200;
const MIN_HIGH_QUALITY_COVER_HEIGHT = 400;

export type {
  ProfileImageResult,
  GetProfilePictureOptions,
  GetProfilePictureImageOptions,
  ProfileImageDownloadResult,
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
  const profileUrl = normalizeProfileInput(rawUrl);
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
    identifier: getProfileIdentifier(finalUrl),
    imageUrl: best.url,
    width: best.width ?? null,
    height: best.height ?? null,
    source: best.source,
    candidates,
    warning: warnings.join(" "),
  };
}

export async function getProfilePictureImage(
  rawInput: string,
  options: GetProfilePictureImageOptions = {},
): Promise<ProfileImageDownloadResult> {
  const result = await getProfilePicture(rawInput, {
    timeoutMs: options.timeoutMs,
    verbose: options.verbose,
    verifyImages: false,
  });

  const remaining = [...(result.candidates ?? [])];
  let lastError: unknown;
  for (let attempt = 0; attempt < 5 && remaining.length > 0; attempt++) {
    const candidate = selectBest(remaining);
    if (!candidate) break;
    try {
      const image = await downloadFacebookImage(candidate.url, {
        timeoutMs: options.timeoutMs,
        verbose: options.verbose,
        maxBytes: options.maxBytes,
      });
      return {
        ...result,
        imageUrl: candidate.url,
        width: image.width,
        height: image.height,
        source: candidate.source,
        data: image.data,
        contentType: image.contentType,
      };
    } catch (error: unknown) {
      lastError = error;
      const index = remaining.indexOf(candidate);
      if (index >= 0) remaining.splice(index, 1);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new NoImageFoundError("No downloadable profile picture found.");
}

export async function getCoverPictureImage(
  rawInput: string,
  options: GetProfilePictureImageOptions = {},
): Promise<ProfileImageDownloadResult> {
  const profileUrl = normalizeProfileInput(rawInput);
  const { html, finalUrl } = await fetchPublicPage(profileUrl, {
    timeoutMs: options.timeoutMs,
    verbose: options.verbose,
  });

  if (detectLoginWall(html)) {
    throw new NoImageFoundError(
      "Facebook returned a login page. The cover may require authentication to view.",
    );
  }

  const candidates = extractCoverCandidates(html, {
    verbose: options.verbose,
  });
  let lastError: unknown;
  for (const candidate of candidates.slice(0, 5)) {
    try {
      const image = await downloadFacebookImage(candidate.url, {
        timeoutMs: options.timeoutMs,
        verbose: options.verbose,
        maxBytes: options.maxBytes,
      });
      if (
        image.width / image.height < 1.3 ||
        image.width < MIN_HIGH_QUALITY_COVER_WIDTH ||
        image.height < MIN_HIGH_QUALITY_COVER_HEIGHT
      ) {
        continue;
      }

      return {
        inputUrl: rawInput,
        profileUrl: finalUrl,
        identifier: getProfileIdentifier(finalUrl),
        imageUrl: candidate.url,
        width: image.width,
        height: image.height,
        source: candidate.source,
        candidates,
        warning:
          "Facebook CDN URLs expire. Fetch again if the URL stops working.",
        data: image.data,
        contentType: image.contentType,
      };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  if (candidates.length > 0 && lastError instanceof Error) throw lastError;
  throw new NoImageFoundError("No downloadable public cover picture found.");
}
