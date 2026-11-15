import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConnectionStatus } from '../../../core/network/connection-status';
import type { RiskLevel } from '../../../domain/model/risk';
import { summarizeDepartment, topZones } from '../../../domain/util/department-summary';
import { favoriteZones } from '../../../domain/util/favorites';
import { riskLabel } from '../../../domain/util/risk-labels';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import { FavoritesStore } from '../../../state/favorites.store';
import { ZonesStore } from '../../../state/zones.store';
import { AppIcon } from '../../components/app-icon/app-icon';
import { LavaBg } from '../../components/lava-bg/lava-bg';
import { RiskBadge } from '../../components/risk-badge/risk-badge';
import { StateMessage } from '../../components/state-message/state-message';

/** Cuántas zonas muestra el carrusel "Zonas con mayor riesgo". */
const TOP_ZONE_COUNT = 5;
/** Last card of a carousel with its own entry step (0.1 s each). */
const MAX_STAGGER = 3;

@Component({
  selector: 'app-home-page',
  imports: [AppIcon, LavaBg, RiskBadge, StateMessage, TranslatePipe],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
  host: { class: 'ion-page' },
})
export class HomePage {
  protected readonly store = inject(ZonesStore);
  /** While the server wakes up the skeleton adds «Conectando con el servidor…». */
  protected readonly connection = inject(ConnectionStatus);
  /** Placeholder cards of the carousel while loading: about the two and a half that fit. */
  protected readonly skeletonCards = [0, 1, 2] as const;
  private readonly router = inject(Router);
  private readonly favorites = inject(FavoritesStore);
  private readonly i18n = inject(I18n);
  protected readonly summary = computed(() => summarizeDepartment(this.store.zones(), this.store.hotspots()));
  protected readonly topZones = computed(() => topZones(this.store.zones(), TOP_ZONE_COUNT));
  /** «Mis municipios»: the hearts of the zone sheet, in the order they were added. */
  protected readonly myZones = computed(() => favoriteZones(this.favorites.ids(), this.store.zones()));
  /** Step (--i) at which «Zonas con mayor riesgo» comes in: after «Mis municipios» when it is shown. */
  protected readonly topStart = computed(() => (this.myZones().length > 0 ? 4 : 2));
  /** A carousel shows about two cards and a half: past the fourth the rest come in together. */
  protected readonly stagger = (index: number): number => Math.min(index, MAX_STAGGER);

  protected riskName(level: RiskLevel): string {
    return riskLabel(level, this.i18n.language());
  }

  constructor() {
    if (this.store.zones().length === 0 && !this.store.loading()) this.store.load();
  }

  protected openSettings(): void {
    void this.router.navigateByUrl('/settings');
  }

  protected openHowItWorks(): void {
    void this.router.navigateByUrl('/how-it-works');
  }

  /** Abre el mapa con la hoja de la zona (el mapa la muestra cuando llega store.detail). */
  protected openZone(zoneId: string): void {
    this.store.select(zoneId);
    void this.router.navigateByUrl('/map');
  }
}
