# Changelog

## [1.0.0] - 2024-10-15

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
