import type {CleaningRequestInput} from './portal-contract';

export interface RequestOutcome {ok: boolean; status?: number}
/** An ambiguous delivery is retried byte-for-byte, with the original consent and key. */
export function createRequestAttempt(makeKey: () => string) {
  let pending: Readonly<CleaningRequestInput> | null = null;
  return {
    get pending() { return pending; },
    begin(input: Omit<CleaningRequestInput, 'idempotencyKey'>): Readonly<CleaningRequestInput> {
      return pending ??= Object.freeze({...input, idempotencyKey: makeKey()});
    },
    finish(outcome: RequestOutcome) {
      // 408/409 and transport/5xx may conceal an accepted previous attempt.
      const rejected = outcome.status !== undefined && outcome.status >= 400 && outcome.status < 500
        && outcome.status !== 408 && outcome.status !== 409;
      if (outcome.ok || rejected) pending = null;
    },
  };
}
