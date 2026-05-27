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
  safetyWarnings: string[];
  fullYesRequired: boolean;
  dryRun: boolean;
}

export class TuiController {
  state: TuiState;
  private _resolveInput: ((value: string) => void) | null = null;
  private _listeners: Set<() => void> = new Set();
  private _inputBuffer: string = '';

  constructor(intent: string, dryRun = false) {
    this.state = {
      phase: 'planning',
      intent,
      plan: [],
      steps: [],
      currentStepIndex: 0,
      commandOutput: '',
      startTime: Date.now(),
      terrainDetails: [],
      safetyWarnings: [],
      fullYesRequired: false,
      dryRun,
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
    if (this.state.fullYesRequired) {
      if (value === 'y' || value === 'Y') {
        this._inputBuffer = 'y';
      } else if (value === 'e' || value === 'E') {
        if (this._inputBuffer === 'y') this._inputBuffer = 'ye';
        else this._inputBuffer = '';
      } else if (value === 's' || value === 'S') {
        if (this._inputBuffer === 'ye') {
          this._inputBuffer = '';
          if (this._resolveInput) {
            const r = this._resolveInput;
            this._resolveInput = null;
            r('y');
          }
        } else {
          this._inputBuffer = '';
        }
      } else if (value === 'n' || value === 'N') {
        this._inputBuffer = '';
        if (this._resolveInput) {
          const r = this._resolveInput;
          this._resolveInput = null;
          r('n');
        }
      } else {
        this._inputBuffer = '';
      }
      return;
    }

    if (this._resolveInput) {
      const r = this._resolveInput;
      this._resolveInput = null;
      r(value);
    }
  }

  get inputProgress(): string {
    return this._inputBuffer;
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
