import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMERGENCY_LINES } from '../../../core/emergency/emergency-lines';
import { LOCATE_USER, type LocationResult } from '../../../core/location/user-location';
import { SHARE_CHANNELS, type ShareMessage } from '../../../core/share/share-zone';
import type { ZoneRiskSummary } from '../../../domain/model/risk';
import { ZonesStore } from '../../../state/zones.store';
import { EmergencyHelp } from './emergency-help';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const PASTO: ZoneRiskSummary = { id: 'pasto', name: 'Pasto', latitude: 1.2136, longitude: -77.2811, score: 20, level: 'low' };

function render(location: LocationResult, zoneName: string | null = null) {
  const locate = vi.fn(async () => location);
  const shared: ShareMessage[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCATE_USER, useValue: locate },
      // The browser without a share menu: the text goes to the clipboard («Copiado»).
      { provide: SHARE_CHANNELS, useValue: { copy: async (value: string) => void shared.push({ title: '', text: value }) } },
      { provide: ZonesStore, useValue: { zones: signal([PASTO]), boundaries: signal(null) } },
    ],
  });
  const fixture = TestBed.createComponent(EmergencyHelp);
  fixture.componentRef.setInput('zoneName', zoneName);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);
  return { fixture, host, locate, shared, button };
}

/** Lets the location and share promises finish and draws again. */
async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  for (let i = 0; i < 3; i++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

describe('EmergencyHelp', () => {
  it('has a tel: link for every line of the constant, named for screen readers', () => {
    const { host } = render({ status: 'denied' });
    const links = [...host.querySelectorAll<HTMLAnchorElement>('a.call')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(EMERGENCY_LINES.map((line) => `tel:${line.number}`));
    expect(links[0].getAttribute('aria-label')).toBe('Llamar a Línea de emergencias, 123');
    expect(links.map((a) => text(a.querySelector('b')))).toEqual(['123', '119', '132', '144']);
  });

  it('says what to say when calling and that Atalaya reports to no one', () => {
    const { host } = render({ status: 'denied' });
    expect(host.querySelectorAll('.tips li')).toHaveLength(4);
    expect(text(host.querySelector('.disclaimer'))).toContain('no avisa a nadie automáticamente');
  });

  it('does not ask for the location until the button is tapped', async () => {
    const { fixture, locate, shared, button } = render({ status: 'ok', latitude: 1.2136, longitude: -77.2811 });
    expect(locate).not.toHaveBeenCalled();

    button('Compartir mi ubicación')!.click();
    await settle(fixture);

    expect(locate).toHaveBeenCalledTimes(1);
    expect(shared).toHaveLength(1);
    expect(shared[0].text).toContain('Coordenadas: 1.21360, -77.28110');
    expect(shared[0].text).toContain('Municipio más cercano: Pasto');
    expect(text(fixture.nativeElement.querySelector('.notice'))).toBe('Copiado');
  });

  it('without a location: says why and, in a zone sheet, shares without it', async () => {
    const { fixture, host, shared, button } = render({ status: 'denied' }, 'Pasto');
    button('Compartir mi ubicación')!.click();
    await settle(fixture);

    expect(text(host.querySelector('.error'))).toContain('no tiene permiso de ubicación');
    expect(shared).toHaveLength(0);

    button('Compartir sin ubicación')!.click();
    await settle(fixture);
    expect(shared[0].text).toContain('Municipio consultado: Pasto');
    expect(shared[0].text).toContain('Ubicación: no disponible');
  });

  it('has no «Compartir sin ubicación» outside a zone sheet', async () => {
    const { fixture, button } = render({ status: 'unavailable' });
    button('Compartir mi ubicación')!.click();
    await settle(fixture);
    expect(button('Compartir sin ubicación')).toBeUndefined();
  });
});
