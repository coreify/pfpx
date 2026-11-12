import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { printResult, printError } from "../src/utils/output.js";
import type { ProfileImageResult } from "../src/core/types.js";

// Mock child_process for openInBrowser & copyToClipboard
vi.mock("node:child_process", () => {
  return {
    execFile: vi.fn(
      (
        _cmd: string,
        _args: string[],
        callback?: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (typeof callback === "function") {
          queueMicrotask(() => callback(null, "", ""));
        }
        const listeners = new Map<string, (value: unknown) => void>();
        return {
          stdin: {
            end(text: string) {
              queueMicrotask(() => {
                if (text.includes("fail-test")) {
                  listeners.get("error")?.(new Error("Command failed"));
                } else {
                  listeners.get("close")?.(0);
                }
              });
            },
          },
          once(event: string, listener: (value: unknown) => void) {
            listeners.set(event, listener);
          },
        };
      },
    ),
  };
});

// Import after mocking
import { openInBrowser } from "../src/utils/open-browser.js";
import { copyToClipboard } from "../src/utils/clipboard.js";
import * as childProcess from "node:child_process";

describe("printResult", () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let logSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("outputs JSON when options.json is true", () => {
    const res: ProfileImageResult = {
      inputUrl: "https://www.facebook.com/user",
      profileUrl: "https://www.facebook.com/user",
      identifier: "user",
      imageUrl: "https://scontent.xx.fbcdn.net/photo.jpg",
      width: 480,
      height: 480,
      source: "og:image",
    };
    printResult(res, { json: true });
    expect(stdoutSpy).toHaveBeenCalled();
    const calls = stdoutSpy.mock.calls as [string | Uint8Array][];
    const output = String(calls[0]?.[0]);
    expect(JSON.parse(output)).toEqual(res);
  });

  it("prints image URL and warning in normal mode", () => {
    const res: ProfileImageResult = {
      inputUrl: "https://www.facebook.com/user",
      profileUrl: "https://www.facebook.com/user",
      identifier: "user",
      imageUrl: "https://scontent.xx.fbcdn.net/photo.jpg",
      width: 480,
      height: 480,
      source: "og:image",
      warning: "URL may expire.",
    };
    printResult(res, { json: false });
    expect(logSpy).toHaveBeenCalledWith(
      "https://scontent.xx.fbcdn.net/photo.jpg",
    );
    expect(stderrSpy).toHaveBeenCalledWith("\nNote: URL may expire.\n");
  });

  it("prints candidates when options.all is true", () => {
    const res: ProfileImageResult = {
      inputUrl: "https://www.facebook.com/user",
      profileUrl: "https://www.facebook.com/user",
      identifier: "user",
      imageUrl: "https://scontent.xx.fbcdn.net/best.jpg",
      width: 500,
      height: 500,
      source: "og:image",
      candidates: [
        {
          url: "https://scontent.xx.fbcdn.net/cand1.jpg",
          source: "og:image",
          width: 500,
          height: 500,
          verified: true,
        },
        {
          url: "https://scontent.xx.fbcdn.net/cand2.jpg",
          source: "structured-data",
          verified: false,
        },
      ],
    };
    printResult(res, { all: true, json: false });
    expect(logSpy).toHaveBeenCalledWith("All discovered candidates:");
    expect(logSpy).toHaveBeenCalledWith("\nBest:");
    expect(logSpy).toHaveBeenCalledWith(
      "https://scontent.xx.fbcdn.net/best.jpg",
    );
  });
});

describe("printError", () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("outputs JSON error when options.json is true", () => {
    const err = Object.assign(new Error("Test error"), { code: "TEST_ERR" });
    printError(err, { json: true, inputUrl: "https://facebook.com/user" });
    expect(stdoutSpy).toHaveBeenCalled();
    const calls = stdoutSpy.mock.calls as [string | Uint8Array][];
    const output = String(calls[0]?.[0]);
    const parsed = JSON.parse(output) as {
      error: string;
      code: string;
      inputUrl: string;
    };
    expect(parsed.error).toBe("Test error");
    expect(parsed.code).toBe("TEST_ERR");
    expect(parsed.inputUrl).toBe("https://facebook.com/user");
  });

  it("outputs formatted message to stderr when json is false", () => {
    const err = new Error("Something broke");
    printError(err, { json: false });
    expect(stderrSpy).toHaveBeenCalledWith("✖ Something broke\n");
  });
});

describe("openInBrowser & copyToClipboard", () => {
  it("openInBrowser invokes execFile", async () => {
    await openInBrowser("https://example.com");
    expect(childProcess.execFile).toHaveBeenCalled();
  });

  it("copyToClipboard returns true on successful exec", async () => {
    const success = await copyToClipboard("test-url");
    expect(success).toBe(true);
  });

  it("copyToClipboard returns false when exec fails", async () => {
    const success = await copyToClipboard("fail-test");
    expect(success).toBe(false);
  });
});

describe("advanced output", () => {
  afterEach(() => vi.restoreAllMocks());
  it("prints measured quality and public metadata", async () => {
    const { printImageInfo } = await import("../src/utils/output.js");
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    printImageInfo(
      {
        inputUrl: "testuser",
        profileUrl: "https://www.facebook.com/testuser",
        identifier: "testuser",
        imageUrl: null,
        width: 2000,
        height: 1000,
        source: "cover-data",
        metadata: { name: "Public title", description: "Bio", type: "profile" },
      },
      "Cover picture",
    );
    expect(stderr.mock.calls.flat().join("")).toContain("2.00 MP");
    expect(stderr.mock.calls.flat().join("")).toContain("Public title");
  });

  it("prints partial results and missing-cover diagnostic in text mode", async () => {
    const { printMediaResult } = await import("../src/utils/output.js");
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printMediaResult(
      {
        inputUrl: "testuser",
        profileUrl: "https://www.facebook.com/testuser",
        identifier: "testuser",
        metadata: { name: null, description: null, type: null },
        profile: {
          inputUrl: "testuser",
          profileUrl: "https://www.facebook.com/testuser",
          identifier: "testuser",
          imageUrl: "https://scontent.xx.fbcdn.net/avatar.jpg",
          width: null,
          height: null,
          source: null,
        },
        cover: null,
        errors: { cover: { error: "No cover", code: "NO_IMAGE_FOUND" } },
      },
      { info: true },
    );
    expect(log).toHaveBeenCalledWith(
      "https://scontent.xx.fbcdn.net/avatar.jpg",
    );
    expect(stderr.mock.calls.flat().join("")).toContain("cover: No cover");
  });
});
