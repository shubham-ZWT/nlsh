# nlsh — Natural Language Shell Agent
## Build Plan & Architecture Reference

> **Hackathon:** Codex Hackathon | **Timeline:** 7 Days | **Goal:** Ship a working shell agent to production

---

## What We're Building

Not a command translator. A **shell agent that thinks in goals**.

The user speaks intent. The agent builds a plan, executes it step by step, watches what happens, and recovers from failures — all inside a single terminal process with no local server, no framework, no magic.

---

## Core Principles

- **One process.** The CLI talks to Groq directly. No Express server, no localhost port, no separate process to manage.
- **No framework.** No LangChain, no LlamaIndex. The agent loop is ~30 lines of plain TypeScript.
- **Memory is just state.** A single task object passed into every LLM call. That's it.
- **Plan first, command second.** The agent generates a plan of intents, then generates each command right before it runs — with full context of what already happened.

---

## Terrain — The One Thing That Makes nlsh Different

Every other shell tool is blind. It sees your intent, generates a command, done. It has zero knowledge of what you're actually working on.

**Terrain gives nlsh eyes.**

Before the agent acts on anything, it surveys your project — reads your config files, understands your stack, learns your git habits — and builds a project profile it carries into every single LLM call. When you say "get this running locally," it already knows you have a `docker-compose.yml`, a `.env.example` that needs copying, and a `db:migrate` script in `package.json`. It doesn't ask. It already knows.

### What Terrain scans

| File | What it learns |
|---|---|
| `package.json` | Project name, scripts, dependencies, package manager |
| `docker-compose.yml` | Services, ports, volumes, dependencies between containers |
| `Dockerfile` | Build stages, base image, exposed ports |
| `.github/workflows/*.yml` | CI pipeline steps, deployment targets |
| `README.md` | What the project does, how to run it |
| `git log --oneline -20` | Commit message style, branch naming conventions |
| `.env.example` | Required environment variables |
| `Makefile` | Available make targets |

### How it works

**First run in a directory:**
```
$ nlsh "get this running locally"
  
  ◆ Mapping terrain...
    ✓ Node.js project — Express API + React frontend
    ✓ Docker Compose — postgres, redis, api, web services
    ✓ 3 env vars required (copied from .env.example)
    ✓ Commit style: conventional commits (feat/fix/chore)
    ✓ Saved to .nlsh/terrain.json
```

**Every run after that:** instant — reads from `.nlsh/terrain.json`. No rescan, no delay.

**When project changes:** Terrain watches checksums of key files. If `package.json` or `docker-compose.yml` changes, it silently updates the relevant parts of the profile on next run.

### What Terrain unlocks

Without Terrain, the planner prompt gets: intent + OS + installed tools.

With Terrain, the planner prompt gets: intent + OS + installed tools + **your exact project stack, your scripts, your service names, your commit style, your branch conventions**.

The difference in output quality is not subtle. "Push it to main" with Terrain generates a commit message in `feat(scope): description` format because it learned that from your git log. "Start the database" runs `docker compose up postgres -d` using your actual service name, not a guess.

### The `nlsh terrain` command

```bash
nlsh terrain          # show current terrain profile
nlsh terrain --refresh  # force a full rescan
nlsh terrain --clear    # delete terrain profile for this directory
```

### Terrain in the task object

```javascript
{
  id: "uuid",
  originalIntent: "push it to main",
  terrain: {                              // ← injected from .nlsh/terrain.json
    projectName: "myapp",
    stack: ["node", "express", "react"],
    packageManager: "pnpm",
    services: ["postgres", "redis", "api", "web"],
    commitStyle: "conventional",          // learned from git log
    branchPrefix: "feature/",            // learned from git log
    scripts: { dev: "...", build: "...", "db:migrate": "..." },
    requiredEnvVars: ["DATABASE_URL", "JWT_SECRET", "REDIS_URL"],
    scannedAt: "2026-05-25T10:00:00Z",
    checksum: "abc123"                    // to detect when rescan needed
  },
  context: { ... },
  plan: [ ... ],
  ...
}
```

### Terrain is the demo

The single most impressive thing you can show a judge is this:

1. Clone a repo they've never seen before
2. `cd` into it
3. Type `nlsh "get this running locally"`
4. Watch nlsh map the terrain and build a perfect, project-specific plan in under 10 seconds

No other tool does this. Every other tool is generic. nlsh knows the terrain.

---

## Architecture

### Single Process Flow

```
User types intent
       ↓
  nlsh process starts
       ↓
  LLM Call #1 → returns Step[] plan
       ↓
  Show plan in TUI → user approves
       ↓
  Loop: for each step
    → LLM Call #2 → generate exact command for this step (with history)
    → Show command in TUI → user confirms
    → execa runs command → stdout/stderr streamed to TUI
    → result saved to task memory
    → if exitCode !== 0:
         → LLM Call #3 → analyze failure, return revised plan
         → show diagnosis + new plan → user approves → continue
    → next step
       ↓
  Task complete → saved to ~/.nlsh/history.json
```

### The Task Object (Your Memory)

This object is created at the start of every task and passed into every single LLM call. This is how the agent remembers everything.

```javascript
{
  id: "uuid",
  originalIntent: "push it to main",
  context: {
    cwd: "/home/user/myproject",
    branch: "feature/auth",
    os: "linux",
    shell: "bash",
    installedTools: ["git", "docker", "node", "npm"]
  },
  plan: [
    { id: 1, intent: "check current branch" },
    { id: 2, intent: "check for uncommitted changes" },
    { id: 3, intent: "stage all changes" },
    { id: 4, intent: "write commit message from diff" },
    { id: 5, intent: "push to origin main" }
  ],
  currentStep: 3,
  history: [
    { stepId: 1, command: "git branch", stdout: "* feature/auth", exitCode: 0 },
    { stepId: 2, command: "git status", stdout: "Changes not staged...", exitCode: 0 }
  ],
  status: "running",  // planning | running | recovering | done | failed
  recoveryAttempts: 0
}
```

### LLM Strategy

| Call Type | When | Model | What it receives | What it returns |
|---|---|---|---|---|
| **Plan** | Once at task start | Groq llama-3.1-70b | intent + context | `Step[]` array of intents |
| **Command** | Before each step | Groq llama-3.1-70b | full task object + current step | `{ command, explanation, risk, reversible }` |
| **Diff summary** | Before commit step | Claude / GPT-4o | git diff output | meaningful commit message |
| **Recovery** | On step failure | Groq llama-3.1-70b | full task object + error | `{ diagnosis, revisedRemainingSteps }` |

Use Groq for speed on 90% of calls. Route to a smarter model only when reading a large diff or analyzing a complex error.

### Folder Structure

```
nlsh/
  src/
    index.ts          ← entry point, parses args, kicks off agent
    config.ts         ← reads ~/.nlsh/config.json (API keys, provider choice)
    agent/
      planner.ts      ← LLM Call #1: intent → Step[]
      executor.ts     ← runs commands via execa, streams output
      recovery.ts     ← LLM Call #3: failed task → revised plan
      memory.ts       ← task state object, serialize to disk after every step
    terrain/
      scanner.ts      ← scans project files, builds terrain profile
      watcher.ts      ← checksums key files, triggers rescan on change
      profile.ts      ← reads/writes .nlsh/terrain.json
    llm/
      groq.ts         ← fetch() wrapper around Groq API
      claude.ts       ← fetch() wrapper around Claude API
      router.ts       ← picks model based on task complexity/token count
    ui/
      tui.tsx         ← Ink components: plan view, step view, recovery view
      panels.tsx      ← command panel, warning panel, context panel
  demo/
    server.js         ← WebSocket server for browser demo (Railway deploy)
    public/
      index.html      ← xterm.js browser terminal
  tsconfig.json
  package.json
  AGENT_SPEC.md       ← source of truth for Codex sessions
```

---

## The Three LLM Prompts (Write These Before Coding)

### Prompt 1 — Planner

```
You are a shell agent planner. Given a user's intent and their system context,
return a JSON array of steps needed to accomplish the goal.

Each step has only an id and an intent (plain English, not a command).
Do not generate commands yet. Just the plan.

Context: {{ task.context }}
Intent: {{ task.originalIntent }}

Return ONLY valid JSON. No explanation. No markdown.
[{ "id": 1, "intent": "..." }, ...]
```

### Prompt 2 — Command Generator

```
You are a shell agent. Generate the exact shell command for the current step.
Use the history of completed steps to inform your decision.

Full task state: {{ JSON.stringify(task) }}
Current step intent: {{ currentStep.intent }}

Return ONLY valid JSON:
{
  "command": "...",
  "explanation": "...",
  "risk": "low|medium|high",
  "reversible": true|false,
  "confidence": 0.0-1.0
}
```

### Prompt 3 — Recovery

```
You are a shell agent debugger. A step failed. Analyze why and return
a revised plan for the remaining steps.

Full task state including history: {{ JSON.stringify(task) }}
Failed step: {{ JSON.stringify(failedStep) }}
Error output: {{ errorOutput }}

Return ONLY valid JSON:
{
  "diagnosis": "plain English explanation of what went wrong",
  "canContinue": true|false,
  "revisedRemainingSteps": [{ "id": N, "intent": "..." }, ...]
}
```

---

## Phase 1 — Foundation (Day 1)

**Goal:** Single intent → single command → runs → output shown. End to end, no TUI yet.

### Tasks

**1.1 — Repo scaffold**
- Init npm package with `package.json` (`type: "module"`)
- Create folder structure above
- Add TypeScript (`tsconfig.json`, `tsx`, `@types/node`)
- Add dependencies: `ink`, `react`, `execa`, `groq-sdk`, `lowdb`, `chalk`, `ora`
- Add `nlsh` bin entry in package.json (points to `dist/index.js`)

**1.2 — Config module**
- `config.js` reads `~/.nlsh/config.json`
- If file doesn't exist, run `nlsh setup` wizard
- Wizard asks: provider (Groq / Ollama), API key, preferred model
- Saves to `~/.nlsh/config.json`

**1.3 — Groq client**
- `llm/groq.js` — single `callGroq(messages, systemPrompt)` function
- Uses `fetch()` directly to `https://api.groq.com/openai/v1/chat/completions`
- Returns parsed JSON response
- Handles errors and timeouts

**1.4 — Context collector**
- Detects OS (`process.platform`)
- Detects shell (`$SHELL` env var)
- Gets cwd (`process.cwd()`)
- Runs `which git`, `which docker`, `which node` etc. to detect installed tools
- Returns a typed context object

**1.5 — Basic planner**
- `agent/planner.js` takes intent + context
- Calls Groq with Prompt 1
- Parses and returns `Step[]`

**1.6 — Basic executor**
- `agent/executor.js` wraps execa
- Runs a command string
- Returns `{ stdout, stderr, exitCode }`

**1.7 — Wire it together**
- `index.js` reads `process.argv[2]` as intent
- Collects context
- Calls planner → logs plan to console
- For each step, calls command generator → logs command → calls executor → logs output

**Checkpoint:** `npm start "list all docker containers"` (or `tsx src/index.ts`) prints the plan, generates a command per step, runs them, shows output. No TUI, raw console output is fine.

---

## Phase 2 — Agent Loop & Memory (Day 2)

**Goal:** The agent remembers everything, recovers from failures, completes multi-step tasks reliably.

### Tasks

**2.1 — Task object + memory module**
- `agent/memory.js` creates and manages the task object
- `createTask(intent, context)` → returns initial task object with uuid
- `updateTask(task, stepResult)` → appends to history, increments currentStep
- `saveTask(task)` → serializes to `~/.nlsh/tasks/<id>.json`
- `loadTask(id)` → deserializes from disk (for resume feature)

**2.2 — Command generator**
- `agent/planner.js` — add `generateCommand(task, step)` function
- Calls Groq with Prompt 2 (full task object + current step)
- Returns `{ command, explanation, risk, reversible, confidence }`

**2.3 — Recovery module**
- `agent/recovery.js` takes full task object + failed step + error output
- Calls Groq with Prompt 3
- Returns `{ diagnosis, canContinue, revisedRemainingSteps }`

**2.4 — The agent loop**
- `agent/index.js` — the while loop
- Calls planner once to get initial plan
- For each step: generate command → execute → store result
- On failure: call recovery → if canContinue, replace remaining plan and continue
- On recovery failure: surface to user with full diagnosis

**2.5 — LLM router**
- `llm/router.js` — `route(task, callType)` returns which model to use
- If callType is `diff_summary` or context is > 3000 tokens → Claude
- Otherwise → Groq
- Falls back to Groq if Claude key not configured

**Checkpoint:** `nlsh "push it to main"` with uncommitted changes runs the full multi-step flow, generates a meaningful commit message from the diff, and if the push fails (e.g. diverged branch) the agent analyzes the error and proposes a revised plan.

---

## Phase 3 — Terrain (Day 3)

**Goal:** nlsh knows your project before it acts. Every LLM call is enriched with project-specific context.

### Tasks

**3.1 — Scanner**
- `terrain/scanner.js` — reads the following files if they exist in cwd:
  - `package.json` → extract name, scripts, dependencies, packageManager
  - `docker-compose.yml` → extract service names, ports, volumes
  - `Dockerfile` → extract base image, exposed ports, build stages
  - `.github/workflows/*.yml` → extract job names and steps
  - `.env.example` → extract required env var names (not values)
  - `Makefile` → extract target names
  - `README.md` → first 500 words only
- Runs `git log --oneline -20` → extract commit message patterns, branch names
- Returns a typed `TerrainProfile` object

**3.2 — Profile module**
- `terrain/profile.js`
- `loadProfile(cwd)` → reads `.nlsh/terrain.json` in project directory
- `saveProfile(cwd, profile)` → writes `.nlsh/terrain.json`
- `isStale(profile)` → checksums `package.json`, `docker-compose.yml`, and compares to stored checksums. Returns true if any changed.

**3.3 — Watcher / init flow**
- On every `nlsh` run, before planning:
  - Check if `.nlsh/terrain.json` exists
  - If not → show `◆ Mapping terrain...` spinner → run scanner → save profile → continue
  - If exists → check `isStale()` → if stale, silently rescan changed files only → continue
  - If fresh → load and inject into task object, no visible delay

**3.4 — Inject terrain into task object**
- `agent/memory.js` — `createTask()` now accepts terrain profile
- Terrain stored under `task.terrain`
- All LLM prompts updated to include terrain in the context block

**3.5 — Terrain LLM prompt enrichment**
Update Prompt 1 (Planner) to include terrain:
```
Project terrain:
- Stack: {{ terrain.stack.join(', ') }}
- Package manager: {{ terrain.packageManager }}
- Available scripts: {{ Object.keys(terrain.scripts).join(', ') }}
- Docker services: {{ terrain.services.join(', ') }}
- Commit style: {{ terrain.commitStyle }}
- Branch prefix convention: {{ terrain.branchPrefix }}
- Required env vars: {{ terrain.requiredEnvVars.join(', ') }}
```

**3.6 — `nlsh terrain` command**
- `nlsh terrain` → pretty-prints current terrain profile
- `nlsh terrain --refresh` → deletes and rebuilds profile
- `nlsh terrain --clear` → deletes profile only

**Checkpoint:** Run `nlsh terrain` in a real project. The profile should correctly identify your stack, services, scripts, and commit style. Then run `nlsh "start the database"` — it should use your actual docker service name, not a generic one.

---

## Phase 4 — TUI (Day 4)

**Goal:** Replace raw console output with a proper terminal UI that shows the agent thinking, including the Terrain scan animation.

### UI States

The TUI has 5 states that transition as the agent progresses:

```
PLANNING    → spinner + "Analyzing intent..."
APPROVING   → full plan displayed, waiting for Y/n
RUNNING     → current step highlighted, previous steps checked off, output streaming
RECOVERING  → red failure banner, diagnosis text, revised plan, waiting for Y/n
DONE        → all steps checked, summary, time taken
```

### Tasks

**3.1 — Plan approval panel**

```
┌─ nlsh ──────────────────────────────────┐
│ Goal: push it to main                   │
│                                         │
│ Plan:                                   │
│  1. Check current branch                │
│  2. Check for uncommitted changes       │
│  3. Stage all changes                   │
│  4. Write commit message from diff      │
│  5. Push to origin/main                 │
│                                         │
│  [Y] Run this plan   [n] Cancel         │
└─────────────────────────────────────────┘
```

**3.2 — Step execution panel**

```
┌─ nlsh ──────────────────────────────────┐
│ ✓ Check current branch                  │
│ ✓ Check for uncommitted changes         │
│ ▶ Staging all changes          [step 3] │
│   git add .                             │
│   ──────────────────────────────────    │
│   (output streams here live)            │
│                                         │
│  2. Write commit message from diff      │
│  3. Push to origin/main                 │
└─────────────────────────────────────────┘
```

**3.3 — Command confirmation panel**

Each generated command is shown before execution:
```
┌─ Command ───────────────────────────────┐
│  git add .                              │
├─ What this does ────────────────────────┤
│  Stages all modified and new files      │
│  in the current directory               │
├─ Risk: LOW  │  Reversible: YES ─────────┤
│  [Y] Run   [n] Skip   [e] Edit         │
└─────────────────────────────────────────┘
```

**3.4 — Recovery panel**

```
┌─ Step Failed ───────────────────────────┐
│  ✗ Push to origin/main                  │
│                                         │
│  Why it failed:                         │
│  Remote has 2 commits you don't have.   │
│  Your branch has diverged.              │
│                                         │
│  Revised plan:                          │
│  → Fetch latest from origin             │
│  → Rebase your commits on top           │
│  → Push again                           │
│                                         │
│  [Y] Run revised plan   [n] Abort       │
└─────────────────────────────────────────┘
```

**3.5 — Edit mode**
- `e` key opens the generated command in `$EDITOR`
- On save, command is shown back in TUI for final Y/n
- History entry tagged with `[edited]`

**Checkpoint:** Full TUI flow working. Terrain scan animation shows on first run. Looks good, transitions between states cleanly, output streams in real time.

---

## Phase 5 — Safety & History (Day 5)

**Goal:** Nothing dangerous runs silently. Everything is logged.

### Tasks

**4.1 — Safety middleware**

Applied before every command execution:

| Check | Action |
|---|---|
| Command matches blocklist (`rm -rf /`, `mkfs`, `dd if=/dev/zero`, fork bombs) | Hard block, show error, abort task |
| `risk === "high"` | Require user to type `yes` in full, not just `Y` |
| `reversible === false` | Show red irreversible badge, extra confirmation |
| Command contains `sudo` | Extra confirmation step regardless of risk level |
| `confidence < 0.75` | Show yellow low-confidence warning |

**4.2 — History module**
- Every executed command saved to `~/.nlsh/history.json` via lowdb
- Entry includes: timestamp, originalIntent, command, exitCode, risk, duration
- `nlsh history` command shows last 20 entries
- Up-arrow in TUI cycles through previous intents (not just commands)

**4.3 — Dry run mode**
- `NLSH_DRY_RUN=1 nlsh "..."` or `nlsh --dry-run "..."`
- Full plan and command generation runs normally
- Commands are shown but never executed
- Output panel shows `[DRY RUN — not executed]`

**Checkpoint:** Try running a dangerous command like "delete all docker volumes." It should be blocked or require full `yes` confirmation. History is persisted correctly.

---

## Phase 6 — The Killer Feature: Diff-Aware Commits (Day 6)

**Goal:** The commit message step reads the actual diff and writes a genuinely meaningful message.

This is the feature that separates nlsh from every other shell tool. Instead of "update files" or "fix stuff," the agent writes:

```
add JWT expiry validation to prevent stale token reuse in auth middleware
```

### Tasks

**5.1 — Diff reader**
- Before the commit step, executor runs `git diff --staged`
- If diff is under 4000 tokens → passes to LLM directly
- If diff is large → summarizes changed files and key hunks first

**5.2 — Commit message prompt**
```
You are a senior engineer writing a git commit message.
Look at this diff and write a commit message that explains WHY this
change was made, not just what files changed.

Rules:
- First line: 50 chars max, imperative mood, no period
- If needed, blank line then body explaining context
- No generic messages like "update files" or "fix bug"

Diff:
{{ diff }}
```

**5.3 — Route this call to the smarter model**
- This is the one place to use Claude or GPT-4o if configured
- Falls back to Groq if not

**Checkpoint:** Make a real code change, run `nlsh "push it to main"`, see a commit message that actually describes the change intelligently. Terrain's commit style knowledge means the message matches your project's convention.

---

## Phase 7 — Demo Server (Day 7)

**Goal:** Judges can try nlsh in a browser with zero install.

### How It Works

```
Browser (xterm.js) ←→ WebSocket ←→ demo/server.js on Railway ←→ nlsh agent ←→ Groq
```

The demo server runs the nlsh agent in a sandboxed environment. It has a fake git repo pre-loaded with some changes so the demo is always ready to show. The user types in the browser terminal and sees real agent output.

### Tasks

**6.1 — Demo server**
- `demo/server.js` — Express + `ws` package
- On WebSocket connection: spawn nlsh agent as child process
- Pipe WebSocket input → agent stdin
- Pipe agent stdout/stderr → WebSocket
- Timeout connections after 5 minutes

**6.2 — Browser terminal**
- `demo/public/index.html`
- xterm.js terminal, full screen, dark theme
- Connects to WebSocket on load
- Shows a welcome message with example commands to try

**6.3 — Pre-loaded demo repo**
- A fake git repo in the demo server with some staged changes
- Always in a state ready to demo "push it to main"
- Resets to this state after each session

**6.4 — Deploy to Railway**
- Push `demo/` to GitHub
- Connect repo to Railway
- Set env vars: `GROQ_API_KEY`, `NODE_ENV=demo`
- Get public URL

**Checkpoint:** Visit the Railway URL, see a terminal, type `push it to main` in the pre-loaded repo, watch the agent map terrain and execute the full plan.

---

## Phase 8 — Polish & Ship (Day 7 evening)

**Goal:** Clean README, demo GIF, npm publish, hackathon submission.

### Tasks

**7.1 — README**

Must include:
- One-line description
- GIF of the full demo (plan → execute → commit message → push)
- GIF of the recovery flow (failure → diagnosis → revised plan → success)
- Install instructions (`npm install -g nlsh`)
- Setup instructions (`nlsh setup`)
- Link to live demo

**7.2 — Record demo GIFs**
- Use `vhs` or `asciinema` to record terminal sessions
- Scenario 1: "push it to main" happy path
- Scenario 2: merge conflict recovery
- Scenario 3: Docker command with a meaningful error

**7.3 — npm publish**
```bash
npm login
npm publish --access public
```

**7.4 — Submission**
- GitHub repo link
- Live demo URL (Railway)
- npm package link
- 2-minute demo video

---

## Codex Workflow (How to Use Codex to Build This)

Since you're building this with Codex, every session needs context. Here's the protocol:

### Before any Codex session
Every session starts with this context block:

```
Project: nlsh — a shell agent CLI
Stack: Node.js ESM + TypeScript, Ink TUI, execa, Groq API (direct fetch, no framework)
Repo structure: [paste folder tree]
Current phase: Phase X
Read AGENT_SPEC.md for full architecture.

Task: [specific thing to build]
Expected output: [what done looks like]
```

### AGENT_SPEC.md is your source of truth
Keep this file updated as the project evolves. It's the one file that every Codex session reads to understand the whole system. Never let it go stale.

### One task per Codex session
Don't ask Codex to "build the whole agent loop." Give it one module at a time. If the task is bigger than ~150 lines of code, break it down further.

### Test before moving to next phase
Each phase has a checkpoint. Don't start Phase 3 until Phase 2's checkpoint works. Codex sessions compound — if the foundation is broken, everything built on top is broken.

---

## Dependencies

```json
{
  "dependencies": {
    "ink": "^4.4.1",
    "react": "^18.2.0",
    "execa": "^8.0.1",
    "groq-sdk": "^0.3.3",
    "lowdb": "^7.0.1",
    "chalk": "^5.3.0",
    "ora": "^8.0.1",
    "uuid": "^9.0.0",
    "ws": "^8.16.0",
    "js-yaml": "^4.1.0",
    "glob": "^10.3.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.19.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0"
  }
}
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `GROQ_API_KEY` | Groq API key | set via `nlsh setup` |
| `ANTHROPIC_API_KEY` | Claude API key for diff summaries | optional |
| `NLSH_DRY_RUN` | Show commands without running | `0` |
| `NLSH_PROVIDER` | `groq` or `ollama` | `groq` |
| `NLSH_EDITOR` | Editor for edit mode | `$EDITOR` or `vim` |
| `NLSH_HISTORY_MAX` | Max history entries | `500` |
| `NLSH_TERRAIN_REFRESH` | Force terrain rescan on every run | `0` |

---

## The Demo Script (Rehearse This)

### Scene 1 — Happy path with Terrain (90 seconds)
```
$ nlsh "push it to main"

  ◆ Mapping terrain...
    ✓ Node.js project — Express API
    ✓ Git: conventional commits, branch prefix feature/
    ✓ Terrain saved

🧠 Planning...

  Plan for: push it to main
  ─────────────────────────
  1. Check current branch
  2. Check for uncommitted changes  
  3. Stage all changes
  4. Write commit message from diff
  5. Push to origin/main

  [Y] Run this plan

▶ Step 1/5 — Check current branch
  $ git branch --show-current
  feature/auth ✓

▶ Step 2/5 — Check for uncommitted changes
  $ git status
  3 files modified ✓

▶ Step 3/5 — Stage all changes
  $ git add .
  ✓

▶ Step 4/5 — Write commit message from diff
  Reading diff...
  $ git commit -m "feat(auth): add JWT expiry check to prevent stale token reuse"
  ✓  ← note: conventional commit format learned from terrain

▶ Step 5/5 — Push to origin/main
  $ git push origin main
  ✓ Done
```

### Scene 2 — Terrain on an unfamiliar repo (killer demo, 60 seconds)
```
$ git clone https://github.com/someone/big-project && cd big-project
$ nlsh "get this running locally"

  ◆ Mapping terrain...
    ✓ Node.js + Python monorepo
    ✓ Docker Compose — postgres, redis, api, worker, web (5 services)
    ✓ Requires: DATABASE_URL, REDIS_URL, SECRET_KEY
    ✓ Setup script found: make bootstrap
    ✓ Terrain saved

  Plan:
  1. Copy .env.example to .env
  2. Install Node dependencies (pnpm install)
  3. Install Python dependencies (pip install -r requirements.txt)
  4. Start Docker services (docker compose up -d)
  5. Run database migrations (make db-migrate)
  6. Start the dev server (make dev)

  [Y] Run this plan
```

No googling. No reading the README. nlsh already read it.

### Scene 3 — Recovery (60 seconds)
```
$ nlsh "push it to main"

🧠 Planning...

  Plan for: push it to main
  ─────────────────────────
  1. Check current branch
  2. Check for uncommitted changes  
  3. Stage all changes
  4. Write commit message from diff
  5. Push to origin/main

  [Y] Run this plan

▶ Step 1/5 — Check current branch
  $ git branch --show-current
  feature/auth ✓

▶ Step 2/5 — Check for uncommitted changes
  $ git status
  3 files modified ✓

▶ Step 3/5 — Stage all changes
  $ git add .
  ✓

▶ Step 4/5 — Write commit message from diff
  Reading diff...
  $ git commit -m "add JWT expiry check to prevent stale token auth"
  ✓

▶ Step 5/5 — Push to origin/main
  $ git push origin main
  ✓ Done
```

### Scene 3 — Recovery (60 seconds)
```
▶ Step 5/5 — Push to origin/main
  $ git push origin main
  ✗ error: failed to push some refs

  ┌─ Recovery ──────────────────────────────┐
  │ Remote has 2 commits you don't have.    │
  │ Your branch has diverged from origin.   │
  │                                         │
  │ Revised plan:                           │
  │ → Fetch latest from origin              │
  │ → Rebase your commits on top            │
  │ → Push again (force-with-lease)         │
  │                                         │
  │ [Y] Run revised plan                    │
  └─────────────────────────────────────────┘

▶ Fetching origin... ✓
▶ Rebasing... ✓
▶ Pushing... ✓ Done
```

---

## Risks & How to Handle Them

| Risk | How to handle |
|---|---|
| Groq rate limit hit mid-task | Pause task, show user, offer to resume when limit resets |
| LLM returns invalid JSON | Retry once with stricter prompt, fall back to showing raw response |
| Command hangs (no output) | 30s timeout per command, show timeout error, offer to kill |
| Git merge conflict in rebase | Recovery module detects conflict markers in output, generates resolution steps |
| Demo server overloaded during judging | Pre-record GIF as backup, link prominently in README |

---

*nlsh — Natural Language Shell Agent | Hackathon Build Plan | May 2026*
