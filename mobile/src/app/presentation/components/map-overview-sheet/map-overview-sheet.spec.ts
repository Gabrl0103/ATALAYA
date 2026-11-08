import { TestBed } from '@angular/core/testing';
import { DRAG_DISTANCE, MapOverviewSheet, overviewCounts, overviewOpenAfterDrag } from './map-overview-sheet';

function setup(inputs: { zoneCount: number; hotspotCount: number; canZoom?: boolean }) {
  const fixture = TestBed.createComponent(MapOverviewSheet);
  fixture.componentRef.setInput('zoneCount', inputs.zoneCount);
  fixture.componentRef.setInput('hotspotCount', inputs.hotspotCount);
  fixture.componentRef.setInput('updatedLabel', 'Actualizado 06:04 p. m.');
  if (inputs.canZoom !== undefined) fixture.componentRef.setInput('canZoom', inputs.canZoom);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

const text = (element: Element | null): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Taps the handle: the sheet goes up (or down). */
function toggle(fixture: ReturnType<typeof setup>['fixture'], host: HTMLElement): void {
  host.querySelector<HTMLButtonElement>('.handle')!.click();
  fixture.detectChanges();
}

describe('MapOverviewSheet', () => {
  it('opens low: the title, the four levels and the button only', () => {
    const { host } = setup({ zoneCount: 64, hotspotCount: 12 });
    expect(text(host.querySelector('h2'))).toBe('Departamento de Nariño');
    expect([...host.querySelectorAll('app-risk-badge')].map(text)).toEqual(['Bajo', 'Medio', 'Alto', 'Extremo']);
    expect(host.querySelector('.zoom')).not.toBeNull();
    expect(host.querySelector('.counts')).toBeNull();
    expect(host.querySelector('.range')).toBeNull();
    expect(host.querySelector('.note')).toBeNull();
    expect(host.querySelector('.handle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('counts the municipalities and recent hotspots once up, in singular when there is one', () => {
    expect(overviewCounts(64, 12)).toBe('64 municipios · 12 focos de calor recientes');
    expect(overviewCounts(1, 1)).toBe('1 municipio · 1 foco de calor reciente');
    expect(overviewCounts(64, 12, 'en')).toBe('64 municipalities · 12 recent heat spots');
    expect(overviewCounts(1, 1, 'en')).toBe('1 municipality · 1 recent heat spot');
    const { fixture, host } = setup({ zoneCount: 64, hotspotCount: 12 });
    toggle(fixture, host);
    expect(text(host.querySelector('.counts'))).toBe('64 municipios · 12 focos de calor recientes');
  });

  it('says it is loading before the zones arrive', () => {
    const { fixture, host } = setup({ zoneCount: 0, hotspotCount: 0 });
    toggle(fixture, host);
    expect(text(host.querySelector('.counts'))).toBe('Cargando municipios…');
  });

  it('once up, adds the ranges, the hotspot key and when it was updated', () => {
    const { fixture, host } = setup({ zoneCount: 64, hotspotCount: 12 });
    toggle(fixture, host);
    expect([...host.querySelectorAll('app-risk-badge')].map(text)).toEqual(['Bajo', 'Medio', 'Alto', 'Extremo']);
    expect([...host.querySelectorAll('.range')].map(text)).toEqual(['0–24', '25–49', '50–74', '75–100']);
    expect(text(host.querySelector('.hotspot-key'))).toContain('Foco de calor');
    expect(text(host.querySelector('.note'))).toBe('Actualizado 06:04 p. m.');
  });

  it('asks the map to zoom to Nariño, and hides the button when there is no map', () => {
    const { fixture, host } = setup({ zoneCount: 64, hotspotCount: 12 });
    let requests = 0;
    fixture.componentInstance.zoomRequested.subscribe(() => requests++);
    const zoom = host.querySelector<HTMLButtonElement>('.zoom')!;
    expect(text(zoom)).toBe('Acercar a Nariño');
    zoom.click();
    expect(requests).toBe(1);

    expect(setup({ zoneCount: 64, hotspotCount: 12, canZoom: false }).host.querySelector('.zoom')).toBeNull();
  });

  it('goes up and down again with the handle', () => {
    const { fixture, host } = setup({ zoneCount: 64, hotspotCount: 12 });
    const handle = host.querySelector<HTMLButtonElement>('.handle')!;
    expect(handle.getAttribute('aria-label')).toBe('Mostrar detalles');
    toggle(fixture, host);
    expect(handle.getAttribute('aria-label')).toBe('Ocultar detalles');
    expect(host.querySelector('.note')).not.toBeNull();
    toggle(fixture, host);
    expect(host.querySelector('.note')).toBeNull();
  });

  it('goes up with a drag or flick up and down with one down; a short drag leaves it as it was', () => {
    expect(overviewOpenAfterDrag(false, -DRAG_DISTANCE, 0)).toBe(true);
    expect(overviewOpenAfterDrag(false, -10, -0.8)).toBe(true);
    expect(overviewOpenAfterDrag(true, DRAG_DISTANCE, 0)).toBe(false);
    expect(overviewOpenAfterDrag(true, 10, 0.8)).toBe(false);
    expect(overviewOpenAfterDrag(false, -10, 0)).toBe(false);
    expect(overviewOpenAfterDrag(true, 10, 0)).toBe(true);
  });
});
