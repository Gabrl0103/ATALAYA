import { TestBed } from '@angular/core/testing';
import type { NearbySummary } from '../../../domain/util/nearby';
import { SettingsStore } from '../../../state/settings.store';
import { NearbyCard } from './nearby-card';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** The text of each child, with a space between them (the template has none). */
const parts = (el: Element | null | undefined): string => [...(el?.children ?? [])].map(text).filter(Boolean).join(' ');

const SUMMARY: NearbySummary = {
  latitude: 1.2136,
  longitude: -77.2811,
  zone: { id: 'pasto', name: 'Pasto', latitude: 1.2136, longitude: -77.2811, score: 20, level: 'low' },
  place: 'inside',
  zoneKm: 0.4,
  hotspot: {
    hotspot: { id: 'h1', latitude: 1.3, longitude: -77.2, detectedAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
    km: 12.3,
    direction: 'ne',
  },
};

function render(summary: NearbySummary = SUMMARY) {
  const fixture = TestBed.createComponent(NearbyCard);
  fixture.componentRef.setInput('summary', summary);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host };
}

describe('NearbyCard', () => {
  it('says where the person is, its risk and the closest heat spot with distance and direction', () => {
    const { host } = render();
    expect(text(host.querySelector('.place'))).toBe('Estás en Pasto');
    expect(parts(host.querySelector('.risk'))).toBe('Bajo 20 de 100');
    expect(text(host.querySelector('.hotspot'))).toBe('Foco de calor más cercano: a 12 km al noreste, hace 3 h.');
    expect(text(host.querySelector('.note'))).toContain('no incendios confirmados');
  });

  it('says there is none instead of making one up, and offers no button for it', () => {
    const { host } = render({ ...SUMMARY, hotspot: null });
    expect(text(host.querySelector('.hotspot'))).toBe('No hay focos de calor a menos de 100 km en los últimos 5 días.');
    expect([...host.querySelectorAll('.action')].map(text)).toEqual(['Ver municipio']);
  });

  it('says it is outside Nariño, or only the closest seat when the boundaries did not load', () => {
    expect(text(render({ ...SUMMARY, place: 'outside', zoneKm: 142.4 }).host.querySelector('.place'))).toBe(
      'Fuera de Nariño · el municipio más cercano es Pasto, a 142 km',
    );
    expect(text(render({ ...SUMMARY, place: 'nearest', zoneKm: 3.25 }).host.querySelector('.place'))).toBe(
      'Municipio más cercano: Pasto, a 3,3 km',
    );
  });

  it('opens the zone, shows the heat spot and closes, with 44 px targets', () => {
    const { fixture, host } = render();
    const events: string[] = [];
    fixture.componentInstance.openZone.subscribe((id) => events.push(`zone:${id}`));
    fixture.componentInstance.showHotspot.subscribe(() => events.push('hotspot'));
    fixture.componentInstance.closed.subscribe(() => events.push('closed'));
    const [open, hotspot] = host.querySelectorAll<HTMLButtonElement>('.action');
    open!.click();
    hotspot!.click();
    host.querySelector<HTMLButtonElement>('.icon-button')!.click();
    expect(events).toEqual(['zone:pasto', 'hotspot', 'closed']);
    expect(host.querySelector('.icon-button')!.getAttribute('aria-label')).toBe('Cerrar «Cerca de mí»');
  });

  it('is in English when the app is', async () => {
    const { fixture, host } = render();
    await TestBed.inject(SettingsStore).update({ language: 'en' });
    fixture.detectChanges();
    expect(text(host.querySelector('.place'))).toBe('You are in Pasto');
    expect(text(host.querySelector('.hotspot'))).toBe('Closest heat spot: 12 km northeast, 3 h ago.');
  });
});
