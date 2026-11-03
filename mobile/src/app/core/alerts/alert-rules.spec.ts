import type { RiskLevel, ZoneRiskSummary } from '../../domain/model/risk';
import { notificationId, parseSeenLevels, planAlerts } from './alert-rules';

const zone = (id: string, level: RiskLevel, score = 50): ZoneRiskSummary => ({
  id,
  name: id,
  latitude: 1,
  longitude: -77,
  score,
  level,
});
const ids = (zones: readonly ZoneRiskSummary[]) => zones.map((z) => z.id);

describe('planAlerts', () => {
  it('warns about a favorite that goes up to the threshold or more, and saves every favorite', () => {
    const plan = planAlerts([zone('pasto', 'high'), zone('ipiales', 'medium')], { pasto: 'medium', ipiales: 'low' }, 'high');
    expect(ids(plan.notify)).toEqual(['pasto']);
    expect(plan.seen).toEqual({ pasto: 'high', ipiales: 'medium' });
  });

  it('does not repeat while the level stays, nor when it goes down', () => {
    expect(planAlerts([zone('pasto', 'high')], { pasto: 'high' }, 'high').notify).toEqual([]);
    const down = planAlerts([zone('pasto', 'high')], { pasto: 'extreme' }, 'high');
    expect(down.notify).toEqual([]);
    expect(down.seen).toEqual({ pasto: 'high' }); // a later rise to Extremo warns again
    expect(ids(planAlerts([zone('pasto', 'extreme')], down.seen, 'high').notify)).toEqual(['pasto']);
  });

  it('warns again after going under the threshold and back', () => {
    const below = planAlerts([zone('pasto', 'medium')], { pasto: 'high' }, 'high');
    expect(below.notify).toEqual([]);
    expect(ids(planAlerts([zone('pasto', 'high')], below.seen, 'high').notify)).toEqual(['pasto']);
  });

  it('with Extremo as the threshold, Alto does not warn', () => {
    expect(planAlerts([zone('pasto', 'high')], { pasto: 'medium' }, 'extreme').notify).toEqual([]);
    expect(ids(planAlerts([zone('pasto', 'extreme')], { pasto: 'high' }, 'extreme').notify)).toEqual(['pasto']);
  });

  it('only remembers a favorite never seen, unless it is the first check after turning the alerts on', () => {
    expect(planAlerts([zone('tumaco', 'extreme')], {}, 'high').notify).toEqual([]);
    expect(ids(planAlerts([zone('tumaco', 'extreme')], {}, 'high', true).notify)).toEqual(['tumaco']);
    expect(planAlerts([zone('ipiales', 'medium')], {}, 'high', true).notify).toEqual([]);
  });

  it('forgets the zones that are no longer favorites', () => {
    expect(planAlerts([zone('pasto', 'low')], { pasto: 'low', tumaco: 'extreme' }, 'high').seen).toEqual({ pasto: 'low' });
  });
});

describe('parseSeenLevels', () => {
  it('reads the saved levels and drops anything broken', () => {
    expect(parseSeenLevels('{"pasto":"high","ipiales":"medium"}')).toEqual({ pasto: 'high', ipiales: 'medium' });
    expect(parseSeenLevels('{"pasto":"burning","ipiales":3}')).toEqual({});
    expect(parseSeenLevels('not json')).toEqual({});
    expect(parseSeenLevels('["high"]')).toEqual({});
    expect(parseSeenLevels(null)).toEqual({});
  });

  it('does not take keys of the object prototype as levels', () => {
    expect(planAlerts([zone('constructor', 'high')], parseSeenLevels('{}'), 'high', false).notify).toEqual([]);
  });
});

describe('notificationId', () => {
  it('gives each zone the same positive int every time, never the 0 of the test notification', () => {
    expect(notificationId('pasto')).toBe(notificationId('pasto'));
    expect(notificationId('pasto')).not.toBe(notificationId('ipiales'));
    for (const id of ['pasto', 'ipiales', 'el-tablon-de-gomez', 'a']) {
      const value = notificationId(id);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(2 ** 31);
    }
  });
});
