import { setTimeout as delay } from 'node:timers/promises';

const knownCodes = {
  ERR_VALIDATION: [400, 'The ledger rejected the input.'],
  ERR_UNAUTHORIZED: [403, 'This identity cannot perform the ledger operation.'],
  ERR_NOT_FOUND: [404, 'The requested ledger record does not exist.'],
  ERR_CONFLICT: [409, 'The operation conflicts with existing ledger data.'],
  ERR_STATE: [409, 'The ledger record is not in an eligible state.'],
  ERR_CAP_EXCEEDED: [409, 'The policy weekly cap would be exceeded.'],
  ERR_QUORUM_PENDING: [409, 'The event is waiting for quorum or the reading window to close.'],
} as const;

export class ApiError extends Error {
  constructor(public code: string, public status: number, message: string, public businessRejection = false) {
    super(message);
  }
}

export function ledgerFailure(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const details = error as { message?: unknown; details?: { message?: unknown }[]; name?: string };
  const messages = [details?.message, ...(Array.isArray(details?.details) ? details.details.map((detail) => detail.message) : [])];
  for (const [code, [status, message]] of Object.entries(knownCodes)) {
    if (messages.some((text) => typeof text === 'string' && text.includes(code + ':'))) {
      const businessRejection = code === 'ERR_STATE' && messages.some((text) => typeof text === 'string' &&
        ['policy was not eligible for the complete event window', 'missing overlapping platform attestation']
          .some((reason) => text.includes('ERR_STATE: ' + reason)));
      return new ApiError(code, status, message, businessRejection);
    }
  }
  if (details?.name === 'CommitStatusError' || details?.name === 'SubmitError') {
    return new ApiError('ERR_COMMIT_UNKNOWN', 503, 'The commit could not be confirmed. Retry with the same operation ID.');
  }
  return new ApiError('ERR_LEDGER_UNAVAILABLE', 503, 'The ledger operation could not be completed.');
}

export async function retry<T>(
  attempt: () => Promise<T>,
  retryable: (error: unknown) => boolean,
  onRetry: () => void,
  wait: (ms: number) => Promise<unknown> = delay,
  random: () => number = Math.random,
): Promise<T> {
  for (let index = 0; ; index++) {
    try {
      return await attempt();
    } catch (error) {
      if (index >= 3 || !retryable(error)) throw error;
      onRetry();
      const cap = Math.min(1500, 150 * 2 ** index);
      await wait(Math.round(cap / 2 + random() * cap / 2));
    }
  }
}
