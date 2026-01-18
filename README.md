# cclp

Fast CLI to scan, list, and launch Claude Code projects.

## Install

```bash
npm install -g cclp
```

Or run directly:

```bash
npx cclp
```

## Usage

```bash
cclp                    # interactive picker
cclp list               # table view
cclp open <name>        # fuzzy match launch
cclp stats              # usage summary

# filter by days
cclp -d 7               # last 7 days
cclp list --days 30     # last month
cclp stats -d 7         # week costs
```

## Example output

```
$ cclp stats -d 7
Claude Code Usage (last 7d)
----------------------------------------
Projects:       7
Sessions:       128
Input tokens:   1.6M
Output tokens:  2.3M
Cache writes:   121.1M
Cache reads:    1617.8M
----------------------------------------
Estimated cost: $978.09
```

## How it works

Scans `~/.claude/projects/` for Claude Code session data, parses JSONL files to extract token usage, and calculates costs based on Anthropic pricing.

## License

MIT
