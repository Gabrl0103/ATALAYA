import type { MessageKey } from '../../i18n/translate';

/** A phone line of «¿Ves fuego? Avisa»: the number to dial and the name of the service (a text key). */
export interface EmergencyLine {
  readonly id: string;
  /** As it is dialled; spaces or dashes are allowed (they are left out of the tel: link). */
  readonly number: string;
  /** Name of the service in es.json and en.json. */
  readonly name: MessageKey;
}

/** National lines of Colombia, the same in every municipality. */
export const NATIONAL_LINES: readonly EmergencyLine[] = [
  { id: 'emergencies', number: '123', name: 'emergency.line.emergencies' },
  { id: 'firefighters', number: '119', name: 'emergency.line.firefighters' },
  { id: 'red-cross', number: '132', name: 'emergency.line.redCross' },
  { id: 'civil-defense', number: '144', name: 'emergency.line.civilDefense' },
];

/**
 * Local lines of Nariño (firefighters of a municipality, risk management offices…), shown after the
 * national ones. To add one: an entry here, e.g. `{ id: 'firefighters-pasto', number: '…', name:
 * 'emergency.line.firefightersPasto' }`, and that key with the service's name in es.json and en.json.
 */
export const LOCAL_LINES: readonly EmergencyLine[] = [];

/** Every line the card shows, national first. */
export const EMERGENCY_LINES: readonly EmergencyLine[] = [...NATIONAL_LINES, ...LOCAL_LINES];

/** The tel: link of a line: only digits (and a leading +), so the phone's dialler opens with the number. */
export function telHref(line: EmergencyLine): string {
  return `tel:${line.number.replace(/[^\d+]/g, '')}`;
}
