import { TestBed } from '@angular/core/testing';
import { Haptic } from '../../../core/haptics';
import { SettingsStore } from '../../../state/settings.store';
import { RefreshControl } from './refresh-control';

function render(inputs: { updatedAt?: Date | null; loading?: boolean; offline?: boolean } = {}) {
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

  it('says it is offline and the date and time of the data shown, in the language of the app', async () => {
    const { fixture, host } = render({ updatedAt: new Date(2026, 10, 15, 17, 7), offline: true });
    expect(host.querySelector('.updated')?.textContent).toBe('Sin conexión · datos del 15 nov. 2026, 5:07 p. m.');

    await TestBed.inject(SettingsStore).update({ language: 'en' });
    fixture.detectChanges();
    expect(host.querySelector('.updated')?.textContent).toBe('Offline · data from Nov 15, 2026, 5:07 PM');
  });

  it('drops the notice when new data arrives', () => {
    const { fixture, host } = render({ updatedAt: new Date(2026, 10, 15, 17, 7), offline: true });
    fixture.componentRef.setInput('updatedAt', new Date(2026, 10, 16, 9, 30));
    fixture.componentRef.setInput('offline', false);
    fixture.detectChanges();
    expect(host.querySelector('.updated')?.textContent).toMatch(/^Actualizado 09:30 a\. ?m\.$/);
  });

  it('says it is loading and ignores a second tap while it asks', () => {
    const { host, button, refreshes } = render({ updatedAt: null, loading: true });
    expect(host.querySelector('.updated')?.textContent).toBe('Cargando…');
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(refreshes()).toBe(0);
  });
});
