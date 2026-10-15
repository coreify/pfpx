#!/usr/bin/env node
import { Command } from "commander";
import { intro, text, spinner, outro, isCancel, cancel } from "@clack/prompts";
import { getCoverPicture, getProfilePicture } from "./commands/get.js";
import { printResult, printError } from "./utils/output.js";
import { openInBrowser } from "./utils/open-browser.js";
import { copyToClipboard } from "./utils/clipboard.js";
import { EXIT_CODES } from "./core/types.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function getPackageVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkg = require(join(__dirname, "..", "package.json")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const program = new Command("pfpx")
    .description(
      "Retrieve the highest-resolution public Facebook profile picture URL.",
    )
    .argument("[url]", "Facebook profile URL")
    .option("--json", "Output JSON to stdout; diagnostics to stderr")
    .option("--all", "Show all discovered image candidates")
    .option("--cover", "Retrieve cover picture instead of profile picture")
    .option("--open", "Open the image URL in the default browser")
    .option("--copy", "Copy the image URL to the clipboard")
    .option("--verbose", "Show extraction steps and request info")
    .option("--timeout <ms>", "Per-request timeout in milliseconds", "15000")
    .option("--no-verify", "Skip image dimension verification")
    .version(getPackageVersion(), "-v, --version")
    .helpOption("-h, --help")
    .exitOverride();

  let parsedUrl: string | undefined;
  let opts: {
    json?: boolean;
    all?: boolean;
    cover?: boolean;
    open?: boolean;
    copy?: boolean;
    verbose?: boolean;
    timeout: string;
    verify: boolean;
  };

  try {
    program.parse(["node", "pfpx", ...argv]);
    parsedUrl = program.args[0];
    opts = program.opts<typeof opts>();
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (
      e.code === "commander.helpDisplayed" ||
      e.code === "commander.version"
    ) {
      return EXIT_CODES.SUCCESS;
    }
    process.stderr.write(`✖ ${e.message ?? String(err)}\n`);
    return EXIT_CODES.GENERAL_ERROR;
  }

  let profileUrl: string;

  if (!parsedUrl) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "✖ No URL provided. Pass a Facebook profile URL as argument.\n",
      );
      return EXIT_CODES.INVALID_URL;
    }
    intro("pfpx — Facebook Profile Picture Extractor");

    const input = await text({
      message: "Enter Facebook profile URL:",
      placeholder: "https://www.facebook.com/username",
      validate(value) {
        if (!value?.trim()) return "URL is required";
      },
    });
    if (isCancel(input)) {
      cancel("Cancelled.");
      return EXIT_CODES.SUCCESS;
    }
    profileUrl = input.trim();
  } else {
    profileUrl = parsedUrl;
  }

  const timeoutMs = parseInt(opts.timeout, 10);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    process.stderr.write("✖ --timeout must be a positive integer.\n");
    return EXIT_CODES.GENERAL_ERROR;
  }
  const s = opts.json ? null : spinner();
  s?.start(
    opts.cover ? "Extracting cover image…" : "Extracting profile image…",
  );

  try {
    const result = opts.cover
      ? await getCoverPicture(profileUrl, {
          timeoutMs,
          verbose: opts.verbose,
        })
      : await getProfilePicture(profileUrl, {
          timeoutMs,
          verbose: opts.verbose,
          verifyImages: opts.verify !== false,
        });

    s?.stop("Done.");

    printResult(result, { all: opts.all, json: opts.json });

    if (opts.open && result.imageUrl) {
      try {
        await openInBrowser(result.imageUrl);
        if (!opts.json) process.stderr.write("Opened in browser.\n");
      } catch {
        process.stderr.write("Could not open browser.\n");
      }
    }

    if (opts.copy && result.imageUrl) {
      const copied = await copyToClipboard(result.imageUrl);
      if (!opts.json) {
        process.stderr.write(
          copied ? "Copied to clipboard.\n" : "Could not copy to clipboard.\n",
        );
      }
    }

    if (!parsedUrl && !opts.json) {
      outro("Done.");
    }

    return EXIT_CODES.SUCCESS;
  } catch (err: unknown) {
    s?.stop("Failed.");
    printError(err, { json: opts.json, inputUrl: profileUrl });

    const code = (err as { code?: string }).code;
    switch (code) {
      case "INVALID_URL":
        return EXIT_CODES.INVALID_URL;
      case "NOT_FACEBOOK":
        return EXIT_CODES.NOT_FACEBOOK;
      case "NO_IMAGE_FOUND":
        return EXIT_CODES.NO_IMAGE_FOUND;
      case "TIMEOUT":
        return EXIT_CODES.TIMEOUT;
      case "RATE_LIMITED":
        return EXIT_CODES.RATE_LIMITED;
      case "NETWORK_ERROR":
        return EXIT_CODES.NETWORK_ERROR;
      default:
        return EXIT_CODES.GENERAL_ERROR;
    }
  }
}

const scriptName = process.argv[1]
  ? process.argv[1].replace(/\\/g, "/").split("/").pop()?.toLowerCase()
  : "";

const isMain =
  scriptName === "cli.ts" ||
  scriptName === "cli.js" ||
  scriptName === "pfpx" ||
  scriptName === "pfpx.cmd";

if (isMain) {
  main()
    .then((code) => {
      if (code !== 0) process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
