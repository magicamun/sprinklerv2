"""
ETo Calculator (FAO-56-Light)
Phase 1: Manual trigger, no soil model, no scheduler
"""
from typing import Dict

from datetime import datetime, date, timedelta
import math
import logging
import urllib.request
import requests
import json
from collections import defaultdict
import yaml
import os
from pyscript.modules.infra.providers.provider_openmeteo import OpenMeteoProvider

from pyscript.openmeteo import fetch_openmeteo
from pyscript.modules.infra.store.hydrostore import hydro_store

from pyscript.modules.sprinkler.sprinkler_config import SENSOR_HYDRO_ETO, SENSOR_HYDRO_RAIN, SENSOR_HYDRO_SOIL, INPUT_SOIL_CAPACITY, INPUT_SOIL_OPTIMAL, CHART_DAYS_PAST, CHART_DAYS_FUTURE

from pyscript.modules.infra.providers.provider_context import ProviderContext
from pyscript.modules.infra.providers.provider_manager import ProviderManager

ETO_CONFIG_FILE = "/config/sprinkler/eto.yaml"

SOIL_CAPACITY           = float(state.get(INPUT_SOIL_CAPACITY))
SOIL_OPTIMAL            = float(state.get(INPUT_SOIL_OPTIMAL))

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
ELEVATION = hass.config.elevation

# ETO_MIN_MM = 1.0
#ETO_MAX_MM = 8.0

#DEFAULT_WIND_MS = 2.0  # fixer Wind, später ersetzbar
#SOLAR_SATURATION = 0.7  # Deckelung Sonnenanteil

def load_eto_config():

    log_eto.info(f"[CONFIG] loading {ETO_CONFIG_FILE}")

    fd = os.open(ETO_CONFIG_FILE, os.O_RDONLY)

    try:

        content = os.read(fd, 1024 * 1024).decode("utf-8")

    finally:

        os.close(fd)

    log_eto.info(f"[CONFIG] bytes={len(content)}")

    cfg = yaml.safe_load(content)

    log_eto.info(f"[CONFIG] parsed={cfg}")

    return cfg or {}
        
ETO_CONFIG = load_eto_config() or {}

log_eto.info(f"[CONFIG] ETO_CONFIG={ETO_CONFIG}")

ETO_DEFAULTS = ETO_CONFIG.get("defaults", {})
ETO_SOURCES  = ETO_CONFIG.get("sources", {})
ETO_SETTINGS = ETO_CONFIG.get("eto", {})

class EToEngine:

    def __init__(self, store):
        self.store = store

        self.provider_ctx = ProviderContext(
            store=self.store,
            defaults=ETO_DEFAULTS,
            state_get=state.get,
            service_call=service.call,
            task_executor=task.executor,
            logger=log_eto,
        )
        self.provider_manager = ProviderManager(self.provider_ctx, ETO_SOURCES)

        self.eto_min_mm = ETO_SETTINGS.get("min_mm", 1.0)
        self.eto_max_mm = ETO_SETTINGS.get("max_mm", 8.0)
        self.solar_saturation = ETO_SETTINGS.get("solar_saturation", 0.7)

    def _normalize_forecast_date(self, value):

        if not value:
            return None

        # OpenMeteo -> "2026-03-11"
        if len(value) == 10:
            return date.fromisoformat(value)

        # Weather integrations -> ISO datetime
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()

    def normalize_wind(self, value, source=None, mode=None):

        # mode: "daily" / "hourly"

        if value is None:
            return None

        # Heuristik + bekannte Fälle
        if mode == "daily":
            return value / 3.6   # km/h → m/s

        if mode == "hourly":
            return value         # already m/s

        # fallback safety
        if value > 20:           # unrealistisch für m/s im Alltag
            return value / 3.6

        return value

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

        mode = "daily"

        if not cfg.get("forecast_id"):
            return

        try:
            result = service.call(
                "weather",
                "get_forecasts",
                blocking=True,
                return_response=True,
                entity_id=cfg["forecast_id"],
                type=mode
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
                    wind = round(self.normalize_wind(wind, source, mode), 3)
                    self.store.write("global", "wind_ms", "forecast", source, float(wind), date)

                if rain is not None:
                    self.store.write("global", "rain_mm", "forecast", source, float(rain), date)

        except Exception as e:
            log_eto.error(f"Forecast collect failed for {source}: {e}")


    # -----------------------------
    # Projections
    # -----------------------------
    def build_eto_explanation(self, eto, temperature, humidity, sun_hours):
        # --- Level ---
        if eto <= 3:
            level_key = "low"
            level_label = "Sehr geringer Wasserbedarf"
        elif eto <= 8:
            level_key = "medium"
            level_label = "Mäßiger Wasserbedarf"
        else:
            level_key = "high"
            level_label = "Hoher Wasserbedarf"

        # --- Faktoren ---
        if sun_hours > 6:
            sun_label = "viel Sonne"
        elif sun_hours > 2:
            sun_label = "etwas Sonne"
        else:
            sun_label = "kaum Sonne"

        if temperature > 20:
            temp_label = "warm"
        elif temperature > 10:
            temp_label = "mild"
        else:
            temp_label = "kühl"

        if humidity < 50:
            humidity_label = "trockene Luft"
        elif humidity < 75:
            humidity_label = "normale Luftfeuchte"
        else:
            humidity_label = "hohe Luftfeuchte"

        return {
            "level": level_key,
            "label": level_label,
            "factors": [
                sun_label,
                temp_label,
                humidity_label
            ]
        }

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
        # Temperatur
        # ------------------------

        temp = self.store.get("global", "temp_c", "derived", "median", today)

        # ------------------------
        # Humidity
        # ------------------------

        hum = self.store.get("global", "humidity_pct", "derived", "median", today)

        # ------------------------
        # Humidity
        # ------------------------

        sun = self.store.get("global", "sun_hours", "derived", "median", today)
        
        # ------------------------
        # SENSOR WRITE
        # ------------------------

        explanation = {}

        if eto is not None and hum is not None and temp is not None and sun is not None:
           explanation = self.build_eto_explanation(eto, temp, hum, sun)

        if eto is not None:
            state.set(
                SENSOR_HYDRO_ETO,
                round(eto, 2),
                {
                    "friendly_name": "ETo Median",
                    "unit_of_measurement": "mm",
                    "state_class": "measurement",
                    "temperature": temp,
                    "humidity": hum,
                    "sun_hours": sun,
                    "explanation": explanation,
                }
            )

        if rain is not None:
            state.set(
                SENSOR_HYDRO_RAIN,
                round(rain, 2),
                {
                    "friendly_name": "Rain Today",
                    "unit_of_measurement": "mm",
                    "state_class": "measurement"
                }
            )

        if soil is not None:
            state.set(
                SENSOR_HYDRO_SOIL,
                round(soil, 2),
                {
                    "friendly_name": "Soil Balance",
                    "unit_of_measurement": "mm",
                    "state_class": "measurement"
                }
            )
      

    def project_chart_sensor(self, entity_id, series, unit):

        #data = {
        #    e["date"]: e["value"]
        #    for e in series
        #    if e and e.get("value") is not None
        #}

        state.set(
            entity_id,
            0,
            {
                "unit_of_measurement": unit,
                **series
            }
        )

    def project_global_chart_sensors(self):
        today = date.today()

        start = (today - timedelta(days=CHART_DAYS_PAST)).isoformat()
        end   = (today + timedelta(days=CHART_DAYS_FUTURE)).isoformat()

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
hydro_store.configure_site(LATITUDE, LONGITUDE, ELEVATION)

@state_trigger(
    "input_number.soil_capacity_mm",
    "input_number.soil_optimal_mm"
)
def soil_params_changed(var_name=None, value=None, old_value=None):

    log_eto.info(f"[CONFIG] {var_name} changed: {old_value} → {value}")

    SOIL_CAPACITY           = float(state.get(INPUT_SOIL_CAPACITY))
    SOIL_OPTIMAL            = float(state.get(INPUT_SOIL_OPTIMAL))


@time_trigger("cron(5 * * * *)")
def etoengine_collecthourly():
    etoengine.prune()

    # etoengine.collect_all_sources()
    await etoengine.provider_manager.update_observed()
    await etoengine.provider_manager.update_forecast()

    hydro_store.compute_eto_all_days()
    hydro_store.compute_soil_all_days(soil_min = 0, soil_opt = SOIL_OPTIMAL, soil_max = SOIL_CAPACITY, scope="global", force_all = False)

    etoengine.project_today_sensors()
    etoengine.project_global_chart_sensors()

@time_trigger("startup")
def etoengine_startup():

    for source, cfg in ETO_SOURCES.items():

        log_eto.info(

            f"[CONFIG] Loaded ETo source: {source} "

            f"({cfg.get('friendly_name')})"

        )

    etoengine.prune()

#    etoengine.collect_all_sources()        
    await etoengine.provider_manager.update_observed()
    await etoengine.provider_manager.update_forecast()

    hydro_store.compute_eto_all_days()
    hydro_store.compute_soil_all_days(soil_min = 0, soil_opt = SOIL_OPTIMAL, soil_max = SOIL_CAPACITY, scope="global", force_all = False)

    etoengine.project_today_sensors()
    etoengine.project_global_chart_sensors()
