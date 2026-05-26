import { execaSync } from 'execa';
import { platform, homedir, hostname } from 'node:os';

export interface SystemContext {
  cwd: string;
  hostname: string;
  os: string;
  shell: string;
  installedTools: string[];
  home: string;
  nodeVersion: string;
}

const TOOLS = ['git', 'docker', 'node', 'npm', 'pnpm', 'yarn', 'python', 'make'] as const;

function detectShell(): string {
  const shell = process.env.SHELL || process.env.ComSpec || process.env.PSHOME;
  if (shell) return shell;
  if (platform() === 'win32') return 'powershell.exe';
  return '/bin/bash';
}

function detectTools(): string[] {
  const installed: string[] = [];
  const whichCmd = platform() === 'win32' ? 'where' : 'which';
  for (const tool of TOOLS) {
    try {
      execaSync(whichCmd, [tool], { timeout: 2000 });
      installed.push(tool);
    } catch {
      // not found
    }
  }
  return installed;
}

export function collectContext(): SystemContext {
  return {
    cwd: process.cwd(),
    hostname: hostname(),
    os: platform(),
    shell: detectShell(),
    installedTools: detectTools(),
    home: homedir(),
    nodeVersion: process.version,
  };
}
