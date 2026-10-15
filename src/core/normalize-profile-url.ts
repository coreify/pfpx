import { InvalidUrlError, NotFacebookError } from "../utils/errors.js";

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
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
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

  if (url.pathname === "/profile.php") {
    const id = url.searchParams.get("id");
    for (const key of [...url.searchParams.keys()]) {
      if (key !== "id") {
        url.searchParams.delete(key);
      }
    }
    if (id) url.searchParams.set("id", id);
  } else {
    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.delete(key);
    }
  }

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
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
