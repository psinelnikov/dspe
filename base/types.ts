export interface Action {
  data: {
    message: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DataFixed {
  opType: string;
  opCommand: string;
  originalMessage: string;
  [key: string]: unknown;
}

export interface ActionResult {
  data: string | null;
  status: number;
  log: string | null;
  [key: string]: unknown;
}

export type HandlerFn = (
  state: unknown,
  msg: string
) => Promise<[string | null, number, string | null]> | [string | null, number, string | null];

export type StateReportFn = (state: unknown) => unknown;

export interface HandlerRegistration {
  opType: string;
  opCommand: string;
  handler: HandlerFn;
}

export interface Framework {
  setState(state: unknown): void;
  handle(opType: string, opCommand: string, handler: HandlerFn): void;
  getState(): unknown;
}
