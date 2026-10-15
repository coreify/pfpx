# @coreify/pfpx

Retrieve the highest-resolution publicly accessible Facebook profile picture (up to 2048×2048) from CLI or Node.js.

[![npm](https://img.shields.io/npm/v/@coreify/pfpx)](https://www.npmjs.com/package/@coreify/pfpx)
[![license](https://img.shields.io/npm/l/@coreify/pfpx)](./LICENSE)

## Install

```bash
npm install -g @coreify/pfpx
# or run directly:
npx @coreify/pfpx <url>
```

## CLI Usage

```bash
pfpx https://www.facebook.com/zuck
```

### Options

| Flag          | Description                                    |
| ------------- | ---------------------------------------------- |
| `--json`      | Output machine-readable JSON                   |
| `--open`      | Open image URL in default browser              |
| `--copy`      | Copy image URL to clipboard                    |
| `--all`       | Show all discovered image candidates           |
| `--no-verify` | Skip dimension verification (faster)           |
| `--verbose`   | Print extraction steps and request diagnostics |

## API

```typescript
import { getProfilePicture, getProfilePictureImage } from "@coreify/pfpx";

const result = await getProfilePicture("https://www.facebook.com/zuck");
console.log(result.imageUrl); // 2048x2048 uncropped CDN link
console.log(result.width, result.height); // 2048, 2048

// Accepts a username, URL, or URL embedded in text. Downloads with timeout,
// redirect, content-type, and byte-limit validation.
const image = await getProfilePictureImage("zuck", {
  maxBytes: 20 * 1024 * 1024,
});
console.log(image.data, image.contentType);
```

## Notes

- Operates only on publicly accessible profile data without credentials or cookies.
- Facebook CDN URLs expire after a few days. Re-run if link expires.

## License

MIT
