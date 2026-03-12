"""
ETo Calculator (FAO-56-Light)
Phase 1: Manual trigger, no soil model, no scheduler
"""

from datetime import datetime, date
import math
import logging
import urllib.request
import json
from pyscript.openmeteo import fetch_openmeteo
from collections import defaultdict

forecast = defaultdict(dict)
forecast_median = defaultdict(dict)

SENSOR_PREFIX_ETO = "sensor.irrigation_eto_raw"
SENSOR_PREFIX_FORECAST = "sensor.irrigation_forecast"
SENSOR_PREFIX_SOIL = "sensor.irrigation_soil"
SENSOR_RAIN_TODAY = "sensor.regen_mm_heute"    # NUR wenn die Ermittlung um 23:55 läuft - sonst gestern

log_eto           = logging.getLogger("pyscript.eto")

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
LATITUDE = 47.5546
LONGITUDE =  8.2623

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


WEATHER_SOURCES = {
    SOURCE_LOCAL: {
        "friendly_name": "Lokal (Weatherman)",
        "type": "sensor",
        "temp": "sensor.local_temperature_avg",
        "humidity": "sensor.local_humidity_avg",
        "sun": "sensor.local_sun_hours_today",
        "wind": None,
        "forecast_id": None,
        "latitude": LATITUDE,
        "longitude": LONGITUDE
    },

    SOURCE_OWD: {
        "friendly_name": "OpenWeather",
        "type": "sensor",
        "temp": "sensor.openweather_temperature_avg",
        "humidity": "sensor.openweather_humidity_avg",
        "sun": None,
        "wind": "sensor.openweather_wind_speed_ms",
        "forecast_id": "weather.openweathermap",
        "latitude": LATITUDE,
        "longitude": LONGITUDE
    },
    SOURCE_DWD: {
        "friendly_name": "Deutscher Wetterdienst",
        "type": "sensor",
        "temp": "sensor.dwd_temperature_avg",
        "humidity": "sensor.dwd_humidity_avg",
        "sun": "sensor.dwd_sun_hours_today",
        "wind": "sensor.dwd_wind_speed_ms",
        "forecast_id": "weather.donaueschingen_land",
        "latitude": LATITUDE,
        "longitude": LONGITUDE
    },
    SOURCE_OPENMETEO: {
        "friendly_name": "OpenMeteo",
        "type": "direct",
        "temp": None,
        "humidity": None,
        "sun": None,
        "wind": None,
        "forecast_id": None,
        "latitude": LATITUDE,
        "longitude": LONGITUDE
    }
}

# ----------- Soil, Deficit --------------
def to_pyscript_entity(entity_id: str) -> str:
    """
    Converts a sensor.* entity to a persistable pyscript.* entity.
    Keeps everything after the first dot.
    """

    if not isinstance(entity_id, str):
        raise ValueError("entity_id must be string")

    if "." not in entity_id:
        raise ValueError(f"Invalid entity_id format: {entity_id}")

    domain, rest = entity_id.split(".", 1)

    return f"pyscript.{rest}"

# -----------------------------
# Helper: normalize_date, clamp, median
# -----------------------------
def normalize_forecast_date(value):

    if not value:
        return None

    # OpenMeteo -> "2026-03-11"
    if len(value) == 10:
        return date.fromisoformat(value)

    # Weather integrations -> ISO datetime
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()

def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))

def median(values):

    vals = [v for v in values if v is not None]

    if not vals:
        return None

    vals.sort()
    n = len(vals)

    mid = n // 2

    if n % 2:
        return vals[mid]

    return (vals[mid - 1] + vals[mid]) / 2

def set_eto_state(entity_id: str, eto_mm: float, friendly_name: str, method: str, today: str):
    if not entity_id:
        return
    
    pystate = to_pyscript_entity(entity_id)

    # --- Guard 0: Check if Sensor exists
    if not state.exist(pystate):
        state.set(pystate, 0, {"eto_date": None})
        state.persist(pystate)
        log_eto.info(f"ETo-Sensor {pystate} created, persisted")

    # --- Guard 1: Already calculated today?
    attrs = state.getattr(pystate)
    eto_date = attrs.get("eto_date")
    
    if today:
        if eto_date == today:
            log_eto.info(f"Daily ETo already calculated for {entity_id} – skipping")
            return
            
    state.set(pystate,
        round(eto_mm, 2),
        {
            "friendly_name": f"ETo {friendly_name}",
            "unit_of_measurement": "mm",
            "state_class": "measurement",
            "icon": "mdi:water-percent",
            "raw_mm": eto_mm,
            "caps_mm": [ETO_MIN_MM, ETO_MAX_MM],
            "calculated_at": datetime.now().isoformat(),
            "method": method,
            "eto_date": date.today().isoformat(),
        },
    )

def project_forecast():
    eto_attrs = {}
    rain_attrs = {}
    prob_attrs = {}

    for d in sorted(forecast_median):

        v = forecast_median[d]

        key = d.isoformat()

        eto_attrs[key] = round(v["eto"],2)
        rain_attrs[key] = round(v["rain"],2)
        prob_attrs[key] = round(v["prob"],0)

    state.set(
        f"{SENSOR_PREFIX_FORECAST}_eto",
        0,
        {
            "friendly_name": "ETo Forecast Median",
            "unit_of_measurement": "mm",
            "state_class": "measurement",
            **eto_attrs
        }
    )
    state.set(
        f"{SENSOR_PREFIX_FORECAST}_rain",
        0,
        {
            "friendly_name": "Rain Forecast Median",
            "unit_of_measurement": "mm",
            **rain_attrs
        }
    )
    state.set(
        f"{SENSOR_PREFIX_FORECAST}_probability",
        0,
        {
            "friendly_name": "Rain Probability Forecast",
            "unit_of_measurement": "%",
            **prob_attrs
        }
    )

# -----------------------------
# CORE: FAO-56-Light (Stub)
# -----------------------------

def calculate_eto_fao56_light(data: dict, latitude: float) -> float:
    """
    FAO-56-Light Reference Evapotranspiration (mm/day)
    Uses temperature, humidity, sun hours, fixed wind.
    """

    # -----------------------------
    # Input
    # -----------------------------
    t_mean = data["temp_c"]
    rh_mean = data["humidity_pct"]
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

# -----------------------------
# ETO DATA COLLECTION
# -----------------------------
def collect_eto_data_for_source(cfg: Dict):

    if not cfg:
        return None

    if cfg["type"] == "direct":
        data = task.executor(fetch_openmeteo, cfg["latitude"], cfg["longitude"])

        daily = data.get("daily")
        daily_units = data.get("daily_units")

        if not daily:
            raise ValueError("OpenMeteo response missing 'daily'")

        eto_today = daily["et0_fao_evapotranspiration"][0]
        eto_units = daily_units["et0_fao_evapotranspiration"]
        log_eto.debug(f"ETo for OpenMeteo fetched {data}")

        return {
            "eto_direct": float(eto_today),
            "wind_ms": DEFAULT_WIND_MS
        }

    return {
        "temp_c": float(state.get(cfg["temp"])),
        "humidity_pct": float(state.get(cfg["humidity"])),
        "sun_hours": float(state.get(cfg["sun"])) if cfg["sun"] else None,
        "wind_ms": float(state.get(cfg["wind"])) if cfg["wind"] else DEFAULT_WIND_MS
    }

# -----------------------------
# CORE: Forecast
# -----------------------------
def get_forecast_for_source(cfg: dict, type="daily"):

    if not cfg:
        log_eto.error(f"Get {type} Forecast for {source} - no Configuration")

    entity_id = cfg["forecast_id"]
    friendly_name = cfg["friendly_name"]

    if not entity_id:
        log_eto.error(f"Get {type} Forecast for {friendly_name} - no Source")
        return None


    log_eto.debug(f"Get {type} Forecast for {friendly_name} and {entity_id}")

    result = service.call(
        "weather",
        "get_forecasts",
        blocking=True,
        return_response=True,
        entity_id=entity_id,
        type=type
    )
    log_eto.debug(f"Forecast {type} fetched for {friendly_name}")

    return result[entity_id]["forecast"]

def get_openmeteo_forecast(cfg: dict):

    data = task.executor(fetch_openmeteo, cfg["latitude"], cfg["longitude"])

    if not data:
        log_eto.warning("OpenMeteo forecast fetch failed")
        return None

    daily = data.get("daily")

    if not daily:
        log_eto.warning(f"OpenMeteo daily block missing {data}")
        return None

    dates = daily.get("time", [])
    eto = daily.get("et0_fao_evapotranspiration", [])
    rain = daily.get("precipitation_sum", [])
    probability = daily.get("precipitation_probability_max", [])

    forecast = []

    for i in range(min(3, len(dates))):

        d = normalize_forecast_date(dates[i])

        forecast.append({
            "date": d,
            "eto": eto[i],
            "rain": rain[i],
            "probability": probability[i]
        })

    return forecast


from datetime import datetime
import logging

log = logging.getLogger("pyscript.soil")

# -----------------------------
# Soil
# -----------------------------
def compute_soil_balance():
    entity_id = to_pyscript_entity(f"{SENSOR_PREFIX_SOIL}")

    if state.exist(entity_id):
        soil_today = float(state.get(entity_id))
    else:
        soil_today = float(state.get("input_number.soil_optimal_mm"))
        state.set(entity_id, soil_today, {})
        state.persist(entity_id)

    soil_max = float(state.get("input_number.soil_capacity_mm"))

    eto_today = float(state.get(to_pyscript_entity(f"{SENSOR_PREFIX_ETO}_median")))
    rain_today = float(state.get(f"{SENSOR_RAIN_TODAY}"))

    soil_new = soil_today + rain_today - eto_today
    
    soil_new = clamp(soil_new, 0, soil_max)

    # --- Guard 1: Already calculated today?
    attrs = state.getattr(entity_id)
    soil_date = attrs.get("soil_date")
    today = date.today().isoformat()

    if today == soil_date:
        log_eto.info(f"Daily ETo already calculated for {entity_id} – skipping")
        return

    state.set(entity_id,
        round(soil_new, 2),
        {
            "friendly_name": f"Soil Balance",
            "unit_of_measurement": "mm",
            "state_class": "measurement",
            "raw_mm": soil_new,
            "caps_mm": [0, soil_max],
            "calculated_at": datetime.now().isoformat(),
            "soil_date": today,
        },
    )
    state.persist(entity_id)


def compute_soil_forecast():

    entity_id = to_pyscript_entity(f"{SENSOR_PREFIX_SOIL}")

    if state.exist(entity_id):
        soil_today = float(state.get(entity_id))
    else:
        soil_today = float(state.get("input_number.soil_optimal_mm"))

    eto_fc  = state.getattr(f"{SENSOR_PREFIX_FORECAST}_eto")
    rain_fc = state.getattr(f"{SENSOR_PREFIX_FORECAST}_rain")

    soil_forecast = {}

    soil = soil_today

    dates = []

    for d in eto_fc.keys():
        if d[:4].isdigit():
            dates.append(d)

    dates = sorted(dates)

    for d in dates:

        eto  = float(eto_fc.get(d, 0))
        rain = float(rain_fc.get(d, 0))

        soil = soil + rain - eto

        soil_forecast[d] = round(soil,2)

    state.set(
        f"{SENSOR_PREFIX_FORECAST}_soil",
        soil_today,
        {
            "friendly_name": "Soil Balance Forecast",
            "unit_of_measurement": "mm",
            **soil_forecast
        }
    )

# -----------------------------
# SERVICE
# -----------------------------
def calculate_eto_for_source(entity_id: str, cfg: dict):
    """
    Manuell auslösbarer Service:
    pyscript.calculate_eto
    """
    if not cfg:
        log_eto.error(f"Calculate ETo - No Configuration")

    friendly_name = cfg["friendly_name"]

    log_eto.info(f"ETo calculation started for {friendly_name}")

    weather = collect_eto_data_for_source(cfg)

    method = "FAO-56-Light"
    # OpenMeteo liefert fertiges ETo
    if "eto_direct" in weather:
        eto_raw = weather["eto_direct"]
        method = "direct"
    else:
        eto_raw = calculate_eto_fao56_light(weather, cfg["latitude"])

    eto_mm = clamp(eto_raw, ETO_MIN_MM, ETO_MAX_MM)

    set_eto_state(entity_id=entity_id, eto_mm = eto_mm, friendly_name = friendly_name, method = method, today = date.today().isoformat())

    log_eto.info(f"ETo finished for {friendly_name}: {eto_raw:.2f} mm")

    return eto_raw

def calculate_eto_daily():
    """
    Daily ETo calculation for all configured sources.
    Runs at 23:55 local time to catch complete daily values.
    """

    today = date.today().isoformat()

    etoc = 1
    eto_values = []

    for source, cfg in WEATHER_SOURCES.items():

        entity_id = to_pyscript_entity(f"{SENSOR_PREFIX_ETO}_{source}")

        # --- Guard 2: For LOCAL, ensure daily sensors are sane
        if source == SOURCE_LOCAL:
            sun_hours = state.get("sensor.local_sun_hours_today")
            rain_today = state.get("sensor.local_rain_today_mm")

            try:
                sun_hours = float(sun_hours)
                rain_today = float(rain_today)
            except (TypeError, ValueError):
                log_eto.error("Daily ETo aborted (local): daily sensors not numeric")
                continue#
        
        #    if sun_hours == 0:
        #        log.warning(
        #            "Daily ETo aborted (local): sun_hours_today is 0 at 23:55"
        #        )
        #        continue

            log.info(
                f"Daily ETo trigger (local): sun={sun_hours:.2f}h rain={rain_today:.2f}mm"
            )

        # --- For OpenWeather: no daily-sensor guard needed
        if source == SOURCE_OWD:
            log_eto.info("Daily ETo trigger (openweather)")

        # --- Calculate
        try:
            eto_values.append(calculate_eto_for_source(entity_id=entity_id, cfg=cfg))
        except Exception as err:
            log_eto.error(f"ETo calculation failed for {source}: {err}")

    eto_raw_median = median(eto_values)

    set_eto_state(entity_id=f"{SENSOR_PREFIX_ETO}_median", eto_mm = eto_raw_median, friendly_name = "ETo Median", method = "", today = date.today().isoformat())

def rh_from_dewpoint(temp_c, dew_point_c):

    if temp_c is None or dew_point_c is None:
        return None

    a = 17.625
    b = 243.04

    es = 6.1094 * math.exp((a * temp_c) / (b + temp_c))
    e  = 6.1094 * math.exp((a * dew_point_c) / (b + dew_point_c))

    rh = 100 * (e / es)

    return max(0, min(100, rh))

def forecast_weather_to_eto_input(f):
    temp = f.get("temperature")
    rh = f.get("humidity")

    if rh is None:
        rh = rh_from_dewpoint(temp, f.get("dew_point"))

    return {
        "temp_c": temp,
        "humidity_pct": rh,
        "sun_hours": None,
        "wind_ms": f.get("wind_speed", 0)
    }

def get_forecast():

    for source, cfg in WEATHER_SOURCES.items():
        friendly_name = cfg["friendly_name"]
        type = cfg["type"]

        if not type:
            continue

        if source == "openmeteo":
            fc = get_openmeteo_forecast(cfg)

            if not fc:
                continue

            for f in fc:
                forecast[f['date']][source] = {
                    "eto": f['eto'],
                    "rain": f['rain'],
                    "prob": f['probability']
                }
                log_eto.info(
                    f"Forecast OpenMeteo {f['date']} "
                    f"ETo={f['eto']} Rain={f['rain']} Probability={f['probability']:.2f}"
                )
        else:
            fc = get_forecast_for_source(cfg, "daily")

            if not fc:
                continue

            for f in fc[:3]:
                datum = normalize_forecast_date(f.get("datetime"))
                log_eto.info(f"Forecast {friendly_name} - process Date {datum}")
                # log_eto.info(f"Forecast - data: {f}")
                eto_input = forecast_weather_to_eto_input(f)
                # log_eto.info(f"Forecast {eto_input}")
                eto = calculate_eto_fao56_light(eto_input, cfg["latitude"])
                rain = float(f.get("precipitation", 0))
                probability = float(f.get("precipitation_probability", 0))
                forecast[datum][source] = {
                    "eto": eto,
                    "rain": rain,
                    "prob": probability
                }
                log_eto.info(f"Forecast {friendly_name} {datum} ETo={eto:.2f} Rain={rain:.2f} Probability={probability:.2f}")

    day = 0
    for d in sorted(forecast):

        log_eto.info(f"Forecast {d}")

        eto_vals = []
        rain_vals = []
        prob_vals = []

        for src in forecast[d]:
            v = forecast[d][src]

            eto_vals.append(v["eto"])
            rain_vals.append(v["rain"])
            prob_vals.append(v["prob"])

            log_eto.info(
                f"  {src}: eto={v['eto']:.2f} rain={v['rain']} prob={v['prob']}"
            )

        eto_med = median(eto_vals)
        rain_med = median(rain_vals)
        prob_med = median(prob_vals)
        log_eto.info(
            f" Median eto={eto_med:.2f} rain={rain_med} prob={prob_med}"
        )

        forecast_median[d] = {
            "eto": eto_med,
            "rain": rain_med,
            "prob": prob_med
        }
        day += 1

@time_trigger("cron(0 * * * *)")
def hourly():
    get_forecast()
    compute_soil_forecast()
    project_forecast()

@time_trigger("cron(55 23 * * *)")
def daily():
    calculate_eto_daily()
    compute_soil_balance()

@time_trigger("startup")
def startup():
    calculate_eto_daily()
    get_forecast()
    compute_soil_balance()
    compute_soil_forecast()
    project_forecast()
