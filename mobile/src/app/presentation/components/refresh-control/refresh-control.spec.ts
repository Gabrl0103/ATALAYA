import { TestBed } from '@angular/core/testing';
import { Haptic } from '../../../core/haptics';
import { RefreshControl } from './refresh-control';

function render(inputs: { updatedAt?: Date | null; loading?: boolean } = {}) {
  const fixture = TestBed.createComponent(RefreshControl);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  let refreshes = 0;
  fixture.componentInstance.refresh.subscribe(() => refreshes++);
  return { fixture, host, button: host.querySelector<HTMLButtonElement>('.refresh')!, refreshes: () => refreshes };
}

describe('RefreshControl', () => {
  beforeEach(() => vi.spyOn(TestBed.inject(Haptic), 'tap').mockImplementation(() => undefined));

  it('says when the data arrived and asks for it again', () => {
    const { host, button, refreshes } = render({ updatedAt: new Date(2026, 10, 14, 17, 7) });
    expect(host.querySelector('.updated')?.textContent).toMatch(/^Actualizado 05:07 p\. ?m\.$/);
    expect(button.getAttribute('aria-label')).toBe('Actualizar');
    button.click();
    expect(refreshes()).toBe(1);
  });

  it('says it is loading and ignores a second tap while it asks', () => {
    const { host, button, refreshes } = render({ updatedAt: null, loading: true });
    expect(host.querySelector('.updated')?.textContent).toBe('Cargando…');
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(refreshes()).toBe(0);
  });
});
