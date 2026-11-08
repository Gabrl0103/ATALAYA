import en from '../../i18n/en.json';
import es from '../../i18n/es.json';
import { EMERGENCY_LINES, LOCAL_LINES, NATIONAL_LINES, telHref, type EmergencyLine } from './emergency-lines';

describe('emergency lines', () => {
  it('has the national lines of Colombia', () => {
    expect(NATIONAL_LINES.map((line) => line.number)).toEqual(['123', '119', '132', '144']);
    expect(EMERGENCY_LINES).toEqual([...NATIONAL_LINES, ...LOCAL_LINES]);
  });

  it('names every line in Spanish and English, with unique ids', () => {
    const english: Readonly<Record<string, string>> = en;
    const spanish: Readonly<Record<string, string>> = es;
    for (const line of EMERGENCY_LINES) {
      expect(spanish[line.name], line.id).toBeTruthy();
      expect(english[line.name], line.id).toBeTruthy();
    }
    expect(new Set(EMERGENCY_LINES.map((line) => line.id)).size).toBe(EMERGENCY_LINES.length);
  });
});

describe('telHref', () => {
  it('dials the number of the line', () => {
    expect(telHref(NATIONAL_LINES[0])).toBe('tel:123');
  });

  it('leaves spaces and dashes out of a local number', () => {
    const local: EmergencyLine = { id: 'local', number: '+57 000 000-0000', name: 'emergency.line.firefighters' };
    expect(telHref(local)).toBe('tel:+570000000000');
  });
});
