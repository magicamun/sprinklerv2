# Weather, Hydro, and ETo Subsystem: Current Implementation

This document describes the implementation currently present in the Sprinkler
project. It is an as-is reference for the weather, hydro, ETo, soil-water, and
Sprinkler integration paths. It does not define a target architecture and does
not contain refactoring recommendations.

## 1. System overview

The active collection and calculation flow is:

```text
Configured weather sources (sprinkler/eto.yaml)
  -> EToEngine creates ProviderContext and ProviderManager
  -> ProviderManager dispatches by provider capability
  -> HomeAssistantProvider or OpenMeteoProvider
  -> HydroStore observed/forecast values
  -> HydroStore derived median/current weather values
  -> HydroStore ETo calculation
  -> HydroStore soil-water model
  -> SprinklerCore deficit and runtime decisions
```

`EToEngine` is the runtime orchestrator. At startup and at minute 5 of every
hour it prunes the store, awaits observed and forecast provider dispatch,
calculates ETo for all current/future days, calculates the global soil model,
and projects Home Assistant sensors and chart data. Site latitude, longitude,
and elevation come from `hass.config` and are passed to `HydroStore` through
`configure_site()`.

References:

- `pyscript/etoengine.py`: `load_eto_config()`, `EToEngine.__init__()`,
  `etoengine_collecthourly()`, `etoengine_startup()`
- `sprinkler/eto.yaml`: `defaults`, `eto`, and `sources`
- `pyscript/modules/infra/store/hydrostore.py`: `HydroStore`
- `pyscript/modules/sprinkler/scheduler.py`: `SprinklerCore`

## 2. Provider system

### 2.1 ProviderBase

`ProviderBase` stores the shared context, configured source name, and source
configuration. Its class-level defaults declare both observed and forecast as
unsupported. The base `update_observed()` and `update_forecast()` methods raise
`NotImplementedError`.

Reference: `pyscript/modules/infra/providers/provider_base.py`:
`ProviderBase`.

### 2.2 ProviderManager

`ProviderManager` creates one provider instance per configured source:

- `provider: homeassistant` creates `HomeAssistantProvider`.
- `provider: openmeteo` creates `OpenMeteoProvider`.
- Unknown provider identifiers raise `ValueError`.

Both manager update methods are asynchronous. For each provider they inspect
`supports_observed` or `supports_forecast`, skip unsupported operations, invoke
the update method, and await the result when `inspect.isawaitable()` is true.
The manager contains no source-name-specific handling for `local`, `dwd`, or
`openweather`.

Reference: `pyscript/modules/infra/providers/provider_manager.py`:
`ProviderManager.__init__()`, `update_observed()`, `update_forecast()`.

### 2.3 ProviderContext and HTTP boundary

`ProviderContext` supplies:

- `store`: the shared `HydroStore`;
- `defaults`: global weather defaults from `eto.yaml`;
- `state_get`: Pyscript `state.get`;
- `service_call`: Pyscript `service.call`;
- `http`: an `HttpClient`;
- `logger`: the EToEngine logger.

`HttpClient._http_get_json()` uses blocking `requests.get()` with a ten-second
timeout and `raise_for_status()`. `HttpClient.get_json()` moves that native
callable through the injected Pyscript task executor and awaits it. OpenMeteo
therefore does not execute blocking HTTP directly on the Pyscript event loop.

Reference: `pyscript/modules/infra/providers/provider_context.py`:
`ProviderContext`, `HttpClient`.

### 2.4 HomeAssistantProvider

#### Capabilities and execution model

Observed support is enabled at class level. Forecast support is set per
instance from the source configuration:

- `local`: `supports_forecast: false`;
- `openweather`: `supports_forecast: true`;
- `dwd`: `supports_forecast: true`.

Observed collection is synchronous. Forecast collection is asynchronous
because `update_forecast()` awaits the Pyscript `weather.get_forecasts`
service call. `ProviderManager` awaits that provider coroutine.

#### Observed data

`collect_weather_data_for_source()` iterates the configured `fields`. It reads
each configured entity through `state_get`, converts the state to `float`,
uses an explicit field default or the global default when no value is
available, and rounds to three decimals. It does not inspect or convert the
unit of observed sensor entities; the configured sensors are therefore
expected to expose canonical units.

Current configured observed fields are:

- `local`: `temp_c`, `humidity_pct`, `sun_hours`, `rain_mm`, and `wind_ms`.
  `sun_hours` and `rain_mm` have explicit zero defaults. `wind_ms` has no
  entity and receives the global default `2.0`.
- `openweather`: `temp_c`, `humidity_pct`, and `wind_ms`. Its configured
  `sun_hours` entity is null and has no applicable default, so it is omitted.
- `dwd`: `temp_c`, `humidity_pct`, and `wind_ms`. Its configured `sun_hours`
  entity is null and has no applicable default, so it is omitted.

The provider writes every non-null field through
`HydroStore.write_observed("global", key, source, value)`. The implementation
also supports a configured direct `eto_mm`: if present, it writes only that
field and returns. None of the current source configurations declares an
`eto_mm` field.

#### Forecast data

The provider calls:

```text
weather.get_forecasts(entity_id=<forecast_id>, type="daily")
```

For each returned entry:

- The date is the first ten characters of `datetime`.
- `temp_c` is `(temperature + templow) / 2`. Both values are required.
- Temperature is converted from the Weather entity's `temperature_unit`;
  Celsius and Fahrenheit are supported.
- `humidity_pct` uses `humidity` directly. If humidity is absent and a mean
  temperature was available, relative humidity is calculated from `temp_c`
  and `dew_point` using the exponential saturation-vapour-pressure relation
  in `_humidity_from_dewpoint()`.
- `wind_ms` uses `wind_speed` and the Weather entity's `wind_speed_unit`.
  Supported conversions are m/s, km/h, mph, knots, and ft/s.
- `rain_mm` uses `precipitation` and the entity's `precipitation_unit`.
  Supported conversions are mm, cm, and inches.
- `prob_pct` uses `precipitation_probability` directly.
- No `sun_hours`, `solar_rad_mj_m2`, or `eto_ref_mm` is synthesized.

Missing inputs or unsupported units cause the affected field to be omitted;
the remaining fields for that day can still be written. Forecast values are
written through `HydroStore.write_forecast()`.

Reference: `pyscript/modules/infra/providers/provider_homeassistant.py`:
`HomeAssistantProvider.__init__()`, `collect_weather_data_for_source()`,
`collect_weather_source()`, `_normalize_forecast_entry()`,
`_humidity_from_dewpoint()`, unit conversion helpers, and
`update_forecast()`.

### 2.5 OpenMeteoProvider

Both observed and forecast capabilities are enabled. Both update methods are
asynchronous and obtain the same combined hourly/daily JSON response through
`ProviderContext.http.get_json()`.

The request uses `timezone=auto`. Requested hourly fields are
`temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `precipitation`,
`et0_fao_evapotranspiration`, and `shortwave_radiation`. Requested daily fields
are `et0_fao_evapotranspiration`, `precipitation_sum`,
`precipitation_probability_max`, `sunshine_duration`, and
`shortwave_radiation_sum`.

#### Observed aggregation

`_aggregate_today()` slices every hourly array from index zero through the
current local hour, inclusive:

- `temp_c`: arithmetic mean of `temperature_2m`;
- `humidity_pct`: arithmetic mean of `relative_humidity_2m`;
- `wind_ms`: arithmetic mean of `wind_speed_10m`, divided by 3.6;
- `rain_mm`: sum of `precipitation`;
- `eto_ref_mm`: sum of `et0_fao_evapotranspiration`;
- `solar_rad_mj_m2`: sum of hourly `shortwave_radiation` in W/m², multiplied
  by 3600 and divided by 1,000,000 to obtain accumulated MJ/m².

Values are rounded to two decimals and written as
`observed/<source=openmeteo>`.

#### Forecast normalization

Daily fields are normalized as follows:

- `eto_ref_mm` directly from `et0_fao_evapotranspiration`;
- `rain_mm` directly from `precipitation_sum`;
- `prob_pct` directly from `precipitation_probability_max`;
- `sun_hours` from `sunshine_duration / 3600`;
- `solar_rad_mj_m2` directly from `shortwave_radiation_sum`.

Forecast `temp_c`, `humidity_pct`, and `wind_ms` are calculated from hourly
arrays. `_aggregate_forecast_hourly()` groups entries by the date part of each
local `hourly.time` value and averages all values associated with that date.
Wind is divided by 3.6. The hourly results are merged into the daily result,
rounded to two decimals, and written as `forecast/openmeteo`.

Reference: `pyscript/modules/infra/providers/provider_openmeteo.py`:
`OPENMETEO_FIELDS`, `OPENMETEO_FORECAST_FIELDS`,
`OPENMETEO_FORECAST_HOURLY_FIELDS`, `OpenMeteoProvider._build_url()`,
`_aggregate_today()`, `_aggregate_forecast_hourly()`, and
`_normalize_forecast()`.

### 2.6 Canonical-field availability matrix

`O` means observed, `F` means forecast, and `—` means the current source does
not write the field. DWD and OpenWeather are separate configured instances of
`HomeAssistantProvider`.

| Canonical field | local | DWD | OpenWeather | OpenMeteo observed | OpenMeteo forecast | Canonical unit |
|---|---:|---:|---:|---:|---:|---|
| `temp_c` | O | O/F | O/F | mean 00:00–current hour | mean of hourly values by local forecast date | °C |
| `humidity_pct` | O | O/F | O/F | mean 00:00–current hour | mean of hourly values by local forecast date | % |
| `wind_ms` | O (default 2.0) | O/F | O/F | mean 00:00–current hour, km/h ÷ 3.6 | mean by local date, km/h ÷ 3.6 | m/s |
| `rain_mm` | O | F | F | sum 00:00–current hour | `precipitation_sum` | mm/day or accumulated mm today |
| `prob_pct` | — | F | F | — | `precipitation_probability_max` | % |
| `sun_hours` | O | — | — | — | `sunshine_duration` ÷ 3600 | h/day |
| `solar_rad_mj_m2` | — | — | — | accumulated hourly W/m² × 3600 ÷ 1,000,000 | `shortwave_radiation_sum` | MJ/m²/day |
| `eto_ref_mm` | — | — | — | summed hourly provider ET0 | daily provider ET0 | mm/day or accumulated mm today |

For DWD and OpenWeather forecast values, temperature, wind, and precipitation
are normalized from the unit attributes of the associated Home Assistant
Weather entity. Their observed sensor units are not normalized by the
provider.

## 3. HydroStore data model

### 3.1 Stored hierarchy

The persisted hierarchy is:

```text
day (ISO YYYY-MM-DD)
  -> scope
    -> key
      -> variant
        -> source
          -> { value, ts }
```

Example:

```json
{
  "2026-08-03": {
    "global": {
      "temp_c": {
        "forecast": {
          "openmeteo": {"value": 18.2, "ts": "..."}
        },
        "derived": {
          "median": {"value": 18.2, "ts": "..."},
          "current": {"value": 18.2, "ts": "..."}
        }
      }
    }
  }
}
```

The in-memory day mapping is `HydroStore.today`; persistence uses
`sprinkler/hydro.json`. `meta` stores soil anchors separately from the day
hierarchy. The configured history window is 28 days.

References:

- `pyscript/modules/infra/store/hydrostore.py`: `HydroStore.__init__()`,
  `_ensure_path()`, `_load_today()`, `_save_today()`, `prune()`
- `pyscript/modules/sprinkler/sprinkler_config.py`: `HYDRO_FILE`,
  `MAX_HISTORY_DAYS`

### 3.2 Scopes

- `global` contains site-wide weather, ETo, rain, and the optional global soil
  calculation.
- `zone:<id>` contains zone-specific `soil_mm` and `irrigation_mm` values.

Writes mark either the global dirty state or the relevant zone dirty state for
consumers.

### 3.3 Variants and sources

- `observed`: measurements or accumulated values for the current day. Sources
  include configured providers and `runtime` for actual irrigation.
- `forecast`: predicted daily values. Sources include weather providers and
  `scheduler` for planned irrigation.
- `derived`: calculated representations such as `median`, `current`, and
  `model`.
- `median`: a cross-source weather/value aggregation generated automatically
  after observed or forecast writes.
- `current`: the current-day representation generated automatically according
  to the field policy below.
- `model`: the soil-water result stored under `soil_mm/derived/model`.
- `manual`: also appears for manual soil reset data, although it is not part
  of provider weather ingestion.

`write_observed()`, `write_forecast()`, and generic `write()` store a value and
timestamp. Observed and forecast writes immediately recalculate `median` and
`current`.

References: `HydroStore.write_observed()`, `write_forecast()`, `write()`,
`get()`, `get_sources()` in
`pyscript/modules/infra/store/hydrostore.py`.

### 3.4 Median semantics

`_compute_median()` uses the numeric median implemented by `_median()`:

- For today, it uses all non-null observed source values. Forecast values are
  used only when there are no observed values for the key.
- For every date other than today, it uses forecast source values only. The
  code comment calls this the future path, but the condition is simply
  `day != today`.
- An odd number of values returns the middle sorted value. An even number
  returns the arithmetic mean of the two middle values.
- Stored derived medians are rounded to three decimals.

References: `HydroStore._median()`, `_compute_median()`,
`_update_derived_median()`.

### 3.5 Current semantics

For every date other than today, `_compute_current()` returns the already
stored derived median directly.

For today, source-specific observed and forecast medians are calculated
separately. Two policies exist.

#### State/mean values

Keys without an explicit policy, including `temp_c`, `humidity_pct`,
`wind_ms`, `prob_pct`, and `eto_mm`, use:

```text
t = clamp((current hour + current minute / 60) / 24, 0, 1)
current = observed_median × t + forecast_median × (1 - t)
```

If only one side exists, that median is returned. If neither exists,
`current` is `None`.

#### Cumulative daily totals

`CURRENT_POLICIES` declares these keys as `daily_total`:

- `rain_mm`
- `sun_hours`
- `solar_rad_mj_m2`
- `eto_ref_mm`

For these keys, today's `current` is the forecast median when available;
otherwise it is the observed median; otherwise it is `None`. This represents
the current best available estimate of the complete daily total rather than a
time blend of an accumulated observation and a daily forecast.

References: `CURRENT_POLICIES`, `HydroStore._compute_current()`,
`_update_derived_current()` in
`pyscript/modules/infra/store/hydrostore.py`.

## 4. ETo calculation

All active ETo calculations are implemented by `HydroStore`; `EToEngine`
orchestrates when they run.

### 4.1 compute_eto_all_days()

`compute_eto_all_days(force_all=False)` gets every date present for the
`global` scope. It skips dates before today unless `force_all` is true and
calls `compute_eto_for_day()` for each remaining date. Per-day exceptions are
logged and do not stop the loop.

Reference: `pyscript/modules/infra/store/hydrostore.py`:
`HydroStore.compute_eto_all_days()`.

### 4.2 compute_eto_for_day()

For one date, `compute_eto_for_day()` constructs these work sets:

- `observed`: every source present under `temp_c/observed`;
- `forecast`: every source present under `temp_c/forecast`;
- `derived`: the fixed source names `median` and `current`.

Existing direct values under `eto_mm/observed/<source>` are copied into the
result first. A matching observed source is then skipped rather than
recalculated.

For every remaining variant/source combination, the method calls
`_compute_eto_variant()`. Successful results are written to the same variant
and source under `eto_mm`:

```text
global/eto_mm/<variant>/<source>/{value, ts}
```

Observed and forecast ETo writes invoke HydroStore's generic median/current
updates. Later in the same method, successful calculations for the fixed
derived sources write formula results directly to
`eto_mm/derived/median` and `eto_mm/derived/current`. Consequently, the final
derived ETo values are normally ETo calculated from derived weather inputs,
not merely a median or blend of the already calculated per-provider ETo
values.

Reference: `HydroStore.compute_eto_for_day()`.

### 4.3 _compute_eto_variant()

`_compute_eto_variant(day, variant, source)` reads exactly four global fields
with the same variant and source:

| Input | Expected canonical unit |
|---|---|
| `temp_c` | °C |
| `humidity_pct` | % |
| `wind_ms` | m/s |
| `sun_hours` | h/day |

If any of the four is `None`, the variant is not calculated. This wrapper
therefore requires humidity and sunshine even though
`calculate_eto_fao56_light()` itself contains internal defaults/fallbacks for
them. The calculated ETo is rounded to three decimals.

Reference: `HydroStore._compute_eto_variant()`.

### 4.4 calculate_eto_fao56_light()

`calculate_eto_fao56_light(data, day)` returns an `EToResult` containing ETo,
the inputs, site data, and intermediate radiation/vapour-pressure values.

Inputs used by the function:

- mean temperature `t_mean` from `temp_c`;
- mean relative humidity `rh_mean` from `humidity_pct` (function-level
  default 60);
- wind speed `wind` from `wind_ms`;
- sunshine duration `sun_hours` (optional inside this function);
- date string `day` for day-of-year;
- configured site latitude and elevation.

Configured longitude is stored by `configure_site()` but is not read by this
calculation.

The implemented steps and constants are:

1. Daily soil heat flux `G = 0.0`.
2. Fixed psychrometric constant `gamma = 0.066 kPa/°C`.
3. Albedo `0.23`.
4. Saturation vapour pressure:
   `es = 0.6108 × exp(17.27 × T / (T + 237.3))`.
5. Actual vapour pressure: `ea = es × RH / 100`.
6. Vapour-pressure-curve slope:
   `delta = 4098 × es / (T + 237.3)²`.
7. Inverse relative Earth-Sun distance:
   `dr = 1 + 0.033 × cos(2π/365 × day_of_year)`.
8. Solar declination:
   `0.409 × sin(2π/365 × day_of_year - 1.39)`.
9. Sunset hour angle from latitude and solar declination.
10. Extraterrestrial radiation `ra` using solar constant `0.0820`.
11. Clear-sky radiation: `rso = (0.75 + 2e-5 × elevation) × ra`.
12. Solar radiation from sunshine duration:
    `rs = (0.25 + 0.5 × sun_hours / maximum_daylight_hours) × ra`.
    If sunshine is absent inside this function, `rs = 0.75 × ra`.
13. Net shortwave radiation: `rns = (1 - 0.23) × rs`.
14. Cloud factor:
    `clamp(1.35 × rs/rso - 0.35, 0.05, 1.0)`.
15. Net longwave radiation uses coefficient `4.903e-9`, the fourth power of
    `T + 273.16`, actual vapour pressure, and the cloud factor.
16. Net radiation: `rn = rns - rnl`.
17. Reduced Penman-Monteith expression:
    `(0.408 × delta × (rn-G) + gamma × 900/(T+273) × wind × (es-ea)) /
    (delta + gamma × (1 + 0.34 × wind))`.
18. Negative results are clamped to zero. There is no upper clamp in this
    function.

Observable simplifications relative to the larger set of inputs and terms in
full FAO-56 are that the code uses one mean temperature throughout, derives
actual vapour pressure from mean relative humidity, uses a fixed
psychrometric constant, fixes daily soil heat flux at zero, estimates solar
radiation from sunshine duration with fixed coefficients, and does not apply
a wind-height adjustment. Elevation affects clear-sky radiation but not the
fixed psychrometric constant. The configured ETo minimum, maximum, and
`solar_saturation` values are loaded into `EToEngine` but are not read by this
HydroStore calculation.

References:

- `pyscript/modules/infra/store/hydrostore.py`: `EToResult`,
  `HydroStore.calculate_eto_fao56_light()`
- `pyscript/etoengine.py`: `EToEngine.__init__()`, `hydro_store.configure_site()`
- `sprinkler/eto.yaml`: `eto`

## 5. ETo variants

### `eto_mm/observed/<source>`

This is ETo for one source's observed `temp_c`, `humidity_pct`, `wind_ms`, and
`sun_hours`. It is calculated only when all four exist under the same source.
The current `HomeAssistantProvider` can also write a direct observed `eto_mm`
when such a field is configured; no current source configuration does so.

### `eto_mm/forecast/<source>`

This is ETo calculated from one source's forecast weather fields. OpenMeteo
provides all four required forecast inputs. The current DWD and OpenWeather
forecast paths do not supply `sun_hours`, so their source-specific forecast
ETo calculation is skipped.

### `eto_mm/derived/median`

This is normally the result of applying the ETo formula to
`temp_c/derived/median`, `humidity_pct/derived/median`,
`wind_ms/derived/median`, and `sun_hours/derived/median`. It is written after
the per-source variants during `compute_eto_for_day()`.

### `eto_mm/derived/current`

This is normally the result of applying the ETo formula to the four weather
fields' `derived/current` values. The inputs can therefore combine multiple
providers and, for today, use their field-specific current policies.
`eto_mm` itself is not declared as a `daily_total` current policy.

### `eto_ref_mm`

`eto_ref_mm` is OpenMeteo's externally calculated
`et0_fao_evapotranspiration`. It is stored for observed and forecast variants
as a reference value and receives generic `derived/median` and
`derived/current` values. It is not read by
`calculate_eto_fao56_light()`, `_compute_eto_variant()`, the soil model, or
Sprinkler runtime calculations.

Thus the current system contains both:

1. ETo calculated independently for each source that has a complete set of
   same-source weather inputs; and
2. ETo calculated from cross-source `derived/median` and `derived/current`
   weather inputs.

References: `HydroStore.compute_eto_for_day()`, `_compute_eto_variant()`,
`CURRENT_POLICIES`; `OpenMeteoProvider` field mappings.

## 6. Solar radiation

`global/solar_rad_mj_m2` represents total shortwave global solar radiation as
daily energy per unit area, in MJ/m²/day. It is not an instantaneous W/m²
power value.

OpenMeteo supplies it in two forms:

- Observed: `hourly.shortwave_radiation` in W/m². `_aggregate_today()` sums
  values from 00:00 through the current hour and converts them with
  `sum × 3600 / 1,000,000`. The result is accumulated energy so far today.
- Forecast: `daily.shortwave_radiation_sum`, copied directly as the daily
  total.

HydroStore treats the key generically for observed, forecast, and median.
Its `current` policy is `daily_total`: forecast median is preferred as the
best available full-day estimate; observed accumulated energy is used when no
forecast exists.

No ETo method reads `solar_rad_mj_m2`. The current ETo calculation continues
to estimate `rs` from `sun_hours`.

References:

- `pyscript/modules/infra/providers/provider_openmeteo.py`:
  `OPENMETEO_FIELDS`, `OPENMETEO_FORECAST_FIELDS`, `_aggregate_today()`
- `pyscript/modules/infra/store/hydrostore.py`: `CURRENT_POLICIES`,
  `_compute_current()`, `_compute_eto_variant()`,
  `calculate_eto_fao56_light()`

## 7. Soil use

### 7.1 HydroStore soil model

`compute_soil_for_day(scope, soil_min, soil_opt, soil_max, day)` obtains its
starting soil value from the previous day's
`<scope>/soil_mm/derived/model`. If absent, it uses the scope's stored soil
anchor; if that is absent, it uses `soil_opt`.

For the target day it reads:

- `global/eto_mm/derived/median`, defaulting to zero;
- `global/rain_mm/derived/median`, defaulting to zero;
- `<scope>/irrigation_mm/derived/median`, defaulting to zero.

Soil continuity policy: missing derived ETo is treated as `0.0` for
water-balance continuity. This fallback does not mean that the physical ETo
was measured as zero.

The update is:

```text
soil = previous_soil + rain + irrigation - ETo
soil = clamp(soil, soil_min, soil_max)
```

The rounded result is written to `<scope>/soil_mm/derived/model`.

`compute_soil_all_days()` iterates all dates in the store, skipping past dates
unless `force_all` is true. EToEngine invokes it for `global` with
`force_all=False`; `SprinklerCore.compute_soil_all_zones()` invokes it per
zone with `force_all=True`.

Actual irrigation is accumulated under
`zone:<id>/irrigation_mm/observed/runtime`. Planned irrigation is accumulated
under `zone:<id>/irrigation_mm/forecast/scheduler`. Their generic derived
median is what the soil model reads.

References:

- `pyscript/modules/infra/store/hydrostore.py`:
  `compute_soil_for_day()`, `compute_soil_all_days()`,
  `add_actual_irrigation()`, `add_forecast_irrigation()`
- `pyscript/etoengine.py`: scheduled global soil calculation
- `pyscript/modules/sprinkler/scheduler.py`:
  `SprinklerCore.compute_soil_all_zones()`

## 8. Sprinkler interface

This section covers only Sprinkler's data exchange with the Hydro/ETo
subsystem.

### Values read

`SprinklerCore` and its projection helpers read:

- `zone:<id>/soil_mm/derived/model` for current zone soil state;
- `global/eto_mm/derived/median` for daily atmospheric water demand;
- `global/rain_mm/derived/median` for forecast rain;
- `global/prob_pct/derived/median` for rain probability;
- zone-specific observed and forecast `irrigation_mm`;
- global ETo/rain series and zone soil/irrigation series for projections.

### Deficit and runtime influence

`adaptation_deficit()` starts with today's zone soil value, falling back to
the configured optimal soil value. Today's deficit is
`max(0, soil_optimal - soil)` and receives the first default weight, `0.7`.

It then takes up to two dates from the global store whose date is greater than
or equal to today. For each date:

```text
effective rain = rain × precipitation_probability / 100 × rain_factor
effective ETo  = ETo × eto_factor
soil           = soil + effective rain + irrigation - effective ETo
deficit        = max(0, soil_optimal - soil)
```

The forecast deficits receive the remaining default weights `0.4` and `0.2`.
For today, irrigation combines observed runtime irrigation and scheduled
forecast irrigation; later dates use scheduled irrigation.

`adapt_program_durations()` caps the resulting weighted deficit at soil
capacity and passes it to `calculate_zone_seconds()`. That method applies the
zone's `zone_factor` and converts millimetres to seconds using the configured
`precipitation_rate_mm_per_hour`:

```text
seconds = deficit_mm × zone_factor / precipitation_rate_mm_per_hour × 3600
```

Calculated runtimes below three minutes become zero. On completed runtime,
actual irrigation is calculated from elapsed seconds and the zone
precipitation rate and written back to HydroStore.

`build_soil_series_from_queue()` separately projects a zone soil series using
the same additive water-balance shape with global ETo/rain series and planned
queue irrigation.

References:

- `pyscript/modules/sprinkler/scheduler.py`:
  `SprinklerCore.adaptation_deficit()`, `adapt_program_durations()`,
  `calculate_zone_seconds()`, `_stop_zone()`,
  `build_soil_series_from_queue()`, `compute_soil_all_zones()`
- `pyscript/sprinkler.py`: `project_qe()`, `project_all_zone_charts()`,
  `rebuild_soil_all()`

## 9. Current Design Observations

The following are factual observations from the current code, not proposals:

- The active runtime path is `EToEngine -> ProviderManager -> Provider ->
  HydroStore`; weather-source protocol and normalization code resides in the
  providers.
- ETo is calculated both per complete same-source weather dataset and from
  cross-source derived median/current weather inputs.
- The final `eto_mm/derived/median` and `eto_mm/derived/current` values are
  normally formula results calculated from derived weather inputs.
- OpenMeteo supplies external ET0 as `eto_ref_mm`; that reference value is not
  used by the internal ETo or soil calculations.
- Internal ETo remains based on `sun_hours` even though
  `solar_rad_mj_m2` is stored for OpenMeteo observed and forecast data.
- Provider data availability differs: local has observed sunshine but no
  forecast; DWD and OpenWeather have forecasts without sunshine; OpenMeteo
  forecast has all four inputs required by `_compute_eto_variant()`.
- OpenMeteo observed does not write `sun_hours`, so its same-source observed
  ETo cannot be calculated by `_compute_eto_variant()` from the currently
  stored OpenMeteo observed fields.
- Home Assistant observed entities are assumed to already use canonical
  units, while Home Assistant forecasts inspect and normalize entity units.
- Today's derived median prefers observed values and uses forecast only when
  no observed source value exists. Today's derived current can combine
  observed and forecast values, subject to the per-key current policy.
- Soil calculations consume derived medians, not derived current values.
- `eto_mm` is not a `daily_total` current-policy key; `eto_ref_mm` is.
- Configured `eto.min_mm`, `eto.max_mm`, and `eto.solar_saturation` values are
  stored on `EToEngine` but are not used by the current HydroStore ETo formula.
- Configured longitude is retained by HydroStore but is not read by the
  current ETo formula.

## 10. Reference map

| Concern | Primary code references |
|---|---|
| Runtime orchestration | `pyscript/etoengine.py`: `EToEngine`, `etoengine_collecthourly()`, `etoengine_startup()` |
| Source configuration | `sprinkler/eto.yaml` |
| Provider contract | `pyscript/modules/infra/providers/provider_base.py`: `ProviderBase` |
| Provider creation and dispatch | `pyscript/modules/infra/providers/provider_manager.py`: `ProviderManager` |
| Runtime dependency boundary | `pyscript/modules/infra/providers/provider_context.py`: `ProviderContext`, `HttpClient` |
| HA observed/forecast normalization | `pyscript/modules/infra/providers/provider_homeassistant.py`: `HomeAssistantProvider` |
| OpenMeteo collection and normalization | `pyscript/modules/infra/providers/provider_openmeteo.py`: `OpenMeteoProvider` and field mappings |
| Storage hierarchy and derived data | `pyscript/modules/infra/store/hydrostore.py`: write/get methods, `_compute_median()`, `_compute_current()` |
| Internal ETo | `pyscript/modules/infra/store/hydrostore.py`: `EToResult`, ETo methods |
| Soil-water model | `pyscript/modules/infra/store/hydrostore.py`: soil and irrigation methods |
| Sprinkler consumption | `pyscript/modules/sprinkler/scheduler.py`: relevant `SprinklerCore` methods |
| HA projections and manual soil reset | `pyscript/sprinkler.py`: projection and soil service functions |
