#!/usr/bin/env node

import { getConfig, setupWizard } from './config.js';
import { collectContext } from './utils/platform.js';
import { runAgent } from './agent/index.js';
import { loadProfile, saveProfile } from './terrain/profile.js';
import { scanProject } from './terrain/scanner.js';
import { ensureTerrain } from './terrain/index.js';
import type { TerrainProfile } from './terrain/index.js';
import { TuiController } from './ui/index.js';
import { startTUI } from './ui/tui.js';
import { printHistory } from './history/index.js';

async function showTerrain() {
  const cwd = process.cwd();
  const profile = loadProfile(cwd);
  if (!profile) {
    console.log('  No terrain profile found. Run an intent first to scan the project.');
    return;
  }
  console.log('');
  console.log('  Terrain Profile');
  console.log('  ───────────────');
  if (profile.projectName) console.log(`  Project: ${profile.projectName}`);
  if (profile.stack?.length) console.log(`  Stack: ${profile.stack.join(', ')}`);
  if (profile.packageManager) console.log(`  Package manager: ${profile.packageManager}`);
  if (profile.scripts && Object.keys(profile.scripts).length > 0) {
    console.log(`  Scripts: ${Object.keys(profile.scripts).join(', ')}`);
  }
  if (profile.services?.length) {
    console.log(`  Services: ${profile.services.map((s) => s.name).join(', ')}`);
    for (const svc of profile.services) {
      if (svc.ports) console.log(`    ${svc.name} ports: ${svc.ports.join(', ')}`);
    }
  }
  if (profile.requiredEnvVars?.length) console.log(`  Required env vars: ${profile.requiredEnvVars.join(', ')}`);
  if (profile.commitStyle) console.log(`  Commit style: ${profile.commitStyle}`);
  if (profile.currentBranch) console.log(`  Branch: ${profile.currentBranch}`);
  if (profile.dockerBaseImage) console.log(`  Base image: ${profile.dockerBaseImage}`);
  if (profile.dockerExposedPorts?.length) console.log(`  Exposed ports: ${profile.dockerExposedPorts.join(', ')}`);
  if (profile.makeTargets?.length) console.log(`  Make targets: ${profile.makeTargets.join(', ')}`);
  console.log(`  Scanned: ${profile.scannedAt}`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('');
    console.log('  nlsh — Natural Language Shell Agent');
    console.log('');
    console.log('  Usage:');
    console.log('    nlsh "your intent"    Run the agent');
    console.log('    nlsh --dry-run "..."  Dry run (show commands, no execution)');
  console.log('    npm run dry "..."     Same as above via npm');
    console.log('    nlsh setup            Configure API keys');
    console.log('    nlsh history          Show command history');
    console.log('    nlsh terrain           Show terrain profile');
    console.log('    nlsh terrain --refresh Force rescan terrain');
    console.log('    nlsh terrain --clear   Delete terrain profile');
    console.log('    nlsh --help            Show this help');
    console.log('');
    return;
  }

  if (args[0] === 'setup') {
    await setupWizard();
    return;
  }

  if (args[0] === 'history') {
    printHistory();
    return;
  }

  if (args[0] === 'terrain') {
    const cwd = process.cwd();
    if (args[1] === '--refresh') {
      console.log('  ◆ Rescanning terrain...');
      const profile = scanProject(cwd);
      saveProfile(cwd, profile);
      console.log('  ✓ Terrain refreshed');
      return;
    }
    if (args[1] === '--clear') {
      const { existsSync, rmSync } = await import('node:fs');
      const { join } = await import('node:path');
      const dir = join(cwd, '.nlsh');
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        console.log('  ✓ Terrain cleared');
      } else {
        console.log('  No terrain to clear.');
      }
      return;
    }
    await showTerrain();
    return;
  }

  // Parse flags
  const dryRunEnv = process.env.NLSH_DRY_RUN === '1';
  const dryRunIndex = args.indexOf('--dry-run');
  if (dryRunIndex !== -1) args.splice(dryRunIndex, 1);
  const dryRun = dryRunEnv || dryRunIndex !== -1;
  const headless = args.includes('--headless');
  if (headless) args.splice(args.indexOf('--headless'), 1);
  const intent = args.join(' ');

  const config = getConfig();

  if (!config.apiKey) {
    console.log('  No API key configured. Run `nlsh setup` first.');
    return;
  }

  const context = collectContext();

  // Terrain scan
  let terrain: TerrainProfile | null = null;
  try {
    terrain = await ensureTerrain(context.cwd);
  } catch {
    // terrain is optional
  }

  // Check if we can use Ink TUI (needs a real TTY)
  const hasTTY = !!process.stdin.isTTY && !!process.stdout.isTTY;

  if (headless || !hasTTY) {
    // Fallback to simple console mode
    const { runHeadless } = await import('./headless.js');
    const task = await runHeadless(intent, context, config, terrain ?? undefined);
    if (task.status === 'done') {
      console.log('  ✓ Done');
    } else {
      console.log('  ✗ Failed');
      process.exit(1);
    }
    return;
  }

  // Start TUI (Ink)
  let tui: ReturnType<typeof startTUI>;
  const controller = new TuiController(intent, dryRun);
  try {
    if (terrain) {
      const details: string[] = [];
      if (terrain.stack?.length) details.push(`${terrain.stack.join(', ')}`);
      if (terrain.services?.length) details.push(`${terrain.services.length} service(s)`);
      if (terrain.requiredEnvVars?.length) details.push(`${terrain.requiredEnvVars.length} env var(s)`);
      controller.update({ terrainDetails: details });
    }
    tui = startTUI(controller);
  } catch (err) {
    console.error(`\n  nlsh needs a real terminal to run. Use a standard terminal emulator.\n`);
    process.exit(1);
  }

  const task = await runAgent(intent, context, config, controller, terrain ?? undefined);

  tui.unmount();
  await tui.waitUntilExit().catch(() => {});

  if (task.status === 'done') {
    console.log('  ✓ Done');
  } else if (task.status === 'failed') {
    console.log('  ✗ Failed after', task.history.length || controller.state.steps.length, 'step(s)');
    process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error('  ✗ Fatal error:', err.message);
  process.exit(1);
});
