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
from typing import Dict, List

log_zones = logging.getLogger("pyscript.sprinkler.zone_v2")

log_zones.warning("Module reloaded")

from .sprinkler_config import CONFIG_DIR

ZONES_FILE = f"{CONFIG_DIR}/zonesv2.json"

class ZoneStore:

    def __init__(self, file_path: str):
        self._file_path = file_path
        self._zones: Dict[int, dict] = {}
        log_zones.debug("ZoneStore initialized with file %s", file_path)

    # =========================================================
    # ID GENERATION
    # =========================================================

    def _next_id(self) -> int:
        if not self._zones:
            return 1
        return max(self._zones.keys()) + 1

    # =========================================================
    # ACCESS
    # =========================================================

    def all(self) -> dict[int, dict]:
        return dict(self._zones)

    def get(self, zone_id: int) -> dict | None:
        return self._zones.get(zone_id)

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

        ordered_zone = {
            "zone_id": zid
        }

        for key, value in zone.items():
            ordered_zone[key] = copy.deepcopy(value)

        self._zones[zid] = ordered_zone

        log_zones.info(
            "Zone added id=%s name=%s",
            zid,
            zone.get("name")
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

        updated = copy.deepcopy(zone)

        self._zones[zid] = updated

        log_zones.info(
            "Zone updated id=%s name=%s",
            zid,
            updated.get("name")
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

zone_store = ZoneStore(ZONES_FILE)
zone_store.load()