import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiErrorCode } from '../../../core/error/api-error';
import { ConnectionStatus } from '../../../core/network/connection-status';
import { StateMessage, type StateKind } from './state-message';

const text = (el: Element | null | undefined): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

interface Inputs {
  kind: StateKind;
  text?: string;
  error?: ApiErrorCode;
  retryable?: boolean;
}

function render(inputs: Inputs, waking = false) {
  TestBed.configureTestingModule({
    providers: [{ provide: ConnectionStatus, useValue: { waking: signal(waking) } }],
  });
  const fixture = TestBed.createComponent(StateMessage);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('StateMessage', () => {
  it('loads as a status with its line, and nothing more while the server answers quickly', () => {
    const { host } = render({ kind: 'loading', text: 'Cargando registros…' });
    expect(host.getAttribute('role')).toBe('status');
    expect(text(host.querySelector('.text'))).toBe('Cargando registros…');
    expect(host.querySelector('.hint')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
  });

  it('says the server is waking up when the load takes long', () => {
    const { host } = render({ kind: 'loading' }, true);
    expect(text(host.querySelector('.text'))).toBe('Cargando datos…');
    expect(text(host.querySelector('.hint'))).toContain('Conectando con el servidor');
  });

  it('names the failure, is read out as an alert and asks again with «Reintentar»', () => {
    const { fixture, host } = render({ kind: 'error', error: 'network' });
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);
    expect(host.getAttribute('role')).toBe('alert');
    expect(host.classList).toContain('is-error');
    expect(text(host.querySelector('.text'))).toBe('No pudimos conectar con el servidor. Revisa tu conexión a internet.');
    const button = host.querySelector<HTMLButtonElement>('button.action');
    expect(text(button)).toBe('Reintentar');
    button?.click();
    expect(retries).toBe(1);
  });

  it('has no button when nothing can be asked again', () => {
    const { host } = render({ kind: 'error', error: 'server', retryable: false });
    expect(host.querySelector('button')).toBeNull();
  });

  it('shows an empty state with its own line and icon, without a button', () => {
    const { host } = render({ kind: 'empty', text: 'No hay incendios registrados para este municipio.' });
    expect(host.getAttribute('role')).toBe('status');
    expect(host.querySelector('.icon svg')).not.toBeNull();
    expect(text(host.querySelector('.text'))).toBe('No hay incendios registrados para este municipio.');
    expect(host.querySelector('button')).toBeNull();
  });
});
