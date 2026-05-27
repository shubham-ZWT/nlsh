# nlsh — Natural Language Shell Agent

## Project Overview

A shell agent that thinks in goals, not commands. User speaks intent, agent builds a plan, executes step-by-step, watches results, recovers from failures — all in a single terminal process.

**Key differentiator:** Terrain — nlsh scans the project before acting (reads package.json, docker-compose.yml, git log, README, etc.) and injects that context into every LLM call.

## Stack

- Node.js ESM (`"type": "module"`)
- Ink v4 + React v18 for TUI
- execa for shell command execution
- Groq API (direct fetch, no framework)
- No LangChain, no LlamaIndex, no Express server

## Architecture

Single process flow:

```
User intent → Context collector → Planner (LLM Call #1 → Step[])
  → Show plan in TUI → User approves
  → Loop: for each step
    → Command generator (LLM Call #2 → { command, risk })
    → Safety check → User confirms
    → execa runs → result saved to task
    → On failure: Recovery (LLM Call #3 → revised plan)
  → Task complete → saved to history
```

## Folder Structure

```
nlsh/
  src/
    index.ts          ← entry point, parses args, kicks off agent
    config.ts         ← reads ~/.nlsh/config.json
    agent/
      index.ts        ← the main agent loop (while loop)
      planner.ts      ← LLM Call #1: intent → Step[]
      executor.ts     ← runs commands via execa (supports streaming)
      recovery.ts     ← LLM Call #3: failed step → revised plan
      memory.ts       ← task state object, serialize to disk
    terrain/
      scanner.ts      ← scans project files, builds profile
      profile.ts      ← reads/writes .nlsh/terrain.json
      index.ts        ← ensureTerrain init flow
    llm/
      groq.ts         ← fetch() wrapper around Groq API
      router.ts       ← routes to Groq
    ui/
      index.ts        ← TuiController class, TuiState type
      tui.tsx         ← Ink App component + render function
      panels.tsx      ← panel components (Planning, Plan, Command, Execution, Recovery, Done)
    utils/
      platform.ts     ← OS detection, shell detection, which/where shim
      editor.ts       ← openEditor for edit mode
  test/
    unit/             ← unit tests for each module
  AGENTS.md           ← this file
  package.json
```

## The Task Object (Memory)

Created at task start, passed into every LLM call. This is how the agent remembers everything:

```js
{
  id: "uuid",
  originalIntent: "push it to main",
  terrain: { /* injected from .nlsh/terrain.json */ },
  context: {
    cwd: "/home/user/project",
    branch: "feature/auth",
    os: "linux",
    shell: "bash",
    installedTools: ["git", "docker", "node", "npm"]
  },
  plan: [
    { id: 1, intent: "check current branch" },
    { id: 2, intent: "check for uncommitted changes" },
    ...
  ],
  currentStep: 3,
  history: [
    { stepId: 1, command: "git branch", stdout: "* feature/auth", exitCode: 0 },
  ],
  status: "running",  // planning | running | recovering | done | failed
  recoveryAttempts: 0
}
```

## LLM Strategy

| Call | Model | Input | Output |
|------|-------|-------|--------|
| Plan | Groq llama-3.1-70b | intent + context + terrain | `Step[]` |
| Command | Groq llama-3.1-70b | full task + current step | `{ command, explanation, risk, reversible, confidence }` |
| Commit message | Claude/GPT-4o (or Groq fallback) | git diff | meaningful commit message |
| Recovery | Groq llama-3.1-70b | task + error | `{ diagnosis, canContinue, revisedSteps }` |

## Coding Conventions

- **ESM only** — `import`/`export`, no `require`
- **No frameworks** — no LangChain, no Express for production
- **Ink for all UI** — no ora spinners (Ink takes over terminal)
- **Direct fetch for LLM APIs** — SDKs optional, prefer fetch
- **Task object is the only memory** — no DB, no vector store
- **Errors are structured** — every error gets parsed into `{ type, message, recoverable }`
- **Windows compatible** — use `process.platform`, `where.exe` fallback, `ComSpec`

## Key Design Decisions

1. Terrain is the demo — cloning an unknown repo and running one command is the killer feature
2. Plan-first, command-second — agent generates all intents first, then generates commands one at a time with full context
3. User confirms every command — always ask before executing (except in demo mode)
4. Recovery is cheap — just regenerate remaining steps, don't abort the whole task
5. No sandboxing — runs in user's shell directly (like Claude Code), safety is permission-based

## Current Status

Phase 4 — TUI (completed)

## TUI Architecture

The TUI uses Ink v4 + React 18 to render five panel states:

| Phase | Component | Description |
|-------|-----------|-------------|
| `planning` | `PlanningPanel` | Spinner + "Analyzing intent..." + terrain checkmarks |
| `approving` | `PlanPanel` | Full plan displayed, Y/n input via Ink's `useInput` |
| `running` | `CommandPanelView` + `ExecutionPanel` | Command confirmation (Y/n/e), then streaming execution |
| `recovering` | `RecoveryPanel` | Red failure banner, diagnosis, revised plan, Y/n |
| `done` / `failed` | `DonePanel` | Summary with step checkmarks and timing |

### TuiController (bridge between agent loop and UI)

```
agent loop ──updates──> TuiController ──notifies──> Ink App (re-renders)
agent loop <──input──── TuiController <──useInput── Ink App
```

Key methods:
- `update(partial)` — sets partial state and notifies subscribers
- `appendOutput(text)` — streams command output to the UI
- `waitForInput()` — returns a promise resolved by Ink's `useInput`
- `handleInput(value)` — resolves `waitForInput` promise

### Agent loop integration

The agent loop (`src/agent/index.ts`) no longer uses `console.log`. Instead it:
1. Calls `controller.update({ phase, ... })` for every state transition
2. Awaits `controller.waitForInput()` for user confirmation (Y/n/e)
3. Passes `onData` callback to `executeCommand` for streaming output
4. Supports edit mode (press 'e') via `openEditor()` in `src/utils/editor.ts`

### Edit mode (Task 3.5)

When user presses `e` on a command:
1. Writes the command to a temp file
2. Opens `$EDITOR` (or `notepad` on Windows)
3. Reads back the modified command
4. Continues to execute the edited command

## Prompts

### Planner
```
You are a shell agent planner. Given a user's intent and their system context,
return a JSON array of steps needed to accomplish the goal.

Each step has only an id and an intent (plain English, not a command).
Do not generate commands yet. Just the plan.

Context: {{ task.context }}
Terrain: {{ task.terrain }}
Intent: {{ task.originalIntent }}

Return ONLY valid JSON. No explanation. No markdown.
[{ "id": 1, "intent": "..." }, ...]
```

### Command Generator
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

### Recovery
```
You are a shell agent debugger. A step failed. Analyze why and return
a revised plan for the remaining steps.

Full task state including history: {{ JSON.stringify(task) }}
Failed step: {{ JSON.stringify(failedStep) }}
Error output: {{ errorOutput }}

Return ONLY valid JSON:
{
  "diagnosis": "plain English explanation",
  "canContinue": true|false,
  "revisedRemainingSteps": [{ "id": N, "intent": "..." }, ...]
}
```

## Common Commands

- `node src/index.js "your intent"` — run the agent
- `node src/index.js --dry-run "your intent"` — dry run
- `npm run test:unit` — unit tests
- `npm run test:integration` — integration tests (sandbox)
