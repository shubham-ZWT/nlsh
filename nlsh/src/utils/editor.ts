import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';

export async function openEditor(content: string): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-'));
  const tmpFile = join(tmpDir, 'command.sh');
  writeFileSync(tmpFile, content, 'utf-8');

  const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vim');

  try {
    await execa(editor, [tmpFile], { stdio: 'inherit' });
    const modified = readFileSync(tmpFile, 'utf-8').trim();
    return modified || content;
  } finally {
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
    try { unlinkSync(tmpDir) } catch { /* ignore */ }
  }
}
