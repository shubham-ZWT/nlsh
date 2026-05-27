# Pitch Deck — nlsh

## Slide 1: The Problem

**Remembering terminal commands is a productivity tax every developer pays.**

- Different OS means different syntax (`ls` vs `dir`, `rm` vs `del`)
- Tools like git, docker, npm each have dozens of flags — you use them once a month, forget them next time
- New developers hit a wall: they know what they want to do but not the command to do it
- Copy-pasting from ChatGPT breaks flow — context lives in a browser tab, not your terminal

**The result:** constant context-switching, repeated Google searches, and frustration over things you *know* how to do but can't recall the exact incantation.

---

## Slide 2: The Solution

**nlsh — Say what you want in plain English. nlsh gets it done.**

```bash
npm install -g @shubham.dev/nlsh
nlsh setup
nlsh "push the latest changes to main"
```

**Key differentiators:**

| Capability | nlsh | Chat GPT | Claude Code / opencode |
|------------|------|----------|------------------------|
| Executes commands | ✅ Directly | ❌ Copy-paste | ✅ Directly |
| Scans your project first | ✅ Terrain awareness | ❌ No context | ❌ Chat-based |
| Plan-first architecture | ✅ Plan → Execute | ❌ One-shot | ❌ Inline chat |
| Auto-recovery on failure | ✅ Revises & retries | ❌ You debug | ❌ You debug |
| Risk-based safety | ✅ 4-tier gate | ❌ None | ❌ Minimal |

**Three LLM calls per task cycle:** Plan → Command → Recovery. Every call has full terrain context.

### Terrain Harness

Most agents operate blind — they guess your stack from your question. nlsh scans the workspace before acting: `package.json`, `Dockerfile`, `docker-compose.yml`, git branch, recent commits, available tools. This profile feeds every LLM call. The agent knows you're in a NestJS monorepo on `feature/auth` with 3 unstaged files before it generates a single command. No guessing. No "what stack are you using?"

### Custom Agent Orchestration

A state-machine architecture with three precise LLM invocations:

| Phase | Input → Output | Purpose |
|-------|---------------|---------|
| **Plan** | Intent + terrain → Structured steps | Breaks vague intent into verifiable milestones |
| **Command** | Full task state + current step → Exact shell command | Translates a goal into the right shell incantation |
| **Recovery** | History + error output → Diagnosis + revised plan | Recovers from failures without losing progress |

Between LLM calls, deterministic logic handles safety validation, user confirmation, command execution, and state persistence. LLM for reasoning, code for execution — flexible and predictable.

### Terminal Experience — Five Phases

```
Planning  →  Approving  →  Running  →  Recovering  →  Done
```

---

## Slide 3: Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ (ESM) |
| **LLM** | Groq API (llama-3.3-70b-versatile) via raw `fetch()` |
| **Terminal UI** | Ink v4 + React 18 |
| **Shell execution** | execa (child process with streaming) |
| **Language** | TypeScript |
| **Package** | Published on npm as `@shubham.dev/nlsh` |

**Architecture highlights:**
- Zero AI framework dependencies (no LangChain, no LangGraph, no Vercel AI SDK)
- Single-process agent loop — no daemon, no server
- Rule-based safety engine that blocks destructive commands
- Cross-platform: Windows, macOS, Linux
- 128 unit tests, all passing

---

## Slide 4: Target Audience

**Primary: Individual developers and engineers**

- Junior devs learning git, docker, and CLI workflows
- Senior devs who want to move faster without context-switching
- Engineers working across multiple OS environments (Windows + WSL + Linux)

**Secondary: Teams and organizations**

- Onboarding new team members — no need to memorize project-specific commands
- CI/CD pipelines — headless mode works in non-interactive environments
- Open source contributors — quick ramp-up on unfamiliar projects (terrain scans the repo)

**Market fit:** Every developer who uses a terminal is a potential user. The CLI developer tools market includes millions of active users across npm, Homebrew, and package managers.

**Distribution:** npm install — zero friction. One command to install, one command to configure, one command to use.
