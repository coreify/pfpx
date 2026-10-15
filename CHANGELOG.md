# Changelog

## [1.2.1] - 2026-10-15

### Added

- `getCoverPicture()` API and `--cover` CLI option

### Fixed

- Facebook AVIF cover downloads being reported as network errors
- Facebook photo-page URLs being treated as image candidates

## [1.2.0] - 2026-10-15

### Added

- Stable `identifier` result field: username when available, numeric profile ID otherwise
- `getCoverPictureImage()` for best-effort original public cover download

## [1.1.0] - 2026-10-15

### Added

- `getProfilePictureImage()` for validated profile lookup and bounded image download
- Bare username and Facebook URL-in-text input support
- GIF and extended WebP dimension parsing

### Fixed

- Mobile fallback redirect incorrectly ending as a redirect-loop error
- Candidate verification dropping every candidate after the first five
- WebP VP8 byte order, unsafe cross-origin redirects, and oversized response handling
- Shell injection risks in browser and clipboard helpers

### Changed

- HTML extraction parses each document once
- Image downloads validate redirects, MIME type, timeout, and size limits

## [1.0.0] - 2026-10-15

### Added

- Initial release
- `pfpx <url>` CLI to retrieve public Facebook profile picture URL
- Flags: `--json`, `--all`, `--open`, `--copy`, `--verbose`, `--timeout`, `--no-verify`
- Interactive Clack prompt when no URL argument provided
- Extraction strategies: `og:image`, `twitter:image`, structured data, public HTML
- Image dimension verification via streaming byte inspection (JPEG, PNG, WebP)
- SSRF protection: private IP rejection, redirect chain validation
- Modular library export: `getProfilePicture(url, options)`
- Full test suite with mocked HTTP fixtures
