"""
ETo Calculator (FAO-56-Light)
Phase 1: Manual trigger, no soil model, no scheduler
"""
from typing import Dict

from datetime import datetime, date, timedelta
import math
import logging
import urllib.request
import json
from collections import defaultdict

from pyscript.openmeteo import fetch_openmeteo
from pyscript.modules.infra.store.hydrostore import hydro_store

SOIL_CAPACITY           = float(state.get("input_number.soil_capacity_mm"))
SOIL_OPTIMAL            = float(state.get("input_number.soil_optimal_mm"))

log_eto           = logging.getLogger("pyscript.etoengine")

# --- Pyscript editor hints (no runtime effect) ---
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any
# -----------------------------
# CONFIG (erstmal hart codiert)
# -----------------------------
LATITUDE  = hass.config.latitude
LONGITUDE = hass.config.longitude

ETO_TRIGGER_TIME = "23:55"
ETO_MIN_MM = 1.0
ETO_MAX_MM = 8.0

DEFAULT_WIND_MS = 2.0  # fixer Wind, später ersetzbar
SOLAR_SATURATION = 0.7  # Deckelung Sonnenanteil

# Quellen
SOURCE_LOCAL        = "local"
SOURCE_OWD          = "openweather"
SOURCE_DWD          = "dwd"
SOURCE_OPENMETEO    = "openmeteo"

ETO_SOURCES = {
    SOURCE_LOCAL: {
        "friendly_name": "Lokal (Weatherman)",
        "type": "sensor",

        "fields": {
            "temp_c": {
                "entity": "sensor.local_temperature_avg"
            },
            "humidity_pct": {
                "entity": "sensor.local_humidity_avg"
            },
            "sun_hours": {
                "entity": "sensor.sonnenstunden_heute",
                "default": 0.0
            },
            "rain_mm": {
                "entity": "sensor.regen_mm_heute",
                "default": 0.0
            },
            "wind_ms": {
                "entity": None,
                "default": DEFAULT_WIND_MS
            }
        },

        "forecast_id": None
    },

    SOURCE_OWD: {
        "friendly_name": "OpenWeather",
        "type": "sensor",

        "fields": {
            "temp_c": {
                "entity": "sensor.openweather_temperature_avg"
            },
            "humidity_pct": {
                "entity": "sensor.openweather_humidity_avg"
            },
            "sun_hours": {
                "entity": None,
                "default": 0.0
            },
            "wind_ms": {
                "entity": "sensor.openweather_wind_speed_ms",
                "default": DEFAULT_WIND_MS
            }
        },

        "forecast_id": "weather.openweathermap"
    },

    SOURCE_DWD: {
        "friendly_name": "Deutscher Wetterdienst",
        "type": "sensor",

        "fields": {
            "temp_c": {
                "entity": "sensor.dwd_temperature_avg"
            },
            "humidity_pct": {
                "entity": "sensor.dwd_humidity_avg"
            },
            "sun_hours": {
                "entity": "sensor.dwd_sun_hours_today",
                "default": 0.0
            },
            "wind_ms": {
                "entity": "sensor.dwd_wind_speed_ms",
                "default": DEFAULT_WIND_MS
            }
        },

        "forecast_id": "weather.donaueschingen_land"
    },

    SOURCE_OPENMETEO: {
        "friendly_name": "OpenMeteo",
        "type": "direct",

        "fields": {
            "temp_c": {"default": None},
            "humidity_pct": {"default": None},
            "sun_hours": {"default": None},
            "wind_ms": {"default": None}
        },

        "forecast_id": None
    }
}

class EToEngine:

    def __init__(self, store):
        self.store = store

    def build_env(self, source_cfg):

        result = {}

        for key, meta in source_cfg.get("fields", {}).items():

            entity = meta.get("entity")
            default = meta.get("default")

            val = None

            # ------------------------
            # SENSOR SOURCE
            # ------------------------
            if source_cfg.get("type") == "sensor":

                if entity:
                    try:
                        val = float(state.get(entity))
                    except (TypeError, ValueError):
                        val = None

            # ------------------------
            # DIRECT SOURCE
            # ------------------------
            elif source_cfg.get("type") == "direct":
                # wird später extern befüllt
                val = None

            # ------------------------
            # DEFAULT FALLBACK
            # ------------------------
            if val is None:
                val = default

            if val is not None:
                result[key] = val

        return result

    def _normalize_forecast_date(self, value):

        if not value:
            return None

        # OpenMeteo -> "2026-03-11"
        if len(value) == 10:
            return date.fromisoformat(value)

        # Weather integrations -> ISO datetime
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
       
    import math

    def rh_from_dewpoint(self, temp_c, dew_point_c):

        if temp_c is None or dew_point_c is None:
            return None

        a = 17.625
        b = 243.04

        es = 6.1094 * math.exp((a * temp_c) / (b + temp_c))
        e  = 6.1094 * math.exp((a * dew_point_c) / (b + dew_point_c))

        rh = 100 * (e / es)

        return max(0, min(100, rh))

    # -----------------------------
    # Forecast - Collectors
    # -----------------------------
    def collect_forecast_openmeteo(self):

        data = task.executor(fetch_openmeteo, LATITUDE, LONGITUDE)

        daily = data.get("daily")
        if not daily:
            log_eto.error("OpenMeteo: missing daily data")
            return

        days = daily.get("time", [])
        eto_vals = daily.get("et0_fao_evapotranspiration", [])
        rain_vals = daily.get("precipitation_sum", [])
        prob_vals = daily.get("precipitation_probability_max", [])

        for i, day in enumerate(days):

            date = self._normalize_forecast_date(day)
            try:
                # ------------------------
                # ETo
                # ------------------------
                if i < len(eto_vals):
                    self.store.write(
                        "global", "eto_mm", "forecast", "openmeteo",
                        float(eto_vals[i]), date
                    )

                # ------------------------
                # Rain
                # ------------------------
                if i < len(rain_vals):
                    self.store.write(
                        "global", "rain_mm", "forecast", "openmeteo",
                        float(rain_vals[i]), date
                    )

                # ------------------------
                # Probability
                # ------------------------
                if i < len(prob_vals):
                    self.store.write(
                        "global", "prob_pct", "forecast", "openmeteo",
                        float(prob_vals[i]), date
                    )

            except Exception as e:
                log_eto.error(f"Forecast write failed for {day}: {e}")
                
    def collect_forecast_for_source(self, source, cfg):

        if not cfg.get("forecast_id"):
            return

        try:
            result = service.call(
                "weather",
                "get_forecasts",
                blocking=True,
                return_response=True,
                entity_id=cfg["forecast_id"],
                type="daily"
            )

            forecasts = result[cfg["forecast_id"]]["forecast"]

            for entry in forecasts:

                day = entry.get("datetime")[:10]  # YYYY-MM-DD

                date = self._normalize_forecast_date(day)

                temp = entry.get("temperature")
                hum  = entry.get("humidity")
                dew  = entry.get("dew_point") 
                wind = entry.get("wind_speed")
                rain = entry.get("precipitation")

                if hum is None:
                    hum = self.rh_from_dewpoint(temp, dew)

                if temp is not None:
                    self.store.write("global", "temp_c", "forecast", source, float(temp), date)

                if hum is not None:
                    self.store.write("global", "humidity_pct", "forecast", source, float(hum), date)

                if wind is not None:
                    self.store.write("global", "wind_ms", "forecast", source, float(wind), date)

                if rain is not None:
                    self.store.write("global", "rain_mm", "forecast", source, float(rain), date)

        except Exception as e:
            log_eto.error(f"Forecast collect failed for {source}: {e}")

    # -----------------------------
    # Weather Data Collection
    # -----------------------------
    def collect_weather_data_for_source(self, cfg):

        data = {}

        for key, conf in cfg.get("fields", {}).items():

            entity = conf.get("entity")
            default = conf.get("default", None)

            if entity:
                try:
                    val = state.get(entity)
                    val = float(val) if val is not None else None
                except Exception:
                    val = None
            else:
                val = None

            if val is None:
                val = default

            # 👉 HIER
            if val is not None:
                val = round(val, 3)
                
            data[key] = val

        return data

    def collect_weather_source(self, source, cfg):

        weather = self.collect_weather_data_for_source(cfg)

        # 🔥 CASE: direct ETo
        if weather.get("eto_mm") is not None:
            self.store.write_observed("global", "eto_mm", source, weather["eto_mm"])
            return

        # 🔥 GENERIC WRITE
        for key, value in weather.items():

            if value is None:
                continue

            self.store.write_observed("global", key, source, value)

    def collect_all_sources(self):

        for source, cfg in ETO_SOURCES.items():   # bestehende config
            try:
                self.collect_weather_source(source, cfg)
            except Exception as e:
                log_eto.error(f"Weather collect failed for {source}: {e}")

        # forecast (HA sources)
        for source, cfg in ETO_SOURCES.items():
            self.collect_forecast_for_source(source, cfg)
            
        # 🔥 forecast (nur 1x)
        try:
            self.collect_forecast_openmeteo()
        except Exception as e:
            log_eto.error(f"Forecast collect failed: {e}")

    # -----------------------------
    # CORE: FAO-56-Light (Stub)
    # -----------------------------
    def calculate_eto_fao56_light(self, data: dict, latitude: float) -> float:
        """
        FAO-56-Light Reference Evapotranspiration (mm/day)
        Uses temperature, humidity, sun hours, fixed wind.
        """

        # -----------------------------
        # Input
        # -----------------------------
        t_mean = data["temp_c"]
        rh_mean = data.get("humidity_pct", 60)
        wind = data["wind_ms"]
        sun_hours = data.get("sun_hours")

        # -----------------------------
        # Constants
        # -----------------------------
        G = 0.0  # soil heat flux (daily)
        gamma = 0.066  # psychrometric constant (kPa/°C)
        albedo = 0.23

        # -----------------------------
        # Saturation vapour pressure
        # -----------------------------
        es = 0.6108 * math.exp((17.27 * t_mean) / (t_mean + 237.3))
        ea = es * (rh_mean / 100.0)
        delta = (4098 * es) / ((t_mean + 237.3) ** 2)

        # -----------------------------
        # Extraterrestrial radiation
        # -----------------------------
        day_of_year = datetime.now().timetuple().tm_yday
        lat_rad = math.radians(latitude)

        dr = 1 + 0.033 * math.cos(2 * math.pi / 365 * day_of_year)
        solar_dec = 0.409 * math.sin(2 * math.pi / 365 * day_of_year - 1.39)
        ws = math.acos(-math.tan(lat_rad) * math.tan(solar_dec))

        ra = (
            24 * 60 / math.pi
            * 0.0820
            * dr
            * (
                ws * math.sin(lat_rad) * math.sin(solar_dec)
                + math.cos(lat_rad) * math.cos(solar_dec) * math.sin(ws)
            )
        )

        # -----------------------------
        # Solar radiation from sun hours
        # -----------------------------
        if sun_hours is not None:
            n = sun_hours
            N = 24 / math.pi * ws
            rs = (0.25 + 0.5 * (n / N)) * ra
        else:
            rs = 0.75 * ra  # fallback

        rns = (1 - albedo) * rs
        rnl = 4.903e-9 * ((t_mean + 273.16) ** 4) * (0.34 - 0.14 * math.sqrt(ea))
        rn = rns - rnl

        # -----------------------------
        # Penman-Monteith (reduced)
        # -----------------------------
        eto = (
            (0.408 * delta * (rn - G))
            + gamma * (900 / (t_mean + 273)) * wind * (es - ea)
        ) / (delta + gamma * (1 + 0.34 * wind))

        log_eto.info(f"ETo inputs: T={t_mean} RH={rh_mean} Sun={sun_hours} Wind={wind}")
        log_eto.info(f"ETo result: {eto:.2f} mm")
        
        return max(0.0, eto)

    def compute_eto_for_day(self, day):

        scope = "global"
        results = {}

        # 🔥 bereits vorhandene direkte ETo holen
        direct_eto = self.store.get(scope, "eto_mm", "observed", date=day)

        if direct_eto:
            results.setdefault("observed", {}).update(direct_eto)

        # 🔥 klassische Berechnung für andere Quellen
        variants = self.store.get_variants(scope, "temp_c", day)

        for variant in variants:

            sources = self.store.get_sources(scope, "temp_c", variant, day)

            for source in sources:

                # 🔥 skip wenn schon direct vorhanden
                if source in results.get(variant, {}):
                    continue

                try:
                    temp = self.store.get(scope, "temp_c", variant, source, day)
                    hum  = self.store.get(scope, "humidity_pct", variant, source, day)
                    wind = self.store.get(scope, "wind_ms", variant, source, day)
                    sun  = self.store.get(scope, "sun_hours", variant, source, day)

                    if temp is None or hum is None:
                        continue

                    eto = self.calculate_eto_fao56_light({
                        "temp_c": temp,
                        "humidity_pct": hum,
                        "wind_ms": wind,
                        "sun_hours": sun
                    }, LATITUDE)

                    results.setdefault(variant, {})[source] = round(eto, 3)

                except Exception as e:
                    log_eto.error(f"ETo failed {day} {variant}/{source}: {e}")

        # 🔥 WRITE BACK
        for variant, sources in results.items():
            for source, value in sources.items():
                self.store.write("global", "eto_mm", variant, source, value, day)

        return results
        
    def compute_eto_all_days(self):

        scope = "global"

        days = self.store.get_days(scope)

        results = {}

        for day in sorted(days):

            try:
                results[day] = self.compute_eto_for_day(day)

            except Exception as e:
                log_eto.error(f"ETo failed for day {day}: {e}")

    def compute_soil(self):

        scope = "global"

        soil_min = 0
        soil_opt = SOIL_OPTIMAL
        soil_max = SOIL_CAPACITY

        try:
            self.store.compute_soil_all_days(
                scope,
                soil_min,
                soil_opt,
                soil_max
            )
        except Exception as e:
            log_eto.error(f"Soil computation failed: {e}")        

    # -----------------------------
    # Projections
    # -----------------------------
    def project_today_sensors(self):

        today = self.store.today.get("date")

        # ------------------------
        # ETo
        # ------------------------

        eto = self.store.get("global", "eto_mm", "derived", "current", today)

        if eto is None:
            eto = self.store.get("global", "eto_mm", "median", "forecast", today)

        # ------------------------
        # RAIN
        # ------------------------

        rain = self.store.get("global", "rain_mm", "median", "forecast", today)

        # ------------------------
        # SOIL
        # ------------------------

        soil = self.store.get("global", "soil_mm", "derived", "model", today)

        if soil is None:
            soil = SOIL_OPTIMAL

        # ------------------------
        # SENSOR WRITE
        # ------------------------

        if eto is not None:
            state.set(
                "sensor.irrigation_eto_median1",
                round(eto, 2),
                {
                    "friendly_name": "ETo Median",
                    "unit_of_measurement": "mm",
                    "state_class": "measurement"
                }
            )

        if rain is not None:
            state.set(
                "sensor.irrigation_rain_median1",
                round(rain, 2),
                {
                    "friendly_name": "Rain Today",
                    "unit_of_measurement": "mm",
                    "state_class": "measurement"
                }
            )

        if soil is not None:
            state.set(
                "sensor.irrigation_soil1",
                round(soil, 2),
                {
                    "friendly_name": "Soil Balance",
                    "unit_of_measurement": "mm",
                    "state_class": "measurement"
                }
            )

    def project_chart_sensor(self, entity_id, series, unit):

        data = {
            e["date"]: e["value"]
            for e in series
            if e and e.get("value") is not None
        }

        state.set(
            entity_id,
            0,
            {
                "unit_of_measurement": unit,
                **data
            }
        )

    def project_global_chart_sensors(self):
        today = date.today()

        start = (today - timedelta(days=9)).isoformat()
        end   = (today + timedelta(days=4)).isoformat()

        # ------------------------------------------------

        eto_series  = self.store.build_series("global", "eto_mm", start=start, end=end)
        rain_series = self.store.build_series("global", "rain_mm", start=start, end=end)
        soil_series = self.store.build_series("global", "soil_mm", start=start, end=end)

        log_eto.info(f"eto_series: {eto_series}")

        self.project_chart_sensor("sensor.irrigation_chart_eto", eto_series, "mm")
        self.project_chart_sensor("sensor.irrigation_chart_rain", rain_series, "mm")
        self.project_chart_sensor("sensor.irrigation_chart_soil", soil_series, "mm")

    def prune(self):
        self.store.prune()

etoengine = EToEngine(hydro_store)

@time_trigger("cron(5 * * * *)")
def etoengine_collecthourly():
    etoengine.prune()

    etoengine.collect_all_sources()
    etoengine.compute_eto_all_days()
    etoengine.compute_soil()
    etoengine.project_today_sensors()
    etoengine.project_global_chart_sensors()

@time_trigger("startup")
def etoengine_startup():
    etoengine.prune()

    etoengine.collect_all_sources()
    etoengine.compute_eto_all_days()
    etoengine.compute_soil()
    etoengine.project_today_sensors()
    etoengine.project_global_chart_sensors()
