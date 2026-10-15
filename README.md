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
```

### Options

| Flag          | Description                                    |
| ------------- | ---------------------------------------------- |
| `--json`      | Output machine-readable JSON                   |
| `--open`      | Open image URL in default browser              |
| `--copy`      | Copy image URL to clipboard                    |
| `--all`       | Show all discovered image candidates           |
| `--cover`     | Retrieve cover instead of profile picture      |
| `--no-verify` | Skip dimension verification (faster)           |
| `--verbose`   | Print extraction steps and request diagnostics |

## API

```typescript
import {
  getCoverPicture,
  getCoverPictureImage,
  getProfilePicture,
  getProfilePictureImage,
} from "@coreify/pfpx";

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
