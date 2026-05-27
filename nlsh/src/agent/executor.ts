import { execa } from 'execa';

export interface ExecResult {
  stdout: string;
  stderr: string;
  all: string;
  exitCode: number;
  failed: boolean;
  timedOut: boolean;
  duration: number;
}

export interface ExecOptions {
  timeout?: number;
  onData?: (chunk: string) => void;
}

export async function executeCommand(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { timeout = 0, onData } = options;

  try {
    const subprocess = execa(command, {
      shell: true,
      timeout,
      reject: false,
      all: true,
    });

    if (onData && subprocess.all) {
      subprocess.all.on('data', (chunk: Buffer) => {
        onData(chunk.toString());
      });
    }

    const result = await subprocess;

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      all: result.all || '',
      exitCode: result.exitCode ?? -1,
      failed: result.failed ?? false,
      timedOut: result.timedOut ?? false,
      duration: Date.now(),
    };
  } catch (err) {
    return {
      stdout: '',
      stderr: (err as Error).message,
      all: (err as Error).message,
      exitCode: -1,
      failed: true,
      timedOut: false,
      duration: Date.now(),
    };
  }
}
