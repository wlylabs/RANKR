import type { TraceErrorCode } from "./types";

const STATUS: Record<TraceErrorCode, number> = {
  token: 422,
  program: 422,
  unsupported: 400,
  invalid: 400,
  nokey: 501,
  upstream: 502,
  limit: 429,
};

/** A wallet that can't be traced, and why; `status` is the API's answer. */
export class TraceError extends Error {
  constructor(
    readonly code: TraceErrorCode,
    message: string,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }
}
