import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import type { FireHistory } from '../domain/model/risk';
import { FireRepository } from '../domain/repository/repositories';
import { HistoryStore } from './history.store';

const records = (count: number): FireHistory => ({ events: [], summary: { count, totalHectares: 0, lastDate: null } });

function setup(history: FireRepository['history']) {
  TestBed.configureTestingModule({ providers: [{ provide: FireRepository, useValue: { history: vi.fn(history) } }] });
  return TestBed.inject(HistoryStore);
}

describe('HistoryStore', () => {
  it('keeps only the answer of the last filter tapped', () => {
    const requests: Subject<FireHistory>[] = [];
    const store = setup(() => {
      const request = new Subject<FireHistory>();
      requests.push(request);
      return request;
    });
    store.load('pasto');
    store.load('ipiales');
    expect(requests[0]!.observed).toBe(false);
    requests[1]!.next(records(2));
    expect(store.history()?.summary.count).toBe(2);
    expect(store.loading()).toBe(false);
  });

  it('names a failure and stops loading', () => {
    const store = setup(() => throwError(() => new Error('down')));
    store.load();
    expect(store.error()).toBe('unexpected');
    expect(store.loading()).toBe(false);
  });
});
