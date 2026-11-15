import { TestBed } from '@angular/core/testing';
import { OnboardingFlag } from '../../../core/onboarding-flag';
import { Onboarding } from './onboarding';

describe('Onboarding', () => {
  afterEach(() => vi.useRealTimers());

  it('remembers it was seen and closes when skipped', async () => {
    vi.useFakeTimers();
    const markDone = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: OnboardingFlag, useValue: { markDone } }] });
    const fixture = TestBed.createComponent(Onboarding);
    const finished = vi.fn();
    fixture.componentInstance.finished.subscribe(finished);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.skip')!.click();
    fixture.detectChanges();

    expect(markDone).toHaveBeenCalledOnce();
    expect(host.classList).toContain('leaving');
    vi.advanceTimersByTime(400);
    expect(finished).toHaveBeenCalledOnce();
  });

  it('shows three progress dots with the first one active', () => {
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    const dots = (fixture.nativeElement as HTMLElement).querySelectorAll('.dots i');
    expect(dots.length).toBe(3);
    expect(dots[0].classList).toContain('active');
    expect(fixture.nativeElement.querySelector('.cta').textContent.trim()).toBe('Continuar');
  });
  it('shows the map, the 72 h forecast and favorites with alerts', () => {
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const pages = host.querySelectorAll('.page');
    expect(pages.length).toBe(3);
    expect(pages[0]!.querySelectorAll('.mini-map .zone').length).toBeGreaterThan(3);
    expect([...pages[0]!.querySelectorAll('.map-badges app-risk-badge')].map((badge) => badge.textContent?.trim())).toEqual(['Tumaco 62', 'Pasto 31', 'Ipiales 18']);
    expect([...pages[1]!.querySelectorAll('.when')].map((when) => when.textContent?.trim())).toEqual(['hoy', 'mañana', 'pasado mañana']);
    expect([...pages[2]!.querySelectorAll('.feature b')].map((title) => title.textContent?.trim())).toEqual([
      'Mis municipios', 'Alertas', 'Ubicación (opcional)',
    ]);
  });

  it('can be skipped from every page and ends with «Empezar»', () => {
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const track = host.querySelector<HTMLElement>('.track')!;
    track.scrollTo = () => undefined;
    for (let page = 0; page < 3; page++) {
      expect(host.querySelector('.skip')).not.toBeNull();
      if (page < 2) host.querySelector<HTMLButtonElement>('.cta')!.click();
      fixture.detectChanges();
    }
    expect(host.querySelector('.cta')!.textContent?.trim()).toBe('Empezar');
    expect(host.querySelectorAll('.page')[2]!.getAttribute('aria-hidden')).toBe('false');
  });
});
