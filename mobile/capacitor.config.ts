import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.willay.app',
  appName: 'Atalaya',
  webDir: 'dist/mobile/browser',
  // Mismo fondo que la splash animada: sin destello blanco entre la splash nativa y la web.
  backgroundColor: '#0B0604',
  server: {
    // Desarrollo: el backend local usa http. Con el backend desplegado (https) esto se puede quitar.
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    // Alertas locales: la llama monocroma (res/drawable/ic_stat_atalaya.xml) en el naranja de la app.
    LocalNotifications: {
      smallIcon: 'ic_stat_atalaya',
      iconColor: '#FF8A2B',
    },
  },
};

export default config;
