import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeChecksum } from './scanner.js';
import type { TerrainProfile } from './scanner.js';

const TERRAIN_DIR = '.nlsh';
const TERRAIN_FILE = 'terrain.json';

function getTerrainPath(cwd: string): string {
  return join(cwd, TERRAIN_DIR, TERRAIN_FILE);
}

export function loadProfile(cwd: string): TerrainProfile | null {
  const path = getTerrainPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as TerrainProfile;
  } catch {
    return null;
  }
}

export function saveProfile(cwd: string, profile: TerrainProfile): void {
  const dir = join(cwd, TERRAIN_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = getTerrainPath(cwd);
  writeFileSync(path, JSON.stringify(profile, null, 2), 'utf-8');
}

export function isStale(cwd: string, profile: TerrainProfile): boolean {
  const current = computeChecksum(cwd);
  return current !== profile.checksum;
}
