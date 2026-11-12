import type {
  ProfileImageResult,
  ImageCandidate,
  ErrorResult,
  ProfileMediaResult,
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

export function printImageInfo(
  result: ProfileImageResult,
  label: string,
): void {
  const lines = [
    `${label}: ${result.identifier}`,
    `Profile: ${result.profileUrl}`,
  ];
  if (result.metadata?.name) lines.push(`Name: ${result.metadata.name}`);
  if (result.metadata?.description)
    lines.push(`Description: ${result.metadata.description}`);
  if (result.metadata?.type) lines.push(`Page type: ${result.metadata.type}`);
  if (result.width && result.height) {
    lines.push(
      `Resolution: ${result.width} × ${result.height} (${((result.width * result.height) / 1_000_000).toFixed(2)} MP)`,
    );
  } else lines.push("Resolution: unverified");
  lines.push(`Source: ${result.source ?? "unknown"}`);
  lines.push(`Candidates: ${result.candidates?.length ?? 0}`);
  process.stderr.write(lines.join("\n") + "\n");
}

export function printMediaResult(
  result: ProfileMediaResult,
  options: {
    json?: boolean | undefined;
    all?: boolean | undefined;
    info?: boolean | undefined;
  },
): void {
  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  for (const kind of ["profile", "cover"] as const) {
    const image = result[kind];
    if (image) {
      if (options.info)
        printImageInfo(
          image,
          kind === "profile" ? "Profile picture" : "Cover picture",
        );
      printResult(image, options);
    } else if (result.errors[kind]) {
      process.stderr.write(`${kind}: ${result.errors[kind].error}\n`);
    }
  }
}
