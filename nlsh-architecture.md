# nlsh: Agentic Shell for Developers

## What It Is

nlsh is a **shell agent** that translates plain-English intent into terminal commands — with planning, safety checks, automatic recovery, and a polished terminal UI. No chat interface, no YAML pipelines. You type `nlsh "push to main"` and it gets it done.

## Core Problem

Every developer knows the frustration: you've done this before but can't remember the exact flags. Is it `git reset --soft` or `--mixed`? Does `docker ps -a` show stopped containers or only running ones? On Windows it's `dir`, on Linux it's `ls` — but your brain is in the wrong OS today.

This isn't a skill issue. It's a **context-switching tax** that compounds across tools, across operating systems, and across projects with different stacks.

Existing solutions fall short:

- **ChatGPT / Claude Chat** — you describe what you want, copy the command, paste it, see it fail, go back. The context lives in a browser tab disconnected from your terminal.
- **Scripts and Makefiles** — rigid. One typo in a new environment and they break. No adaptation.
- **Claude Code, opencode, Kiro** — these execute commands directly, but they operate in a **chat-based paradigm**: you converse back and forth, the tool responds inline. There's no separation between planning and execution, no structured recovery when a step fails, and no terrain awareness — they don't systematically survey your project before generating commands. They're powerful, but they're chat interfaces dressed in terminal clothing.

nlsh is different. It's a **goal-oriented agent** with a deliberate architecture: plan first, execute second, recover automatically. It surveys your project before a single LLM call. It generates every command with full context of your stack, branch, and recent changes. And when something fails, it doesn't ask you what went wrong — it figures it out and adjusts.

nlsh closes the loop. It's not a command suggester — it's an agent that owns the full cycle: understand your intent → survey your project → build a plan → generate precise commands → run them in your real shell → watch the result → recover if something fails.

**nlsh is for all of us. Say what you want in plain English. nlsh gets it done.**

## User Flow

```bash
# One command to install — available everywhere
npm install -g @shubham.dev/nlsh

# PowerShell users — just add quotes
npm install -g "@shubham.dev/nlsh"

# One command to configure
nlsh setup

# See what's possible
nlsh --help

# Speak your intent — nlsh handles the rest
nlsh "check git status"
nlsh "show all running docker containers"
nlsh "find all node_modules and show their sizes"
nlsh "push latest changes to main"
nlsh "run tests and fix any failures"
```

Three steps — install, configure, speak. That's it.

## Architecture

```
Intent → Terrain → Plan → [Command → Safety → Execute → Result]⁺ → Done
                              ↑                              |
                              └── Recovery ←── Failure ──────┘
```

### Agent Orchestration

The agent follows a **state-machine architecture** with three distinct LLM invocations per task cycle, each with a precise role:

| Phase | Input | Output | Purpose |
|-------|-------|--------|---------|
| **Plan** | Intent + terrain context | Structured step list | Breaks vague intent into verifiable milestones |
| **Command** | Full task state + current step | Exact shell command | Translates a goal into the right shell incantation |
| **Recovery** | Task history + error output | Diagnosis + revised plan | Recovers from failures without losing progress |

Between these LLM calls, the agent runs **deterministic logic**: safety validation, user confirmation, command execution, and state persistence. This hybrid design — LLM for reasoning, code for execution — makes the agent both flexible and predictable.

### Terrain as Agent Harness

Most agents operate blind — they guess your stack from the question you ask. **Terrain** eliminates that guesswork by surveying the project before the agent takes a single step.

When nlsh starts, it scans the workspace for structural signals: dependency manifests (`package.json`, `requirements.txt`, `Cargo.toml`), container configurations (`Dockerfile`, `docker-compose.yml`), version control state (branch, recent commits, unstaged changes), and available system tools.

This terrain profile becomes part of every LLM prompt. The result: the agent knows you're in a NestJS monorepo on `feature/auth` with 3 uncommitted files — before it generates a single command. It doesn't ask what stack you're using. It already knows.

### Intent → Plan → Context → Execute

1. **Intent** — raw user input: `"push it to main"`
2. **Plan** — LLM generates 2-5 high-level steps as JSON: `[{id, intent}, ...]`
3. **Context** — terrain profile + task history appended to every subsequent LLM prompt
4. **Execute** — each step generates an exact command, runs it, captures output


### Failure Handling & Recovery

When a command exits non-zero:

1. The error output (stdout + stderr) is captured
2. Recovery LLM receives the full task state plus the error
3. It returns: `{ diagnosis, canContinue, revisedRemainingSteps }`
4. If recoverable, remaining steps are replaced with the revised plan
5. The loop continues without restarting

This means a failed `npm install` (package name typo) doesn't abort the whole task — the agent fixes the command and retries.

### Safety System

Every command passes through a **multi-layered safety gate** before execution. The LLM assigns risk, reversibility, and confidence — but the final say belongs to deterministic rules:

| Risk Level | Behavior |
|------------|----------|
| **Blocked** | Commands like `rm -rf /`, `mkfs`, `dd if=/dev/zero` are rejected outright — no confirmation can override |
| **High** | Destructive operations require the user to type "yes" in full — a single "y" won't bypass |
| **Medium** | Potentially risky commands show a warning alongside the standard Y/n prompt |
| **Low** | Safe commands proceed with normal confirmation |

This hybrid approach — LLM for context-aware risk assessment, rules for hard guarantees — means the agent can run powerful commands without being dangerous. The safety system doesn't guess. It enforces.

### TUI

The terminal interface is built with **Ink v4 + React 18** — the same rendering engine used by modern CLI tools. Instead of naive spinners or scrolling log output, it renders five distinct panels that transition cleanly as the agent progresses:

| Phase | What the user sees |
|-------|-------------------|
| **Planning** | Animated spinner with terrain scan checkmarks appearing in real time |
| **Approving** | Full numbered plan with a clean Y/n prompt |
| **Running** | The exact command with a bordered output box streaming results live |
| **Recovering** | Red failure banner with diagnosis and a revised plan |
| **Done** | Step-by-step summary with checkmarks, timing, and command output |

A controller bridges the agent loop and the React renderer: the loop pushes state updates, Ink re-renders, and user input flows back as promises. This keeps the agent logic completely decoupled from the UI — the same agent drives both the terminal UI and the headless mode.

### Headless Mode

When running in CI, piped input, or non-interactive environments, nlsh automatically detects the absence of a TTY and switches to a clean console mode with simple text prompts. No raw terminal manipulation, no React — just straightforward stdout logging. The same agent, the same logic, zero configuration.

### Automated Commit Messages

When nlsh detects a `git commit` command, it intercepts execution, captures the working tree diff, and sends it to the LLM to generate a meaningful commit message — then injects it into the command automatically. This was one of the most technically nuanced features because the message must reflect the *actual* changes, not the agent's intent. The diff is real. The message is contextual. The developer doesn't lift a finger.

## What Makes It Different

- **No AI framework dependencies** — zero abstraction layers between the agent and the LLM
- **No sandbox** — runs in your real shell, security is permission-based
- **Terrain-first** — context is gathered from the actual project before any LLM call
- **Cross-platform** — works on Windows, macOS, and Linux with full feature parity
- **Single process** — no daemon, no background server

## Module Breakdown

| Module | Responsibility |
|--------|---------------|
| **Agent loop** | Orchestrates the plan→command→execute→recover cycle |
| **Planner** | Converts intent into structured steps (LLM Call #1) |
| **Command generator** | Produces exact shell commands per step (LLM Call #2) |
| **Executor** | Runs commands via child process with real-time streaming |
| **Recovery** | Diagnoses failures and revises remaining steps (LLM Call #3) |
| **Safety** | Rule engine that blocks or flags dangerous commands |
| **Terrain** | Scans project files and git state to build context |
| **Memory** | Serializes task state to disk for persistence |
| **TUI** | Ink + React panels for planning, execution, and results |
| **LLM router** | Manages API calls and model selection |
| **Commit message** | Captures diffs and generates commit messages

## Tests

128 unit tests across 11 files. No integration test flakiness — unit tests mock LLM responses and test each module in isolation.

## Stats

- **~150KB** unpacked on npm
- **1 LLM call to plan** + **1 per step to command** + **optional recovery on failure**
- **128 tests**, all passing
- **Zero AI framework dependencies** — no LangChain, no LangGraph, no Vercel AI SDK
