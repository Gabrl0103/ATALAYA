import { Component, effect, inject, signal } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { LocalAlerts } from './core/alerts/local-alerts';
import { AppCurtain } from './core/app-curtain';
import { OnboardingFlag } from './core/onboarding-flag';
import { Motion } from './core/motion';
import { I18n } from './i18n/i18n';
import { BottomNav } from './presentation/components/bottom-nav/bottom-nav';
import { Onboarding } from './presentation/components/onboarding/onboarding';
import { Splash } from './presentation/components/splash/splash';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, BottomNav, Onboarding, Splash],
  template: `
    <div class="app-stage">
      <div class="phone-shell">
        <!-- La app carga por detrás mientras la splash o la introducción están encima. -->
        <ion-app [attr.inert]="showSplash() || showOnboarding() ? '' : null">
          <ion-router-outlet />
          <app-bottom-nav />
        </ion-app>
        @if (showOnboarding()) {
          <app-onboarding (finished)="showOnboarding.set(false)" />
        }
        @if (showSplash()) {
          <app-splash (finished)="showSplash.set(false)" />
        }
      </div>
    </div>
  `,
})
export class App {
  protected readonly showSplash = signal(true);
  protected readonly showOnboarding = signal(false);

  constructor() {
    // Started here so <html lang> follows the language from the first screen.
    inject(I18n);
    inject(Motion);
    // From the start: a tap on an alert (even one that opened the app) goes to its zone on the map.
    inject(LocalAlerts);
    // Se resuelve mucho antes de que termine la splash, así que la introducción ya está debajo al desvanecerse.
    const onboarding = inject(OnboardingFlag);
    void onboarding.isDone().then((done) => this.showOnboarding.set(!done));
    effect(() => {
      if (!onboarding.replayRequested()) return;
      onboarding.replayRequested.set(false);
      this.showOnboarding.set(true);
    });
    const curtain = inject(AppCurtain);
    effect(() => {
      if (!this.showSplash() && !this.showOnboarding()) curtain.lift();
    });
  }
}
