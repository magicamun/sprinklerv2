from typing import TYPE_CHECKING, Any
if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any

import logging
import os
import json
import tempfile
import copy
from typing import Dict

log_zones = logging.getLogger("pyscript.sprinkler.zone_v2")

log_zones.debug("Module reloaded")

from .sprinkler_config import ZONE_FILE

ZONE_TYPES = {
    "lawn": {
        "label": "Rasen",
        "eto_factor": 1.0,
        "rain_factor": 1.0,
    },
    "bed_sun": {
        "label": "Beet (volle Sonne)",
        "eto_factor": 0.8,
        "rain_factor": 1.0,
    },
    "bed_dense": {
        "label": "Beet (dicht bewachsen)",
        "eto_factor": 0.6,
        "rain_factor": 0.6,
    },
    "pot_outdoor": {
        "label": "Topf (Regen)",
        "eto_factor": 0.5,
        "rain_factor": 0.5,
    },
    "pot_protected": {
        "label": "Topf (geschützt)",
        "eto_factor": 0.5,
        "rain_factor": 0.0,
    }
}

class ZoneStore:

    def __init__(self, file_path: str):
        self._file_path = file_path
        self._zones: Dict[int, dict] = {}
        log_zones.debug("ZoneStore initialized with file %s", file_path)

    # =========================================================
    # ACCESS
    # =========================================================
    def _normalize_zone(self, zone: dict) -> dict:
        z = copy.deepcopy(zone)

        # ------------------------
        # TYPE
        # ------------------------
        ztype = z.get("type", "lawn")
        type_defaults = ZONE_TYPES.get(ztype, ZONE_TYPES["lawn"])

        z["type"] = ztype

        # ------------------------
        # MIGRATION (alt → neu)
        # ------------------------
        if "eto_factor" not in z:
            z["eto_factor"] = z.get("zone_factor", type_defaults["eto_factor"])

        if "rain_factor" not in z:
            z["rain_factor"] = type_defaults["rain_factor"]

        # ------------------------
        # DEFAULTS (nur wenn fehlt)
        # ------------------------
        if z.get("eto_factor") is None:
            z["eto_factor"] = type_defaults["eto_factor"]

        if z.get("rain_factor") is None:
            z["rain_factor"] = type_defaults["rain_factor"]

        return z

    def all(self) -> dict[int, dict]:
        return dict(self._zones)

    def get(self, zone_id: int) -> dict | None:
        z = self._zones.get(zone_id)
        if not z:
            return None

        return self._normalize_zone(z)

    def exists(self, zone_id: int) -> bool:
        return zone_id in self._zones

    # =========================================================
    # LOAD / SAVE
    # =========================================================

    def load(self):

        if not os.path.exists(self._file_path):
            log_zones.info("Zones file not found – starting empty")
            self._zones = {}
            return

        try:
            with open(self._file_path, "r") as f:
                data = json.load(f)

            zones = data.get("zones", [])

            self._zones = {
                z["zone_id"]: z
                for z in zones
                if "zone_id" in z
            }

            log_zones.info("Loaded %d zones", len(self._zones))

        except Exception as e:
            log_zones.error("Failed to load zones: %s", e)
            self._zones = {}

    def save(self):

        data = {
            "zones": list(self._zones.values())
        }

        directory = os.path.dirname(self._file_path)
        os.makedirs(directory, exist_ok=True)

        try:
            with tempfile.NamedTemporaryFile(
                "w",
                dir=directory,
                delete=False
            ) as tmp:
                json.dump(data, tmp, indent=2)
                temp_name = tmp.name

            os.replace(temp_name, self._file_path)

            log_zones.info("Persisted %d zones", len(self._zones))

        except Exception as e:
            log_zones.error("Failed to save zones: %s", e)
            raise

    # =========================================================
    # CRUD
    # =========================================================

    def add(self, zone: dict) -> int:

        zid = zone.get("zone_id")

        if zid is None:
            log_zones.warning("Add rejected: missing zone_id")
            raise ValueError("Zone id missing")

        if zid in self._zones:
            log_zones.warning("Add rejected: zone id=%s already exists", zid)
            raise ValueError(f"Zone {zid} already exists")

        # ✅ saubere Kopie + garantiert zone_id
        z = self._normalize_zone(zone)

        self._zones[zid] = copy.deepcopy(z)
        
        log_zones.info(
            "Zone added id=%s name=%s",
            zid,
            z.get("zone_name")
        )

        return zid
        
    def update(self, zone: dict):

        zid = zone.get("zone_id")

        if zid is None:
            log_zones.warning("Update rejected: missing zone_id")
            raise ValueError("Zone id missing")

        if zid not in self._zones:
            log_zones.warning("Update rejected: zone id=%s not found", zid)
            raise ValueError(f"Zone {zid} not found")

        z = self._normalize_zone(zone)

        self._zones[zid] = copy.deepcopy(z)

        log_zones.info(
            "Zone updated id=%s name=%s",
            zid,
            z.get("name")
        )

    def delete(self, zone_id: int):

        if zone_id not in self._zones:
            log_zones.warning("Delete rejected: id=%s not found", zone_id)
            raise ValueError(f"Zone {zone_id} not found")

        deleted = self._zones[zone_id]
        del self._zones[zone_id]

        log_zones.info(
            "Zone deleted id=%s name=%s",
            zone_id,
            deleted.get("name")
        )


# =========================================================
# SINGLETON
# =========================================================

zone_store = ZoneStore(ZONE_FILE)
zone_store.load()