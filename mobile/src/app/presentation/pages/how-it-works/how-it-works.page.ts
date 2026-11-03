import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { RiskLevel } from '../../../domain/model/risk';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { AppIcon, type IconName } from '../../components/app-icon/app-icon';
import { LavaBg } from '../../components/lava-bg/lava-bg';
import { RiskBadge } from '../../components/risk-badge/risk-badge';

interface FlowStep {
  readonly icon: IconName;
  readonly title: MessageKey;
  readonly text: MessageKey;
}

/** From the satellite to the map, in the order the data goes (backend jobs, scoring, model, app). */
export const FLOW_STEPS: readonly FlowStep[] = [
  { icon: 'flame', title: 'how.step.sources', text: 'how.step.sourcesText' },
  { icon: 'wifi', title: 'how.step.ingest', text: 'how.step.ingestText' },
  { icon: 'bars', title: 'how.step.score', text: 'how.step.scoreText' },
  { icon: 'calendar', title: 'how.step.model', text: 'how.step.modelText' },
  { icon: 'map', title: 'how.step.map', text: 'how.step.mapText' },
];

/** The sources of the first step, by their own names (not translated). */
export const FLOW_SOURCES = ['NASA FIRMS', 'Open-Meteo / ERA5', 'UNGRD', 'Gobernación de Nariño', 'DANE'] as const;

/** SCORE_WEIGHTS of backend/src/domain/service/RiskScoringService.ts. */
export const SCORE_WEIGHTS: readonly { readonly label: MessageKey; readonly weight: number }[] = [
  { label: 'factor.dryWeather', weight: 50 },
  { label: 'factor.nearbyHotspots', weight: 30 },
  { label: 'factor.fireHistory', weight: 20 },
];

/** Cut-offs of the score and of the forecast (RiskLevel in the backend). */
export const LEVEL_RANGES: readonly { readonly level: RiskLevel; readonly from: number; readonly to: number }[] = [
  { level: 'low', from: 0, to: 24 },
  { level: 'medium', from: 25, to: 49 },
  { level: 'high', from: 50, to: 74 },
  { level: 'extreme', from: 75, to: 100 },
];

/** «Cómo funciona»: opened from Inicio and from Ajustes > Acerca de; not a tab. */
@Component({
  selector: 'app-how-it-works-page',
  imports: [AppIcon, LavaBg, RiskBadge, TranslatePipe],
  templateUrl: './how-it-works.page.html',
  styleUrl: './how-it-works.page.css',
  host: { class: 'ion-page' },
})
export class HowItWorksPage {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly steps = FLOW_STEPS;
  protected readonly sources = FLOW_SOURCES;
  protected readonly weights = SCORE_WEIGHTS;
  protected readonly levels = LEVEL_RANGES;
  protected readonly notItems: readonly MessageKey[] = ['how.not.prediction', 'how.not.hotspots', 'how.not.authorities'];
  protected readonly limits: readonly MessageKey[] = ['how.limit.history', 'how.limit.sources', 'how.limit.weather', 'how.limit.radius'];

  /** Back to where it was opened (Inicio or Ajustes); to Inicio if the app started here. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigateByUrl('/home');
  }
}
