import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { TuiState } from './index.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 60);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

function Separator() {
  return <Text dimColor>{"\u2500".repeat(40)}</Text>;
}

export function PlanningPanel({ state }: { state: TuiState }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Spinner />
        <Text> Analyzing intent...</Text>
      </Box>
      {state.terrainDetails.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {state.terrainDetails.map((d, i) => (
            <Box key={i} marginLeft={3}>
              <Text color="greenBright">✓</Text>
              <Text> {d}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function PlanPanel({ state }: { state: TuiState }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>plan</Text>
        <Text dimColor> for </Text>
        <Text bold>{state.intent}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {state.plan.map((step) => (
          <Box key={step.id}>
            <Text dimColor>{String(step.id).padStart(2, ' ')}.</Text>
            <Text> {step.intent}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">[Y] Run this plan</Text>
        <Text>   </Text>
        <Text dimColor>[n] Cancel</Text>
      </Box>
    </Box>
  );
}

function getRiskColor(risk?: string): string {
  switch (risk) {
    case 'high': return 'red';
    case 'medium': return 'yellow';
    default: return 'green';
  }
}

export function CommandPanelView({
  command,
  explanation,
  risk,
  reversible,
  confidence,
  safetyWarnings,
  fullYesRequired,
  dryRun,
}: {
  command: string;
  explanation: string;
  risk: string;
  reversible: boolean;
  confidence: number;
  safetyWarnings: string[];
  fullYesRequired: boolean;
  dryRun: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="single" borderColor="gray">
      {dryRun && (
        <Box marginBottom={1}>
          <Text color="yellow" bold>⚠ DRY RUN — command will not be executed</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>$ </Text>
        <Text bold color="cyanBright">{command}</Text>
      </Box>
      {explanation && (
        <Box marginTop={1}>
          <Text dimColor>{explanation}</Text>
        </Box>
      )}
      {safetyWarnings.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {safetyWarnings.map((w, i) => (
            <Box key={i}>
              <Text color="yellow">⚠ {w}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1} gap={2}>
        <Text>
          Risk: <Text color={getRiskColor(risk)}>{risk?.toUpperCase() || '?'}</Text>
        </Text>
        <Text>
          Reversible: <Text color={reversible ? 'green' : 'red'}>{reversible ? 'YES' : 'NO'}</Text>
        </Text>
        <Text>
          Confidence: <Text color={confidence >= 0.75 ? 'green' : 'yellow'}>{Math.round(confidence * 100)}%</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        {fullYesRequired ? (
          <Text color="red">Type "yes" to confirm   [n] Abort</Text>
        ) : (
          <Text>
            <Text color="cyan">[Y] Run</Text>
            <Text>   </Text>
            <Text dimColor>[n] Skip   [e] Edit</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}

export function ExecutionPanel({ state }: { state: TuiState }) {
  const pastSteps = state.steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed'
  );
  const currentStep = state.steps.find(
    (s) => s.status === 'executing' || s.status === 'confirming'
  );
  const futureSteps = state.steps.filter((s) => s.status === 'pending');

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>plan</Text>
        <Text dimColor> for </Text>
        <Text bold>{state.intent}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {pastSteps.map((s) => (
          <Box key={s.id}>
            <Text color={s.status === 'failed' ? 'redBright' : 'greenBright'}>
              {s.status === 'failed' ? '\u2717' : '\u2713'}
            </Text>
            <Text> {s.intent}</Text>
            {s.status === 'skipped' && <Text dimColor> (skipped)</Text>}
          </Box>
        ))}
        {currentStep && (
          <Box flexDirection="column" marginTop={pastSteps.length > 0 ? 0 : 0}>
            <Box>
              <Text color="cyanBright">{'\u25B6'}</Text>
              <Text bold> {currentStep.intent}</Text>
            </Box>
            {currentStep.command && (
              <Box marginLeft={3}>
                <Text dimColor>$ </Text>
                <Text dimColor>{currentStep.command}</Text>
              </Box>
            )}
            {state.commandOutput && (
              <Box
                flexDirection="column"
                marginLeft={3}
                marginTop={1}
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
              >
                {state.commandOutput.split('\n').filter(Boolean).map((line, i) => (
                  <Text key={i} wrap="truncate">{line}</Text>
                ))}
              </Box>
            )}
            {currentStep.status === 'executing' && !state.commandOutput && (
              <Box marginLeft={3} marginTop={1}>
                <Spinner />
                <Text> Running...</Text>
              </Box>
            )}
          </Box>
        )}
        {futureSteps.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {futureSteps.map((s) => (
              <Box key={s.id}>
                <Text dimColor>{'\u25CB'}</Text>
                <Text dimColor> {s.intent}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function RecoveryPanel({ state }: { state: TuiState }) {
  const failedStep = state.steps.find((s) => s.status === 'failed');

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="redBright" bold>✗ Step Failed</Text>
      </Box>
      {failedStep && (
        <Box marginTop={1}>
          <Text bold>{failedStep.intent}</Text>
        </Box>
      )}
      {state.diagnosis && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>Why it failed:</Text>
          <Text>{state.diagnosis}</Text>
        </Box>
      )}
      {state.revisedPlan && state.revisedPlan.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Separator />
          <Text bold>Revised plan:</Text>
          {state.revisedPlan.map((step) => (
            <Box key={step.id} marginLeft={1}>
              <Text color="cyanBright">{'\u2192'} {step.intent}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        {state.revisedPlan && state.revisedPlan.length > 0 ? (
          <Box>
            <Text color="cyan">[Y] Run revised plan</Text>
            <Text>   </Text>
            <Text dimColor>[n] Abort</Text>
          </Box>
        ) : (
          <Text color="red">[n] Abort</Text>
        )}
      </Box>
    </Box>
  );
}

export function DonePanel({ state }: { state: TuiState }) {
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
  const allCompleted = state.steps.length > 0 && state.steps.every((s) => s.status === 'completed');

  return (
    <Box flexDirection="column" paddingX={1}>
      {allCompleted ? (
        <Box>
          <Text color="greenBright" bold>✓ All {state.steps.length} steps completed  </Text>
          <Text dimColor>({elapsed}s)</Text>
        </Box>
      ) : (
        <Box>
          <Text color="redBright" bold>✗ Failed  </Text>
          <Text dimColor>({elapsed}s)</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {state.steps.map((s) => (
          <Box key={s.id} flexDirection="column">
            <Box>
              <Text
                color={
                  s.status === 'completed'
                    ? 'greenBright'
                    : s.status === 'failed'
                      ? 'redBright'
                      : 'yellow'
                }
              >
                {s.status === 'completed' ? '\u2713' : s.status === 'failed' ? '\u2717' : '\u25CB'}
              </Text>
              <Text> {s.intent}</Text>
              {s.status === 'failed' && state.diagnosis && (
                <Text dimColor> — {state.diagnosis}</Text>
              )}
            </Box>
            {s.command && (
              <Box marginLeft={3} marginTop={0}>
                <Text dimColor>$ </Text>
                <Text dimColor>{s.command}</Text>
              </Box>
            )}
            {s.output && (
              <Box
                flexDirection="column"
                marginLeft={3}
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                marginTop={0}
              >
                {s.output.split('\n').filter(Boolean).map((line, i) => (
                  <Text key={i} wrap="truncate">{line}</Text>
                ))}
              </Box>
            )}
          </Box>
        ))}
      </Box>
      {!allCompleted && state.error && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="redBright">Why it failed:</Text>
          <Text>{state.error}</Text>
        </Box>
      )}
    </Box>
  );
}
