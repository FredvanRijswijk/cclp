# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.2.0] - 2025-01-19

### Added
- `cclp clear-cache` command to force cache refresh
- `--no-cache` flag to bypass cache for any command
- `cclp completion <shell>` for bash/zsh/fish shell completion
- `(cached)` indicator when displaying cached data

## [1.1.0] - 2025-01-19

### Added
- **Caching**: ProjectStats cached in `~/.cclp/cache.json` with 5min TTL, invalidates on projects dir change
- **Frecency sorting**: Projects sorted by launch frequency + recency, stored in `~/.cclp/history.json`
- **Session preview**: Picker shows last session info (model, tokens, first user prompt)

### Changed
- Picker now shows frecency score badge `[score]` for frequently used projects
- Preview descriptions appear below each picker item

## [1.0.0] - 2025-01-18

### Added
- Initial release
- Interactive project picker with fuzzy search
- `cclp list` - table view of all projects
- `cclp open <name>` - open project by name (fuzzy match)
- `cclp stats` - usage summary with cost calculation
- `-d, --days <n>` filter for all commands
- Cost tracking based on Anthropic token pricing (sonnet-4 default)
- Path decoding for Claude's encoded project paths
- Anonymous telemetry via PostHog

[Unreleased]: https://github.com/FredvanRijswijk/cclp/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/FredvanRijswijk/cclp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/FredvanRijswijk/cclp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/FredvanRijswijk/cclp/releases/tag/v1.0.0
