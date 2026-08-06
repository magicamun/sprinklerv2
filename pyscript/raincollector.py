import logging
from datetime import date, timedelta

log_rain = logging.getLogger("pyscript.raincollector")

RAIN_SOURCE = "sensor.regen_pro_h"

HELPER_TOTAL = "pyscript.rain_today_corrected"
HELPER_YESTERDAY = "pyscript.rain_yesterday_corrected"
SENSOR_TOTAL = "sensor.regen_mm_heute_korrigiert"
SENSOR_YESTERDAY = "sensor.regen_mm_gestern_korrigiert"

# --------------------------------------------------
# Helper
# --------------------------------------------------

def get_float(entity_id, default=0.0):
    try:
        value = state.get(entity_id)

        if value in (None, "unknown", "unavailable"):
            return default

        return float(value)

    except Exception:
        return default


def publish_sensor():

    total = get_float(HELPER_TOTAL)

    state.set(
        SENSOR_TOTAL,
        round(total, 2),
        {
            "friendly_name": "Regen Heute (korrigiert)",
            "unit_of_measurement": "mm",
            "state_class": "measurement",
            "source": "regen_pro_h delta accumulation",
        }
    )


def publish_yesterday_sensor():

    total = get_float(HELPER_YESTERDAY)
    finalized_day = state.get(f"{HELPER_YESTERDAY}.date")

    state.set(
        SENSOR_YESTERDAY,
        round(total, 2),
        {
            "friendly_name": "Regen Gestern (korrigiert)",
            "unit_of_measurement": "mm",
            "state_class": "measurement",
            "date": finalized_day,
            "source": "persisted rain_today_corrected before reset",
        }
    )


# --------------------------------------------------
# Startup
# --------------------------------------------------

@time_trigger("startup")
def raincollector_startup():

    current_day = date.today().isoformat()
    state.persist(
        HELPER_TOTAL,
        default_value=0.0,
        default_attributes={"date": current_day}
    )
    state.persist(HELPER_YESTERDAY, default_value=0.0)

    accumulator_day = state.get(f"{HELPER_TOTAL}.date")
    if accumulator_day and str(accumulator_day) != current_day:
        state.set(
            HELPER_YESTERDAY,
            round(get_float(HELPER_TOTAL), 2),
            {"date": str(accumulator_day)}
        )
        state.set(HELPER_TOTAL, 0, {"date": current_day})

    publish_sensor()
    publish_yesterday_sensor()

    log_rain.info(
        f"[STARTUP] rain_today={get_float(HELPER_TOTAL)}"
    )


# --------------------------------------------------
# Delta Accumulation
# --------------------------------------------------

@state_trigger("sensor.regen_pro_h")
def rain_changed(value=None, old_value=None):

    try:
        current = float(value)
        previous = float(old_value)

    except Exception:
        return

    delta = round(current - previous, 3)

    if delta <= 0:
        return

    total = get_float(HELPER_TOTAL)

    total += delta

    state.set(
        HELPER_TOTAL,
        round(total, 2),
        {"date": date.today().isoformat()}
    )

    publish_sensor()

    log_rain.info(
        f"[RAIN] {previous} -> {current} "
        f"delta={delta} total={round(total,2)}"
    )


# --------------------------------------------------
# Daily Reset
# --------------------------------------------------

@time_trigger("cron(0 0 * * *)")
def reset_daily():

    total = get_float(HELPER_TOTAL)

    log_rain.info(
        f"[RESET] final rain_today={total}"
    )

    finalized_day = state.get(f"{HELPER_TOTAL}.date")
    if not finalized_day:
        finalized_day = (date.today() - timedelta(days=1)).isoformat()

    state.set(
        HELPER_YESTERDAY,
        round(total, 2),
        {"date": finalized_day}
    )
    publish_yesterday_sensor()

    state.set(
        HELPER_TOTAL,
        0,
        {"date": date.today().isoformat()}
    )
    publish_sensor()
