import {
  InvalidUrlError,
  NotFacebookError,
  UnsupportedUrlError,
} from "../utils/errors.js";

const ALLOWED_FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "touch.facebook.com",
  "fb.com",
  "www.fb.com",
]);

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^0\./,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fe[89ab][0-9a-f]:/i,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((p) => p.test(hostname));
}

export function isFacebookHost(hostname: string): boolean {
  if (ALLOWED_FACEBOOK_HOSTS.has(hostname)) return true;
  return /^[a-z]{2}(-[a-z]{2})?\.facebook\.com$/.test(hostname);
}

export function isAllowedProfileHost(hostname: string): boolean {
  return isFacebookHost(hostname);
}

const PROFILE_SUBTABS = new Set([
  "about",
  "photos",
  "photos_albums",
  "photos_by",
  "friends",
  "followers",
  "following",
  "reels",
  "videos",
  "map",
  "reviews",
  "mentions",
  "sports",
  "music",
  "movies",
  "books",
]);

export function normalizeProfileUrl(raw: string): string {
  let input = raw.trim();
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    input = "https://" + input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InvalidUrlError(`Cannot parse URL: ${raw}`);
  }

  if (isPrivateHost(url.hostname)) {
    throw new InvalidUrlError(
      `Private/local host not allowed: ${url.hostname}`,
    );
  }

  if (!isAllowedProfileHost(url.hostname)) {
    throw new NotFacebookError(raw);
  }

  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.port = "";
  url.hash = "";

  if (
    url.hostname === "m.facebook.com" ||
    url.hostname === "touch.facebook.com" ||
    url.hostname === "web.facebook.com" ||
    url.hostname === "facebook.com" ||
    url.hostname === "fb.com" ||
    url.hostname === "www.fb.com"
  ) {
    url.hostname = "www.facebook.com";
  }

  const profileId = url.searchParams.get("profile_id");
  if (profileId && /^\d+$/.test(profileId)) {
    return `https://www.facebook.com/profile.php?id=${profileId}`;
  }

  const idParam = url.searchParams.get("id");
  if (
    url.pathname.replace(/\/+$/, "").toLowerCase() === "/profile.php" &&
    idParam &&
    /^\d+$/.test(idParam)
  ) {
    return `https://www.facebook.com/profile.php?id=${idParam}`;
  }

  const rawPath = url.pathname.replace(/\/+$/, "");

  const peopleMatch = rawPath.match(/^\/people\/[^/]+\/(\d+)$/);
  if (peopleMatch && peopleMatch[1]) {
    return `https://www.facebook.com/profile.php?id=${peopleMatch[1]}`;
  }

  const pMatch = rawPath.match(/^\/p\/(?:[a-zA-Z0-9.-]+-)?(\d+)$/);
  if (pMatch && pMatch[1]) {
    return `https://www.facebook.com/profile.php?id=${pMatch[1]}`;
  }

  const userMatch = rawPath.match(/^\/(?:user|profile)\/(\d+)$/);
  if (userMatch && userMatch[1]) {
    return `https://www.facebook.com/profile.php?id=${userMatch[1]}`;
  }

  const segments = rawPath.split("/").filter(Boolean);
  const first = (segments[0] || "").toLowerCase();
  const second = (segments[1] || "").toLowerCase();

  if (first === "share") {
    if (second === "p")
      throw new UnsupportedUrlError(
        raw,
        "post",
        "This link is a Facebook post, not a profile.",
      );
    if (second === "r")
      throw new UnsupportedUrlError(
        raw,
        "reel",
        "This link is a Facebook reel, not a profile.",
      );
    if (second === "v")
      throw new UnsupportedUrlError(
        raw,
        "video",
        "This link is a Facebook video, not a profile.",
      );
    throw new UnsupportedUrlError(
      raw,
      "share",
      "This link is a generic Facebook share link.",
    );
  }

  if (
    first === "posts" ||
    first === "story.php" ||
    first === "permalink.php" ||
    second === "posts" ||
    second === "activity"
  ) {
    throw new UnsupportedUrlError(
      raw,
      "post",
      "This link is a Facebook post, not a profile.",
    );
  }

  if (first === "photo.php" || first === "photo") {
    throw new UnsupportedUrlError(
      raw,
      "photo",
      "This link is a Facebook photo, not a profile.",
    );
  }

  if (
    first === "watch" ||
    first === "reel" ||
    first === "reels" ||
    (segments.length >= 3 && second === "videos")
  ) {
    throw new UnsupportedUrlError(
      raw,
      "video",
      "This link is a Facebook video or reel, not a profile.",
    );
  }

  if (first === "groups" || first === "group") {
    throw new UnsupportedUrlError(
      raw,
      "group",
      "This link is a Facebook group, not a profile.",
    );
  }

  if (first === "events" || first === "event") {
    throw new UnsupportedUrlError(
      raw,
      "event",
      "This link is a Facebook event, not a profile.",
    );
  }

  if (first === "marketplace") {
    throw new UnsupportedUrlError(
      raw,
      "marketplace",
      "This link is a Marketplace listing, not a profile.",
    );
  }

  if (first === "gaming") {
    throw new UnsupportedUrlError(
      raw,
      "gaming",
      "This link is a Facebook Gaming page, not a profile.",
    );
  }

  if (first === "fundraisers") {
    throw new UnsupportedUrlError(
      raw,
      "fundraiser",
      "This link is a Facebook fundraiser, not a profile.",
    );
  }

  const sysPages = new Set([
    "friends",
    "notifications",
    "settings",
    "messages",
    "saved",
    "login",
    "recover",
    "help",
    "search",
    "policies",
    "terms",
    "privacy",
    "ads",
    "business",
  ]);
  if (sysPages.has(first)) {
    throw new UnsupportedUrlError(
      raw,
      "navigation",
      `This is a Facebook ${first} page, not a profile.`,
    );
  }

  if (
    segments.length >= 2 &&
    (PROFILE_SUBTABS.has(second) || second.startsWith("about_"))
  ) {
    return `https://www.facebook.com/${segments[0]}`;
  }

  for (const key of [...url.searchParams.keys()]) {
    url.searchParams.delete(key);
  }

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

const FACEBOOK_URL_IN_TEXT =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)?(?:facebook\.com|fb\.com)\/[^\s<>"']+/i;
const FACEBOOK_USERNAME = /^@?([a-zA-Z0-9.]{3,50})$/;

export function normalizeProfileInput(raw: string): string {
  const input = raw.trim();
  const username = input.match(FACEBOOK_USERNAME)?.[1];
  if (username) {
    return `https://www.facebook.com/${username}`;
  }

  const matchedUrl = input.match(FACEBOOK_URL_IN_TEXT)?.[0];
  if (matchedUrl) {
    const withoutTrailingPunctuation = matchedUrl.replace(/[),.;!?]+$/, "");
    return normalizeProfileUrl(withoutTrailingPunctuation);
  }

  return normalizeProfileUrl(input);
}

export function getProfileIdentifier(profileUrl: string): string {
  const url = new URL(profileUrl);
  const username = url.pathname.split("/").filter(Boolean)[0];
  if (
    username?.toLowerCase() !== "profile.php" &&
    username &&
    /^[a-zA-Z0-9.]{3,50}$/.test(username)
  ) {
    return username;
  }

  const id = url.searchParams.get("id");
  if (id && /^\d+$/.test(id)) return id;

  return "facebook-profile";
}

export function isSafeFacebookCdnUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (isPrivateHost(url.hostname)) return false;
  return (
    url.hostname.endsWith(".fbcdn.net") ||
    url.hostname.endsWith(".facebook.com") ||
    url.hostname.endsWith(".fbsbx.com")
  );
}
