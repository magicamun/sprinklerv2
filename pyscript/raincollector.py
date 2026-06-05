import logging

log_rain = logging.getLogger("pyscript.raincollector")

RAIN_SOURCE = "sensor.regen_pro_h"

HELPER_TOTAL = "input_number.rain_today_corrected"
SENSOR_TOTAL = "sensor.regen_mm_heute_korrigiert"

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


# --------------------------------------------------
# Startup
# --------------------------------------------------

@time_trigger("startup")
def raincollector_startup():

    publish_sensor()

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

    service.call(
        "input_number",
        "set_value",
        entity_id=HELPER_TOTAL,
        value=round(total, 2)
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

    service.call(
        "input_number",
        "set_value",
        entity_id=HELPER_TOTAL,
        value=0
    )

    publish_sensor()