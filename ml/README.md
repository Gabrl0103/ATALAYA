# Atalaya ML

Modelo de machine learning que estima la **probabilidad de actividad de fuego** (focos de calor) por
municipio de Nariño en las próximas 72 h. Se entrena con el historial de focos de NASA FIRMS y el clima
histórico de NASA POWER. Es un **indicador de riesgo**, no una predicción exacta: un foco de calor no es
un incendio forestal confirmado (incluye quemas agrícolas).

Estado: **fases 1–3 (datos, variables, entrenamiento y evaluación)**. Resultados y limitaciones en
[`docs/ML.md`](../docs/ML.md). La integración en el backend (fase 4) aún no está hecha: el modelo de pesos
del backend (0,5/0,3/0,2) sigue siendo el que usa la app.

## Instalación (Windows, Python 3.12+)

```
cd ml
py -3.13 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

Variables de entorno (nunca en git). Los scripts leen el entorno y, si existen, `ml/.env` y `backend/.env`:

| Variable | Para qué |
|---|---|
| `MAP_KEY` | NASA FIRMS (clave gratis: https://firms.modaps.eosdis.nasa.gov/api/map_key/). Obligatoria para descargar focos. |
| `DATABASE_URL` | Opcional: lee las zonas de la tabla `zone` (Neon). Sin ella se leen de `narinoMunicipalities.ts`. |

## Cómo reproducir todo

Todo se guarda en `ml/data/` (ignorado por git). Los comandos se corren desde `ml/`, en este orden:

```
.venv\Scripts\python -m willay_ml.zones        # 64 zonas -> data/zones.csv
.venv\Scripts\python -m willay_ml.firms        # focos FIRMS -> data/raw/firms/ (~1 h la primera vez)
.venv\Scripts\python -m willay_ml.power        # clima NASA POWER -> data/raw/nasa_power/ (~2 min)
.venv\Scripts\python -m willay_ml.fire_events  # incendios del scraping (tabla fire_event) -> data/fire_events.csv
.venv\Scripts\python -m willay_ml.dataset      # etiquetas -> data/processed/dataset_daily.parquet
.venv\Scripts\python -m willay_ml.summary      # resumen de datos -> data/processed/summary.md
.venv\Scripts\python -m willay_ml.features     # fase 2 -> data/processed/features_daily.parquet
.venv\Scripts\python -m willay_ml.train        # fase 3 -> models/, docs/ml/calibration.png
.venv\Scripts\python -m pytest -q              # pruebas (incluye la de fuga de información)
```

## Fase 1: datos

Las descargas se pueden detener y volver a correr: lo ya descargado queda en caché y no se pide otra vez.

### Focos de calor (NASA FIRMS)

- API de área (`/api/area/csv`), bounding box de Nariño `-79.1,0.35,-76.8,2.7` (el mismo del backend).
- **VIIRS 375 m, SNPP y NOAA-20** (los satélites que ingiere el backend) desde el 2014-12-02: 2015–2018
  sirve para la propensión de cada zona y 2019 en adelante para el dataset. Archivo estándar (`*_SP`) hasta su último día y luego
  tiempo casi real (`*_NRT`). NOAA-20 existe desde el 2018-04-01, así que antes solo hay SNPP.
- **MODIS 1 km** se descarga solo para compararlo con VIIRS (`summary`).
- Límites: la API responde como máximo 5 días por petición y cada petición gasta ~10 transacciones del
  `MAP_KEY` (5000 cada 10 minutos). El script hace 3 peticiones en paralelo, revisa el consumo
  (`mapkey_status`) cada 20 peticiones y espera si pasa de 4000, reintenta con espera creciente y guarda
  cada tramo de 5 días como un CSV.
- Se descartan para las etiquetas los focos que FIRMS marca como volcán, otra fuente estática o mar
  (`type` 1/2/3, solo en el archivo). Los focos NRT no traen `type`: se descartan los que caen a 1 km o
  menos de un foco que el archivo marcó como estático (Galeras está a ~10 km de Pasto).
- Fechas: `acq_date`/`acq_time` vienen en UTC; se convierten a fecha local de Colombia (UTC−5).

### Clima (NASA POWER, API diaria por punto)

- `power.larc.nasa.gov/api/temporal/daily/point`, comunidad `AG`, sin llave. Una petición por zona con todo
  el periodo (2018-12-01 a hoy; 30 días antes del 2019-01-01 para las variables de 30 días): 64 peticiones.
- Variables (10 de un máximo de 20 por petición): `PRECTOTCORR` (precipitación corregida), `T2M`,
  `T2M_MAX`, `T2M_MIN`, `RH2M`, `QV2M`, `WS2M`, `WS2M_MAX`, `EVPTRNS` (evapotranspiración), `GWETTOP`
  (humedad del suelo superficial).
- Límites: la documentación no publica una cifra; responde 429 "Too Many Requests" y puede bloquear a quien
  pide la misma ubicación una y otra vez. El script va de a una petición, con 1 s de pausa, reintentos con
  espera creciente y caché por zona (`data/raw/nasa_power/`).
- **Resolución gruesa:** MERRA-2 (0,5° × 0,625°, ~55 × 70 km). Las 64 cabeceras caen en solo **10 celdas**,
  así que muchos municipios vecinos tienen exactamente el mismo clima. Ver limitaciones en `docs/ML.md`.
- Valor de relleno `-999` → vacío. Días en hora solar local (LST).

### Clima (Open-Meteo) — descartado para entrenar

`willay_ml.weather` (Open-Meteo Historical Weather API, ERA5-Land ~11 km) quedó en el código y su caché en
`data/raw/open_meteo/` (se detuvo con 2023–2026 descargados), pero no se usa: el historial completo
necesitaba dos días de cuota gratis. Detalles:

- `archive-api.open-meteo.com/v1/archive`, sin API key, reanálisis ERA5/ERA5-Land (no son estaciones),
  corregido a la altura de cada cabecera municipal, días locales (`America/Bogota`).
- Variables diarias (10): precipitación, temperatura máx./mín./media, viento máx./medio,
  evapotranspiración FAO (ET0), humedad relativa media y mínima, déficit de presión de vapor máx.
- Peticiones en lote: 16 zonas por petición, un año por petición, de lo más reciente a lo más antiguo.
- Límites gratis: 600 llamadas/min, 5000/hora, 10 000/día, y **cada ubicación cuenta como una llamada por
  cada 14 días** (≤ 10 variables). Todo el historial son ~19 700 llamadas, así que la descarga tarda dos
  días UTC. El script guarda cada petición en `data/raw/open_meteo/usage.jsonl` y espera antes de pasar de
  500/min, 4500/hora y 9500 por día UTC (deja margen para la ingesta del backend). Si el servidor responde
  429 espera la ventana correspondiente.
- Usa siempre el mismo `--end` hasta terminar la descarga: el año en curso se guarda con su fecha final y
  otra fecha lo volvería a pedir.

### Dataset y etiqueta

Una fila por zona y día local `d` (desde el 2019-01-01). La predicción se hace al final del día `d`:

- `label_r{R}` = 1 si hay al menos un foco VIIRS a R km o menos de la cabecera municipal en los días
  `d+1`, `d+2` o `d+3`. Los focos del propio día `d` no entran en la etiqueta. R = 25 km (el radio del
  modelo actual); 10 y 50 km para ver la sensibilidad.
- `hotspots_today_r{R}`: focos del día `d`.
- Columnas de clima (NASA POWER) del día `d`.
- Los últimos 3 días no tienen etiqueta (falta el futuro) y no entran. Los días sin tramo FIRMS descargado
  quedan sin etiqueta (no se toman como "sin focos").
- El dataset va desde el 2019-01-01 hasta el último día con clima y etiqueta.

## Fase 2: variables (`willay_ml.features`)

Todas usan solo datos de días `<= d` (la predicción se hace al final del día `d`). La prueba
`tests/test_features.py` reemplaza por números aleatorios todo lo posterior a una fecha y comprueba que
las variables hasta esa fecha no cambian.

| Grupo | Variables |
|---|---|
| Lluvia | `rain_1d/3d/7d/14d/30d_mm`, `dry_days` (días seguidos con < 1 mm) |
| Temperatura | `temperature_mean_c`, `temperature_max_c`, `temperature_range_c`, `temperature_trend_7d_c` (últimos 7 días − 7 anteriores) |
| Humedad y viento | `humidity_mean_pct`, `humidity_7d_pct`, `wind_max_ms`, `wind_7d_ms` |
| Balance de agua | `evapotranspiration_mm`, `water_balance_30d_mm` (lluvia − evapotranspiración, 30 días), `surface_soil_wetness` |
| Focos | `hotspots_zone_1d/7d/30d` (≤ 25 km), `hotspots_ring_7d/30d` (anillo de 25 a 50 km: municipios vecinos) |
| Estacionalidad | `day_of_year_sin`, `day_of_year_cos` |
| Propensión | `zone_hotspot_days_per_year`: días por año con foco a ≤ 25 km en 2015–2018 (antes de todas las filas) |

Los incendios de la UNGRD (`fire_event`) no se usan como variable: cubren solo 2019–2022 (no hay datos
en validación ni prueba) y las noticias empiezan en 2026, así que la variable cambiaría de significado
entre periodos. Sí se usan para recalcular el modelo de pesos actual.

## Fase 3: entrenamiento (`willay_ml.train`)

- División temporal: entrenamiento 2019–2023, validación 2024, prueba 2025-01-01 en adelante.
- Modelos: (a) baseline = regresión logística con `dry_days` + propensión; (b) modelo de pesos actual
  recalculado (`weighted_model.py`, copia de `RiskScoringService.ts`); (c) regresión logística con todas
  las variables; (d) `HistGradientBoostingClassifier` (rejilla pequeña elegida por PR-AUC de validación).
- Desbalance: pesos de clase balanceados. Calibración: ajustada solo con 2024 (Platt para los lineales,
  isotónica para boosting y para el puntaje de pesos).
- Salidas: `models/*.joblib`, `models/metadata.json` (fecha, rango de datos, métricas, versión, variables),
  `data/processed/evaluation.json`, `docs/ml/calibration.png`.
