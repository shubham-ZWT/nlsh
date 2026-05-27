# nlsh — Natural Language Shell Agent

**Talk to your terminal in plain English.**

```bash
npm install -g @shubham.dev/nlsh
nlsh setup
nlsh "show all running containers"
```

nlsh is a shell agent that thinks in goals, not commands. You speak your intent, it builds a plan, executes step-by-step, watches results, and recovers from failures — all in a single terminal process.

## Install

```bash
npm install -g @shubham.dev/nlsh
```

Requires Node.js 18+.

## Setup

Configure your LLM API key:

```bash
nlsh setup
```

Get a free API key at https://console.groq.com and configure it:

```bash
export GROQ_API_KEY="gsk_..."
```

## Usage

```bash
nlsh "check git status"
nlsh "push the latest changes to main"
nlsh "find all node_modules folders and show their sizes"
nlsh "run the test suite and fix any failures"
```

### Commands

| Command | Description |
|---------|-------------|
| `nlsh "intent"` | Run the agent |
| `nlsh --dry-run "intent"` | Show plan and commands without executing |
| `nlsh setup` | Configure API keys |
| `nlsh history` | Show past command history |
| `nlsh terrain` | Show project terrain profile |
| `nlsh terrain --refresh` | Force rescan terrain |
| `nlsh terrain --clear` | Delete terrain profile |
| `nlsh --help` | Show help |

## How It Works

```
You: "push the latest changes to main"
        │
        ▼
  1. Terrain Scan ─── reads package.json, git log, docker-compose, etc.
        │
        ▼
  2. Planner ─── LLM generates a step-by-step plan
        │
        ▼
  3. You approve the plan ─── [Y/n]
        │
        ▼
  4. For each step:
     ─ Command Generator ─── LLM produces the exact shell command
     ─ Safety check ─── blocks dangerous commands (rm -rf /, etc.)
     ─ You confirm ─── [Y/n/e] (e = edit command)
     ─ Execute ─── streams output in real time
     ─ On failure ─── Recovery LLM diagnoses and revises remaining steps
        │
        ▼
  5. Done ─── summary with timing
```

## Features

### Terrain Awareness

Before acting, nlsh scans your project to understand its context — reads `package.json`, `docker-compose.yml`, `git log`, `Makefile`, and more. This context is injected into every LLM call, so commands are relevant to your actual project.

### Safety System

Commands are checked against risk, reversibility, and confidence before execution:

- `rm -rf /` → blocked outright
- `sudo apt install` → requires typing "yes" (not just "y")
- `docker rm -f $(docker ps -aq)` → high risk warning

### Commit Message Generation

When `git commit` is detected, nlsh captures the diff and generates a meaningful commit message automatically.

### Recovery

If a step fails, the recovery LLM analyzes the error and produces a revised plan for the remaining steps — no need to restart from scratch.

### TUI

Professional terminal UI built with Ink + React, styled in GitHub Dark colors with real-time streaming output.

### Headless Mode

When stdin is not a TTY (piped input, CI), nlsh automatically falls back to a clean console mode. Use `--headless` explicitly in non-interactive environments.

## Configuration

Config is stored at `~/.nlsh/config.json`:

```json
{
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "apiKey": "gsk_..."
}
```

API key priority: **env var** → **config file**

## Development

```bash
git clone https://github.com/nlsh/nlsh.git
cd nlsh
npm install
npm run build
npm link
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without emitting |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run start "intent"` | Run via tsx (no build needed) |

### Tests

128 unit tests across 11 files covering planner, executor, memory, recovery, safety, UI controller, agent flow, editor, history, and committer.

```bash
npm run test:unit
```

## License

MIT
