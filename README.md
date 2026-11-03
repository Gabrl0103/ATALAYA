# Willay

App móvil que muestra el riesgo de incendio forestal por municipio en Nariño, Colombia.

- `backend/` — API en Express + TypeScript (Clean Architecture). Usa Neon si hay `DATABASE_URL`; si no, **datos de prueba** en memoria.
- `mobile/` — App Ionic + Angular + Capacitor (Android).
- `database/` — `schema.sql` para Neon (PostGIS).
- `ml/` — Machine learning en Python: datos históricos (NASA FIRMS, NASA POWER), variables, entrenamiento y evaluación. Ver `ml/README.md`.
- `docs/` — `REQUIREMENTS.md` (requisitos y decisiones) y `ML.md` (modelo de machine learning).

## Cómo correrlo (Windows)

Necesitas Node.js 24 (o el LTS que ya tienes), Git y Android Studio.

### 1. Backend
```
cd backend
npm install
npm run dev
```
Debe decir `Willay API listening on http://localhost:3000/api`.
Pruébalo en el navegador: http://localhost:3000/api/zones

Pruebas del cálculo de riesgo: `npm test`.

#### Base de datos (Neon)
Sin `DATABASE_URL` el backend usa los datos de prueba en memoria (`seedData.ts`); esos datos nunca se escriben en Neon. Para usar Neon:
```
cd backend
copy .env.example .env      # pega la cadena de conexión de Neon en DATABASE_URL
npm run db:schema           # crea PostGIS y las tablas (database/schema.sql)
npm run db:zones            # carga los 64 municipios de Nariño (DIVIPOLA del DANE)
npm run db:seed             # opcional: igual que db:zones (no carga datos de prueba)
npm run db:backfill         # historial de 35 días para el pronóstico (clima diario + focos FIRMS)
npm run dev                 # debe decir "Persistence: PostgreSQL (Neon)"
```

`npm run db:zones` se puede correr las veces que quieras (upsert por `id`). Los datos están en
`backend/src/infrastructure/persistence/narinoMunicipalities.ts`: nombre, código DIVIPOLA y coordenadas
de la cabecera municipal tal como los publica el DANE (datos.gov.co, dataset `gdxc-w37w`), más alias
("Tumaco", "Magüí Payán") para reconocer el municipio en noticias y en el dataset de la UNGRD.
Los 12 ids originales (`pasto`, `ipiales`, `tumaco`…) se conservan.

#### Límites municipales (mapa)
El mapa colorea los 64 municipios con sus límites del **Marco Geoestadístico Nacional 2025 del DANE**
(capa `MGN_ADM_MPIO_GRAFICO`, "Versión MGN2025-Nivel Municipio", Shapefile). Se sirven desde un archivo
estático versionado, `backend/src/infrastructure/geo/narino-boundaries-mgn2025.json` (149 KB, 42 KB con
gzip), unido con las zonas por código DIVIPOLA. No usan la base de datos (`zone.boundary` sigue vacía).

Para regenerarlo: bajar el zip a mano desde geoportal.dane.gov.co (su `robots.txt` pide pausas de 120 s y
visitas de noche) a `backend/data/raw/` (fuera de git) y correr `npm run geo:boundaries`. El script
(mapshaper) toma el departamento 52, simplifica al 2,7 % y falla si los 64 códigos no coinciden.

Fuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co

#### Ingesta de datos
Con `npm run dev` el backend programa la ingesta (node-cron, hora de Colombia) y trae el clima al arrancar.
Para correrla una vez a mano: `npm run ingest` (todas) o `npm run ingest weather` (una).

| Tarea | Fuente | Frecuencia |
|---|---|---|
| `weather` | Open-Meteo (sin API key), una sola petición para los 64 municipios → `weather_snapshot` | cada hora |
| `hotspots` | NASA FIRMS, VIIRS SNPP/NOAA-20/NOAA-21, últimos 5 días → `hotspot` (solo si hay `MAP_KEY`) | cada 3 h |
| `weather-daily` | Open-Meteo histórico (ERA5) de los últimos 35 días → `weather_daily`, para el pronóstico de 72 h | diario, 02:20 y al arrancar |
| `hotspots-history` | NASA FIRMS, detecciones crudas de los últimos 35 días (tramos de 5 días) → `hotspot_detection` y `firms_complete_day` (solo si hay `MAP_KEY`) | diario, 02:40 y al arrancar |
| `fires` | Scraping: datasets UNGRD 2019–2025 (datos.gov.co `wwkg-r6te`, `rgre-6ak4`, `2343-nuqp`; CC BY-SA 4.0 / CC BY 4.0, atribución en Historial) y feed RSS de noticias de la Gobernación de Nariño → `fire_event` | diario, 03:30 |

El scraping revisa `robots.txt` antes de cada URL (caché 24 h), deja al menos 5 s entre peticiones al mismo sitio (o el `Crawl-delay` si es mayor) y no vuelve a guardar una noticia ya guardada (`source_url`). Las noticias de un mismo municipio con 3 días o menos entre una y otra cuentan como **un solo incendio**: se guarda la más antigua y las demás quedan como enlaces de referencia (`related_urls`).

### 2. App en el navegador
En otra terminal:
```
cd mobile
npm install
npm start
```
Abre http://localhost:4200 (con el backend encendido).
Pruebas unitarias de la app (Vitest): `npm test`.

#### Mapa (MapLibre GL, globo)
El mapa usa **MapLibre GL JS 6.13** con proyección `globe` y tiles raster de OpenStreetMap oscurecidos con
propiedades de pintura (sin filtro CSS), más claros en la vista lejana del globo y oscuros desde zoom 5. La
primera vez por sesión (`sessionStorage`: una recarga no la repite) el globo entero, con su halo naranja,
espera entre el título y la hoja a que se vaya la splash; luego gira despacio (3 s) y vuela a Nariño (2,6 s,
inclinación 35°). Un toque en el mapa salta el giro o el vuelo y deja el encuadre final; con
`prefers-reduced-motion` abre directo en Nariño. Nariño queda lo más grande posible por encima de la hoja, el
mismo encuadre que deja «Acercar a Nariño»; al subir o bajar la hoja se vuelve a encuadrar. Después la cámara
queda dentro de Nariño (`maxBounds`, zoom mínimo 6).

Los municipios se colorean por nivel de riesgo, con un contorno claro de 1 px, el borde del departamento más
grueso y el seleccionado con contorno blanco y resplandor. No hay grupos: en el globo solo se ven los
polígonos y, sobre Nariño, cada municipio es su etiqueta centrada en la cabecera, mientras no choque con otra
(gana el seleccionado, luego Pasto y luego el más riesgoso) y quepa entera entre la cabecera y la hoja; si no,
queda como un punto chico sin número, que no se dibuja si una etiqueta lo tapa. En el encuadre inicial la
etiqueta es solo el nombre (10 px, claro con halo oscuro; unas 21 a 390 px de ancho) y al acercar aparecen
más; desde zoom 8,5 suma el puntaje y el nivel en el color del riesgo. Tocar un municipio abre su hoja de zona
al instante, con lo que el mapa ya tiene (nombre, puntaje, nivel y factores), mientras hace un vuelo corto
(0,7 s); al cerrarla el mapa se queda donde está y solo «Acercar a Nariño» vuelve al departamento. El mapa es siempre
globo: sin WebGL no hay mapa (ni globo ni plano), la pantalla lo dice y la búsqueda y «Mi ubicación» siguen
abriendo la hoja de zona. La hoja «Departamento de Nariño» abre baja (título, los 4 niveles y «Acercar a
Nariño») y se sube arrastrando o tocando el asa para ver los conteos, los rangos (0–24, 25–49, 50–74, 75–100),
la clave del foco de calor y la nota; los créditos de OSM y DANE van en letra pequeña abajo a la derecha del
mapa, justo encima de la hoja.

Nada se baja de un CDN: el CSS y el worker de MapLibre (`maplibre/maplibre-gl-worker.mjs`, copiado por
`angular.json`) van en la app; solo los tiles vienen de internet. El chunk del mapa (carga perezosa en
`/map`) pesa 1,10 MB (247 KB con gzip).

#### Mis municipios y Compartir
La hoja de zona tiene dos botones junto al nivel, los únicos para marcar favoritos y compartir:
- **Corazón:** agrega o quita el municipio de «Mis municipios», con una vibración ligera en el teléfono. Los
  favoritos se guardan solo en el teléfono (`@capacitor/preferences`; `localStorage` en el navegador), sin
  cuentas ni backend. Inicio los muestra arriba de «Zonas con mayor riesgo» (la sección no aparece si no hay
  ninguno) y el buscador del mapa los sugiere antes de escribir y los pone primero. En esas listas el corazón
  solo indica que es favorito. Un favorito que ya no está entre las zonas se ignora.
- **Compartir:** envía nombre, nivel y puntaje, el pronóstico de 24/48/72 h si respondió el modelo (no el
  respaldo), la hora de «Actualizado» del mapa (la API no expone la hora de ingesta), la aclaración y
  «Atalaya · Riesgo de incendios en Nariño». Sin links ni ubicación. En Android usa `@capacitor/share`; en el
  navegador, `navigator.share` o, si no existe, copia el texto y dice «Copiado». Cerrar el menú no es un error.

#### Ajustes e idiomas (v0.30)
Ajustes se abre con el engranaje de la cabecera de Inicio (`/settings`, carga perezosa; no es una pestaña).
Todo se guarda con `@capacitor/preferences` (clave `settings`) y se lee antes de la primera pantalla, así
que la app nunca aparece en el idioma equivocado:
- **Idioma:** Automático (el del teléfono si es español o inglés; si no, español), Español o English. Las
  traducciones están en `mobile/src/app/i18n/es.json` y `en.json` (en el APK, sin internet); el pipe `t` las
  cambia en caliente, con fechas, números y horas por `Intl` («24 oct. 2026, 5:07 p. m.» / «Oct 24, 2026,
  5:07 PM»). Una prueba falla si un JSON tiene claves que el otro no. No se traducen los datos: municipios,
  lugares, UNGRD, Gobernación, NASA FIRMS, la cita literal del DANE ni los nombres de los tiles de OSM.
- **Unidades:** °C / °F y km/h / mph para la fila «Clima ahora» de la hoja de zona (temperatura, humedad,
  viento y días sin lluvia; lo que no llegue se omite). Solo cambia cómo se muestran. El clima llega con la
  lista de zonas, así que la fila sale al abrir la hoja; con un backend anterior se pide al tocar el
  municipio. Mientras algo carga (clima, focos, incendios por año, pronóstico), su esqueleto ocupa la misma
  altura final, con un brillo que lo recorre, así que nada se mueve cuando llega.
- **Movimiento:** Automático (sigue al teléfono) o Reducido (sin entrada del mapa, partículas ni animaciones).
  Los dos apagan todas las animaciones de abajo, sin retrasos: lo escalonado aparece al instante.
- **Vibración**, **Datos** (borrar favoritos, con confirmación; borrar la caché de pronósticos y límites),
  **Ayuda** (ver la introducción otra vez) y **Acerca de** (versión 0.30.0, cómo se calcula el riesgo y las
  fuentes con su licencia o cita: NASA FIRMS, Open-Meteo, ERA5/Copernicus, NASA POWER, Gobernación de
  Nariño, OpenStreetMap, UNGRD y DANE).

#### Animaciones (v0.32)
Todas salen de `mobile/src/app/theme/animations.css` (`anim-up`, `anim-sheet`, `anim-growx`, `anim-growy`,
`anim-ring`, curva `cubic-bezier(0.2, 0.8, 0.2, 1)`, escalón `--i` de 0,1 s) y solo mueven `transform` y
`opacity`, para ir fluidas en un Android de gama media; ninguna anima alturas ni cambia el tamaño final.
- **Hoja de zona:** las tarjetas de «Clima ahora», los factores y las filas del pronóstico entran
  escalonadas y cada barra crece (`growx`) cuando su fila ya está. El corazón late al marcar y se encoge al
  desmarcar (solo tras tocarlo) y la flecha de compartir sube y vuelve.
- **Inicio:** las tarjetas de «Mis municipios» entran escalonadas; la que se quita se encoge y se desvanece
  (`animate.leave` de Angular, sin librerías), y la sección entera con el último favorito.
- **Ajustes:** tarjetas y filas escalonadas; en idioma, unidades y movimiento la píldora clara se desliza
  bajo la opción elegida.
- **Esqueletos:** un brillo (`::after` desplazado con `transform`) en lugar del latido.

### 3. App en Android (emulador o celular)
```
cd mobile
npm install
npx cap add android        # solo la primera vez
npm run build:android
npm run open:android       # abre Android Studio; pulsa Run con un emulador o un celular conectado por USB
```
La app en Android usa el backend desplegado (`https://willay-api.onrender.com/api`), no el de tu PC.
Para generar el APK: Android Studio → Build → Build APK(s).

## Modelo de riesgo
Puntaje 0–100 por municipio = **0,5 × clima seco + 0,3 × focos cercanos + 0,2 × historial** (cada factor de 0 a 100).
- **Clima seco:** temperatura, humedad, viento y días sin lluvia de Open-Meteo.
- **Focos cercanos:** focos de NASA FIRMS a 25 km o menos en los últimos 5 días, con peso por antigüedad (1 hasta 2 días, 0 a los 5); suma 3 o más = 100.
- **Historial:** incendios *reportados* por año del municipio desde el 2019-01-01 (UNGRD + noticias); 2,8 por año = 100 (p90 de los municipios, fijo). Los municipios grandes reportan más.

Niveles: Bajo 0–24, Medio 25–49, Alto 50–74, Extremo 75–100. Detalle y limitaciones en `docs/REQUIREMENTS.md` (sección 7).

### Pronóstico 72 h (modelo de machine learning)
En `ml/` hay un modelo que estima la probabilidad de focos de calor a ≤ 25 km en las próximas 72 h. Se entrenó con NASA FIRMS (VIIRS) y clima de NASA POWER. En el periodo de prueba (2025–2026), la regresión logística supera al modelo de pesos: ROC-AUC 0,85 frente a 0,68.

Desde la v0.22 el backend lo usa en `GET /api/zones/:id/forecast` y la app lo muestra en la hoja de zona («Pronóstico 72 h»). El puntaje del mapa sigue siendo el modelo de pesos. La app lo pide en cuanto se toca un municipio, muestra las tres filas como esqueleto mientras llega, lo guarda por zona 10 minutos (solo las respuestas del modelo) y cancela la petición anterior si se toca otro.
- **Sin Python en producción:** `python -m willay_ml.export_backend` (en `ml/`) exporta la regresión logística a `backend/src/infrastructure/ml/risk-model-1.0.0.json` y el backend la calcula en TypeScript (`predictRisk`).
- **Clima:** producción usa Open-Meteo y el modelo se entrenó con NASA POWER, así que cada variable pasa por un ajuste lineal Open-Meteo → POWER (ajustado con 2024). En prueba: ROC-AUC 0,842 con Open-Meteo ajustado frente a 0,853 con POWER.
- **Filas 24/48/72 h:** el modelo corrido al final de hoy, mañana y pasado mañana, con el clima pronosticado y solo los focos ya observados.
- **Respaldo:** si faltan datos o algo falla, responde el puntaje actual y el motivo (`source: "fallback"`).

Detalle, ajuste y limitaciones en `docs/ML.md` (sección 7); cómo reproducirlo en `ml/README.md`.

## Endpoints
- `GET /api/zones` — municipios con puntaje, nivel de riesgo y, desde la v0.28, `factors`; desde la v0.31, `weather` (el clima actual de «Clima ahora»). Los dos son opcionales para la app: si faltan, la hoja los espera del detalle como esqueleto.
- `GET /api/zones/:id` — detalle: clima y factores.
- `GET /api/zones/:id/forecast` — pronóstico de 72 h con el modelo de ML (filas de 24, 48 y 72 h), o respaldo con el puntaje actual.
- `GET /api/zones/boundaries` — límites de los 64 municipios (GeoJSON, `feature.id` = id de la zona; caché de un día con ETag).
- `GET /api/fires?zoneId=pasto` — historial de incendios y resumen.
- `GET /api/hotspots` — focos de calor.

## Qué falta
- Desplegar el backend (Render/Railway) y cambiar `API_BASE_URL` en `mobile/src/app/core/config/api-config.ts`.
