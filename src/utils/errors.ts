export class PfpxError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PfpxError";
  }
}

export class InvalidUrlError extends PfpxError {
  constructor(message: string) {
    super(message, "INVALID_URL");
    this.name = "InvalidUrlError";
  }
}

export class NotFacebookError extends PfpxError {
  constructor(url: string) {
    super(`Not a Facebook URL: ${url}`, "NOT_FACEBOOK");
    this.name = "NotFacebookError";
  }
}

export class NetworkError extends PfpxError {
  constructor(message: string) {
    super(message, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}

export class TimeoutError extends PfpxError {
  constructor(url: string) {
    super(`Request timed out: ${url}`, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export class RateLimitedError extends PfpxError {
  constructor() {
    super(
      "Rate limited by Facebook (HTTP 429). Try again later.",
      "RATE_LIMITED",
    );
    this.name = "RateLimitedError";
  }
}

export class NoImageFoundError extends PfpxError {
  constructor(reason: string) {
    super(reason, "NO_IMAGE_FOUND");
    this.name = "NoImageFoundError";
  }
}

export class UnsupportedUrlError extends PfpxError {
  constructor(
    url: string,
    public readonly category: string = "unsupported",
    message?: string,
  ) {
    super(
      message || `Unsupported Facebook URL (${category}): ${url}`,
      "UNSUPPORTED_URL",
    );
    this.name = "UnsupportedUrlError";
  }
}
