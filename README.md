# @coreify/pfpx

Extract highest-resolution public Facebook profile and cover pictures.

[![npm](https://img.shields.io/npm/v/@coreify/pfpx)](https://www.npmjs.com/package/@coreify/pfpx)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## Install

```bash
npm install -g @coreify/pfpx
# or run directly:
npx @coreify/pfpx <url>
```

## CLI Usage

```bash
pfpx https://www.facebook.com/zuck
pfpx --cover https://www.facebook.com/zuck
pfpx --both --info zuck
pfpx --both --json zuck
```

To run the enhanced local build before publishing a release:

```bash
cd package
bun install --frozen-lockfile
bun run build
node dist/cli.js --both --info zuck
```

### Options

| Flag             | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `--json`         | Output machine-readable JSON                         |
| `--open`         | Open image URL in default browser                    |
| `--copy`         | Copy image URL to clipboard                          |
| `--all`          | Show all discovered image candidates                 |
| `--both`         | Retrieve avatar and cover from one public page       |
| `--info`         | Show public page details and image quality on stderr |
| `--timeout <ms>` | Set per-request timeout (default: 15000 ms)          |
| `--cover`        | Retrieve cover instead of profile picture            |
| `--no-verify`    | Skip dimension verification (faster)                 |
| `--verbose`      | Print extraction steps and request diagnostics       |

`--info` includes the published Open Graph title/name, description, page type, canonical profile URL, identifier, resolution, megapixels, extraction source, and candidate count. Missing facts remain unknown; follower counts and private account details are not inferred. Existing JSON output gains an optional `metadata` object.

Normal stdout remains image URLs, one per available image, in avatar-then-cover order. Details and warnings go to stderr. `--both --json` emits one object with `profile`, `cover`, `metadata`, and per-image `errors`. A missing cover does not discard an available avatar. Both missing yields exit code 4; a partial success yields 0. Page-fetch failures retain existing error exit codes.

`--both --copy` copies available URLs separated by newlines; `--both --open` opens each available image. Use either `--both` or `--cover`. `--no-verify` skips avatar verification; covers still require dimension verification to avoid returning thumbnails.

## API

```typescript
import {
  getCoverPicture,
  getCoverPictureImage,
  getProfilePicture,
  getProfilePictureImage,
  getProfileMedia,
} from "@coreify/pfpx";

const media = await getProfileMedia("zuck");
console.log(media.metadata, media.profile, media.cover, media.errors);

const result = await getProfilePicture("https://www.facebook.com/zuck");
console.log(result.imageUrl); // 2048x2048 uncropped CDN link
console.log(result.width, result.height); // 2048, 2048
console.log(result.identifier); // username, or numeric profile ID

// Accepts a username, URL, or URL embedded in text. Downloads with timeout,
// redirect, content-type, and byte-limit validation.
const image = await getProfilePictureImage("zuck", {
  maxBytes: 20 * 1024 * 1024,
});
console.log(image.data, image.contentType);

// Returns original public cover bytes only when they meet the high-quality floor.
const cover = await getCoverPictureImage("zuck");
console.log(cover.data, cover.width, cover.height);

const coverMetadata = await getCoverPicture("zuck");
console.log(coverMetadata.imageUrl);
```

## Notes

- Operates only on publicly accessible profile data without credentials or cookies.
- Facebook CDN URLs expire after a few days. Re-run if link expires.
- Cover lookup is best-effort and rejects display-sized images below 1200 × 400.

## License

MIT
