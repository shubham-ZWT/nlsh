export type TuiPhase = 'planning' | 'approving' | 'running' | 'recovering' | 'done' | 'failed';

export interface StepState {
  id: number;
  intent: string;
  status: 'pending' | 'confirming' | 'executing' | 'completed' | 'failed' | 'skipped';
  command?: string;
  explanation?: string;
  risk?: string;
  reversible?: boolean;
  confidence?: number;
  output?: string;
}

export interface TuiState {
  phase: TuiPhase;
  intent: string;
  plan: { id: number; intent: string }[];
  steps: StepState[];
  currentStepIndex: number;
  currentCommand?: {
    command: string;
    explanation: string;
    risk: string;
    reversible: boolean;
    confidence: number;
  };
  commandOutput: string;
  diagnosis?: string;
  revisedPlan?: { id: number; intent: string }[];
  error?: string;
  startTime: number;
  terrainDetails: string[];
}

export class TuiController {
  state: TuiState;
  private _resolveInput: ((value: string) => void) | null = null;
  private _listeners: Set<() => void> = new Set();

  constructor(intent: string) {
    this.state = {
      phase: 'planning',
      intent,
      plan: [],
      steps: [],
      currentStepIndex: 0,
      commandOutput: '',
      startTime: Date.now(),
      terrainDetails: [],
    };
  }

  update(partial: Partial<TuiState>): void {
    Object.assign(this.state, partial);
    this._notify();
  }

  appendOutput(text: string): void {
    this.state.commandOutput += text;
    this._notify();
  }

  clearOutput(): void {
    this.state.commandOutput = '';
    this._notify();
  }

  setSteps(steps: StepState[]): void {
    this.state.steps = steps;
    this._notify();
  }

  updateStep(id: number, updates: Partial<StepState>): void {
    const step = this.state.steps.find((s) => s.id === id);
    if (step) {
      Object.assign(step, updates);
      this._notify();
    }
  }

  waitForInput(): Promise<string> {
    return new Promise((resolve) => {
      this._resolveInput = resolve;
    });
  }

  handleInput(value: string): void {
    if (this._resolveInput) {
      const r = this._resolveInput;
      this._resolveInput = null;
      r(value);
    }
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }
}
