import type { RiskLevel, ZoneRiskSummary } from '../../domain/model/risk';
import type { AlertThreshold } from '../../state/settings.store';

const RANK: Readonly<Record<RiskLevel, number>> = { low: 0, medium: 1, high: 2, extreme: 3 };
const LEVELS = Object.keys(RANK) as RiskLevel[];

/** The level each favorite had at the last check (saved on the phone): what a new level is compared with. */
export type SeenLevels = Readonly<Record<string, RiskLevel>>;

export interface AlertPlan {
  /** Favorites to warn about now: one notification each. */
  readonly notify: readonly ZoneRiskSummary[];
  /** What to save for the next check: every favorite of this one, at its current level. */
  readonly seen: SeenLevels;
}

/**
 * Warns about a favorite when it reaches the threshold or more and that level is higher than the one seen
 * last time: Medio → Alto warns, Alto → Extremo warns, staying Alto does not repeat, and going down only
 * saves the new level (so a later rise warns again). A favorite never seen (just added) is only saved,
 * unless `includeNew`: the first check after turning the alerts on warns about those already high.
 */
export function planAlerts(
  favorites: readonly ZoneRiskSummary[],
  seen: SeenLevels,
  threshold: AlertThreshold,
  includeNew = false,
): AlertPlan {
  const notify: ZoneRiskSummary[] = [];
  const next: Record<string, RiskLevel> = {};
  for (const zone of favorites) {
    const last = Object.hasOwn(seen, zone.id) ? seen[zone.id] : undefined;
    const reaches = RANK[zone.level] >= RANK[threshold];
    if (reaches && (last === undefined ? includeNew : RANK[zone.level] > RANK[last])) notify.push(zone);
    next[zone.id] = zone.level;
  }
  return { notify, seen: next };
}

/** The saved levels; anything broken (or a level this app does not know) reads as not seen. */
export function parseSeenLevels(value: string | null): SeenLevels {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, RiskLevel] => LEVELS.includes(entry[1] as RiskLevel)),
    );
  } catch {
    return {};
  }
}

/** Android wants an int id: the same one per zone, so its new alert replaces the old one in the tray. */
export function notificationId(zoneId: string): number {
  let hash = 5381;
  for (const char of zoneId) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  // 1…2^31 − 1 (positive int); 0 is kept for the test notification.
  return (hash % 0x7ffffffe) + 1;
}
