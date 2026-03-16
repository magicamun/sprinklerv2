import os
from pathlib import Path

# ------------------------------------------------
# Sensors
# ------------------------------------------------
SENSOR_PREFIX           = "sensor.sprinklerv2"
SENSOR_PREFIX_PROGRAMS  = f"{SENSOR_PREFIX}_programs"
SENSOR_PREFIX_ZONE      = f"{SENSOR_PREFIX}_zone"
SENSOR_SOIL_KIND        = "soil"
SENSOR_DEFICIT_KIND     = "deficit"
SENSOR_TIMELINE         = f"{SENSOR_PREFIX}_timeline"
MANUAL_COLOR            = "#546E7A"
SENSOR_PROGRAMS_DEBUG   = f"{SENSOR_PREFIX}_program_queue"

# ------------------------------------------------
# Soil model
# ------------------------------------------------
SENSOR_ETO_YESTERDAY    = "pyscript.irrigation_eto_raw_local"
SENSOR_RAIN_YESTERDAY   = "sensor.regen_mm_gestern"
INPUT_SOIL_CAPACITY     = "input_number.soil_capacity_mm"
INPUT_SOIL_OPTIMAL      = "input_number.soil_optimal_mm"
DEFAULT_SOIL_MM         = 20.0
DEFAULT_DEFICIT_MM      = 0.0

# ------------------------------------------------
# Storage
# ------------------------------------------------
CONFIG_DIR              = Path("/config/sprinkler")

DONE_QUEUE              = "done_queue.jsonl"

TODAY_FILE              = CONFIG_DIR / "irrigation_today.json"
HISTORY_FILE            = CONFIG_DIR / "irrigation_history.jsonl"

DONE_FILE               = CONFIG_DIR / "done_queue.jsonl"
ZONE_FILE               = CONFIG_DIR / "zonesv2.json"
PROGRAM_FILE            = CONFIG_DIR / "programs.json"

MAX_HISTORY_DAYS        = 28

def done_file():
    return CONFIG_DIR / DONE_QUEUE

def ensure_config_dir():
    CONFIG_DIR.mkdir(parents=True, exist_ok = True)