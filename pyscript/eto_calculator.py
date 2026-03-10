"""
ETo Calculator (FAO-56-Light)
Phase 1: Manual trigger, no soil model, no scheduler
"""

from datetime import datetime, date
import math
import logging



log           = logging.getLogger("pyscript.eto")

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
ETO_TRIGGER_TIME = "23:55"
ETO_MIN_MM = 1.0
ETO_MAX_MM = 8.0

DEFAULT_WIND_MS = 2.0  # fixer Wind, später ersetzbar
SOLAR_SATURATION = 0.7  # Deckelung Sonnenanteil

# Quellen
SOURCE_LOCAL = "local"
SOURCE_OWD = "openweather"
SOURCE_DWD = "dwd"

FRIENDLY_NAMES = {
    SOURCE_LOCAL: "ETo Lokal",
    SOURCE_OWD: "ETo OpenWeather",
    SOURCE_DWD: "ETo DWD",
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
# Helper: safe clamp
# -----------------------------

def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))


# -----------------------------
# DATA COLLECTION
# -----------------------------

def collect_weather_data(source: str):
    """
    Liefert ein Dict mit allen für ETo nötigen Größen.
    Noch Dummy / Platzhalter.
    """

    log.info(f"ETo: collecting weather data from '{source}'")

    if source == SOURCE_LOCAL:
        return {
            "temp_c": float(state.get("sensor.local_temperature_avg")),
            "humidity_pct": float(state.get("sensor.local_humidity_avg")),
            "sun_hours": float(state.get("sensor.local_sun_hours_today")),
            "wind_ms": DEFAULT_WIND_MS,
        }

    if source == SOURCE_OWD:
        return {
            "temp_c": float(state.get("sensor.openweather_temperature_avg")),
            "humidity_pct": float(state.get("sensor.openweather_humidity_avg")),
            "sun_hours": None,  # FAO-Fallback
            "wind_ms": float(state.get("sensor.openweather_wind_speed_ms")) or DEFAULT_WIND_MS,
        }

    if source == SOURCE_DWD:
        return {
            "temp_c": float(state.get("sensor.dwd_temperature_avg")),
            "humidity_pct": float(state.get("sensor.dwd_humidity_avg")),
            "sun_hours": float(state.get("sensor.dwd_sun_hours_today")),
            "wind_ms": float(state.get("sensor.dwd_wind_speed_ms")),
        }

    raise ValueError(f"Unknown weather source: {source}")


# -----------------------------
# CORE: FAO-56-Light (Stub)
# -----------------------------

import math
from datetime import datetime

def calculate_eto_fao56_light(data: dict, latitude: float = 50.0) -> float:
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

    log.info(f"ETo inputs: T={t_mean} RH={rh_mean} Sun={sun_hours} Wind={wind}")
    log.info(f"ETo result: {eto:.2f} mm")
    
    return max(0.0, eto)

# -----------------------------
# SERVICE
# -----------------------------

@service
def calculate_eto(entity_id: str, source: str = SOURCE_LOCAL):
    """
    Manuell auslösbarer Service:
    pyscript.calculate_eto
    """

    log.info(f"ETo calculation started (source={source})")

    weather = collect_weather_data(source)
    eto_raw = calculate_eto_fao56_light(weather)

    eto_mm = clamp(eto_raw, ETO_MIN_MM, ETO_MAX_MM)

    state.set(
        entity_id,
        round(eto_mm, 2),
        {
            "friendly_name": FRIENDLY_NAMES.get(source, f"ETo {source}"),
            "unit_of_measurement": "mm",
            "state_class": "measurement",
            "icon": "mdi:water-percent",
            "source": source,
            "raw_mm": round(eto_raw, 2),
            "caps_mm": [ETO_MIN_MM, ETO_MAX_MM],
            "calculated_at": datetime.now().isoformat(),
            "method": "FAO-56-Light",
            "wind_ms": weather["wind_ms"],
            "eto_date": date.today().isoformat(),
        },
    )

    log.info(f"ETo finished: ({source}): {eto_raw:.2f} mm")

def calculate_eto_daily():
    """
    Daily ETo calculation for all configured sources.
    Runs at 23:55 local time to catch complete daily values.
    """

    today = date.today().isoformat()
    sources = [SOURCE_LOCAL, SOURCE_OWD, SOURCE_DWD]

    for source in sources:
        entity_id = to_pyscript_entity(f"sensor.irrigation_eto_raw_{source}")

        # --- Guard 0: Check if Sensor exists
        if not state.exist(entity_id):
            state.set(entity_id, 0, {"eto_date": None})
            state.persist(entity_id)
            log.info(f"ETo-Sensor created, persisted")

        # --- Guard 1: Already calculated today?
        attrs = state.getattr(entity_id)
        eto_date = attrs.get("eto_date")

        if eto_date == today:
            log.info(f"Daily ETo already calculated for {entity_id} – skipping")
            continue

        # --- Guard 2: For LOCAL, ensure daily sensors are sane
        if source == SOURCE_LOCAL:
            sun_hours = state.get("sensor.local_sun_hours_today")
            rain_today = state.get("sensor.local_rain_today_mm")

            try:
                sun_hours = float(sun_hours)
                rain_today = float(rain_today)
            except (TypeError, ValueError):
                log.error("Daily ETo aborted (local): daily sensors not numeric")
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
            log.info("Daily ETo trigger (openweather)")

        # --- Calculate
        try:
            calculate_eto(entity_id= entity_id, source=source)
        except Exception as err:
            log.error(f"ETo calculation failed for {source}: {err}")

@time_trigger("cron(55 23 * * *)")
def daily():
    calculate_eto_daily()

@time_trigger("startup")
def startup():
    calculate_eto_daily()
