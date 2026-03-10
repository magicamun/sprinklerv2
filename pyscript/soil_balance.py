"""
Soil Water Balance – Reference Model
Phase 1: passive observation (no irrigation influence)
"""

import logging
import datetime
import logging
import json
import os

import datetime as dt
from datetime import date

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

log = logging.getLogger("pyscript.soil")

# -----------------------------
# CONFIG
# -----------------------------
SOIL_CAPACITY_MM = 30.0
SOIL_START_MM = 15.0
BALANCE_TRIGGER_TIME = "23:58"

ETO_SOURCE = "local"  # bewusst fest verdrahtet für Phase 1


# -----------------------------
# Helper
# -----------------------------

def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))


def get_float(entity_id):
    if state.exist(entity_id):
        val = state.get(f"{entity_id}")
        if val in (None, "unknown", "unavailable"):
            return None
        try:
            return float(val)
        except ValueError:
            return None
    else:
        log.info(f"get_float: {entity_id} did not exist")


# -----------------------------
# DAILY SOIL BALANCE
# -----------------------------

@time_trigger("cron(10 00 * * *)")
def update_soil_balance():
    soil_water_entity = "sensor.soil_water_mm"    

    today = date.today().isoformat()

    attrs = state.getattr(soil_water_entity)
    balance_date = attrs.get("balance_date")

    # last_date = state.getattr("sensor.soil_water_mm", "balance_date")

    if balance_date == today:
        log.info("Soil balance already calculated today – skipping")
        return

    # --- Read previous soil state
    soil_prev = get_float(soil_water_entity)

    if soil_prev is None:
        soil_prev = SOIL_START_MM
        log.info(f"Soil balance initialized at {soil_prev:.1f} mm")

    # --- Read inputs
    rain = get_float(f"sensor.rain_yesterday")
    eto = get_float(f"sensor.eto_yesterday")

    if eto is None or rain is None:
        log.error("Soil balance aborted: missing eto or rain data")
        return

    # --- Balance equation
    soil_new = soil_prev + rain - eto
    soil_new = clamp(soil_new, 0.0, SOIL_CAPACITY_MM)

    # --- Write state
    state.set(
        soil_water_entity,
        round(soil_new, 2),
        {
            "unit_of_measurement": "mm",
            "icon": "mdi:water",
            "state_class": "measurement",
            "capacity_mm": SOIL_CAPACITY_MM,
            "rain_mm": round(rain, 2),
            "eto_mm": round(eto, 2),
            "soil_prev_mm": round(soil_prev, 2),
            "balance_date": today,
            "updated_at": dt.datetime.now().isoformat(),
        },
    )

    log.info(
        f"Soil balance updated: {soil_prev:.2f} + {rain:.2f} − {eto:.2f} = {soil_new:.2f} mm"
    )
