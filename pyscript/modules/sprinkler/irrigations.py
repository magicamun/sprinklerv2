from typing import TYPE_CHECKING, Any
import datetime

if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any

from .sprinkler_config import SENSOR_SOIL_KIND, SENSOR_DEFICIT_KIND

class IrrigationStore:

    def __init__(self):
        self._zones: dict[int, dict] = {}
        self._dirty: set[int] = set()

    def set(self, zone_id: int, soil: float, deficit: float):
        self._zones[zone_id] = {
            SENSOR_SOIL_KIND: float(soil),
            SENSOR_DEFICIT_KIND: float(deficit),
        }
        self._dirty.add(zone_id)

    def get(self, zone_id: int) -> dict | None:
        return self._zones.get(zone_id)

    def get_soil(self, zone_id: int) -> float:
        return self._zones.get(zone_id, {}).get(SENSOR_SOIL_KIND, 0.0)

    def get_deficit(self, zone_id: int) -> float:
        return self._zones.get(zone_id, {}).get(SENSOR_DEFICIT_KIND, 0.0)

    def update_soil(self, zone_id: int, soil: float):
        if zone_id not in self._zones:
            self._zones[zone_id] = {}
        self._zones[zone_id][SENSOR_SOIL_KIND] = float(soil)
        self._dirty.add(zone_id)

    def update_deficit(self, zone_id: int, deficit: float):
        if zone_id not in self._zones:
            self._zones[zone_id] = {}
        self._zones[zone_id][SENSOR_DEFICIT_KIND] = float(deficit)
        self._dirty.add(zone_id)
        
    def all(self):
        return dict(self._zones)

    def pop_dirty(self):
        dirty = set(self._dirty)
        self._dirty.clear()
        return dirty
