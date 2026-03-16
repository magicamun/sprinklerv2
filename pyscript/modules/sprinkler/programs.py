from typing import TYPE_CHECKING, Any
if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any
    Dict: Any

import logging
import os
import json
import tempfile
import copy
import random

PROGRAM_COLOR_PALETTE = [
    "#546E7A",  # blue grey
    "#7A4A00",  # brown
    "#2C1376",  # deep purple
    "#006D8F",  # teal blue
    "#77BB41",  # green
    "#8E24AA",  # purple
    "#F4511E",  # orange
    "#3949AB",  # indigo
    "#00897B",  # teal
    "#C62828",  # red
]

log_programs           = logging.getLogger("pyscript.sprinkler.programs")

log_programs.debug("Module reloaded")

from pyscript.modules.sprinkler.sprinkler_config import CONFIG_DIR, PROGRAM_FILE

class ProgramStore:
    def __init__(self, file_path: str):
        self._file_path = file_path
        self._programs: Dict[int, dict] = {}
        log_programs.debug("ProgramStore initialized with file %s", file_path)
    # =========================================================
    # ID GENERATION
    # =========================================================

    def _next_id(self) -> int:
        if not self._programs:
            return 1
        return max(self._programs) + 1

    def _next_order(self) -> int:
        if not self._programs:
            return 1
        return max(p["order"] for p in self._programs.values()) + 1
            
    def all(self) -> dict[int, dict]:
        return dict(self._programs)

    def get(self, program_id: int) -> dict | None:
        return self._programs.get(program_id)

    def exists(self, program_id: str) -> bool:
        return program_id in self._programs
    
    # -------------------------
    # Load / Save
    # -------------------------
    def load(self):
        if not os.path.exists(self._file_path):
            log_programs.info("Programs file not found – starting empty")
            self._programs = {}
            return

        try:
            with open(self._file_path, "r") as f:
                data = json.load(f)

            programs = data.get("programs", [])

            self._programs = {
                p["id"]: p
                for p in programs
                if "id" in p
            }

            log_programs.info("Loaded %d programs", len(self._programs))

        except Exception as e:
            log_programs.error("Failed to load programs: %s", e)
            self._programs = {}

    
    def save(self):
        data = {
            "programs": list(self._programs.values())
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

            log_programs.info("Persisted %d programs", len(self._programs))

        except Exception as e:
            log_programs.error("Failed to save programs: %s", e)
            raise

    def _default_program_color(self) -> str:

        used = {
            p.get("color")
            for p in self._programs.values()
            if p.get("color")
        }

        available = [
            c for c in PROGRAM_COLOR_PALETTE
            if c not in used
        ]

        if available:
            return random.choice(available)

        return random.choice(PROGRAM_COLOR_PALETTE)
    
    # -------------------------
    # CRUD
    # -------------------------

    def add(self, program: dict) -> int:

        pid = self._next_id()

        ordered = copy.deepcopy(program)
        ordered["program_id"] = pid

        if not ordered.get("color"):
            ordered["color"] = self._default_program_color()

        self._programs[pid] = ordered

        log_programs.info("Program added id=%s name=%s",
                pid,
                program.get("name"))

        return pid

    def update(self, program: dict):

        pid = program.get("id")

        if pid is None:
            log_programs.warning("Update rejected: missing id")
            raise ValueError("Program id missing")

        if pid not in self._programs:
            log_programs.warning("Update rejected: program id=%s not found", pid)
            raise ValueError(f"Program {pid} not found")

        # id absichern (falls UI Unsinn macht)
        existing = self._programs[pid]

        # falls du später ein order-Feld hast:
        preserved_fields = {}

        if "order" in existing:
            preserved_fields["order"] = existing["order"]

        updated = copy.deepcopy(program)

        # geschützte Felder zurückschreiben
        for k, v in preserved_fields.items():
            updated[k] = v

        self._programs[pid] = updated

        log_programs.info("Program updated id=%s name=%s",
                pid,
                updated.get("name"))

    def delete(self, program_id: int):

        if program_id not in self._programs:
            log_programs.warning("Delete rejected: id=%s not found", program_id)
            raise ValueError(f"Program {program_id} not found")

        deleted = self._programs[program_id]
        del self._programs[program_id]

        log_programs.info("Program deleted id=%s name=%s",
                program_id,
                deleted.get("name"))


# Singleton-Instanz hier erzeugen
program_store = ProgramStore(PROGRAM_FILE)
program_store.load()