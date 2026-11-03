import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () => import('./presentation/pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'map',
    loadComponent: () => import('./presentation/pages/map/map.page').then((m) => m.MapPage),
  },
  {
    path: 'history',
    loadComponent: () => import('./presentation/pages/history/history.page').then((m) => m.HistoryPage),
  },
  // Not a tab: opened from the gear of Inicio.
  {
    path: 'settings',
    loadComponent: () => import('./presentation/pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  // Not a tab: opened from the «Comparar» button of the zone sheet.
  {
    path: 'compare',
    loadComponent: () => import('./presentation/pages/compare/compare.page').then((m) => m.ComparePage),
  },
  // Not a tab either: opened from Inicio and from Ajustes > Acerca de.
  {
    path: 'how-it-works',
    loadComponent: () => import('./presentation/pages/how-it-works/how-it-works.page').then((m) => m.HowItWorksPage),
  },
  { path: '**', redirectTo: 'home' },
];
