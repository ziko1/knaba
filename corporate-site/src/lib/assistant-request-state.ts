import type { AssistantTicket } from './assistant-recovery';

export type AssistantRequestScope = {
  signal: AbortSignal;
  isCurrent: () => boolean;
  check: () => void;
};

type RequestKind = 'poll' | 'action';
type PendingRequest = { controller: AbortController };
type RequestCallbacks<T> = {
  start?: () => void;
  success: (value: T) => void;
  error: (problem: unknown) => void;
  finish?: () => void;
};

export function sameAssistantTicket(left: AssistantTicket | null, right: AssistantTicket) {
  return left?.id === right.id && left.token === right.token;
}

// A foreground action supersedes the previous snapshot. Cancellation saves work;
// the generation and request identity also protect against late, uncancellable results.
export function createAssistantRequestState() {
  let generation = 0;
  let disposed = false;
  let poll: PendingRequest | null = null;
  let action: PendingRequest | null = null;

  const checkpoint = () => {
    const startedGeneration = generation;
    return () => !disposed && generation === startedGeneration;
  };
  const reset = () => {
    generation += 1;
    poll?.controller.abort();
    action?.controller.abort();
    poll = action = null;
  };

  return {
    checkpoint,
    reset,
    dispose: () => { disposed = true; reset(); },
    async run<T>(kind: RequestKind, work: (scope: AssistantRequestScope) => Promise<T>, callbacks: RequestCallbacks<T>) {
      if (disposed || action || (kind === 'poll' && poll)) return;
      if (kind === 'action') {
        poll?.controller.abort();
        poll = null;
      }
      const request = { controller: new AbortController() };
      if (kind === 'poll') poll = request;
      else action = request;
      const inGeneration = checkpoint();
      const isCurrent = () => inGeneration() && (kind === 'poll' ? poll : action) === request;
      const scope = {
        signal: request.controller.signal,
        isCurrent,
        check: () => { if (!isCurrent()) throw new DOMException('Conversation request superseded', 'AbortError'); },
      };
      try {
        callbacks.start?.();
        const result = await work(scope);
        if (isCurrent()) callbacks.success(result);
      } catch (problem) {
        if (isCurrent()) callbacks.error(problem);
      } finally {
        if (isCurrent()) {
          if (kind === 'poll') poll = null;
          else action = null;
          callbacks.finish?.();
        }
      }
    },
  };
}
