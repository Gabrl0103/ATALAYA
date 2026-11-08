# Atalaya

App móvil (Android) que muestra el **riesgo de incendio forestal** de los 64 municipios de Nariño, Colombia.
Junta datos abiertos (focos de calor por satélite, clima e incendios reportados) y los resume en un puntaje
de 0 a 100 por municipio, con un pronóstico a 72 h hecho con un modelo de machine learning.

Repositorio: https://github.com/Gabrl0103/ATALAYA (antes `Willay-Firemap`; GitHub redirige el enlace anterior).

Es un proyecto académico. El puntaje es un **indicador de riesgo, no una predicción exacta**, y el modelo
estima **focos de calor** (anomalías térmicas que ve el satélite), no incendios confirmados.

## Qué hace la app

- **Inicio:** resumen de Nariño hoy (riesgo promedio, focos de calor de los últimos 5 días, municipios
  monitoreados), «Mis municipios» y las zonas con mayor riesgo.
- **Mapa:** globo de MapLibre que gira y vuela a Nariño; los 64 municipios con sus **límites del DANE**,
  coloreados por nivel de riesgo, y los focos de calor recientes. Buscador de municipios y «Mi ubicación».
- **Hoja de zona:** puntaje, nivel, «Clima ahora», los tres factores del puntaje, focos cercanos, incendios
  por año y el **pronóstico 72 h** (24/48/72 h).
- **Favoritos («Mis municipios»)** y **Compartir** el riesgo de un municipio como texto.
- **Comparar** 2 o 3 municipios lado a lado (`/compare`).
- **Historial de focos:** reproducción día a día de los focos de los últimos 35 días sobre el mapa.
- **Cerca de mí:** tras «Mi ubicación», en qué municipio estás, su riesgo y el foco de calor más cercano
  (a 100 km o menos), con distancia, rumbo y antigüedad.
- **¿Ves fuego? Avisa** (hoja de zona y Ajustes): botones para llamar a la Línea de emergencias 123, Bomberos
  119, Cruz Roja 132 y Defensa Civil 144, qué decir al llamar y «Compartir mi ubicación» (municipio,
  coordenadas y un enlace de OpenStreetMap, por el menú de compartir del teléfono). La hoja suma consejos de
  **prevención** según el nivel de riesgo. Atalaya no avisa a nadie automáticamente.
- **Historial:** incendios reportados por municipio (UNGRD y noticias), con reportes por año.
- **Ajustes:** idioma (Automático, Español, **English**), unidades (°C/°F, km/h/mph), movimiento, vibración,
  **alertas locales** de los favoritos, borrar datos, ver la introducción otra vez y Acerca de (fuentes y
  licencias).
- **Cómo funciona** (`/how-it-works`): el camino de los datos y qué significa cada nivel.

## Stack

| Capa | Tecnología |
|---|---|
| App | Ionic 9 + Angular 22 + Capacitor 8 (Android), TypeScript `strict` |
| Mapa | MapLibre GL JS 6.13 (proyección `globe`) con tiles raster de OpenStreetMap |
| Backend | Node.js + Express 5 + TypeScript |
| Scraping e ingesta | `axios` + `cheerio`, programada con `node-cron` dentro del backend |
| Base de datos | PostgreSQL + PostGIS en Neon (opcional: sin ella, datos de prueba en memoria) |
| Machine learning | Python (scikit-learn) en `ml/`; el modelo exportado se calcula en TypeScript en el backend |
| Pruebas | Vitest (app), `node:test` con `tsx` (backend), pytest (ML) |
| Hosting | Backend en Render; la app se instala como APK |

## Arquitectura

Clean Architecture en el backend y en la app: las dependencias van hacia adentro y el dominio no conoce
frameworks.

```
backend/src/
  domain/          modelos, puertos y servicios puros (puntaje de riesgo, variables del pronóstico)
  application/     casos de uso
  infrastructure/  Neon/PostGIS o memoria, clientes externos (FIRMS, Open-Meteo), scraping,
                   modelo de ML exportado, límites del DANE, configuración
  presentation/    rutas HTTP, DTOs y middleware de errores
mobile/src/app/
  core/            configuración de la API, errores, alertas, ubicación, compartir, líneas de emergencia
  domain/          modelos, interfaces de repositorio y utilidades puras
  data/            repositorios HTTP
  state/           stores con signals (zonas, favoritos, comparación, ajustes, historial)
  presentation/    páginas (inicio, mapa, historial, comparar, cómo funciona, ajustes) y componentes
  i18n/            es.json y en.json
database/          schema.sql (PostGIS)
ml/                datos, variables, entrenamiento y exportación del modelo (ver ml/README.md)
docs/              REQUIREMENTS.md (requisitos y decisiones) y ML.md (modelo)
```

## Fuentes de datos y licencias

| Fuente | Qué aporta | Licencia o cita |
|---|---|---|
| NASA FIRMS (VIIRS SNPP, NOAA-20, NOAA-21) | Focos de calor por satélite | Cita que pide la NASA (en Acerca de) |
| Open-Meteo | Clima actual, pronóstico e historial reciente | CC BY 4.0 («Weather data by Open-Meteo.com») |
| ERA5 · Copernicus (vía Open-Meteo) | Clima histórico | Licencia de Copernicus, con su aviso |
| NASA POWER | Clima con el que se entrenó el modelo | Sin licencia declarada; se usa la cita que pide |
| UNGRD, «Emergencias UNGRD» (datos.gov.co `wwkg-r6te`, `rgre-6ak4`, `2343-nuqp`) | Incendios reportados 2019–2025 | CC BY-SA 4.0 (2019–2024) y CC BY 4.0 (2025), con atribución y cambios en Historial |
| Gobernación de Nariño (feed RSS de narino.gov.co) | Noticias de incendios recientes | Sin licencia abierta declarada; se cita la fuente |
| DANE, Marco Geoestadístico Nacional 2025 | Límites de los 64 municipios | «Fuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co» |
| DANE, DIVIPOLA (datos.gov.co `gdxc-w37w`) | Nombre, código y cabecera de cada municipio | Publicado por el DANE en datos.gov.co |
| OpenStreetMap | Mapa base | © OpenStreetMap contributors · ODbL |

El scraping revisa `robots.txt` antes de cada URL (caché 24 h), deja al menos 5 s entre peticiones al mismo
sitio (o el `Crawl-delay` si es mayor) y no vuelve a guardar una noticia ya guardada.

## Cómo correrlo (Windows)

Necesitas Node.js (desarrollado con Node 24), Git y, para Android, Android Studio.

### 1. Backend

```
cd backend
npm install
npm run dev
```

Debe decir `Atalaya API listening on http://localhost:3000/api`. Pruébalo en http://localhost:3000/api/zones.

Sin `DATABASE_URL` el backend usa datos de prueba en memoria (`seedData.ts`), que nunca se escriben en Neon.
Para usar Neon:

```
copy .env.example .env      # completa las variables (ver abajo)
npm run db:schema           # PostGIS y tablas (database/schema.sql)
npm run db:zones            # los 64 municipios de Nariño (DIVIPOLA del DANE)
npm run db:backfill         # 35 días de clima diario y focos para el pronóstico
npm run dev                 # debe decir "Persistence: PostgreSQL (Neon)"
```

#### Ingesta programada

Con `npm run dev` el backend programa la ingesta (node-cron, hora de Colombia). Para correrla una vez a mano:
`npm run ingest` (todas) o `npm run ingest weather` (una).

| Tarea | Fuente | Frecuencia |
|---|---|---|
| `weather` | Open-Meteo, clima actual de los 64 municipios | cada hora |
| `weather-daily` | Open-Meteo histórico (ERA5), últimos 35 días | diario, 02:20 |
| `hotspots` | NASA FIRMS, últimos 5 días (solo con `MAP_KEY`) | cada 3 h |
| `hotspots-history` | NASA FIRMS, detecciones de los últimos 35 días (solo con `MAP_KEY`) | diario, 02:40 |
| `fires` | Scraping: datasets de la UNGRD y feed RSS de la Gobernación | diario, 03:30 |

#### Límites municipales

Se sirven desde un archivo estático versionado,
`backend/src/infrastructure/geo/narino-boundaries-mgn2025.json`. Para regenerarlo: bajar a mano el zip del
MGN 2025 del Geoportal del DANE a `backend/data/raw/` (fuera de git) y correr `npm run geo:boundaries`.

### 2. App en el navegador

En otra terminal, con el backend encendido:

```
cd mobile
npm install
npm start
```

Abre http://localhost:4200. En el navegador la app usa `http://localhost:3000/api`.

### 3. App en Android y APK

```
cd mobile
npm run build:android      # ng build + cap sync android
npm run open:android       # abre Android Studio
```

En Android Studio, **Run** la instala en un emulador o en un celular por USB, y **Build → Build APK(s)**
genera el APK. En Android la app usa el backend desplegado en Render
(`mobile/src/app/core/config/api-config.ts`), no el de tu PC. Su URL, `https://willay-api.onrender.com/api`,
conserva el nombre original del proyecto: Render no cambia el subdominio al renombrar el servicio.

#### Pantalla completa en Android

La app va de borde a borde en todas las versiones: `MainActivity` activa edge-to-edge con iconos claros, el tema
pinta `#0B0604` detrás de las barras del sistema y la actividad queda en vertical. La página se aparta de las
barras solo con `--safe-top/right/bottom/left` (`theme/tokens.css`, que une `env(safe-area-inset-*)` con los
`--safe-area-inset-*` que inyecta Capacitor), y todo el contenido deja `--nav-clearance` bajo la barra inferior.
El marco de teléfono de 390 × 844 solo aparece en una computadora. `npm test` corre antes
`scripts/layout-css.test.mjs`, que falla si vuelven `100vh`/`100vw` o un `env(safe-area-inset-*)` directo.

#### APK desde la terminal

Gradle 8.14 necesita **JDK 21** (el JDK que trae Android Studio es el 25 y Gradle no lo soporta). En Git Bash:

```
cd mobile
npm run build:android
cd android
export JAVA_HOME="/c/Program Files/Java/jdk-21"
./gradlew.bat assembleDebug      # mobile/android/app/build/outputs/apk/debug/app-debug.apk
./gradlew.bat assembleRelease    # mobile/android/app/build/outputs/apk/release/app-release.apk (firmado)
```

#### Firmar el APK de release

El release se firma con `mobile/android/keystore.properties`. Ni ese archivo ni el keystore (`*.jks`,
`*.keystore`) se suben a git. Sin ellos, `assembleRelease` deja `app-release-unsigned.apk`, que Android no
instala.

1. Crea el keystore una sola vez (pide las contraseñas y tus datos):
   ```
   cd mobile/android
   "/c/Program Files/Java/jdk-21/bin/keytool.exe" -genkeypair -v -keystore atalaya-release.jks -alias atalaya -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Crea `mobile/android/keystore.properties`:
   ```
   storeFile=atalaya-release.jks
   storePassword=<la contraseña del keystore>
   keyAlias=atalaya
   keyPassword=<la contraseña de la clave>
   ```
3. Corre `./gradlew.bat assembleRelease`.

Guarda una copia del keystore y de sus contraseñas fuera del proyecto: las actualizaciones del APK se firman
con la misma clave y, si se pierde, no se puede actualizar la app instalada.

## Variables de entorno (`backend/.env`)

Todas son opcionales. La plantilla está en `backend/.env.example`; nunca se versiona `.env`.

| Variable | Para qué | Sin ella |
|---|---|---|
| `PORT` | Puerto de la API | 3000 |
| `DATABASE_URL` | Cadena de conexión de Neon (PostgreSQL + PostGIS) | Datos de prueba en memoria |
| `INGESTION_ENABLED` | `false` apaga la ingesta programada | Ingesta encendida |
| `MAP_KEY` | Clave de NASA FIRMS | No se ingieren focos nuevos |

## Pruebas

```
cd backend && npm test      # node:test
cd mobile && npm test       # Vitest
cd ml && .venv\Scripts\python -m pytest -q
```

## Endpoints

- `GET /api/health`
- `GET /api/zones`: municipios con puntaje, nivel, factores y clima actual.
- `GET /api/zones/:id`: detalle de un municipio (clima, factores, focos cercanos).
- `GET /api/zones/:id/forecast`: pronóstico de 72 h (24, 48 y 72 h) con el modelo, o respaldo con el puntaje
  actual y el motivo.
- `GET /api/zones/boundaries`: límites de los 64 municipios (GeoJSON, caché de un día con ETag).
- `GET /api/fires?zoneId=pasto`: incendios reportados y resumen.
- `GET /api/hotspots`: focos de calor recientes (los que guarda la ingesta, últimos 5 días).
- `GET /api/hotspots/history?from=AAAA-MM-DD&to=AAAA-MM-DD`: focos por día, a lo sumo 35 días.

## Modelo de riesgo

- **Puntaje del mapa (0–100):** 0,5 × clima seco + 0,3 × focos cercanos (≤ 25 km, últimos 5 días) + 0,2 ×
  historial de incendios reportados. Niveles: Bajo 0–24, Medio 25–49, Alto 50–74, Extremo 75–100.
- **Pronóstico 72 h:** regresión logística v1.0.0 que estima la probabilidad de al menos un foco de calor a
  ≤ 25 km de la cabecera en las 72 h siguientes. Con el clima de Open-Meteo ajustado (el de producción), en
  prueba (2025-01-01 a 2026-09-29): ROC-AUC 0,842, PR-AUC 0,496 y Brier 0,100 (tasa base 15,6 %).

Detalle en [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) y [`docs/ML.md`](docs/ML.md); cómo reproducir el
modelo en [`ml/README.md`](ml/README.md).
