import React, { useEffect, useState } from 'react';
import { Box, Text, Newline } from 'ink';
import type { TuiState } from './index.js';

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];

function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

export function PlanningPanel({ state }: { state: TuiState }) {
  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Spinner />
        <Text> Analyzing intent...</Text>
      </Box>
      {state.terrainDetails.map((d, i) => (
        <Box key={i} marginLeft={2}>
          <Text color="green">✓</Text>
          <Text> {d}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function PlanPanel({ state }: { state: TuiState }) {
  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Goal: </Text>
        <Text>{state.intent}</Text>
      </Box>
      <Text bold underline>Plan:</Text>
      {state.plan.map((step) => (
        <Box key={step.id}>
          <Text>  {step.id}. {step.intent}</Text>
        </Box>
      ))}
      <Newline />
      <Box>
        <Text color="cyan">  [Y] Run this plan   [n] Cancel</Text>
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
    <Box borderStyle="round" borderColor={fullYesRequired ? 'red' : 'yellow'} flexDirection="column" paddingX={1} paddingY={1}>
      {dryRun && (
        <Box marginBottom={1}>
          <Text color="yellow" bold>⚠ DRY RUN — command will not be executed</Text>
        </Box>
      )}
      <Box>
        <Text bold>Command: </Text>
        <Text bold color="cyan">{command}</Text>
      </Box>
      <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
        <Text>{explanation || 'No explanation provided.'}</Text>
      </Box>
      {safetyWarnings.length > 0 && (
        <Box borderStyle="single" borderColor="yellow" marginTop={1} paddingX={1} flexDirection="column">
          {safetyWarnings.map((w, i) => (
            <Box key={i}>
              <Text color="yellow">⚠ {w}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1} gap={2}>
        <Text>
          Risk: <Text color={getRiskColor(risk)} bold>{risk?.toUpperCase() || 'UNKNOWN'}</Text>
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
          <Text color="red">  Type "yes" to confirm   [n] Abort</Text>
        ) : (
          <Text color="cyan">  [Y] Run   [n] Skip   [e] Edit</Text>
        )}
      </Box>
    </Box>
  );
}

export function ExecutionPanel({ state }: { state: TuiState }) {
  const pastSteps = state.steps.filter((s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed');
  const currentStep = state.steps.find((s) => s.status === 'executing' || s.status === 'confirming');
  const futureSteps = state.steps.filter((s) => s.status === 'pending');

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Goal: </Text>
        <Text>{state.intent}</Text>
      </Box>

      {pastSteps.map((s) => (
        <Box key={s.id}>
          <Text color={s.status === 'failed' ? 'red' : 'green'}>
            {s.status === 'failed' ? '✗' : '✓'}
          </Text>
          <Text> {s.intent}</Text>
          {s.status === 'skipped' && <Text color="gray"> (skipped)</Text>}
        </Box>
      ))}

      {currentStep && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">▶</Text>
            <Text bold> {currentStep.intent}</Text>
            <Text color="gray">  [step {currentStep.id}]</Text>
          </Box>
          {currentStep.command && (
            <Box marginLeft={2}>
              <Text dimColor>$ {currentStep.command}</Text>
            </Box>
          )}
          {currentStep.status === 'confirming' && (
            <Box marginLeft={2}>
              <Text color="yellow">? Awaiting your response...</Text>
            </Box>
          )}
          {state.commandOutput && (
            <Box flexDirection="column" marginLeft={2} borderStyle="single" borderColor="gray" paddingX={1}>
              {state.commandOutput.split('\n').filter(Boolean).map((line, i) => (
                <Text key={i} wrap="truncate">{line}</Text>
              ))}
            </Box>
          )}
          {!state.commandOutput && currentStep.status === 'executing' && (
            <Box marginLeft={2}>
              <Spinner />
              <Text> Running...</Text>
            </Box>
          )}
        </Box>
      )}

      {futureSteps.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Remaining:</Text>
          {futureSteps.map((s) => (
            <Text key={s.id} dimColor>  {s.id}. {s.intent}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function RecoveryPanel({ state }: { state: TuiState }) {
  const failedStep = state.steps.find((s) => s.status === 'failed');

  return (
    <Box borderStyle="round" borderColor="red" flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="red" bold>✗ Step Failed</Text>
      </Box>
      {failedStep && (
        <Box marginTop={1}>
          <Text bold>{failedStep.intent}</Text>
        </Box>
      )}
      {state.diagnosis && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold underline>Why it failed:</Text>
          <Text>{state.diagnosis}</Text>
        </Box>
      )}
      {state.revisedPlan && state.revisedPlan.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>Revised plan:</Text>
          {state.revisedPlan.map((step) => (
            <Text key={step.id} color="cyan">  → {step.intent}</Text>
          ))}
        </Box>
      )}
      {state.revisedPlan && state.revisedPlan.length > 0 && (
        <Box marginTop={1}>
          <Text color="cyan">  [Y] Run revised plan   [n] Abort</Text>
        </Box>
      )}
      {(!state.revisedPlan || state.revisedPlan.length === 0) && (
        <Box marginTop={1}>
          <Text color="red">  [n] Abort</Text>
        </Box>
      )}
    </Box>
  );
}

export function DonePanel({ state }: { state: TuiState }) {
  const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
  const allCompleted = state.steps.length > 0 && state.steps.every((s) => s.status === 'completed');

  return (
    <Box borderStyle="round" borderColor={allCompleted ? 'green' : 'red'} flexDirection="column" paddingX={1} paddingY={1}>
      {allCompleted ? (
        <Box>
          <Text color="green" bold>✓ All {state.steps.length} steps completed</Text>
        </Box>
      ) : (
        <Box>
          <Text color="red" bold>✗ Failed</Text>
        </Box>
      )}
      <Box>
        <Text dimColor>  Total: {elapsed}s</Text>
      </Box>
      <Newline />
      {state.steps.map((s) => (
        <Box key={s.id}>
          <Text color={s.status === 'completed' ? 'green' : s.status === 'failed' ? 'red' : 'yellow'}>
            {s.status === 'completed' ? '✓' : s.status === 'failed' ? '✗' : '◌'}
          </Text>
          <Text> {s.intent}</Text>
          {s.status === 'failed' && state.diagnosis && (
            <Text dimColor> — {state.diagnosis}</Text>
          )}
        </Box>
      ))}
      {!allCompleted && state.error && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold underline color="red">Why it failed:</Text>
          <Text>{state.error}</Text>
        </Box>
      )}
    </Box>
  );
}
