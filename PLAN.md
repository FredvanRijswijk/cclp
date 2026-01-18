# cc-projects Implementation Plan

## Research Summary

### Directory Structure
- Projects at `~/.claude/projects/` with path encoding (`/` → `-`)
- Example: `-Users-fredvanrijswijk-AttiqLab-cc-projects` → `/Users/fredvanrijswijk/AttiqLab/cc-projects`
- Each project contains: `{sessionId}.jsonl` files, optional `sessions-index.json`

### JSONL Format
```json
{
  "type": "assistant|user|tool_use|...",
  "timestamp": "2026-01-18T13:09:26.168Z",
  "sessionId": "UUID",
  "message": { "usage": { "input_tokens": 8, "output_tokens": 2, "cache_creation_input_tokens": 41567, "cache_read_input_tokens": 0 } }
}
```

### sessions-index.json (when present)
```json
{
  "entries": [{
    "sessionId": "UUID",
    "messageCount": 10,
    "created": "2026-01-10T15:13:55.121Z",
    "modified": "2026-01-10T15:42:15.415Z",
    "firstPrompt": "kill port 3000"
  }]
}
```

---

## Implementation Plan

### 1. Project Setup
- `bun init` with TypeScript
- Dependencies: `@inquirer/prompts`, `picocolors`, `commander`
- Configure for `npx` distribution (bin field in package.json)

### 2. Core Modules

#### `src/scanner.ts` - Project Discovery
```
scanProjects() → Project[]
```
- Read `~/.claude/projects/` directory
- Decode path names (split on `-`, join with `/`, validate path exists)
- Return project metadata (name, path, encoded path)

#### `src/parser.ts` - Session Parsing
```
parseProject(projectPath) → ProjectStats
```
- If `sessions-index.json` exists, use it (fast path)
- Otherwise parse all `.jsonl` files:
  - Count messages by type
  - Extract timestamps (first/last)
  - Sum token usage from `message.usage` fields
  - Track models used

#### `src/pricing.ts` - Cost Calculation
```
calculateCost(usage, model) → number
```
Anthropic pricing (per 1M tokens):
| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| claude-opus-4 | $15 | $75 | $18.75 | $1.50 |
| claude-sonnet-4 | $3 | $15 | $3.75 | $0.30 |
| claude-haiku-4 | $0.80 | $4 | $1.00 | $0.08 |

#### `src/ui.ts` - Terminal UI
- `showProjectPicker(projects)` - interactive select with @inquirer/prompts
- `showProjectTable(projects)` - formatted table output
- `showStats(projects)` - usage summary

#### `src/launcher.ts` - Claude Launcher
```
launchClaude(projectPath) → void
```
- `Bun.spawn(["claude"], { cwd: projectPath })`
- Inherit stdio for interactive session

### 3. CLI Commands

```
cc-projects              # Interactive picker (default)
cc-projects list         # Table view
cc-projects open <name>  # Direct launch (fuzzy match)
cc-projects stats        # Usage summary
```

### 4. Project Structure
```
cc-projects/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── scanner.ts      # Project discovery
│   ├── parser.ts       # JSONL parsing
│   ├── pricing.ts      # Cost calculation
│   ├── ui.ts           # Terminal UI
│   └── launcher.ts     # Claude spawner
├── package.json
├── tsconfig.json
└── README.md
```

### 5. Package.json Essentials
```json
{
  "name": "cc-projects",
  "version": "0.1.0",
  "bin": { "cc-projects": "./dist/index.js" },
  "type": "module",
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target node",
    "dev": "bun run src/index.ts"
  }
}
```

---

## Technical Decisions

1. **No sessions-index.json fallback**: Parse JSONL directly for accuracy (index may be stale)
2. **Streaming JSONL parse**: Use line-by-line reading for large files
3. **Fuzzy matching**: Simple substring match for `open <name>` command
4. **Minimal deps**: Only 3 runtime deps for fast install
5. **Cache pricing**: Embed pricing in code (update manually with releases)

---

## Execution Order

1. Initialize project with Bun
2. Implement scanner.ts + test on local projects
3. Implement parser.ts + pricing.ts
4. Implement ui.ts (picker + table)
5. Implement launcher.ts
6. Wire up CLI with commander
7. Test all commands
8. Prepare for npm publish

---

## Questions Before Starting

1. Package name `cc-projects` available on npm? (need to check)
2. Want cost display in picker or just list command?
3. Fuzzy match library (fuse.js) or simple substring?
