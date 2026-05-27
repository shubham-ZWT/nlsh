import React, { useEffect, useState } from 'react';
import { Box, render, useInput } from 'ink';
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

    // When fullYesRequired, route all input through controller's buffer
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

  switch (state.phase) {
    case 'planning':
      return <PlanningPanel state={state} />;
    case 'approving':
      return <PlanPanel state={state} />;
    case 'running':
      return <RunningView state={state} controller={controller} />;
    case 'recovering':
      return <RecoveryPanel state={state} />;
    case 'done':
    case 'failed':
      return <DonePanel state={state} />;
    default:
      return <Box>Loading...</Box>;
  }
}

function RunningView({
  state,
  controller,
}: {
  state: TuiState;
  controller: TuiController;
}) {
  const currentStep = state.steps.find(
    (s) => s.status === 'confirming'
  );

  if (currentStep && state.currentCommand) {
    return (
      <Box flexDirection="column">
        <ExecutionPanel state={state} />
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
