import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConnectionStatus, SLOW_AFTER_MS } from '../network/connection-status';
import { ApiError } from './api-error';
import { RETRY_DELAYS_MS, errorInterceptor } from './error.interceptor';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    connection: TestBed.inject(ConnectionStatus),
  };
}

const offline = { status: 0, statusText: 'Unknown Error' };

describe('errorInterceptor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks again with a growing wait while the server is unreachable, and answers once it is up', () => {
    const { http, backend, connection } = setup();
    const answer = vi.fn();
    http.get('/api/zones').subscribe(answer);

    backend.expectOne('/api/zones').error(new ProgressEvent('error'), offline);
    expect(connection.waking()).toBe(true);
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0] - 1);
    backend.expectNone('/api/zones');
    vi.advanceTimersByTime(1);
    backend.expectOne('/api/zones').flush('', { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(RETRY_DELAYS_MS[1]);
    backend.expectOne('/api/zones').flush([]);

    expect(answer).toHaveBeenCalledWith([]);
    expect(connection.waking()).toBe(false);
  });

  it('gives up after the last wait with a «network» error', () => {
    const { http, backend } = setup();
    let failure: unknown;
    http.get('/api/zones').subscribe({ error: (error: unknown) => (failure = error) });
    for (const wait of RETRY_DELAYS_MS) {
      backend.expectOne('/api/zones').error(new ProgressEvent('error'), offline);
      vi.advanceTimersByTime(wait);
    }
    backend.expectOne('/api/zones').error(new ProgressEvent('error'), offline);
    expect(failure).toEqual(new ApiError('network', 0));
  });

  it('does not ask again for a 404 or a 500', () => {
    const { http, backend } = setup();
    const errors: unknown[] = [];
    http.get('/api/zones/nada').subscribe({ error: (error: unknown) => errors.push(error) });
    backend.expectOne('/api/zones/nada').flush('', { status: 404, statusText: 'Not Found' });
    http.get('/api/zones').subscribe({ error: (error: unknown) => errors.push(error) });
    backend.expectOne('/api/zones').flush('', { status: 500, statusText: 'Server Error' });
    vi.advanceTimersByTime(60_000);
    backend.verify();
    expect(errors.map((error) => (error as ApiError).code)).toEqual(['notFound', 'server']);
  });

  it('says the server is slow once a request goes unanswered for a while', () => {
    const { http, backend, connection } = setup();
    http.get('/api/zones').subscribe();
    vi.advanceTimersByTime(SLOW_AFTER_MS - 1);
    expect(connection.waking()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(connection.waking()).toBe(true);
    backend.expectOne('/api/zones').flush([]);
    expect(connection.waking()).toBe(false);
  });

  it('stops waiting when the screen no longer wants the answer', () => {
    const { http, backend, connection } = setup();
    const request = http.get('/api/zones').subscribe();
    const pending = backend.expectOne('/api/zones');
    vi.advanceTimersByTime(SLOW_AFTER_MS);
    request.unsubscribe();
    expect(pending.cancelled).toBe(true);
    expect(connection.waking()).toBe(false);
  });
});
