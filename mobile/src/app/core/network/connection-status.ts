import { Injectable, computed, signal } from '@angular/core';

/** A request still unanswered after this long (ms) is taken as the server waking up (Render sleeps when idle). */
export const SLOW_AFTER_MS = 4_000;

/** One request as the interceptor follows it. */
export interface TrackedRequest {
  /** It failed and will be asked again: the server is surely waking up. */
  retrying(): void;
  /** It ended (answer, final error or cancelled). */
  done(): void;
}

/**
 * Whether the app is waiting on a server that takes long to answer: the screens add «Conectando con el
 * servidor…» to their loading state while it is true, instead of a bare «Cargando» that seems stuck.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionStatus {
  private readonly slowRequests = signal(0);

  readonly waking = computed(() => this.slowRequests() > 0);

  track(): TrackedRequest {
    let slow = false;
    const markSlow = (): void => {
      if (slow) return;
      slow = true;
      this.slowRequests.update((count) => count + 1);
    };
    const timer = setTimeout(markSlow, SLOW_AFTER_MS);
    return {
      retrying: markSlow,
      done: () => {
        clearTimeout(timer);
        if (!slow) return;
        slow = false;
        this.slowRequests.update((count) => count - 1);
      },
    };
  }
}
