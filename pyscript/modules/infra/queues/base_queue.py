# queues/base_queue.py

from typing import Dict, List, Optional
from .queue_entry import QueueEntry


class BaseQueue:
    """
    Generic Queue container.
    No scheduling logic.
    No policy logic.
    Pure storage + access abstraction.
    """

    def __init__(self, name: str):
        self.name = name
        self._entries: Dict[str, QueueEntry] = {}

    # -------------------------
    # Core operations
    # -------------------------

    def add(self, qe: QueueEntry):
        self._entries[qe.qe_id] = qe

    def remove(self, qe_id: str) -> Optional[QueueEntry]:
        return self._entries.pop(qe_id, None)

    def get(self, qe_id: str) -> Optional[QueueEntry]:
        return self._entries.get(qe_id)

    def exists(self, qe_id: str) -> bool:
        return qe_id in self._entries

    def all(self) -> List[QueueEntry]:
        return list(self._entries.values())

    @property
    def entries(self) -> List[QueueEntry]:
        return list(self._entries.values())
        
    def clear(self):
        self._entries.clear()

    def size(self) -> int:
        return len(self._entries)