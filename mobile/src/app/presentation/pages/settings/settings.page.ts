import { Component, DestroyRef, ElementRef, OnDestroy, afterNextRender, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocalAlerts } from '../../../core/alerts/local-alerts';
import { APP_VERSION } from '../../../core/config/app-version';
import { Haptic } from '../../../core/haptics';
import { OnboardingFlag } from '../../../core/onboarding-flag';
import { I18n } from '../../../i18n/i18n';
import { TranslatePipe } from '../../../i18n/t.pipe';
import type { MessageKey } from '../../../i18n/translate';
import { FavoritesStore } from '../../../state/favorites.store';
import { SettingsStore, type Settings } from '../../../state/settings.store';
import { ZonesStore } from '../../../state/zones.store';
import { AppIcon } from '../../components/app-icon/app-icon';
import { DataAttribution } from '../../components/data-attribution/data-attribution';
import { EmergencyHelp } from '../../components/emergency-help/emergency-help';
import { LavaBg } from '../../components/lava-bg/lava-bg';
import { DATA_SOURCES } from './data-sources';

interface Choice<T> {
  readonly value: T;
  readonly label: MessageKey;
}

export const LANGUAGE_CHOICES: readonly Choice<Settings['language']>[] = [
  { value: 'auto', label: 'settings.auto' },
  { value: 'es', label: 'settings.spanish' },
  { value: 'en', label: 'settings.english' },
];
export const TEMPERATURE_CHOICES: readonly Choice<Settings['temperature']>[] = [
  { value: 'c', label: 'units.celsius' },
  { value: 'f', label: 'units.fahrenheit' },
];
export const WIND_CHOICES: readonly Choice<Settings['wind']>[] = [
  { value: 'kmh', label: 'units.kmh' },
  { value: 'mph', label: 'units.mph' },
];
export const MOTION_CHOICES: readonly Choice<Settings['motion']>[] = [
  { value: 'auto', label: 'settings.auto' },
  { value: 'reduced', label: 'settings.reduced' },
];
export const THRESHOLD_CHOICES: readonly Choice<Settings['alertThreshold']>[] = [
  { value: 'high', label: 'risk.high' },
  { value: 'extreme', label: 'risk.extreme' },
];

/** How long (ms) «Listo» stays after clearing the data cache. */
const DONE_MS = 2000;

/**
 * Puts the pill of every choice group under its chosen option: transform for the place (it slides,
 * settings.page.css), size at once. The first time it is placed without sliding, then it slides.
 * Options of different widths («Automático» is wider) are why it is measured and not a share.
 */
export function placeThumbs(root: ParentNode): void {
  for (const group of root.querySelectorAll<HTMLElement>('.segmented')) {
    const thumb = group.querySelector<HTMLElement>('.segmented-thumb');
    const chosen = group.querySelector<HTMLElement>('button[aria-checked="true"]');
    // Not laid out (a test, a hidden page): the chosen option keeps its own background.
    if (!thumb || !chosen || chosen.offsetWidth === 0) continue;
    thumb.style.top = `${chosen.offsetTop}px`;
    thumb.style.width = `${chosen.offsetWidth}px`;
    thumb.style.height = `${chosen.offsetHeight}px`;
    thumb.style.transform = `translateX(${chosen.offsetLeft}px)`;
    if (!group.classList.contains('has-thumb')) {
      void thumb.offsetWidth; // The first place is applied before the slide is turned on.
      group.classList.add('has-thumb');
    }
  }
}

/** «Ajustes»: opened from the gear of Inicio. Every choice applies at once and is saved on the phone. */
@Component({
  selector: 'app-settings-page',
  imports: [AppIcon, DataAttribution, EmergencyHelp, LavaBg, TranslatePipe],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.css',
  host: { class: 'ion-page' },
})
export class SettingsPage implements OnDestroy {
  protected readonly settings = inject(SettingsStore);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly haptic = inject(Haptic);
  protected readonly favorites = inject(FavoritesStore);
  private readonly zones = inject(ZonesStore);
  private readonly onboarding = inject(OnboardingFlag);

  protected readonly languages = LANGUAGE_CHOICES;
  protected readonly temperatures = TEMPERATURE_CHOICES;
  protected readonly winds = WIND_CHOICES;
  protected readonly motions = MOTION_CHOICES;
  protected readonly thresholds = THRESHOLD_CHOICES;
  protected readonly version = APP_VERSION;
  protected readonly sources = DATA_SOURCES;
  /** The [Year] of the Copernicus notice: the data shown is of this year. */
  protected readonly year = new Date().getFullYear();
  /** «Borrar favoritos» asks once more, in the same row, before clearing. */
  protected readonly confirmingClear = signal(false);
  protected readonly cacheCleared = signal(false);
  private doneTimer?: ReturnType<typeof setTimeout>;


  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // After each choice, and with the language (the labels change width).
    afterRenderEffect(() => {
      this.settings.language();
      this.settings.temperature();
      this.settings.wind();
      this.settings.motion();
      this.settings.alertThreshold();
      this.alertsOn(); // the threshold row comes and goes with the switch
      this.i18n.language();
      placeThumbs(host);
    });
    // The font arriving, a rotation or a wider screen also move the options.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => placeThumbs(host));
      host.querySelectorAll('.segmented button').forEach((button) => observer.observe(button));
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.doneTimer);
  }

  protected back(): void {
    void this.router.navigateByUrl('/home');
  }

  protected choose(change: Partial<Settings>): void {
    void this.settings.update(change);
  }

  protected clearFavorites(): void {
    this.confirmingClear.set(false);
    void this.favorites.clear();
    // Without favorites there is nothing to warn about: the switch does not stay on.
    void this.alerts.disable();
  }

  protected readonly alerts = inject(LocalAlerts);
  protected readonly hasFavorites = computed(() => this.favorites.ids().length > 0);
  /** On only with favorites: «Alertas» only applies to them. */
  protected readonly alertsOn = computed(() => this.settings.alerts() && this.hasFavorites());
  /** The explanation shown before Android (or the browser) asks for the permission. */
  protected readonly askingPermission = signal(false);
  protected readonly alertsBusy = signal(false);
  protected readonly testSent = signal(false);

  /** Off: at once. On: the permission is asked only now, after saying why (unless already given). */
  protected toggleAlerts(): void {
    this.testSent.set(false);
    if (this.alertsOn()) {
      void this.alerts.disable();
    } else if (this.alerts.permission() === 'granted') {
      void this.turnAlertsOn();
    } else {
      this.askingPermission.set(true);
    }
  }

  protected confirmAlerts(): void {
    this.askingPermission.set(false);
    void this.turnAlertsOn();
  }

  private async turnAlertsOn(): Promise<void> {
    this.alertsBusy.set(true);
    try {
      await this.alerts.enable(); // denied: it stays off and the card says how to allow it
    } finally {
      this.alertsBusy.set(false);
    }
  }

  protected testAlert(): void {
    void this.alerts.test().then((sent) => this.testSent.set(sent));
  }

  protected clearCache(): void {
    this.zones.clearCache();
    clearTimeout(this.doneTimer);
    this.cacheCleared.set(true);
    this.doneTimer = setTimeout(() => this.cacheCleared.set(false), DONE_MS);
  }

  protected openHowItWorks(): void {
    void this.router.navigateByUrl('/how-it-works');
  }

  protected replayIntro(): void {
    this.onboarding.requestReplay();
  }

  protected toggleHaptics(): void {
    const on = !this.settings.haptics();
    void this.settings.update({ haptics: on }).then(() => this.haptic.tap());
  }
}
