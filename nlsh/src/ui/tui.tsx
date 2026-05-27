import React, { useEffect, useState } from 'react';
import { Box, render, Text, useInput } from 'ink';
import { TuiController, type TuiState } from './index.js';
import {
  PlanningPanel,
  PlanPanel,
  CommandPanelView,
  ExecutionPanel,
  RecoveryPanel,
  DonePanel,
} from './panels.js';

function App({ controller }: { controller: TuiController }) {
  const [state, setState] = useState<TuiState>(controller.state);

  useEffect(() => {
    return controller.subscribe(() => setState({ ...controller.state }));
  }, [controller]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') return;

    if (state.fullYesRequired) {
      controller.handleInput(input);
      return;
    }

    if (state.phase === 'approving' || state.phase === 'recovering') {
      if (input === 'y' || input === 'Y') controller.handleInput('y');
      else if (input === 'n' || input === 'N') controller.handleInput('n');
    } else if (state.phase === 'running' && state.currentCommand) {
      if (input === 'y' || input === 'Y') controller.handleInput('y');
      else if (input === 'n' || input === 'N') controller.handleInput('n');
      else if (input === 'e' || input === 'E') controller.handleInput('e');
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan" bold>nlsh</Text>
        {state.dryRun && <Text color="yellow" bold>  ⚠ dry-run</Text>}
      </Box>
      {renderPhase(state, controller)}
    </Box>
  );
}

function renderPhase(state: TuiState, controller: TuiController) {
  switch (state.phase) {
    case 'planning':
      return <PlanningPanel state={state} />;
    case 'approving':
      return <PlanPanel state={state} />;
    case 'running':
      return <RunningView state={state} />;
    case 'recovering':
      return <RecoveryPanel state={state} />;
    case 'done':
    case 'failed':
      return <DonePanel state={state} />;
    default:
      return <Box>Loading...</Box>;
  }
}

function RunningView({ state }: { state: TuiState }) {
  const currentStep = state.steps.find((s) => s.status === 'confirming');

  if (currentStep && state.currentCommand) {
    return (
      <Box flexDirection="column">
        <ExecutionPanel state={state} />
        <Box marginTop={1}>
          <CommandPanelView
            command={state.currentCommand.command}
            explanation={state.currentCommand.explanation}
            risk={state.currentCommand.risk}
            reversible={state.currentCommand.reversible}
            confidence={state.currentCommand.confidence}
            safetyWarnings={state.safetyWarnings}
            fullYesRequired={state.fullYesRequired}
            dryRun={state.dryRun}
          />
        </Box>
      </Box>
    );
  }

  return <ExecutionPanel state={state} />;
}

export function startTUI(controller: TuiController) {
  const app = render(<App controller={controller} />);
  return {
    clear: () => app.clear(),
    waitUntilExit: () => app.waitUntilExit(),
    unmount: () => app.unmount(),
  };
}
