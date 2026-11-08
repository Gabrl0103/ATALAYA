import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError, type Observable } from 'rxjs';
import type { HistoryHotspot, HotspotHistory } from '../../../domain/model/risk';
import { HotspotHistoryRepository } from '../../../domain/repository/repositories';
import { SettingsStore } from '../../../state/settings.store';
import { HotspotReplay } from './hotspot-replay';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** The text of each child, with a space between them (the template has none). */
const parts = (el: Element | null | undefined): string => [...(el?.children ?? [])].map(text).filter(Boolean).join(' ');

const HISTORY: HotspotHistory = {
  from: '2026-11-01',
  to: '2026-11-03',
  hotspots: [
    { latitude: 1.2, longitude: -77.3, date: '2026-11-01', satellite: 'SNPP' },
    { latitude: 1.3, longitude: -77.4, date: '2026-11-01', satellite: 'NOAA20' },
    { latitude: 1.5, longitude: -77.9, date: '2026-11-03', satellite: 'NOAA21' },
  ],
};

function render(answer: () => Observable<HotspotHistory> = () => of(HISTORY)) {
  const repository = { history: vi.fn(answer) };
  TestBed.configureTestingModule({ providers: [{ provide: HotspotHistoryRepository, useValue: repository }] });
  const fixture = TestBed.createComponent(HotspotReplay);
  const shown: (readonly HistoryHotspot[])[] = [];
  fixture.componentInstance.dayShown.subscribe((day) => shown.push(day));
  fixture.detectChanges();
  TestBed.tick();
  const host = fixture.nativeElement as HTMLElement;
  const slider = () => host.querySelector<HTMLInputElement>('input[type="range"]')!;
  return { fixture, host, shown, repository, slider };
}

describe('HotspotReplay', () => {
  afterEach(() => vi.useRealTimers());

  it('opens on the last day, with its date and its count', () => {
    const { host, shown, slider } = render();
    expect(parts(host.querySelector('.day'))).toBe('3 nov 2026 1 foco de calor');
    expect(slider().max).toBe('2');
    expect(slider().getAttribute('aria-valuetext')).toBe('3 nov 2026');
    expect(shown.at(-1)?.map((h) => h.satellite)).toEqual(['NOAA21']);
    expect(host.querySelector('.note')).toBeNull();
  });

  it('shows the heat spots of the day picked with the slider, also a quiet one', () => {
    const { fixture, host, shown, slider } = render();
    slider().value = '0';
    slider().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    TestBed.tick();
    expect(shown.at(-1)).toHaveLength(2);
    expect(parts(host.querySelector('.day'))).toBe('1 nov 2026 2 focos de calor');
    slider().value = '1';
    slider().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    TestBed.tick();
    expect(shown.at(-1)).toEqual([]);
    expect(parts(host.querySelector('.day'))).toBe('2 nov 2026 Sin focos de calor ese día');
  });

  it('plays from the first day, one per second at 1x and twice as fast at 2x, then stops', () => {
    vi.useFakeTimers();
    const { fixture, host, slider } = render();
    const play = () => host.querySelector<HTMLButtonElement>('.play')!;
    play().click(); // on the last day: starts again from the first
    fixture.detectChanges();
    expect(slider().value).toBe('0');
    expect(play().getAttribute('aria-label')).toBe('Pausar');
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(slider().value).toBe('1');

    host.querySelector<HTMLButtonElement>('.controls .action')!.click(); // 2x
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(slider().value).toBe('2');
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(play().getAttribute('aria-label')).toBe('Reproducir'); // at the end it stops
  });

  it('says it failed, with a retry that loads it again, when the endpoint is missing', () => {
    let fail = true;
    const { fixture, host, repository } = render(() => (fail ? throwError(() => new Error('404')) : of(HISTORY)));
    expect(text(host.querySelector('[role="alert"] p'))).toBe(
      'No pudimos cargar el historial de focos. El mapa sigue con los focos recientes.',
    );
    fail = false;
    host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    fixture.detectChanges();
    expect(repository.history).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.day')).not.toBeNull();
  });

  it('says it is loading while the days are on their way, in English too', async () => {
    const answer = new Subject<HotspotHistory>();
    const { fixture, host } = render(() => answer);
    expect(text(host.querySelector('[role="status"]'))).toBe('Cargando los últimos 35 días…');
    await TestBed.inject(SettingsStore).update({ language: 'en' });
    answer.next(HISTORY);
    fixture.detectChanges();
    expect(parts(host.querySelector('.day'))).toBe('Nov 3, 2026 1 heat spot');
    expect(host.querySelector('.replay-head button')!.getAttribute('aria-label')).toBe('Close the heat spot history');
  });
});
