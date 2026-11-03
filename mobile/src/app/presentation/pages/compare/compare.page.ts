import { Location } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { ZoneRiskSummary } from '../../../domain/model/risk';
import { MISSING, compareRows, type CompareRow, type CompareRowId } from '../../../domain/util/compare';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { COMPARE_MAX, CompareStore } from '../../../state/compare.store';
import { FavoritesStore } from '../../../state/favorites.store';
import { SettingsStore } from '../../../state/settings.store';
import { ZonesStore } from '../../../state/zones.store';
import { AppIcon } from '../../components/app-icon/app-icon';
import { WHEN_KEYS } from '../../components/forecast-section/forecast-section';
import { LavaBg } from '../../components/lava-bg/lava-bg';
import { RiskBadge } from '../../components/risk-badge/risk-badge';
import { SearchBox } from '../../components/search-box/search-box';

const ROW_LABELS: Partial<Record<CompareRowId, MessageKey>> = {
  level: 'compare.level',
  score: 'compare.score',
  temperature: 'weather.temperature',
  humidity: 'weather.humidity',
  wind: 'weather.wind',
  dryDays: 'compare.dryDays',
  dryWeather: 'factor.dryWeather',
  nearbyHotspots: 'factor.nearbyHotspots',
  fireHistory: 'factor.fireHistory',
};
const HORIZONS: Partial<Record<CompareRowId, 24 | 48 | 72>> = { h24: 24, h48: 48, h72: 72 };

/** The rows in four groups, as in the zone sheet. */
const GROUPS: readonly { readonly title: MessageKey; readonly rows: readonly CompareRowId[] }[] = [
  { title: 'compare.current', rows: ['level', 'score'] },
  { title: 'forecast.title', rows: ['h24', 'h48', 'h72'] },
  { title: 'weather.title', rows: ['temperature', 'humidity', 'wind', 'dryDays'] },
  { title: 'sheet.factorsTitle', rows: ['dryWeather', 'nearbyHotspots', 'fireHistory'] },
];

/** «Comparar»: 2 or 3 municipalities side by side (/compare, not a tab). */
@Component({
  selector: 'app-compare-page',
  imports: [AppIcon, LavaBg, RiskBadge, SearchBox, TranslatePipe],
  templateUrl: './compare.page.html',
  styleUrl: './compare.page.css',
  host: { class: 'ion-page' },
})
export class ComparePage {
  protected readonly compare = inject(CompareStore);
  protected readonly zonesStore = inject(ZonesStore);
  protected readonly favorites = inject(FavoritesStore);
  private readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly max = COMPARE_MAX;
  protected readonly missing = MISSING;
  protected readonly pickerOpen = signal(false);

  /** The compared zones, in the order they were added (an id the list no longer has is left out). */
  protected readonly zones = computed(() => {
    const byId = new Map(this.zonesStore.zones().map((zone) => [zone.id, zone]));
    return this.compare.ids().flatMap((id) => byId.get(id) ?? []);
  });
  /** What the picker offers: every zone not compared yet (the search box puts the favorites first). */
  protected readonly candidates = computed(() => this.zonesStore.zones().filter((zone) => !this.compare.has(zone.id)));
  protected readonly pendingZone = computed(() => {
    const id = this.compare.pending();
    return id ? (this.zonesStore.zones().find((zone) => zone.id === id) ?? null) : null;
  });

  protected readonly groups = computed(() => {
    const rows = new Map<CompareRowId, CompareRow>(
      compareRows(this.zones(), this.compare.forecasts(), {
        temperature: this.settings.temperature(),
        wind: this.settings.wind(),
        language: this.i18n.language(),
      }).map((row) => [row.id, row]),
    );
    return GROUPS.map((group) => ({
      title: group.title,
      rows: group.rows.map((id) => ({ ...rows.get(id)!, label: this.rowLabel(id) })),
    }));
  });

  constructor() {
    if (this.zonesStore.zones().length === 0 && !this.zonesStore.loading()) this.zonesStore.load();
    // Each compared zone's forecast, once (the store keeps it 10 min).
    effect(() => {
      const ids = this.compare.ids();
      untracked(() => ids.forEach((id) => this.compare.loadForecast(id)));
    });
  }

  private rowLabel(id: CompareRowId): string {
    const hours = HORIZONS[id];
    if (hours) return this.i18n.t('compare.horizon', { hours, when: this.i18n.t(WHEN_KEYS[hours]) });
    return this.i18n.t(ROW_LABELS[id]!);
  }

  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigateByUrl('/map');
  }

  protected remove(zone: ZoneRiskSummary): void {
    this.compare.remove(zone.id);
  }

  protected openPicker(): void {
    this.pickerOpen.set(true);
  }

  protected pick(zone: ZoneRiskSummary): void {
    this.pickerOpen.set(false);
    this.compare.add(zone.id);
  }

  protected addPending(zone: ZoneRiskSummary): void {
    this.compare.add(zone.id);
  }
}
