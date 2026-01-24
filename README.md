# cclp

Fast CLI to scan, list, and launch Claude Code projects with cost tracking.

## Install

```bash
npm install -g cclp
```

## Usage

```bash
cclp                    # interactive picker (j/k/g/G, enter, i=info, esc)
cclp list               # table view with activity colors
cclp recent             # top 5 by frecency
cclp open <name>        # fuzzy match launch
cclp info <name>        # project details (prompts, files, tools)
cclp info <name> -s     # with AI summary (via claude -p)
cclp stats              # usage summary
cclp cost               # daily cost breakdown
cclp cost -w            # weekly cost breakdown
cclp export             # JSON export
cclp export -f csv      # CSV export
cclp archive <name>     # hide from picker
cclp unarchive <name>   # restore
cclp clear-cache        # force refresh
cclp set-base ~/projects # set base dir for new projects
cclp get-base           # show current base dir
cclp new my-app         # create project and launch claude
cclp new my-app -d /tmp # override base dir
cclp telemetry off      # disable anonymous usage tracking
cclp completion zsh     # shell completions (bash/zsh/fish)
```

### Filters

```bash
cclp -d 7               # last 7 days
cclp list --days 30     # last month
cclp --no-cache list    # bypass cache
cclp list -a            # include archived
```

## Features

- **Frecency sorting** - frequently used projects appear first
- **Activity colors** - red (today), yellow (week), blue (month), dim (older)
- **Session preview** - model, tokens, first prompt shown in picker
- **Vim keybindings** - j/k/g/G navigation, i for info, esc to cancel
- **Cost tracking** - daily/weekly breakdown with bar charts
- **AI summaries** - `claude -p` generated, cached 24h
- **Caching** - 5min TTL, auto-invalidates on project changes
- **New projects** - create and launch in one command

## Example

```
$ cclp cost -d 7
Daily cost breakdown (last 7d)
------------------------------------------------------------
DATE         TOKENS         COST         BAR
------------------------------------------------------------
2026-01-19   67.3K          $61.04       ████████████
2026-01-18   10.5K          $29.42       ██████
2026-01-17   9.2K           $2.04
2026-01-16   281.4K         $59.51       ███████████
------------------------------------------------------------
Total: $151.01
```

## Config

All data stored in `~/.cclp/`:
- `cache.json` - project stats cache
- `history.json` - launch history for frecency
- `config.json` - archived projects, base dir, telemetry
- `summaries/` - AI summary cache

## How it works

Scans `~/.claude/projects/` for Claude Code session data, parses JSONL files to extract token usage, and calculates costs based on Anthropic pricing (sonnet-4 default).

## License

MIT
