export type ImageSource =
  "og:image" | "twitter:image" | "structured-data" | "public-html";

export interface ImageCandidate {
  url: string;
  source: ImageSource;
  width?: number | undefined;
  height?: number | undefined;
  verified: boolean;
}

export interface ProfileImageResult {
  inputUrl: string;
  profileUrl: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  source: ImageSource | null;
  candidates?: ImageCandidate[] | undefined;
  warning?: string | undefined;
}

export interface GetProfilePictureOptions {
  timeoutMs?: number | undefined;
  verbose?: boolean | undefined;
  verifyImages?: boolean | undefined;
}

export interface ErrorResult {
  error: string;
  code: string;
  inputUrl?: string | undefined;
}

export type JsonOutput = ProfileImageResult | ErrorResult;

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_URL: 2,
  NOT_FACEBOOK: 3,
  NO_IMAGE_FOUND: 4,
  NETWORK_ERROR: 5,
  TIMEOUT: 6,
  RATE_LIMITED: 7,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
