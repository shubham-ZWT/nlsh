const BLOCKLIST_PATTERNS = [
  { pattern: /^rm\s+-rf\s+\//, reason: 'Recursive root deletion' },
  { pattern: /^rm\s+-rf\s+\/[*]/, reason: 'Recursive root deletion' },
  { pattern: /^mkfs/, reason: 'Filesystem formatting' },
  { pattern: /^dd\s+if=\/dev\/zero/, reason: 'Raw disk write' },
  { pattern: /^dd\s+if=\/dev\/random/, reason: 'Raw disk write' },
  { pattern: /^:\(\)\s*\{/, reason: 'Fork bomb' },
  { pattern: /^>\s*\/dev\/(sda|sdb|sdc|nvme|hda)/, reason: 'Raw disk write' },
  { pattern: /^\s*>\s*\/dev\/null\s*&\s*$/, reason: 'Fork bomb variant' },
  { pattern: /^rmdir\s+\/s/, reason: 'Recursive directory deletion' },
  { pattern: /^del\s+\/f\s+\/s/, reason: 'Recursive file deletion' },
  { pattern: /^Remove-Item\s+-Recurse/, reason: 'Recursive deletion' },
];

const DESTRUCTIVE_DELETE_PATTERNS = [
  /^rm\s+-rf/,
  /^rmdir\s+\/s/,
  /^del\s+\/f\s+\/s/,
  /^Remove-Item\s+-Recurse/,
];

export interface SafetyCheck {
  blocked: boolean;
  blockReason?: string;
  fullYesRequired: boolean;
  warnings: string[];
}

export function checkSafety(
  command: string,
  risk: string,
  reversible: boolean,
  confidence: number
): SafetyCheck {
  const result: SafetyCheck = {
    blocked: false,
    fullYesRequired: false,
    warnings: [],
  };

  const trimmed = command.trim();

  // Blocklist check
  for (const entry of BLOCKLIST_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      result.blocked = true;
      result.blockReason = entry.reason;
      return result;
    }
  }

  // Risk check
  if (risk === 'high') {
    result.fullYesRequired = true;
  }

  // Override: destructive recursive delete patterns should always be high risk
  if (DESTRUCTIVE_DELETE_PATTERNS.some((p) => p.test(trimmed))) {
    if (risk !== 'high') {
      result.fullYesRequired = true;
      result.warnings.push('Destructive delete operation — overridden to high risk');
    }
  }

  // Irreversible check
  if (!reversible) {
    result.fullYesRequired = true;
    result.warnings.push('This command is irreversible');
  }

  // Sudo check
  if (/^sudo\s+/.test(trimmed)) {
    result.fullYesRequired = true;
    result.warnings.push('Requires elevated privileges (sudo)');
  }

  // Low confidence
  if (confidence < 0.75) {
    result.warnings.push(`Low confidence (${Math.round(confidence * 100)}%)`);
  }

  return result;
}
