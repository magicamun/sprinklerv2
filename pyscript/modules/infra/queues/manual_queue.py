# queues/manual_queue.py
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any
    
from .base_queue import BaseQueue
from .queue_entry import QueueEntry
from pyscript.modules.sprinkler.sprinkler_config import MANUAL_COLOR

class ManualQueue(BaseQueue):
    """
    ManualQueue:
    - One entry per zone
    - qe_id == zone_id (stringified)
    - Represents user intent layer
    """

    def __init__(self):
        super().__init__("manual")

    def create_for_zone(self, zone: dict) -> QueueEntry:
        zone_id = zone["zone_id"]

        qe = QueueEntry(
            qe_id               = str(zone_id),  # intentional duplicate
            program_id          = None,
            program_run_id      = None,
            program_name        = None,
            program_run_index   = 0,
            program_run_count   = 0,

            zone_id             = zone_id,
            zone_name           = zone.get("name", ""),
            switch              = zone.get("switch", ""),
            enabled             = zone.get("enabled", TRue),
            zone_index          = 0,
            zone_count          = 0,

            status              = "idle",
            policy              = "floating",
            load                = zone.get("load", 1),

            planned_start       = None,
            planned_end         = None,
            planned_duration    = zone.get("default_duration"),
            
            scheduled_start     = None,
            scheduled_end       = None,
            scheduled_duration  = zone.get("default_duration"),
            slot                = 0,
            
            actual_start        = None,
            actual_end          = None,
            remaining           = zone.get("default_duration"),
            source              = "manual",

            weather_enabled     = False,

            program_color       = MANUAL_COLOR 
        )

        return qe
