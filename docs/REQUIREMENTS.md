# Atalaya — Requisitos y decisiones

*(Antes llamado FIREMAP y luego Willay. Repositorio: https://github.com/Gabrl0103/ATALAYA (antes `Willay-Firemap`).
Algunos identificadores internos conservan el nombre anterior y no se cambian: el id de Android `co.willay.app`
(cambiarlo obliga a reinstalar), la URL de la API `https://willay-api.onrender.com` (Render no cambia el
subdominio al renombrar el servicio) y el paquete de Python `willay_ml`.)*

> Documento vivo: describe el estado actual del proyecto. La historia de cada cambio está en la sección 13.
> **Última actualización:** 2026-11-08 · **Versión:** 0.38 (renombre a Atalaya)

---

## 1. Resumen

App **solo móvil** (Android) que muestra el riesgo de incendio forestal de los **64 municipios de Nariño**
(Colombia). Un backend recolecta datos por **scraping** y APIs abiertas, calcula un **puntaje de riesgo** de 0 a
100 por municipio y un **pronóstico a 72 h** con un modelo de machine learning.

- **Contexto:** proyecto académico, se presenta al profesor.
- **Restricciones del profesor:** el scraping es obligatorio y el tipo de fuente no importa; predecir el incendio
  directamente es demasiado complejo, así que se estima **riesgo**. El profesor no impuso stack.
- **Idioma:** la app está en español e inglés. Código, clases y variables en inglés; documentación en español;
  commits con tipo y scope en inglés y descripción en español.

## 2. Alcance

**Dentro:** app Android (APK), backend API desplegado, ingesta y scraping programados, puntaje de riesgo,
pronóstico 72 h, mapa, historial, favoritos, comparación, alertas locales.

**Fuera:** iOS, escritorio, cuentas y login, reportes ciudadanos, notificaciones push remotas, alertas con la app
cerrada, deep learning.

## 3. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| App | Ionic 9 + Angular 22 + Capacitor 8 (Android), TypeScript `strict` | Web empaquetada como APK; un solo lenguaje con el backend. |
| Mapa | MapLibre GL JS 6.13, proyección `globe`, tiles raster de OpenStreetMap | Gratis y sin facturación; reemplazó a Leaflet en la v0.24. |
| Plugins | `@capacitor/geolocation`, `haptics`, `local-notifications`, `preferences`, `share` | Ubicación, vibración, alertas, ajustes y favoritos en el teléfono, compartir. |
| Backend | Node.js + Express 5 + TypeScript | Sencillo; mismo lenguaje que la app. |
| Scraping | `axios` + `cheerio`, programado con `node-cron` dentro del backend | Sin servicios extra. |
| Base de datos | PostgreSQL + PostGIS en **Neon** (plan gratis) | Sin `DATABASE_URL`, datos de prueba en memoria. |
| Machine learning | Python + scikit-learn en `ml/`; el modelo exportado se calcula en TypeScript | Sin Python en producción. |
| Hosting | Backend en **Render** (plan gratis); la app se instala como APK | Vercel descartado. |
| Pruebas | Vitest (app), `node:test` con `tsx` (backend), pytest (ML) | |

**Diseño:** tema oscuro con acentos de brasa, fondo animado («lámpara de lava»), tarjetas de vidrio y barra
inferior flotante (Inicio, Mapa, Historial y búsqueda). Fuentes Manrope y Roboto Mono con `@fontsource`, dentro
del APK (sin internet).

## 4. Arquitectura y buenas prácticas

- **Clean Architecture** en backend y app: dependencias hacia adentro; el dominio no conoce frameworks.
- **SOLID, DRY, KISS.** Patrones donde aportan: Repository, Factory (fuentes de scraping), inyección de
  dependencias (Angular; contenedor manual en Express), Singleton (pool de conexión, servicios `providedIn: 'root'`).
- **Estado de la app con signals** (stores de zonas, favoritos, comparación, ajustes e historial).
- **Errores:** middleware de errores en Express; en la app, `HttpInterceptor` y errores tipados por código
  (`ApiError.code`) que cada pantalla nombra en su idioma.
- **Tipado fuerte:** TypeScript `strict`, DTOs en ambos lados.
- **Textos de la app** en `i18n/es.json` y `i18n/en.json`; una prueba falla si los dos no tienen las mismas claves.
- **Scraping respetuoso:** `robots.txt` (caché 24 h), al menos 5 s entre peticiones al mismo sitio (o el
  `Crawl-delay` si es mayor) y sin volver a guardar una noticia ya guardada.
- **Accesibilidad y movimiento:** botones de 44 px con `aria-label`; `prefers-reduced-motion` y el ajuste
  «Movimiento: Reducido» apagan las animaciones.

## 5. Estructura de carpetas

```
backend/src/
  domain/          modelos, puertos y servicios puros (RiskScoringService, variables del pronóstico)
  application/     casos de uso (zonas, detalle, pronóstico, límites, incendios, focos, ingestas)
  infrastructure/  persistence (Neon o memoria), external (FIRMS, Open-Meteo), scraping, ml (modelo
                   exportado), geo (límites del DANE), config (env y contenedor)
  presentation/    rutas HTTP, DTOs, middleware de errores
mobile/src/app/
  core/            configuración de la API, errores, alertas, ubicación, compartir, vibración, movimiento,
                   líneas de emergencia
  domain/          modelos, interfaces de repositorio y utilidades puras (comparar, cercanía, reproducción…)
  data/            repositorios HTTP
  state/           stores con signals
  presentation/    páginas (home, map, history, compare, how-it-works, settings) y componentes
  i18n/            es.json, en.json
  theme/           tokens, animaciones y estilos del mapa
database/          schema.sql (PostGIS)
ml/                datos, variables, entrenamiento y exportación del modelo
docs/              este archivo y ML.md
```

## 6. Fuentes de datos

| Fuente | Qué aporta | Cómo se obtiene | Licencia o cita |
|---|---|---|---|
| NASA FIRMS: VIIRS SNPP, NOAA-20 y NOAA-21 (NRT) | Focos de calor | API con `MAP_KEY`, bbox de Nariño | Cita que pide la NASA |
| Open-Meteo | Clima actual, pronóstico y 35 días de historial (ERA5) | API sin clave | CC BY 4.0; ERA5 con el aviso de Copernicus |
| NASA POWER | Clima del entrenamiento del modelo | Descarga en `ml/` | Sin licencia declarada; cita que pide |
| UNGRD, «Emergencias UNGRD» en datos.gov.co: `wwkg-r6te` (2019–2022), `rgre-6ak4` (2023–2024), `2343-nuqp` (2025) | Incendios reportados con municipio, fecha y hectáreas | Scraping de la API de datos.gov.co | CC BY-SA 4.0 (2019–2024), CC BY 4.0 (2025); atribución y cambios en Historial |
| Gobernación de Nariño | Noticias de incendios recientes | Scraping del feed RSS de su buscador (hasta 8 páginas) | Sin licencia abierta declarada; se cita la fuente |
| DANE, Marco Geoestadístico Nacional 2025 (`MGN_ADM_MPIO_GRAFICO`) | Límites de los 64 municipios | Zip bajado a mano, simplificado al 2,7 % con `npm run geo:boundaries` | «Fuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co» |
| DANE, DIVIPOLA (`gdxc-w37w`) | Nombre, código y cabecera de cada municipio | `npm run db:zones` | Publicado en datos.gov.co |
| OpenStreetMap | Mapa base | Tiles raster | ODbL |

**Ingesta programada** (node-cron, hora de Colombia; `npm run ingest` la corre a mano):

| Tarea | Qué hace | Frecuencia |
|---|---|---|
| `weather` | Clima actual de los 64 municipios → `weather_snapshot` | cada hora |
| `weather-daily` | 35 días de clima diario → `weather_daily` | diario, 02:20 |
| `hotspots` | Focos de los últimos 5 días → `hotspot` (con duplicados entre satélites unidos) | cada 3 h |
| `hotspots-history` | Detecciones crudas de 35 días → `hotspot_detection` y `firms_complete_day` | diario, 02:40 |
| `fires` | UNGRD y noticias → `fire_event` | diario, 03:30 |

## 7. Modelo de riesgo

### 7.1 Puntaje actual (el del mapa)

Puntaje 0–100 = **0,5 × clima seco + 0,3 × focos cercanos + 0,2 × historial**. Cada factor va de 0 a 100.
Niveles: **Bajo 0–24, Medio 25–49, Alto 50–74, Extremo 75–100.**

- **Clima seco** (Open-Meteo): 0,3 × temperatura (10→32 °C) + 0,35 × sequedad (humedad 80→20 %) + 0,15 × viento
  (0→40 km/h) + 0,2 × días sin lluvia (0→14).
- **Focos cercanos** (NASA FIRMS): focos a 25 km o menos de la cabecera en los últimos 5 días, con peso por
  antigüedad (1 hasta los 2 días, baja hasta 0 a los 5). Suma de pesos 3 o más = 100. Las detecciones de
  satélites distintos a ≤ 1 km y ≤ 3 h cuentan como un solo foco.
- **Historial** (UNGRD + noticias): incendios **reportados** por año desde el 2019-01-01; 2,8 por año = 100 (p90
  de los municipios, fijo en `RiskScoringService.ts`).

### 7.2 Pronóstico 72 h (machine learning)

Regresión logística **v1.0.0** con calibración Platt: probabilidad de al menos un foco de calor VIIRS a ≤ 25 km
de la cabecera en las 72 h siguientes. Usa los mismos cortes que el puntaje (probabilidad × 100).

- Entrenada con NASA FIRMS y NASA POWER: entrenamiento 2019–2023, calibración 2024, prueba 2025-01-01 a
  2026-09-29. 25 variables sin fuga de información (lluvia, días sin lluvia, temperatura, humedad, viento,
  evapotranspiración, focos en la zona y alrededor, época del año y propensión 2015–2018).
- En producción, `GET /api/zones/:id/forecast` la calcula en TypeScript desde
  `backend/src/infrastructure/ml/risk-model-1.0.0.json`, con el clima de Open-Meteo ajustado a la escala de POWER.
  Filas de 24, 48 y 72 h: el modelo al final de hoy, mañana y pasado mañana.
- **Métricas en prueba** (Open-Meteo ajustado, el de producción): ROC-AUC 0,842, PR-AUC 0,496, Brier 0,100;
  tasa base 15,6 % (Brier de la tasa base 0,131). Con POWER: 0,853 / 0,512 / 0,100. El modelo de pesos, en la
  misma prueba: ROC-AUC 0,680.
- **Respaldo:** si falta clima o focos recientes, o falla el modelo, responde el puntaje actual con el motivo
  (`source: "fallback"`) y la app lo dice.

Detalle completo en [`docs/ML.md`](ML.md).

## 8. Requisitos funcionales (implementados)

| ID | Requisito | Desde |
|---|---|---|
| RF-01 | Mapa de Nariño en un globo (MapLibre), con los 64 municipios del DANE coloreados por nivel de riesgo | v0.23–v0.28 |
| RF-02 | Hoja de zona: puntaje, nivel, «Clima ahora», los tres factores, focos cercanos e incendios por año | v0.8–v0.31 |
| RF-03 | Focos de calor recientes (últimos 5 días) sobre el mapa | v0.8 |
| RF-04 | Historial de incendios reportados, por municipio, con reportes por año y atribución de la UNGRD | v0.8 |
| RF-05 | Buscar un municipio y abrir su hoja | v0.8 |
| RF-06 | Pronóstico 72 h en la hoja de zona, con respaldo y «Reintentar» | v0.22 |
| RF-07 | Inicio: resumen de Nariño, «Mis municipios» y zonas con mayor riesgo | rediseño |
| RF-08 | Favoritos («Mis municipios»), guardados solo en el teléfono | v0.29 |
| RF-09 | Compartir el riesgo de un municipio como texto (sin enlaces ni ubicación) | v0.29 |
| RF-10 | Ajustes: idioma (Automático, Español, English), unidades, movimiento, vibración, datos, ayuda y acerca de | v0.30 |
| RF-11 | «Cómo funciona»: flujo de los datos y qué significa cada nivel | v0.33 (recortada en v0.37) |
| RF-12 | Alertas locales cuando un favorito sube a Alto o Extremo | v0.33 |
| RF-13 | Comparar 2 o 3 municipios lado a lado | v0.34 |
| RF-14 | Historial de focos: reproducción día a día de los últimos 35 días en el mapa | v0.34 |
| RF-15 | «Mi ubicación» y «Cerca de mí»: municipio, riesgo y foco más cercano (≤ 100 km) con distancia y rumbo | v0.34 |
| RF-16 | Introducción de tres pantallas al primer uso, que se puede volver a ver desde Ajustes | rediseño |
| RF-17 | «¿Ves fuego? Avisa»: llamar a las líneas de emergencia, qué decir, compartir la ubicación y prevención por nivel | v0.36 |

### Detalle de las funciones recientes

- **Comparar** (`/compare`): desde «Comparar» en la hoja de zona o con el buscador (favoritos primero). Nivel,
  puntaje, pronóstico 24/48/72 h, clima ahora y factores en columnas; se resalta el de mayor riesgo de cada fila
  y lo que falta se ve como «—». La comparación vive mientras la app está abierta.
- **Historial de focos:** deslizador de fechas, play/pausa y 1x/2x; el mapa muestra solo los focos del día
  (capa GeoJSON de MapLibre) con fecha y conteo. Usa `GET /api/hotspots/history`; si falla, avisa con
  «Reintentar» y el mapa sigue con los focos recientes.
- **Cerca de mí:** municipio por punto en polígono sobre los límites del DANE (o el más cercano si no
  cargaron, o «fuera de Nariño»), y el foco de los últimos 5 días más cercano con distancia, rumbo de 8 puntos
  y antigüedad. Se calcula en el teléfono; la ubicación no sale de él.
- **Alertas:** `@capacitor/local-notifications`, apagadas por defecto. Se revisan al llegar la lista de zonas
  (al abrir la app o volver a ella tras 10 min), solo de favoritos, una por subida de nivel al umbral. El
  permiso se pide solo al activarlas, después de explicarlo.
- **Inglés:** todos los textos de la app; fechas y números con `Intl`. No se traducen los datos (municipios,
  lugares, nombres de fuentes ni la cita literal del DANE).
- **¿Ves fuego? Avisa** (al final de la hoja de zona, después de «Ver historial», y en Ajustes entre Alertas y
  Datos):
  - Botones `tel:` de 44 px o más, con `aria-label`, para la Línea de emergencias 123, Bomberos 119, Cruz Roja
    132 y Defensa Civil 144. Los números están en `mobile/src/app/core/emergency/emergency-lines.ts`
    (`NATIONAL_LINES`); las líneas locales de Nariño se agregan en `LOCAL_LINES`, con su nombre en es/en. En
    Android el enlace abre el marcador con el número; en un navegador de escritorio el número queda a la vista.
  - «Qué decir al llamar», plegado: municipio y vereda o una referencia, qué se ve, si hay viviendas cerca y un
    número de contacto.
  - «Compartir mi ubicación»: la ubicación se pide solo al tocar el botón, con el permiso y los avisos de error
    de «Mi ubicación». El texto lleva el municipio (por los límites del DANE, o el más cercano), las
    coordenadas con 5 decimales y un enlace de OpenStreetMap, y sale por el menú de compartir del teléfono (o
    el portapapeles en el navegador). Si la ubicación falla, la hoja de zona ofrece «Compartir sin ubicación»
    con el municipio consultado. No se guarda ni se envía a ningún servidor.
  - Aviso: Atalaya no reemplaza a las autoridades, no avisa a nadie automáticamente y ante una emergencia hay
    que llamar.
  - **Prevención** (solo en la hoja de zona, bajo el pronóstico): dos consejos fijos para el nivel actual, sin
    normas ni cifras.

## 9. Requisitos no funcionales

- **RNF-01** Solo móvil, mobile-first (pantalla base 390 × 844; se revisa también a 320 px).
- **RNF-02** Si una fuente externa falla, la app sigue: respaldo del pronóstico, mapa sin límites, focos
  recientes sin historial, campos opcionales con un backend anterior.
- **RNF-03** La hoja de zona abre al tocar, con lo que el mapa ya tiene; lo que falta llega como esqueleto del
  mismo tamaño, sin saltos.
- **RNF-04** Privacidad: sin cuentas; favoritos, ajustes, alertas y ubicación se quedan en el teléfono.
- **RNF-05** Todo lo de la sección 4.

## 10. Decisiones

- **Riesgo y no predicción de incendios** (pedido del profesor); el pronóstico estima focos de calor.
- **Ionic + Angular + Capacitor y Express + TypeScript:** un solo lenguaje. Se descartaron Java/Spring Boot +
  React y Flutter + FastAPI.
- **MapLibre con globo en lugar de Leaflet** (v0.24); sin WebGL no hay mapa, pero la búsqueda y «Mi ubicación»
  siguen abriendo la hoja.
- **Límites del DANE como archivo estático versionado**, no en PostGIS: funcionan sin base de datos. El IGAC se
  descartó (sin descarga directa de una capa municipal).
- **NASA POWER para entrenar** porque Open-Meteo histórico tiene una cuota diaria; en producción se usa
  Open-Meteo con un ajuste lineal a la escala de POWER. Reentrenar con Open-Meteo queda para la v1.1.
- **Regresión logística** sobre gradient boosting: mejor en prueba y exportable a TypeScript (sin Python en
  producción). El puntaje del mapa sigue siendo el modelo de pesos.
- **Tope del historial fijo (2,8 por año)** para que el puntaje de una zona no cambie cuando otras reciben reportes.
- **Alertas solo locales y con la app abierta:** se descartó `@capacitor/background-runner` (mínimo 15 min sin
  hora fija, Doze y ahorro de batería, lógica duplicada en otro motor).
- **La API de producción se fija en la app** (`api-config.ts`): Render en Android, `localhost` en el navegador.

## 11. Límites conocidos

- **El modelo estima focos de calor, no incendios confirmados.** VIIRS ve cualquier anomalía térmica, también
  quemas agrícolas y de potreros. Las nubes ocultan focos y el satélite pasa pocas veces al día.
- **Historial escaso.** El historial de incendios cuenta lo **reportado** (más en municipios grandes y con
  prensa); la UNGRD cubre 2019–2025 y 2026 solo tiene noticias de la Gobernación, cuya fecha es la de
  publicación. Algunos municipios tienen poco historial de focos y el modelo aprende sobre todo de la historia:
  avisa poco de un evento extremo donde casi nunca hubo focos. El historial de focos de la app guarda 35 días.
- **Radio fijo de 25 km** desde la cabecera, no el polígono del municipio: un foco puede contar para varios.
- **Clima de producción distinto al del entrenamiento** (Open-Meteo ajustado frente a POWER): rinde algo menos
  (ROC-AUC 0,842 frente a 0,853). Además, la variable de evapotranspiración se entrenó con un error de unidades
  de POWER que el backend reproduce igual; se corrige en la v1.1 (ver `docs/ML.md`).
- **Dependencia de planes gratis.** El backend está en el plan gratis de Render: dormido, la primera respuesta
  tardó 21,9 s (frente a ~0,4 s despierto). Neon (plan gratis) también se suspende sin uso.
- **Alertas:** con la app cerrada no llegan.

## 12. Pendientes

- Modelo v1.1: reentrenar con el clima de Open-Meteo y corregir las unidades de la evapotranspiración.
- Medir los fps del mapa en un Android real (la ventana de automatización limita los cuadros por segundo).
- Confirmar con el profesor que los datos abiertos y las noticias cuentan como scraping válido.

## 13. Registro de cambios

- **2026-11-08 (v0.38, rama `chore/renombre-atalaya`):** revisión del nombre Atalaya.
  - La UI ya decía Atalaya en todas partes (`appName`, título, `strings.xml`, introducción, Ajustes y textos
    compartidos); no quedaban «Willay» ni «FIREMAP» visibles.
  - Los paquetes pasan a `atalaya` (app, antes `mobile`) y `atalaya-backend` (antes `willay-backend`).
  - Se quedan con el nombre anterior la URL de la API (`willay-api.onrender.com`: Render no cambia el subdominio
    al renombrar el servicio), el `appId` `co.willay.app`, el paquete `willay_ml`, el User-Agent `WillayBot` del
    scraping y la clave interna `willay.mapIntroPlayed` de la entrada del mapa (no se ven en la app).
  - El repositorio pasa a https://github.com/Gabrl0103/ATALAYA.

- **2026-11-08 (v0.37, rama `fix/quitar-textos`):** se quitan textos de la app por pedido del profesor, en español e
  inglés.
  - «Cómo funciona» pierde «Qué no es Atalaya», «Límites conocidos» y «Métricas del modelo»; Acerca de pierde el
    resumen de métricas y su pista pasa a «Datos, modelo y niveles de riesgo». Se borran el componente de
    métricas, `model-metrics.ts`, la copia `model-metrics-1.0.0.json` (con su prueba en el backend) y sus claves.
  - Salen las frases de «no es una predicción exacta» de Inicio, Acerca de, la hoja del mapa, el texto de
    compartir, la nota del pronóstico y la introducción (esas dos conservan el resto del texto).
  - Salen los avisos de la hoja de zona («…no confirma la ocurrencia de un incendio») y de Cerca de mí y el
    historial de focos («…no incendios confirmados»).
  - Se quedan el aviso de «¿Ves fuego? Avisa», las atribuciones y licencias, y estos documentos (los límites y
    las métricas siguen en las secciones 7 y 11 y en `docs/ML.md`).
  - Verificado en el navegador a 390 × 844, en español e inglés: Inicio, mapa, hoja de zona, historial de
    focos, introducción, Cómo funciona y Ajustes, sin huecos ni títulos vacíos.

- **2026-11-07 (v0.36, rama `feat/emergency-help`):** ayuda ante incendios.
  - Tarjeta «¿Ves fuego? Avisa» (`emergency-help`) en la hoja de zona y en Ajustes: llamadas por `tel:` a 123,
    119, 132 y 144 desde una constante editable con lugar para líneas locales, guía «Qué decir al llamar»,
    «Compartir mi ubicación» y el aviso de que Atalaya no reporta a nadie.
  - La ubicación se pide solo al tocar «Compartir mi ubicación» (token `LOCATE_USER`, con `getUserLocation`) y
    se envía con el compartir que ya existía; sin datos personales ni servidor. El texto (`emergency-text.ts`)
    tiene pruebas con y sin ubicación.
  - «Prevención» (`prevention-tips`) en la hoja de zona: dos consejos por nivel, con el badge del nivel. Va en
    un componente propio para que el CSS de la hoja siga dentro de su presupuesto de 4 kB.
  - En Android, el Bridge de Capacitor abre los `tel:` con `Intent.ACTION_VIEW` (el marcador, sin el permiso
    `CALL_PHONE`). Sin plugins nuevos; no cambian la URL de la API ni el `appId`.
  - Verificado en el navegador a 390 × 844: hoja de zona sin secciones encimadas y Ajustes con los nombres de
    las líneas completos (en dos renglones si hace falta).

- **2026-11-07 (v0.35, rama `chore/cierre-docs`):** limpieza y documentación de cierre.
  - Dejan de versionarse los prompts del rediseño (`docs/design/FASE*_CLAUDE_CODE.md`, `PROMPT_REDISEÑO_ATALAYA`);
    siguen en disco. `.gitignore` ignora `.claude/skills/` y un prompt de trabajo local de `mobile`.
  - Se quita `ZonesStore.reportError()`, sin llamadas ni pruebas, y un comentario que hablaba de Leaflet.
  - El log del servidor, el esquema SQL y los títulos de los documentos dicen Atalaya.
  - El aviso de la hoja de zona ya no dice «Datos simulados para fines académicos» (los datos de producción son
    reales): «Estimación con datos abiertos de satélite, clima e incendios reportados», en español e inglés.
  - README reescrito (funciones, stack, arquitectura, fuentes y licencias, cómo correr, variables, APK y
    pruebas) y este documento puesto al día con lo implementado, las decisiones y los límites conocidos.
- **2026-11-03 (v0.34, rama `feat/compare-replay-nearby`):** comparar municipios, historial de focos y
  «Cerca de mí».
  - Backend: `GET /api/hotspots/history` lee `hotspot_detection` (35 días), agrupa por día local de Colombia y
    quita duplicados entre satélites como el mapa; valida el rango (400) y guarda cada rango 10 min. Con los
    datos locales del 3 nov: 279 focos en 35 días, 2,5 KB comprimido. Un mes 13 lanzaba `RangeError` (500):
    corregido con su test.
  - Comparar: 2 o 3 municipios lado a lado en `/compare`, con el de mayor riesgo resaltado por fila y «—»
    donde falta el dato. Solo usa endpoints que ya existían (lista de zonas y pronóstico por zona).
  - Historial de focos: barra con deslizador, play/pausa y 1x/2x; los focos recientes se ocultan solo cuando
    llega un día, así que con error el mapa no queda vacío.
  - Cerca de mí: «Mi ubicación» muestra la tarjeta en lugar de abrir la hoja (cambio de comportamiento
    aprobado); municipio por punto en polígono sobre los límites del DANE, foco de 5 días más cercano a 100 km
    con rumbo de 8 puntos. Nada sale del teléfono.
  - Sin plugins nuevos. La hoja de zona deja 6 px entre sus botones para que el nuevo «Comparar» quepa a 390 px.
- **2026-11-03 (v0.33, rama `feat/how-it-works-alerts`):** «Cómo funciona», métricas del modelo y alertas
  locales.
  - «Cómo funciona» (`/how-it-works`, desde Inicio y Acerca de): flujo de los datos, cortes de los niveles,
    lo que Atalaya no es y sus límites. Métricas reales del modelo v1.0.0 en un archivo versionado de la app
    (copiado de `risk-model-1.0.0.json` y `docs/ML.md`, con un test del backend que lo mantiene igual):
    ROC-AUC 0,842, PR-AUC 0,496 y Brier 0,100 con Open-Meteo ajustado (POWER: 0,853 / 0,512 / 0,100), tasa
    base 15,6 %, y los seis factores de mayor coeficiente estandarizado. Acerca de resume la versión,
    ROC-AUC y PR-AUC.
  - Alertas locales con `@capacitor/local-notifications` 8.3.1, sin servidor ni push: se revisan al llegar
    la lista de zonas (al abrir la app o al volver tras 10 min), solo de favoritos, una por subida de nivel
    al umbral (Alto o Extremo), con el pronóstico solo si respondió el modelo; tocar una abre el mapa. Con la
    app cerrada no llegan, y Ajustes lo dice. Se descartó `@capacitor/background-runner` (mínimo 15 min sin
    hora fija, Doze y ahorro de batería, lógica duplicada en otro motor).
  - Permiso: `POST_NOTIFICATIONS` declarado y pedido solo al activar, tras explicarlo; si se niega, el
    interruptor vuelve a apagado con cómo activarlo en el teléfono. Se quita `SCHEDULE_EXACT_ALARM` (lo
    agrega el plugin): las alertas salen al instante con `isExactNotification: false`, que además evita que
    el plugin abra la pantalla de alarmas. Icono monocromo `ic_stat_atalaya`.
  - En el navegador, `@capacitor/core` creaba dos instancias del plugin web si dos llamadas llegaban a la vez
    al arrancar, y el oyente del toque quedaba en la descartada: ahora se registra primero y las demás
    llamadas lo esperan.
  - El aviso del bundle inicial sube de 650 a 700 kB (663 kB, ~162 kB comprimido): los diccionarios es/en
    crecen y el servicio de alertas arranca con la app.
- **2026-11-03 (v0.32, rama `fix/forecast-note-animations`):** la nota del pronóstico ya no tapa las filas y
  animaciones en los apartados nuevos.
  - Causa: desde la v0.31 el molde y la respuesta del pronóstico comparten la celda 1/1 de `.forecast-body`,
    pero con datos del modelo las filas y la nota eran dos hijos, así que la nota caía en la misma celda y se
    dibujaba encima de la fila de 24 h (medido a 390 × 844: empezaba 14 px bajo el tope de las filas). Ahora
    van juntas en `.forecast-model`. Verificado cargando, con datos, respaldo y error, en español e inglés, a
    390 y 320 px: la nota queda debajo y el bloque mide lo mismo que el molde (265,75 px a 390).
  - Pantallas angostas (bajo 360 px): el badge, el favorito y compartir se salían junto al anillo, «12 km/h»
    pisaba la tarjeta vecina de «Clima ahora» y «English» se salía de su tarjeta en Ajustes. La fila de
    acciones baja de línea, el clima va de a dos, el nombre de la zona baja a 30 px y los botones del idioma
    se angostan.
  - Animaciones con `theme/animations.css` (solo `transform` y `opacity`): hoja de zona (clima, factores,
    filas y barras del pronóstico, corazón y compartir), Inicio (entrada y salida de «Mis municipios» con
    `animate.leave`), Ajustes (filas y píldora deslizante) y esqueletos con brillo en vez de latido, sin
    cambiar su tamaño. El molde oculto del pronóstico ya no anima.
  - Movimiento reducido (teléfono o Ajustes) anula también los retrasos: antes las entradas escalonadas
    quedaban invisibles hasta su turno (hasta 0,8 s).
  - No había tarjeta de ayuda ante incendios en `main`, así que no se animó.
- **2026-10-24 (v0.31, rama `fix/sheet-weather`):** «Clima ahora» al instante y la hoja de zona sin saltos.
  - Antes: el clima solo venía en `GET /api/zones/:id`, que se pedía al tocar (la hoja no esperaba) y
    respondía a los ~0,5 s en local, ~0,4 s en Render despierto y 21,9 s con Render dormido. Al llegar el
    detalle y el pronóstico, el contenido bajaba: «Ver historial» pasaba de 762 a 800 y a 878 px (clima
    +4 px, focos +34 px, pronóstico +79 px porque su esqueleto no reservaba la nota).
  - `GET /api/zones` trae `weather` (opcional, con prueba del endpoint: igual al del detalle). La hoja lo
    muestra en cuanto abre (43 ms medidos) en las unidades e idioma de Ajustes.
  - Respaldo para un backend anterior: detalle e historial se piden al tocar, con caché por zona de 10 min y
    cancelación al tocar otro municipio o cerrar la hoja (`firesStatus` nuevo); «Borrar caché de datos» los
    olvida también.
  - Esqueletos con la forma del dato: las cuatro tarjetas de clima con sus etiquetas, las tarjetas de focos e
    incendios por año con sus líneas, y el pronóstico reserva siempre la altura del completo (tres filas y la
    nota), también si responde con respaldo o error. El pulso se apaga con menos movimiento.
  - Verificado en 390 × 844, en español e inglés, con la lista nueva y simulando la vieja: «Ver historial»
    queda en 878 px de principio a fin.
- **2026-10-24 (v0.30, rama `feat/settings-i18n`):** pantalla de Ajustes y la app en inglés.
  - Idioma: servicio `I18n` con signals y diccionarios `i18n/es.json` / `en.json` en el bundle (sin CDN ni
    internet), pipe `t` con parámetros y plurales (`Intl.PluralRules`, más `.zero`), `lang` del documento al
    día. «Automático» usa `navigator.languages[0]` si es es/en; si no, español. Los ajustes se leen con
    `provideAppInitializer` antes del primer render (sin parpadeo). Fechas, números, porcentajes y horas con
    `Intl` (`es-CO` / `en-US`); los niveles pasan a Low/Medium/High/Extreme y los rangos no cambian. Una
    prueba compara las claves y los `{parámetros}` de los dos JSON.
  - Sin textos del backend: el motivo del respaldo del pronóstico ya era un código; un código desconocido o
    ausente muestra «el modelo no está disponible». Los errores HTTP pasan a ser códigos (`ApiError.code`) que
    cada pantalla nombra en su idioma, igual que los mensajes de ubicación.
  - Mapa: marcadores y créditos se repintan al cambiar de idioma; el crédito del DANE pasa del origen de datos
    al control de atribución («Límites» / «Boundaries»). La cita literal del DANE queda en español en ambos.
  - Ajustes (`/settings`, engranaje de 44 px en Inicio): idioma, unidades (°C/°F, km/h/mph), movimiento
    (Automático/Reducido: clase `reduce-motion` en `<html>` y vuelos de cámara sin animación), vibración
    (servicio `Haptic`), datos (borrar favoritos con confirmación en la fila; borrar la caché de pronósticos y
    límites, que se vuelven a pedir), ayuda (ver la introducción otra vez) y acerca de.
  - Hoja de zona: fila «Clima ahora» (temperatura, humedad, viento y días sin lluvia de `GET /zones/:id`) en
    las unidades elegidas; un valor ausente se omite.
  - Acerca de, atribuciones verificadas en la fuente (2026-10-24): NASA FIRMS (cita de su FAQ), Open-Meteo
    («Weather data by Open-Meteo.com», CC BY 4.0), ERA5/Copernicus (aviso de las cláusulas 5.1.2 y 5.1.3 de
    la licencia de Copernicus), NASA POWER («POWER's Reference»), Gobernación de Nariño (boletines; sin
    licencia abierta declarada), OpenStreetMap (ODbL), UNGRD y DANE (sin cambios).
  - Versión 0.30.0 en `package.json` y en el APK (`versionName "0.30.0"`, `versionCode 30`). TypeScript en
    modo `strict` (no daba errores).
  - Verificado en 390 × 844: todas las pantallas en inglés sin textos cortados ni fuera del marco.
- **2026-10-24 (v0.29, rama `feat/favorites-share`):** municipios favoritos y compartir el riesgo de un municipio.
  - Favoritos: corazón de 44 px en la hoja de zona (`aria-pressed`, «Agregar a mis municipios» / «Quitar de mis
    municipios») con vibración ligera. Ids guardados con `@capacitor/preferences` (`favorites.zoneIds`), solo en
    el teléfono; sin almacenamiento siguen en memoria mientras la app está abierta. Los que ya no existen se
    ignoran.
  - Inicio: «Mis municipios» arriba del carrusel, con las mismas tarjetas (badge, nombre, puntaje) en el orden en
    que se agregaron; tocar una abre la zona en el mapa. Sin favoritos no hay sección.
  - Buscador del mapa: sin texto sugiere «Mis municipios»; al escribir, los favoritos que coinciden van primero.
    El corazón de Inicio y del buscador solo indica: se quita desde la hoja.
  - Compartir: botón de 44 px («Compartir»). Texto con nombre, nivel y puntaje, filas de 24/48/72 h solo si
    respondió el modelo, «Actualizado: 24 oct. 2026, 5:07 p. m.» (la hora en que la app cargó las zonas, la misma
    del mapa: la API no trae la hora de ingesta), «Estimación de riesgo, no predicción exacta.» y «Atalaya · Riesgo
    de incendios en Nariño». Android: `@capacitor/share` 8.0.3 (`cap sync android`). Navegador: `navigator.share`;
    si no existe o lo rechaza, portapapeles y aviso «Copiado» (2 s). Cancelar el menú no muestra nada.
  - `percentLabel` pasa de la sección del pronóstico a `domain/util/format.ts`, junto a `formatDateTime`.
- **2026-10-24 (v0.28, rama `fix/map-flow`):** flujo de la hoja de zona y nombres desde el encuadre inicial.
  - Cerrar la hoja de un municipio («‹ Nariño», el fondo o arrastrarla abajo) ya no vuela de vuelta a Nariño:
    el mapa se queda en la misma posición y zoom, y el municipio pierde el resaltado. Solo «Acercar a Nariño»
    vuelve al departamento.
  - Antes la hoja tardaba ~0,5 s en local (más en Render) porque esperaba `GET /api/zones/:id`; ni el vuelo ni
    el pronóstico la frenaban. Ahora se abre al tocar (32 ms medidos) con el resumen del mapa. `GET /api/zones`
    trae `factors` (opcional: con un backend anterior los factores son esqueleto hasta que llega el detalle) y
    los focos cercanos esperan como esqueleto.
  - «Pronóstico 72 h»: se pide primero al tocar, muestra las tres filas como esqueleto, se guarda por zona 10
    minutos (solo respuestas del modelo; el respaldo se vuelve a pedir) y una petición en curso se cancela al
    tocar otro municipio o cerrar la hoja. Siguen el error con «Reintentar» y el aviso de respaldo.
  - Sin grupos: en el globo (zoom < 6) solo los polígonos; sobre Nariño un solo elemento por municipio en todo
    zoom (etiqueta o punto sin número). Por debajo de zoom 8,5 la etiqueta es solo el nombre, 10 px, `#f9f9f4`
    con halo `#09232a` (15,5:1); desde 8,5 nombre, puntaje y nivel. Prioridad: seleccionado, Pasto y puntaje;
    1 px de separación entre etiquetas. La pastilla de las etiquetas completas pasa de 0,68 a 0,82 de opacidad
    para que el nivel en rojo llegue a 4,7:1 aun sobre el relleno amarillo.
  - Verificado en 390 × 844: encuadre inicial (zoom 6,9) con 21 nombres, Pasto incluido, 0 cortados y 0
    encimados; 22–31 nombres entre zoom 7,3 y 8,3; desde 8,5 etiquetas completas; ubicar las etiquetas cuesta
    0,4 ms al detenerse la cámara. Los fps no se pudieron medir en la ventana de automatización (Chrome limita
    `requestAnimationFrame` a 1 Hz); por cuadro hay menos trabajo que antes: los mismos 64 marcadores y ya no
    se consulta la fuente de puntos en cada render.
- **2026-10-24 (v0.27, rama `feat/map-globe`):** un solo elemento por municipio en el zoom de nombres.
  - Antes: desde zoom 8,5, junto a las etiquetas seguían saliendo círculos con número que parecían grupos (no lo
    eran: eran municipios cuya etiqueta no cabía, dibujados como el círculo del zoom bajo) y podían quedar
    encima de otra etiqueta («36» sobre Ancuya); el que tenía etiqueta mostraba además su punto al lado; y una
    etiqueta podía salir cortada por un borde, la cabecera o la hoja.
  - Desde zoom 8,5 el municipio es su etiqueta, centrada en la cabecera, sin punto aparte. Si no cabe, es un punto
    de 8 px sin número, y si una etiqueta lo tapa no se dibuja.
  - Solo se muestran etiquetas enteras dentro del mapa libre (debajo de la cabecera, dentro de los bordes y
    encima de la hoja general o la de zona); al subir o bajar una hoja se vuelven a ubicar.
  - Igual que antes: prioridad del seleccionado y luego por puntaje, y el mismo contraste.
  - Verificado en 390 × 844: el encuadre inicial (zoom 6,9) no muestra etiquetas; a zoom 8,5–11,5, con la hoja
    baja, subida o la de zona abierta, ninguna sale cortada ni encimada.
- **2026-10-24 (v0.26, rama `feat/map-globe`):** el mapa más legible y con un flujo más natural, tras probarlo en el navegador.
  - Antes: sobre Nariño los grupos («40», «14») tapaban los municipios (se agrupaba hasta zoom 8 y el encuadre
    queda en ~6,9); los polígonos casi no se distinguían (relleno 0,28, contorno de 0,8 px) y no había nombres
    hasta zoom 10; el globo casi no se veía; la entrada se repetía en cada recarga y la hoja ocupaba mucho.
  - Grupos solo hasta zoom 5, por debajo del mínimo sobre Nariño (6): ahí cada municipio tiene su marcador.
  - Polígonos: relleno 0,42 (seleccionado 0,62), contorno claro de 1 px, borde del departamento de 2,5 px (los
    bordes que tiene un solo municipio; mapshaper conserva los compartidos vértice a vértice) y el seleccionado
    con contorno blanco de 3 px y resplandor.
  - Etiquetas con nombre y puntaje en el color del nivel desde zoom 8,5; al detenerse la cámara se ubican de
    mayor a menor prioridad (seleccionado, luego puntaje) y las que chocan quedan como punto con el puntaje.
  - Globo: tiles más claros y con algo más de color hasta zoom 3, que pasan al estilo oscuro en zoom 5.
  - Entrada una vez por sesión (`sessionStorage`, con la marca de la página de respaldo); un toque salta el giro
    o el vuelo; `prefers-reduced-motion` abre directo en Nariño.
  - Encuadre a 35° (antes 50°), con menos margen a los lados y el inferior según la altura de la hoja.
  - Hoja baja por defecto (247 px en 390 × 844; con todo a la vista, ~350 px): título, niveles y «Acercar a Nariño»; arrastrando
    o con el asa se sube con los conteos, rangos, clave de focos y nota.
  - Tocar un municipio: vuelo de 0,7 s al zoom 9,5 y su hoja de zona; al cerrarla, vuelta de 0,9 s a Nariño.
- **2026-10-21 (v0.25, rama `feat/map-globe`):** el mapa ajustado a la captura aprobada (`docs/design/4 · Mapa (globo)`).
  - Antes: abriendo directo en `/map`, el giro y el vuelo pasaban debajo de la splash (2,5 s + 0,45 s) y nadie los
    veía; el globo quedaba medio tapado por la hoja, que ocupaba el 52 % de la pantalla; Nariño salía chico.
  - Entrada: el globo entero, con su halo, espera entre el título y la hoja a que se vayan la splash y la
    introducción (`AppCurtain`); gira 3 s a 8°/s y vuela 2,6 s a Nariño con inclinación 50°.
  - Siempre globo: se quita el paso a plano por menos de 30 fps y `MapProjectionFlag`. Sin WebGL sigue sin haber
    mapa (MapLibre lo necesita en las dos proyecciones).
  - Encuadre: Nariño lo más grande posible entre la cabecera y la hoja; «Acercar a Nariño» deja el mismo encuadre
    y plegar o desplegar la hoja lo vuelve a encuadrar si nadie movió el mapa.
  - Créditos de OSM y DANE: letra pequeña abajo a la derecha del mapa, justo encima de la hoja (antes, debajo del título).
  - Hoja: más compacta (42 % de 844 px, plegable con la manija); los 4 niveles en una fila con sus rangos
    (0–24, 25–49, 50–74, 75–100) y la clave del foco de calor.
- **2026-10-21 (v0.24, rama `feat/map-globe`):** fase 4 del rediseño: mapa con globo en MapLibre GL JS 6.13 (reemplaza a Leaflet).
  - Estilo: fondo `#0B0604`, tiles raster de OSM oscurecidos con pintura del raster (brillo invertido, tono 180°,
    poca saturación) y resplandor naranja tenue en el borde del globo (halo CSS: la atmósfera de MapLibre es azul y
    no deja cambiar el color).
  - Entrada: el globo gira 2 s y vuela 2,6 s a Nariño con inclinación 50°; luego `maxBounds` y zoom mínimo 6. Solo
    la primera vez por sesión; con `prefers-reduced-motion`, en visitas siguientes o en el mapa plano salta directo.
    Llegando desde Inicio con una zona elegida, va a su cabecera sin girar.
  - Capas: polígonos del DANE con `feature-state` (nivel y selección), focos como círculos de la GPU, cabeceras
    como marcadores HTML agrupados con el cluster de MapLibre (radio 44 px, hasta zoom 8; el grupo toma el color del
    peor puntaje y al tocarlo se acerca). Nombres desde zoom 10. Atribuciones de OSM y DANE siempre visibles.
  - Pantalla: título «Mapa»; buscador en capa de vidrio que abre la lupa de la barra inferior; «Mi ubicación» en el
    botón redondo de arriba a la derecha; hoja «Departamento de Nariño» con conteos reales, los 4 niveles, la clave
    de focos, la nota de estimación y «Acercar a Nariño». Se borran `RiskLegend` y `zone-area.ts`.
  - Respaldo: menos de 30 fps en la entrada → `mercator` sin cielo, recordado en Preferences. Sin WebGL no hay mapa
    posible (MapLibre lo necesita en ambas proyecciones): se avisa y la búsqueda y «Mi ubicación» siguen funcionando.
  - Rendimiento (Chrome de escritorio, 390×844, 64 polígonos y hasta 49 marcadores): 1,4–2,0 ms por cuadro de GL y
    3,4 ms moviendo la cámara con los marcadores. El Chrome controlado por la extensión limita los cuadros por
    segundo, así que los fps reales quedan por medir en un Android (`[map] globo: N fps` en la consola).
  - Peso: chunk del mapa 1,10 MB (247 KB con gzip), perezoso; carga inicial 600 KB.
- **2026-10-21 (v0.23, rama `feat/municipal-boundaries`):** límites reales de los 64 municipios, coloreados por riesgo.
  - Fuente: DANE, MGN 2025, capa `MGN_ADM_MPIO_GRAFICO` (zip bajado a mano del Geoportal, sha256 `a3c01393…bc141f`).
    Se descartó el IGAC (Resolución 616 de 2020, sin descarga directa de una capa municipal).
  - `npm run geo:boundaries` (mapshaper 0.7.79): filtra el departamento 52, simplifica con Visvalingam y
    `keep-shapes`, deja código y nombre, redondea a 0,0001° y verifica 64 de 64 códigos. Comparación
    (KB sin/con gzip): 2,7 % → 149/42, 3 % → 163/46, 5 % → 261/75, 8 % → 408/115, 12 % → 600/165. Se eligió
    2,7 % (~8.100 vértices): la costa pacífica y la bahía de Tumaco se reconocen; solo se pierden islotes de
    unos cientos de metros. 5 %, 8 % y 12 % pasaban la meta de ~150 KB.
  - Archivo estático versionado, no PostGIS: funciona sin base de datos y `zone.boundary` sigue vacía.
  - `GET /api/zones/boundaries`: GeoJSON unido por DIVIPOLA (nunca por nombre), `Cache-Control` de un día,
    ETag y gzip para toda la API (`compression`).
  - App: capa de polígonos debajo de los marcadores con los colores `--risk-*` al 28 %, contorno fino y la
    zona elegida resaltada; tocar un polígono abre la hoja de zona. Si los límites fallan, el mapa sigue con
    los marcadores y avisa en español (Reintentar / Cerrar). Cita del DANE en Historial y en el mapa.
  - Rendimiento (Chrome de escritorio, 64 polígonos SVG): ninguna tarea de más de 50 ms al hacer zoom y
    desplazar; falta medir en un Android real.
- **2026-10-18 (v0.22, rama `feat/ml-forecast`):** pronóstico de 72 h con la regresión logística v1.0.0 (fase 4 del ML).
  - Se fusiona `feat/ml` (código de `ml/`, `docs/ML.md`).
  - `ml/willay_ml/export_backend.py` exporta el modelo a `backend/src/infrastructure/ml/risk-model-1.0.0.json`
    (coeficientes, normalización, calibración Platt, propensión por zona, fuentes estáticas) y casos de
    sklearn para las pruebas. `predictRisk` (TypeScript) coincide con sklearn con diferencia < 1e-9.
  - Clima: ajuste lineal Open-Meteo → NASA POWER por variable, ajustado con 2024. En prueba (2025–2026):
    ROC-AUC 0,842, PR-AUC 0,496, Brier 0,100 (con POWER: 0,853 / 0,512 / 0,100; sin ajuste: 0,827 / 0,455 /
    0,134, peor que la tasa base). Reentrenar con Open-Meteo queda para la v1.1.
  - Tablas nuevas: `weather_daily` (35 días, Open-Meteo histórico), `hotspot_detection` (detecciones crudas,
    una por satélite) y `firms_complete_day`. Jobs diarios `weather-daily` y `hotspots-history`; carga
    inicial con `npm run db:backfill`. La tabla `hotspot` y el puntaje actual no cambian.
  - `GET /api/zones/:id/forecast`: filas de 24, 48 y 72 h (el modelo al final de hoy, mañana y pasado
    mañana, solo con focos observados). Respaldo con el puntaje actual y el motivo si Open-Meteo falla,
    faltan días de clima o de FIRMS, o falla el modelo.
  - App: sección «Pronóstico 72 h» en la hoja de zona (nivel, barra y porcentaje; aviso en español con
    respaldo o error; «Reintentar» solo cuando la petición falla).
  - Se documenta un error de unidades del entrenamiento: `EVPTRNS` de POWER está en MJ/m²/día, no en mm, y
    `water_balance_30d_mm` resta mm menos MJ. El backend lo reproduce igual; se corrige en la v1.1.
- **2026-10-04 (v0.21, rama `fix/ui-sheet-history`):** la ingesta de FIRMS guarda fuente, confianza y FRP de cada detección y quita duplicados entre satélites (≤ 1 km y ≤ 3 h; queda la de mayor confianza). Corrida del 2026-10-04: 13 detecciones → 12 focos guardados (SNPP 18:53 y NOAA-21 18:15 del 30-sep, a ~10 m, quedan en uno: el de NOAA-21, FRP 14,66).
- **2026-10-04 (v0.20, rama `fix/ui-sheet-history`):** focos FIRMS: ventana de 2 a **5 días** y se agrega **VIIRS NOAA-21 NRT**. El factor de focos pesa cada detección por su antigüedad (1 hasta 2 días, 0 a los 5) para que siga midiendo el riesgo de 24–72 h; umbral 3 y pesos 0,5/0,3/0,2 sin cambio. `GET /api/zones/:id` devuelve `hotspots` (conteo a 25 km y última detección) y la hoja de detalle dice hace cuánto fue. Ojo: el modo en memoria usa focos de prueba del 27–29 de septiembre, que ahora pesan 0.
- **2026-10-04 (v0.19, rama `fix/ui-sheet-history`):** tope del factor de historial de 1 a **2,8 incendios por año** (p90 de los 64 municipios con UNGRD 2019–2025 + noticias), fijo y documentado en `RiskScoringService.ts`; pesos sin cambio. Zonas en 100: 36 → 8; mediana del factor: 100 → 37. Se documenta que el historial mide incendios reportados y que los municipios grandes reportan más.
- **2026-10-04 (v0.18, rama `fix/ui-sheet-history`):** UNGRD 2023–2025: se leen también `rgre-6ak4` y `2343-nuqp` (evento `INCENDIO FORESTAL`), una fuente por dataset. Feed de la Gobernación: 8 páginas y títulos con "incendios" en plural si nombran un municipio (sin hectáreas). `npm run ingest`: 701 incendios (2019: 91, 2020: 37, 2021: 11, 2022: 38, 2023: 161, 2024: 263, 2025: 94, 2026: 6). Corregida en Neon la nota de Ancuya (2026-08-28) que guardó 1.485 ha del total departamental: queda sin dato. Atribución UNGRD/datos.gov.co con licencias en Historial. El historial del modelo satura en 36 de 64 zonas: se documenta, el modelo no cambia. Diario del Sur, HSB Noticias y CorpoNariño descartados.
- **2026-10-04 (v0.17, rama `fix/ui-sheet-history`):** app: la hoja de detalle se arrastra entre media (~45 %) y expandida (~85 %), se cierra al deslizarla hasta abajo, hace scroll expandida y deja libre el botón "Ver historial" (relleno con `safe-area`); probado en emulador Android (Pixel 7). Historial: rango de años y nota de fuentes/años sin datos calculados de los registros, "Sin dato" en vez de "0,0 ha", orden por fecha descendente. Mapa: con zoom < 10 solo punto de color con puntaje; nombres desde zoom 10 o en el municipio seleccionado. Pruebas unitarias en la app con Vitest (`npm test` en `mobile/`). Auditoría de cobertura de noticias (sección 6): el feed de la Gobernación solo tiene 55 noticias desde 2024-01; los datos de 2023–2025 están en datasets nuevos de la UNGRD (propuesta, sin aplicar). Nota: v0.16 está en la rama `feat/ml`.
- **2026-10-03 (v0.16):** modelo de machine learning, fases 1–3, en la carpeta nueva `ml/` (Python, rama
  `feat/ml`).
  - Descarga reanudable del historial de NASA FIRMS (tramos de 5 días, presupuesto de transacciones).
  - Clima de NASA POWER: Open-Meteo se detuvo por su cuota de 10 000 llamadas/día y queda en caché sin
    usarse.
  - Dataset diario por zona con etiqueta a 72 h (radios de 10/25/50 km), 25 variables con prueba de fuga
    de información, y entrenamiento con división temporal.
  - Resultado: la regresión logística supera al modelo de pesos en prueba (2025–2026), pero no al baseline
    simple en el ranking diario de municipios.
  - Documentado en `docs/ML.md`. El modelo de pesos (0,5/0,3/0,2) no cambia y la app sigue usándolo.

- **2026-10-01 (v0.15):** factor de historial: incendios por año de la zona desde el 2019-01-01 (1 por año = 100) en vez del conteo de los últimos 730 días / 5. Pesos sin cambio (0,5 / 0,3 / 0,2). Con los datos de hoy: 46 zonas con historial > 0 (antes 4), puntajes 0–20, todas en nivel Bajo (clima húmedo y sin focos porque falta `MAP_KEY`). Se documentan las limitaciones del historial (sección 7).
- **2026-10-01 (v0.14):** `npm run db:seed` solo carga las 64 zonas; el clima, los incendios y los focos de `seedData.ts` quedan solo para el modo en memoria y las pruebas. Borrados en Neon todos los datos de prueba que había cargado el seed: 8 noticias, 7 filas `ungrd` sin enlace y 7 focos de calor.
- **2026-10-01 (v0.13):** noticias del mismo incendio: la ingesta agrupa, antes de insertar, las noticias de una zona separadas por 3 días o menos (en cadena) con las ya guardadas; queda la más antigua (fecha y enlace), el mayor número de hectáreas y los demás enlaces en `fire_event.related_urls`. Limpieza única en Neon con `npm run db:merge-news` (idempotente): 5 duplicados del cerro Aminda fusionados. Filtro de incendios forestales: palabras completas ("esquema" ya no cuenta como "quema") y se descartan los que mencionan vivienda/casa/local/bodega/establecimiento sin forestal/bosque/monte/páramo/cobertura vegetal/quema. Olaya Herrera (La Isla, 2026-09-29) era un incendio urbano de 15 viviendas: borrado.
- **2026-10-01 (v0.12):** la tabla `zone` tiene los 64 municipios de Nariño (DIVIPOLA del DANE en datos.gov.co `gdxc-w37w`: nombre, código y coordenadas de la cabecera) con `npm run db:zones` (upsert); se conservan los 12 ids anteriores. Columna `zone.aliases` para nombres alternos ("Tumaco", "Magüí Payán", "El Contadero"). El clima de los 64 llega en una sola petición a Open-Meteo. Los scrapers reconocen los 64 nombres con y sin tildes ("Nariño" suelto se toma como el departamento). `GET /api/zones` omite las zonas que aún no tienen clima en vez de fallar.
- **2026-10-01 (v0.11):** scraping de noticias: se reemplaza Diario del Sur (0 resultados) por el feed RSS del buscador de la Gobernación de Nariño. Reglas más estrictas para el municipio (evitan atribuir boletines departamentales a una zona), conteo de noticias leídas / incendios / en zonas / guardados en el log de `npm run ingest`, y duplicados por `source_url` evitados en la base (`fire_event_news_url_key`) y en memoria.
- **2026-09-30 (v0.10):** el mapa usa tiles de OpenStreetMap con filtro CSS oscuro (CARTO pasó a exigir API key). Backend: repositorios PostgreSQL/PostGIS para Neon, `npm run db:schema` y `npm run db:seed`, `DATABASE_URL` en `.env` y fallback a datos en memoria. Ingesta programada con node-cron: clima de Open-Meteo (cada hora), focos de NASA FIRMS (cada 3 h, si hay `MAP_KEY`) y scraping diario de incendios (UNGRD + Diario del Sur) respetando `robots.txt` y con límite de peticiones. El modelo de riesgo (pesos 0.5/0.3/0.2) no cambia.

- **2026-09-30 (v0.9):** el proyecto cambia de nombre: FIREMAP pasa a **Willay** (quechua/kichwa: avisar, anunciar). Se renombran la app, Android (`co.willay.app`), paquetes y documentos.
- **2026-09-30 (v0.8):** primera versión del proyecto `willay/`: backend Express + TypeScript con Clean Architecture y datos de prueba (API, riesgo ponderado y pruebas), y app Ionic + Angular con las 3 pantallas del prototipo (Mapa con Leaflet, Detalle y Historial). Falta: Neon, scraping, Open-Meteo/FIRMS, GeoJSON de Nariño y despliegue.
- **2026-09-30 (v0.7):** nuevo stack: Ionic + Angular + Capacitor, Express + TypeScript, Neon (PostGIS), Leaflet, scraping en Node. Flutter + FastAPI descartados. Se reescriben arquitectura, estructura de carpetas y fases.
- **2026-09-30 (v0.6):** se reemplazan los valores estimados por los tokens reales del CSS de Lovable (colores en hex, fuentes Archivo e IBM Plex Sans, formas y tamaños).
- **2026-09-30 (v0.5):** el estilo visual pasa a ser el prototipo de Lovable (mapa oscuro, tarjetas claras, acento rojo ladrillo). Se documentan las 3 pantallas. 
- **2026-09-30 (v0.4):** estilo visual oscuro tipo dashboard. MVP: mapa, detalle, focos de calor, historial. Extras: buscador y mi ubicación. "Cómo se calcula" queda fuera del MVP.
- **2026-09-30 (v0.3):** el tipo de fuente no importa mientras haya scraping. Se agregan fuentes candidatas (noticias locales, UNGRD en datos.gov.co, IDEAM).
- **2026-09-29 (v0.2):** se confirma Flutter + FastAPI (el profesor no impuso stack). Clean Architecture completa como requisito. Solo móvil. Scraping obligatorio; predicción = puntaje de riesgo.
- **2026-09-29 (v0.1):** borrador inicial (propuesto con Java/React; descartado).
