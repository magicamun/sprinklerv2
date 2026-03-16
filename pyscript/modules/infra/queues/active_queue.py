# queues/active_queue.py
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

from typing import Dict, Optional, List
from .base_queue import BaseQueue
from .queue_entry import QueueEntry

log_active_queue           = logging.getLogger("pyscript.sprinkler.queues.active_queue")

class ActiveQueue(BaseQueue):
    """
    Runtime queue.
    Contains active lifecycle entries (UUID based).
    Controlled exclusively by Scheduler.
    """

    def __init__(self):
        super().__init__("active")

    # ---------------------------------
    # Core API
    # ---------------------------------

    def add(self, entry: QueueEntry):
        self._entries[entry.qe_id] = entry

    def get(self, qe_id: str) -> Optional[QueueEntry]:
        return self._entries.get(qe_id)

    def remove(self, qe_id: str):
        if qe_id in self._entries:
            del self._entries[qe_id]

    def exists(self, qe_id: str) -> bool:
        return qe_id in self._entries

    def all(self) -> List[QueueEntry]:
        return list(self._entries.values())

    def size(self) -> int:
        return len(self._entries)

    def clear(self):
        self._entries.clear()

    def find_by_zone(self, zone_id: int) -> QueueEntry | None:
        for entry in self._entries.values():
            if entry.zone_id == zone_id:
                return entry
        return None

    def get_by_program(self, program_id: int) -> list[QueueEntry]:
        return [
            entry
            for entry in self._entries.values()
            if entry.program_id == program_id
        ]

    def has_running_program(self, program_id: int) -> bool:
        return any(
            entry.status == "running"
            for entry in self._entries.values()
            if entry.program_id == program_id
        )
    
    def remove_by_program(self, program_id: int):

        for entry in list(self._entries.values()):

            if (
                entry.program_id == program_id
                and entry.status in ("queued", "planned")
            ):
                entry.status = "remove"

    def get_running_entries(self, program_id: int):
        return [
            entry
            for entry in self._entries.values()
            if entry.program_id == program_id
            and entry.status == "running"
        ]