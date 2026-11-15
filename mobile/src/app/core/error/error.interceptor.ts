import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, retry, throwError, timer } from 'rxjs';
import { ConnectionStatus } from '../network/connection-status';
import { ApiError } from './api-error';

/**
 * Waits (ms) before each new try of a GET that failed while the server was unreachable or waking up:
 * about half a minute in all, the time Render takes to start a sleeping server.
 */
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

/** No connection (0) or the server not ready yet behind Render's proxy (502–504). A 404 or a 500 is final. */
const RETRYABLE_STATUS = new Set([0, 502, 503, 504]);

const isRetryable = (error: unknown): boolean => error instanceof HttpErrorResponse && RETRYABLE_STATUS.has(error.status);

/**
 * Global error handling: a GET that could not reach the server is asked again with a growing wait, the
 * screens hear (ConnectionStatus) that the server is slow, and every final failure reaches the app as
 * an ApiError with a code the screens can name.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const request = inject(ConnectionStatus).track();
  return next(req).pipe(
    retry({
      count: req.method === 'GET' ? RETRY_DELAYS_MS.length : 0,
      delay: (error: unknown, attempt: number) => {
        if (!isRetryable(error)) return throwError(() => error);
        request.retrying();
        return timer(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
      },
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const code = error.status === 0 ? 'network' : error.status === 404 ? 'notFound' : 'server';
        return throwError(() => new ApiError(code, error.status));
      }
      return throwError(() => new ApiError('unexpected', -1));
    }),
    finalize(() => request.done()),
  );
};
