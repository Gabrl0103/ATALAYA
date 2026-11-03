import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { errorInterceptor } from './core/error/error.interceptor';
import {
  HttpFireRepository, HttpForecastRepository, HttpHotspotHistoryRepository, HttpHotspotRepository, HttpZoneRepository,
} from './data/http-repositories';
import {
  FireRepository, ForecastRepository, HotspotHistoryRepository, HotspotRepository, ZoneRepository,
} from './domain/repository/repositories';
import { routes } from './app.routes';
import { SettingsStore } from './state/settings.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Settings (language, motion…) before the first screen, so nothing is drawn in the wrong language.
    provideAppInitializer(() => inject(SettingsStore).load()),
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([errorInterceptor])),
    // Dependency Injection: the app depends on the abstract repositories, not on HTTP.
    { provide: ZoneRepository, useClass: HttpZoneRepository },
    { provide: FireRepository, useClass: HttpFireRepository },
    { provide: HotspotRepository, useClass: HttpHotspotRepository },
    { provide: ForecastRepository, useClass: HttpForecastRepository },
    { provide: HotspotHistoryRepository, useClass: HttpHotspotHistoryRepository },
  ],
};
