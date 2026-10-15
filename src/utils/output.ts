import type {
  ProfileImageResult,
  ImageCandidate,
  ErrorResult,
} from "../core/types.js";

export function printResult(
  result: ProfileImageResult,
  options: { all?: boolean | undefined; json?: boolean | undefined },
): void {
  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (options.all && result.candidates && result.candidates.length > 0) {
    console.log("All discovered candidates:");
    for (const c of result.candidates) {
      printCandidate(c);
    }
    console.log("\nBest:");
  }

  if (result.imageUrl) {
    console.log(result.imageUrl);
  }

  if (result.warning) {
    process.stderr.write(`\nNote: ${result.warning}\n`);
  }
}

function printCandidate(c: ImageCandidate): void {
  const dims =
    c.width != null && c.height != null
      ? `${c.width}x${c.height}`
      : "unknown dimensions";
  const verified = c.verified ? "verified" : "unverified";
  console.log(`  [${c.source}] ${dims} (${verified})\n  ${c.url}\n`);
}

export function printError(
  error: unknown,
  options: { json?: boolean | undefined; inputUrl?: string | undefined },
): void {
  if (options.json) {
    const out: ErrorResult = {
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code ?? "UNKNOWN",
      inputUrl: options.inputUrl,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`✖ ${msg}\n`);
}
