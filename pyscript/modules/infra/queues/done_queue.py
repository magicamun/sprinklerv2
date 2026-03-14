# queues/done_queue.py
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any


from typing import List
import logging
import os
import json
import datetime

log_done_queue           = logging.getLogger("pyscript.sprinkler.queues.done_queue")

from pyscript.modules.sprinkler.sprinkler_config import done_file

from .queue_entry import QueueEntry


class DoneQueue:
    """
    Append-only history queue.
    Internally list-based.
    Not derived from BaseQueue on purpose.
    """

    def __init__(self, file_path: str):
        self._entries: List[QueueEntry] = []
        self._file_path = file_path

    # -------------------------------------------------
    # Load existing history
    # -------------------------------------------------
    #
    #def load_from_list(self, entries: list[dict]):
    #    self._entries = [QueueEntry.from_dict(e) for e in entries]

    def append(self, entry: QueueEntry):
        self._entries.append(entry)
        self._persist_done_entry(entry)

    # -------------------------------------------------
    # Done-Queue Helper (Serialize, Deserialize)
    # -------------------------------------------------
    def _serialize_entry(self, entry: dict) -> dict:
        out = {}
        for k, v in entry.items():
            if isinstance(v, datetime.datetime):
                out[k] = v.isoformat()
            else:
                out[k] = v
        return out

    def _deserialize_entry(self, data: dict) -> dict:
        out = {}
        for k, v in data.items():
            if isinstance(v, str):
                try:
                    # nur ISO-Datetimes werden zurückverwandelt
                    out[k] = datetime.datetime.fromisoformat(v)
                    continue
                except ValueError:
                    pass
            out[k] = v
        return out
    
    # -------------------------------------------------
    # Load Done-Queue
    # -------------------------------------------------
    def load(self):
        if not os.path.exists(self._file_path):
            return

        fd = os.open(self._file_path, os.O_RDONLY)
        size = os.path.getsize(self._file_path)
        data = os.read(fd, size).decode("utf-8")
        os.close(fd)

        loaded = 0

        for line in data.splitlines():
            if not line.strip():
                continue

            try:
                raw = json.loads(line)
                entry = QueueEntry.from_dict(raw)
                self._entries.append(entry)
                loaded += 1
            except Exception:
                pass

        log_done_queue.info(f"DoneQueue loaded {loaded} entries")

    # -------------------------------------------------
    # Persist Done Entries
    # -------------------------------------------------
    def _persist_done_entry(self, entry: QueueEntry):
        json_str = json.dumps(self._serialize_entry(entry.to_dict())) + "\n"

        fd = os.open(self._file_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        os.write(fd, json_str.encode("utf-8"))
        os.close(fd)

    # -------------------------------------------------
    # Public API (Queue-like Interface)
    # -------------------------------------------------

    def all(self) -> List[dict]:
        return list(self._entries)

    def size(self) -> int:
        return len(self._entries)

    def clear(self):
        """
        Only clears memory.
        Does NOT wipe file.
        """
        self._entries = []