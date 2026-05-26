import { scanProject } from './scanner.js';
import { loadProfile, saveProfile, isStale } from './profile.js';
import type { TerrainProfile } from './scanner.js';

export type { TerrainProfile } from './scanner.js';

export async function ensureTerrain(cwd: string): Promise<TerrainProfile | null> {
  const existing = loadProfile(cwd);

  if (existing && !isStale(cwd, existing)) {
    return existing;
  }

  if (!existing) {
    console.log('  ◆ Mapping terrain...');
  }

  const profile = scanProject(cwd);
  saveProfile(cwd, profile);

  if (!existing) {
    const parts: string[] = [];
    if (profile.stack?.length) parts.push(profile.stack.join(', '));
    if (profile.services?.length) parts.push(`${profile.services.length} service(s)`);
    if (profile.requiredEnvVars?.length) parts.push(`${profile.requiredEnvVars.length} env var(s)`);

    if (parts.length > 0) {
      console.log(`    ✓ ${parts.join(' — ')}`);
    }
    console.log('    ✓ Terrain saved');
  }

  return profile;
}
