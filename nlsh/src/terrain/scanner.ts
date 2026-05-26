import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execaSync } from 'execa';
import { load as parseYaml } from 'js-yaml';
import { createHash } from 'node:crypto';

export interface DockerService {
  name: string;
  ports?: string[];
  volumes?: string[];
}

export interface WorkflowJob {
  name: string;
  steps: string[];
}

export interface TerrainProfile {
  projectName?: string;
  stack?: string[];
  packageManager?: string;
  scripts?: Record<string, string>;
  services?: DockerService[];
  dockerBaseImage?: string;
  dockerExposedPorts?: string[];
  githubWorkflows?: WorkflowJob[];
  requiredEnvVars?: string[];
  makeTargets?: string[];
  commitStyle?: string;
  currentBranch?: string;
  readmeSummary?: string;
  scannedAt: string;
  checksum: string;
}

function checksumFile(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

export function computeChecksum(cwd: string): string {
  const files = ['package.json', 'docker-compose.yml', 'Dockerfile'];
  const hash = createHash('md5');
  for (const f of files) {
    hash.update(checksumFile(join(cwd, f)));
  }
  return hash.digest('hex');
}

function scanPackageJson(cwd: string): Partial<TerrainProfile> {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return {};

  try {
    const pkg = JSON.parse(readFileSync(path, 'utf-8'));
    const stack: string[] = ['node'];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;

    if (deps.react || deps['react-dom']) stack.push('react');
    if (deps.express || deps.fastify || deps.koa) stack.push('express');
    if (deps.next) stack.push('next');
    if (deps.vue) stack.push('vue');
    if (deps.typescript) stack.push('typescript');
    if (deps.prisma || deps['typeorm']) stack.push('orm');
    if (deps.pg || deps['pg-native']) stack.push('postgres');
    if (deps.redis) stack.push('redis');

    const pm = pkg.packageManager
      ? pkg.packageManager.split('@')[0]
      : existsSync(join(cwd, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : existsSync(join(cwd, 'yarn.lock'))
          ? 'yarn'
          : 'npm';

    return {
      projectName: pkg.name,
      stack,
      packageManager: pm,
      scripts: pkg.scripts || {},
    };
  } catch {
    return {};
  }
}

function scanDockerCompose(cwd: string): { services?: DockerService[] } {
  const ymlFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  let path = '';
  for (const f of ymlFiles) {
    const full = join(cwd, f);
    if (existsSync(full)) { path = full; break; }
  }
  if (!path) return {};

  try {
    const raw = parseYaml(readFileSync(path, 'utf-8')) as Record<string, any>;
    if (!raw || !raw.services) return {};

    const services: DockerService[] = Object.entries(raw.services).map(([name, svc]: [string, any]) => ({
      name,
      ports: svc.ports ? svc.ports.map((p: string) => String(p)) : undefined,
      volumes: svc.volumes ? svc.volumes.map((v: string) => String(v)) : undefined,
    }));

    return { services };
  } catch {
    return {};
  }
}

function scanDockerfile(cwd: string): { dockerBaseImage?: string; dockerExposedPorts?: string[] } {
  const path = join(cwd, 'Dockerfile');
  if (!existsSync(path)) return {};

  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n');
    let dockerBaseImage = '';
    const dockerExposedPorts: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const fromMatch = trimmed.match(/^FROM\s+(\S+)/i);
      if (fromMatch && !dockerBaseImage) dockerBaseImage = fromMatch[1];
      const exposeMatch = trimmed.match(/^EXPOSE\s+(\d+)/i);
      if (exposeMatch) dockerExposedPorts.push(exposeMatch[1]);
    }

    return { dockerBaseImage: dockerBaseImage || undefined, dockerExposedPorts };
  } catch {
    return {};
  }
}

function scanGitHubWorkflows(cwd: string): { githubWorkflows?: WorkflowJob[] } {
  const workflowsDir = join(cwd, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return {};

  try {
    const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    const workflows: WorkflowJob[] = [];

    for (const file of files) {
      try {
        const raw = parseYaml(readFileSync(join(workflowsDir, file), 'utf-8')) as Record<string, any>;
        if (!raw || !raw.jobs) continue;
        for (const [jobName, job] of Object.entries(raw.jobs) as [string, any][]) {
          const steps = (job.steps || []).map((s: any) => s.name || s.run || 'unknown');
          workflows.push({ name: jobName, steps });
        }
      } catch {
        // skip invalid workflow files
      }
    }

    return { githubWorkflows: workflows };
  } catch {
    return {};
  }
}

function scanEnvExample(cwd: string): { requiredEnvVars?: string[] } {
  const path = join(cwd, '.env.example');
  if (!existsSync(path)) return {};

  try {
    const content = readFileSync(path, 'utf-8');
    const vars = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0].trim());

    return { requiredEnvVars: vars };
  } catch {
    return {};
  }
}

function scanMakefile(cwd: string): { makeTargets?: string[] } {
  const path = join(cwd, 'Makefile');
  if (!existsSync(path)) return {};

  try {
    const content = readFileSync(path, 'utf-8');
    const targets = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[a-zA-Z][a-zA-Z0-9_-]+\s*:/.test(l) && !l.startsWith('.') && !l.includes('='))
      .map((l) => l.split(':')[0].trim());

    return { makeTargets: targets };
  } catch {
    return {};
  }
}

function scanReadme(cwd: string): { readmeSummary?: string } {
  const path = join(cwd, 'README.md');
  if (!existsSync(path)) return {};

  try {
    const content = readFileSync(path, 'utf-8');
    const plainText = content
      .replace(/#{1,6}\s*/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim();

    const words = plainText.split(/\s+/).slice(0, 500).join(' ');
    return { readmeSummary: words };
  } catch {
    return {};
  }
}

interface GitInfo {
  commitStyle?: string;
  currentBranch?: string;
}

function scanGitLog(cwd: string): GitInfo {
  try {
    const log = execaSync('git', ['log', '--oneline', '-20'], { cwd, timeout: 3000 });
    const messages = log.stdout.split('\n').filter(Boolean);

    // Detect conventional commits
    const conventionalCount = messages.filter((m) =>
      /^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)(\(.+\))?:/.test(m)
    ).length;

    const commitStyle = conventionalCount > messages.length * 0.5 ? 'conventional' : 'plain';

    // Get current branch
    let currentBranch = '';
    try {
      currentBranch = execaSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 2000 }).stdout.trim();
    } catch {
      currentBranch = 'unknown';
    }

    return { commitStyle, currentBranch };
  } catch {
    return {};
  }
}

export function scanProject(cwd: string): TerrainProfile {
  const results = {
    ...scanPackageJson(cwd),
    ...scanDockerCompose(cwd),
    ...scanDockerfile(cwd),
    ...scanGitHubWorkflows(cwd),
    ...scanEnvExample(cwd),
    ...scanMakefile(cwd),
    ...scanReadme(cwd),
    ...scanGitLog(cwd),
  };

  return {
    ...results,
    scannedAt: new Date().toISOString(),
    checksum: computeChecksum(cwd),
  };
}
