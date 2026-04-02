
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    state: Any
    switch: Any
    sensor: Any
    light: Any
    task: Any
    service: Any
    time_trigger: Any

# ------------------------------------------------
# Python
# ------------------------------------------------
import logging
import datetime
import copy
from datetime import date as dt_date, timedelta

# ------------------------------------------------
# Home Assistant / pyscript
# ------------------------------------------------
from homeassistant.util import dt as dt_util

# ------------------------------------------------
# Infra
# ------------------------------------------------
from pyscript.modules.infra.store.hydrostore import hydro_store
from pyscript.modules.util.datetime_utils import aware_now

# ------------------------------------------------
# Sprinkler modules
# ------------------------------------------------
from pyscript.modules.sprinkler.zones import zone_store
from pyscript.modules.sprinkler.programs import program_store
from pyscript.modules.sprinkler.events import SprinklerEvents
from pyscript.modules.sprinkler.scheduler import SprinklerCore, HardwareAdapter
from pyscript.modules.sprinkler.context import SchedulerContext

# ------------------------------------------------
# Sprinkler Configuration
# ------------------------------------------------
from pyscript.modules.sprinkler.sprinkler_config import (
    SENSOR_PREFIX_PROGRAMS, SENSOR_PREFIX_ZONE, 
    SENSOR_TIMELINE, SENSOR_PROGRAMS_DEBUG,
    SENSOR_DEFICIT_KIND, SENSOR_SOIL_KIND, DEFAULT_SOIL_MM, DEFAULT_DEFICIT_MM, INPUT_SOIL_CAPACITY, INPUT_SOIL_OPTIMAL,
    DONE_FILE
)

log_sprinkler           = logging.getLogger("pyscript.sprinkler.sprinkler")
log_projections         = logging.getLogger("pyscript.sprinkler.projections")
log_ui                  = logging.getLogger("pyscript.sprinkler.ui")
log_irrigation          = logging.getLogger("pyscript.sprinkler.irrigation")

log_sprinkler.debug("Sprinkler - Startup")

sprinkler_ready = False
sprinkler_scheduler_task = None
sprinkler_scheduler_running = None
scheduler_context = SchedulerContext(None, {}, {})

class HAHardwareAdapter(HardwareAdapter):

    async def turn_on(self, entity_id: str):
        if state.get("input_boolean.sprinkler_hw_simulation") == "on":
            log_sprinkler.info(f"[HW-SIM] Would turn ON {entity_id}")
            return

        switch.turn_on(entity_id=entity_id)

    async def turn_off(self, entity_id: str):
        if state.get("input_boolean.sprinkler_hw_simulation") == "on":
            log_sprinkler.info(f"[HW-SIM] Would turn OFF {entity_id}")
            return

        switch.turn_off(entity_id=entity_id)

hardware = HAHardwareAdapter()


sprinkler_core = SprinklerCore(hardware, DONE_FILE)

# -------------- isAdmin ---------------
def safe_float(entity_id: str, default: float = 0.0) -> float:
    value = state.get(entity_id)

    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def isAdmin(user_id: str) -> bool:
    log_ui.debug(f"User-Id {user_id} is Admin?")
    return True

def sprinkler_is_active():
    val = state.get("input_boolean.sprinkler_scheduler_aktiv")
    if val is None:
        return False
    return str(val).lower() == "on"

def get_capacity():
    try:
        val = state.get("input_number.sprinkler_capacity")
        if val is None:
            return 1
        return int(float(val))
    except Exception as e:
        log_sprinkler.warning(f"Invalid capacity value: {val} ({e})")
        return 1

def zone_entity(zone_id: int) -> str:
    return f"{SENSOR_PREFIX_ZONE}_{zone_id:02d}"

def zone_remaining_entity(zone_id: int) -> str:
    return f"{SENSOR_PREFIX_ZONE}_{zone_id:02d}_remaining"

def duration_to_seconds(value, default=60):
    """
    Wandelt duration in Sekunden um.
    Erlaubt:
      - int (Sekunden)
      - "HH:MM:SS"
      - "MM:SS"
    """
    if value is None:
        return default

    if isinstance(value, int):
        return value

    if isinstance(value, str):
        try:
            parts = [int(p) for p in value.split(":")]
            if len(parts) == 3:
                h, m, s = parts
            elif len(parts) == 2:
                h, m, s = 0, parts[0], parts[1]
            else:
                raise ValueError
            return h * 3600 + m * 60 + s
        except Exception:
            raise ValueError(f"Ungültige duration: {value}")

    raise ValueError(f"Ungültiger duration-Typ: {type(value)}")

# -------------- Event helper ---------------
def fire_ui_event(
    context,
    *,
    action: str,
    status: str,
    code: str,
    entity_type: str = None,
    entity_id: int = None,
    request_id: str = None,
    data: dict = None,
):
    payload = {
        "action": action,
        "status": status,  # success | error | info
        "code": code,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "request_id": request_id,
        "user_id": context.user_id if context else None,
    }

    if data:
        payload["data"] = data

    event.fire("sprinkler_ui_feedback", **payload)

def ui_success(
    context,
    *,
    action: str,
    code: str,
    entity_type: str = None,
    entity_id: int = None,
    request_id: str = None,
    **data,
):
    fire_ui_event(
        context,
        action=action,
        status="success",
        code=code,
        entity_type=entity_type,
        entity_id=entity_id,
        request_id=request_id,
        data=data or None,
    )

def ui_error(
    context,
    *,
    action: str,
    code: str,
    entity_type: str = None,
    entity_id: int = None,
    request_id: str = None,
    **data,
):
    fire_ui_event(
        context,
        action=action,
        status="error",
        code=code,
        entity_type=entity_type,
        entity_id=entity_id,
        request_id=request_id,
        data=data or None,
    )

def ui_info(
    context,
    *,
    action: str,
    code: str,
    entity_type: str = None,
    entity_id: int = None,
    request_id: str = None,
    **data,
):
    fire_ui_event(
        context,
        action=action,
        status="info",
        code=code,
        entity_type=entity_type,
        entity_id=entity_id,
        request_id=request_id,
        data=data or None,
    )

def fire_internal(event_name: str, **data):
    event.fire(event_name, **data)

def programs_changed(action: str, program_id: int):
    fire_internal(
        SprinklerEvents.Internal.PROGRAMS_CHANGED,
        action=action,
        program_id=program_id
    )

# -------------- Services Program -----------
@service
def sprinkler_ui_program_add(program: dict = None, request_id: str = None, context=None):

    try:
        if not program:
            raise ValueError("Missing program payload")

        pid = program_store.add(program)
        program_store.save()
        sprinkler_core.add_program(pid)

        project_all_programs(program_store, sprinkler_core)
        project_timeline()

        ui_success(
            context,
            action      = "add",
            code        = SprinklerEvents.Program.ADDED,
            entity_type = "program",
            entity_id   = pid,
            request_id  = request_id
        )      
        return {"program_id": pid}

    except Exception as e:
        ui_error(
                context,
                action      = "add",
                code        =  SprinklerEvents.Program.NOT_ADDED,
                entity_type = "program",
                entity_id   = program.get("id") if program else None,
                request_id  = request_id,
                message     = str(e),
            )
        raise

@service
def sprinkler_ui_program_update(program=None, request_id: str = None, context=None):

    try:
        if not program:
            raise ValueError("Missing program payload")

        program_store.update(program)
        program_store.save()
        sprinkler_core.update_program(program.get("id"))
        project_all_programs(program_store, sprinkler_core)
        project_timeline()

        ui_success(
            context,
            action      = "update",
            code        = SprinklerEvents.Program.UPDATED,
            entity_type = "program",
            entity_id   = program.get("id"),
            request_id  = request_id
        )

        return {"program_id": program.get("id")}
    
    except Exception as e:
        ui_error(
                context,
                action      = "update",
                code        =  SprinklerEvents.Program.NOT_UPDATED,
                entity_type = "program",
                entity_id   = program.get("id") if program else None,
                request_id  = request_id,
                message     = str(e),
            )
        raise

@service
def sprinkler_ui_program_delete(program_id=None, request_id: str = None, context=None):

    try:
        if program_id is None:
            raise ValueError("Missing program_id")

        if not program_store.exists(program_id):
            raise ValueError(f"Program {program_id} not found")

        program_store.delete(program_id)
        sprinkler_core.delete_program(program_id)
        program_store.save()

        project_all_programs(program_store, sprinkler_core)
        project_timeline()

        ui_success(
            context,
            action      = "deleted",
            code        = SprinklerEvents.Program.DELETED,
            entity_type = "program",
            entity_id   = program_id,
            request_id  = request_id
        )

        return {"program_id": program_id}
    
    except Exception as e:
        ui_error(
                context,
                action      = "delete",
                code        =  SprinklerEvents.Program.NOT_DELETED,
                entity_type = "program",
                entity_id   = program_id,
                request_id  = request_id,
                message     = str(e),
            )
        raise

@service
def sprinkler_ui_program_start(program_id=None, request_id: str = None, context=None):

    try:
        if program_id is None:
            raise ValueError("Missing program_id")

        if not program_store.exists(program_id):
            raise ValueError(f"Program {program_id} not found")

        sprinkler_core.start_program_now(program_id)

        # 🔁 Projektionen aktualisieren
        project_all_programs(program_store, sprinkler_core)
        project_timeline()

        ui_success(
            context,
            action      = "started",
            code        = SprinklerEvents.Program.STARTED,
            entity_type = "program",
            entity_id   = program_id,
            request_id  = request_id
        )

        return {"program_id": program_id}

    except Exception as e:

        ui_error(
            context,
            action      = "start",
            code        = SprinklerEvents.Program.NOT_STARTED,
            entity_type = "program",
            entity_id   = program_id,
            request_id  = request_id,
            message     = str(e),
        )

        raise

@service
def sprinkler_ui_program_stop(program_run_id: str, request_id: str = None, context=None):

    log_sprinkler.info(f"UI Stop Program Run {program_run_id}")

    queue = sprinkler_core.active_queue

    entries = [
        e for e in queue.all()
        if e.program_run_id == program_run_id
    ]

    if not entries:
        ui_error(
            context,
            action="stop_program",
            code=SprinklerEvents.Program.NOT_RUNNING,
            entity_type="program_run",
            run_id=program_run_id,
            request_id=request_id
        )
        return

    ok = sprinkler_core.request_cancel_program_run(program_run_id)

    # 🔁 Projektionen aktualisieren
    project_all_programs(program_store, sprinkler_core)
    project_timeline()

    if not ok:
        ui_error(
            context,
            action="stop_program",
            code=SprinklerEvents.Program.NOT_STOPPED,
            entity_type="program_run",
            run_id=program_run_id,
            request_id=request_id
        )
        return

    program_id = entries[0].program_id

    ui_success(
        context,
        action="stop_program",
        code=SprinklerEvents.Program.STOPPED,
        entity_type="program_run",
        entity_id=program_id,
        run_id=program_run_id,
        request_id=request_id
    )

@service
def sprinkler_ui_program_skip(program_id: int, request_id: str = None, context=None):

    log_sprinkler.info(f"UI Skip Program Run {program_id}")

    queue = sprinkler_core.active_queue

    entries = [
        e for e in queue.all()
        if e.program_id == program_id
    ]

    if not entries:
        ui_error(
            context,
            action="skip_program",
            code=SprinklerEvents.Program.NOT_QUEUED,
            entity_type="program_id",
            entity_id=program_id,
            request_id=request_id
        )
        return

    ok = sprinkler_core.request_skip_program_run(program_id)

    # 🔁 Projektionen aktualisieren
    project_all_programs(program_store, sprinkler_core)
    project_timeline()

    if not ok:
        ui_error(
            context,
            action="skip_program",
            code=SprinklerEvents.Program.NOT_SKIPPED,
            entity_type="program_run",
            entity_id=program_id,
            request_id=request_id
        )
        return

    program_id = entries[0].program_id

    ui_success(
        context,
        action="stop_program",
        code=SprinklerEvents.Program.SKIPPED,
        entity_type="program",
        entity_id=program_id,
        request_id=request_id
    )

# -------------- Services Zones -----------
@service
def sprinkler_ui_zone_add(zone: dict = None, request_id: str = None, context=None):

    user_id = context.user_id if context else None
    log_sprinkler.info(f"[ZONE] user {user_id} requested add: {zone}")

    try:
        if not zone:
            raise ValueError("Missing zone payload")

        if zone.get("zone_id") is None:
            zone_id = max(zone_store._zones.keys(), default=0) + 1
        else:
            zone_id = zone.get("zone_id")

        if zone_id is None:
            raise ValueError("Zone id missing")

        if zone_id in zone_store._zones:
            raise ValueError(f"Zone {zone_id} already exists")

        # Defaultwerte absichern
        new_zone = {
            "zone_id": zone_id,
            "name": zone.get("name", f"Zone {zone_id}"),
            "switch": zone.get("switch"),
            "default_duration": zone.get("default_duration", 600),
            "enabled": zone.get("enabled", True),
            "load": zone.get("load", 1),
            "precipitation_rate_mm_per_hour": zone.get("precipitation_rate_mm_per_hour", 10),
            "zone_factor": zone.get("zone_factor", 1.0),
        }

        if not new_zone["switch"]:
            raise ValueError("Switch missing")

        zone_store.add(new_zone)
        zone_store.save()
        
        sprinkler_core.manual_owner.on_zone_added(new_zone)

        project_all_zones(zone_store)

        #event.fire(
        #    "sprinkler_ui_feedback",
        #    request_id=request_id,
        #    user_id=user_id,
        #    code="zone_added",
        #    data={"zone_id": zone_id},
        #)
        ui_success(
            context,
            action      = "add",
            code        = SprinklerEvents.Zone.ADDED,
            entity_type = "zone",
            entity_id   = zone_id,
            request_id  = request_id
        )

    except Exception as e:
        log_sprinkler.error(f"[ZONE ADD] failed: {e}")
        ui_error(
            context,
            action      = "add",
            code        = SprinklerEvents.Zone.NOT_ADDED,
            entity_type = "zone",
            entity_id   = new_zone.get("zone_id") if new_zone else None,
            request_id  = request_id,
            message     = str(e),
        )

        #event.fire(
        #    "sprinkler_ui_feedback",
        #    request_id=request_id,
        #    user_id=user_id,
        #    code="zone_add_failed",
        #    data={"error": str(e)},
        #)

@service
def sprinkler_ui_zone_update(zone: dict = None, request_id: str = None, context=None):

    user_id = context.user_id if context else None
    log_sprinkler.info(f"[ZONE] user {user_id} requested update: {zone}")

    try:
        if not zone:
            raise ValueError("Missing zone payload")

        zone_id = zone.get("zone_id")

        if zone_id is None:
            raise ValueError("Zone id missing")

        if not zone_store.exists(zone_id):
            raise ValueError(f"Zone {zone_id} not found")

        # 🔥 Nur Store anfassen
        zone_store.update(zone)
        zone_store.save()

        sprinkler_core.manual_owner.on_zone_updated(zone)

        # 🔥 Sensor neu publishen (keine Queue!)
        project_all_zones(zone_store)

        ui_success(
            context,
            action      = "update",
            code        = SprinklerEvents.Zone.UPDATED,
            entity_type = "zone",
            entity_id   = zone_id,
            request_id  = request_id
        )

        return {"zone_id": zone_id}

    except Exception as e:

        ui_error(
            context,
            action      = "update",
            code        = SprinklerEvents.Zone.NOT_UPDATED,
            entity_type = "zone",
            entity_id   = zone.get("zone_id") if zone else None,
            request_id  = request_id,
            message     = str(e),
        )

        raise

@service
def sprinkler_ui_zone_delete(zone_id: int = None, request_id: str = None, context=None):
    user_id = context.user_id if context else None

    if not isAdmin(user_id):
        ui_error(
            context,
            action="delete_zone",
            code=SprinklerEvents.User.NOT_ADMIN,
            entity_type="user",
            entity_id=user_id,
            request_id=request_id
        )
        return

    if zone_id is None:
        ui_error(
            context,
            action="delete_zone",
            code=SprinklerEvents.Zone.INVALID_PAYLOAD,
            entity_type="zone",
            entity_id="",
            request_id=request_id
        )
        return

    zone = zone_store.get(zone_id)

    if zone is None:
        ui_error(
            context,
            action="delete_zone",
            code=SprinklerEvents.Zone.NOT_FOUND,
            entity_type="zone",
            entity_id=zone_id,
            request_id=request_id
        )
        return

    # -------------------------------------------------
    # 1️⃣ Store löschen
    # -------------------------------------------------
    remove_zone_states(zone_id)
    zone_store.delete(zone_id)
    zone_store.save()


    # -------------------------------------------------
    # 2️⃣ Manual Queue synchronisieren
    # -------------------------------------------------

    sprinkler_core.manual_owner.on_zone_deleted(zone_id)

    # -------------------------------------------------
    # 3️⃣ Projektion aktualisieren
    # -------------------------------------------------

    project_all_zones(zone_store)

    # -------------------------------------------------
    # 4️⃣ UI Erfolg
    # -------------------------------------------------

    ui_success(
        context,
        action="delete_zone",
        code=SprinklerEvents.Zone.DELETED,
        entity_type="zone",
        entity_id=zone_id,
        request_id=request_id
    )

@service
def sprinkler_ui_reset_soil(zone_id: int, request_id: str = None, context=None):

    optimal = float(state.get("input_number.soil_optimal_mm") or 0)

    zone_key = f"zone:{zone_id}"
    today = dt_date.today()

    hydro_store.write(zone_key, "soil_mm", "manual", "user_reset", optimal, today)
    hydro_store.write(zone_key, "soil_mm", "derived", "model", optimal, today)

    ui_success(
        context,
        action="reset_soil",
        code=SprinklerEvents.Zone.SOIL_RESET,
        entity_type="zone",
        entity_id=zone_id,
        request_id=request_id
    )

    log_irrigation.info(f"[SOIL] Zone {zone_id} reset → soil={optimal}")

# ---------- Services Queue - Actions Sart, Cancel, Extend ----------
@service
def sprinkler_ui_start_zone(qe_id: str, duration: int = None, request_id: str = None, context=None):
    owner = sprinkler_core.manual_owner
    queue = sprinkler_core.manual_queue

    log_sprinkler.info(f"UI Start Zone {qe_id}")

    entry = queue.get(qe_id)
    # entry = queue.get(str(zone_id))  # qe_id ist str(zone_id)

    if not entry:
        ui_error(
            context,
            action="start_zone",
            code=SprinklerEvents.Zone.NOT_FOUND,
            entity_type="qe",
            entity_id=qe_id,
            request_id=request_id
        )
        return

    # ---------------------------------
    # Dauer vorbereiten
    # ---------------------------------

    if duration is not None:
        duration_seconds = duration_to_seconds(duration, entry.planned_duration)
        entry.planned_duration = duration_seconds
        entry.scheduled_duration = duration_seconds
        entry.remaining = duration_seconds

    # ---------------------------------
    # Owner entscheidet über Start
    # ---------------------------------

    ok = owner.request_start(entry.zone_id)

    if not ok:
        ui_error(
            context,
            action="start_zone",
            code=SprinklerEvents.Zone.NOT_QUEUED,
            entity_type="zone",
            entity_id=entry.zone_id,
            request_id=request_id
        )
        return

    # ---------------------------------
    # UI Feedback
    # ---------------------------------

    ui_success(
        context,
        action="start_zone",
        code=SprinklerEvents.Zone.STARTED,
        entity_type="zone",
        entity_id=entry.zone_id,
        request_id=request_id,
        duration=entry.planned_duration
    )

@service
def sprinkler_ui_cancel_zone(qe_id: str, request_id: str = None, context=None):
    log_sprinkler.info(f"UI Cancel Zone {qe_id}")
        
    queue = sprinkler_core.active_queue

    entry = queue.get(qe_id)

    if not entry:
        ui_error(
            context,
            action="cancel_zone",
            code=SprinklerEvents.Zone.NOT_QUEUED,
            entity_type="qe",
            entity_id=qe_id,
            request_id=request_id
        )
        return

    ok = sprinkler_core.request_cancel_qe(qe_id)

    if not ok:
        ui_error(
            context,
            action="cancel_zone",
            code=SprinklerEvents.Zone.NOT_CANCELLED,
            entity_type="zone",
            entity_id=entry.zone_id,
            request_id=request_id
        )
        return

    ui_success(
        context,
        action="cancel_zone",
        code=SprinklerEvents.Zone.CANCELLED,
        entity_type="zone",
        entity_id=entry.zone_id,
        request_id=request_id
    )

@service
def sprinkler_ui_extend_zone(qe_id: int, duration: int = None, request_id: str = None, context=None):
    log_sprinkler.info(f"UI Extend Zone {qe_id}")
    queue = sprinkler_core.active_queue

    entry = queue.get(qe_id)
    if not entry:
        ui_error(
            context,
            action="extend_zone",
            code=SprinklerEvents.Zone.NOT_QUEUED,
            entity_type="qe",
            entity_id=qe_id,
            request_id=request_id
        )
        return
    log_sprinkler.info(f"UI Extend Zone {entry.zone_id} → {duration}")

    if duration is None or duration <= 0:
        ui_error(
            context,
            action="extend_zone",
            code=SprinklerEvents.Zone.INVALID_PAYLOAD,
            entity_type="zone",
            entity_id=entry.zone_id,
            request_id=request_id
        )
        return

    # -------------------------
    # Active Entry finden
    # -------------------------
    entry = None

    for e in sprinkler_core.active_queue.all():
        if e.qe_id == qe_id:
            entry = e
            break

    if not entry:
        ui_error(
            context,
            action="extend_zone",
            code=SprinklerEvents.Zone.NOT_FOUND,
            entity_type="zone",
            entity_id=entry.zone_id,
            request_id=request_id
        )
        return

    if entry.status not in ("running", "queued"):
        ui_error(
            context,
            action="extend_zone",
            code=SprinklerEvents.Zone.IGNORED,
            entity_type="zone",
            entity_id=entry.zone_id,
            request_id=request_id
        )
        return

    now = aware_now()

    # -------------------------------------------------
    # RUNNING
    # -------------------------------------------------
    if entry.status == "running":
        entry.scheduled_end = now + timedelta(seconds=duration)
        entry.scheduled_duration = duration
        entry.remaining = duration

    # -------------------------------------------------
    # QUEUED
    # -------------------------------------------------
    elif entry.status == "queued":

        entry.scheduled_duration = duration

        if entry.scheduled_start:
            entry.scheduled_end = (
                entry.scheduled_start +
                timedelta(seconds=duration)
            )

    # Scheduler tick übernimmt Rest

    ui_success(
        context,
        action="extend_zone",
        code=SprinklerEvents.Zone.EXTENDED,
        entity_type="zone",
        entity_id=entry.zone_id,
        request_id=request_id,
        duration=duration
    )

# ---------------------------------------- Projections
def project_sprinkler_core():
    state.set(f"sensor.sprinkler_used", sprinkler_core.used,
              attributes={
                  "friendly_name": "Last"
              }
            )
# ---------- PROGRAMS ----------
def project_all_programs(program_store, sprinkler_core):

    programs_dict = program_store.all()

    projected_programs = []

    for program in programs_dict.values():
        runtime = sprinkler_core.get_program_runtime_state(program["id"])

        projected_programs.append({
            **program,      # Stammdaten
            "runtime": runtime
        })

    state.set(
        SENSOR_PREFIX_PROGRAMS,
        len(projected_programs),
        {
            "programs": projected_programs,
            "updated_at": aware_now().isoformat()
        }
    )

def program_queue_debug():

    blocks_data = []

    for block in sprinkler_core.program_queue.all_blocks():

        block_dict = {
            "program_id": block.program_id,
            "program_name": block.program_name,
            "policy": block.policy,
            "mode": block.mode,
            "weekdays": block.weekdays,
            "schedule": block.schedule,

            "day": block.day.isoformat(),
            "anchor": block.anchor.isoformat(),
            "planned_at": block.planned_at.isoformat(),

            "entries": []
        }

        for e in block.entries:

            block_dict["entries"].append({
                "zone_id": e.zone_id,
                "zone_name": e.zone_name,
                "load": e.load,
                "slot": e.slot,
                "status": e.status,
                "planned_start": str(e.planned_start),
                "planned_end": str(e.planned_end),
                "scheduled_start": str(e.scheduled_start),
                "scheduled_end": str(e.scheduled_end),
                "duration": e.planned_duration,
            })

        blocks_data.append(block_dict)

    state.set(
        SENSOR_PROGRAMS_DEBUG,
        "planned",
        {
            "sun_times": sprinkler_core.sun_times,
            "capacity": get_capacity(),
            "block_count": len(blocks_data),
            "blocks": blocks_data,
        }
    )
        
# ---------- ZONES, ManualQueue ----------

def build_zone_attributes(zone: dict):
    return {
        "zone_id": zone["zone_id"],
        "qe_id" : zone["zone_id"],
        "name": zone["name"],
        "switch": zone["switch"],
        "default_duration": zone.get("default_duration"),
        "enabled": zone.get("enabled", True),
        "load": zone.get("load", 1),
        "precipitation_rate_mm_per_hour": zone.get("precipitation_rate_mm_per_hour"),
        "zone_factor": zone.get("zone_factor", 1.0),
    }

def project_qe(entry):
    zone_id = entry.zone_id
    zone = zone_store.get(zone_id)

    if not zone:
        return

    remaining_entity = zone_remaining_entity(zone_id)

    # -------------------------
    # State
    # -------------------------
    zone_id = entry.zone_id
    zone_key = f"zone:{zone_id}"

    entity_id = f"{SENSOR_PREFIX_ZONE}_{zone_id:02d}"

    attributes = entry.to_dict()
    
    # 👇 DAS ist dein Fix
    attributes["zone"] = copy.deepcopy(zone)

    optimal = safe_float(INPUT_SOIL_OPTIMAL, 0)

    soil = hydro_store.get(zone_key, "soil_mm", "derived", "model") or 0
    deficit = max(0, optimal - soil)

    attributes.update({"soil_mm": round(soil, 2), "deficit_mm": round(deficit, 2)})

    # -------------------------
    # Set State
    # -------------------------
    state.set(
        entity_id,
        entry.status,
        attributes
    )
    # -------------------------
    # Remaining separat setzen
    # -------------------------
    if entry.remaining is not None:
        state.set(remaining_entity, int(entry.remaining))

def resolve_zone_entry(zone_id: int):
    # --------------------------
    # 1) ActiveQueue prüfen
    # --------------------------
    
    for entry in sprinkler_core.active_queue.all():
        if entry.zone_id != zone_id:
            continue

        # Manuell gestartet
        if entry.source == "manual":
            return entry

        # Strict (Programm)
        #if entry.policy == "strict":
        #    if entry.status in ("running", "queued"):
        #        return entry

    # --------------------------
    # 2) Fallback → ManualQueue
    # --------------------------
    return sprinkler_core.manual_queue.get(str(zone_id))

def project_all_zones(zone_store):

    for zone_id, zone in zone_store.all().items():
        entry = resolve_zone_entry(zone_id)

        if entry is None:
            continue

        project_qe(entry)

def remove_zone_states(zone_id: int):
    """
    Neutralisiert alle zu einer Zone gehörenden States.
    Löscht sie nicht (HA kann das nicht),
    sondern setzt sie auf einen neutralen Zustand zurück.
    """

    if zone_id is None:
        return

    log_sprinkler.info(f"Reset states for deleted zone {zone_id}")

    base = f"{SENSOR_PREFIX_ZONE}_{zone_id:02d}"

    entities = [
        base,                              # Haupt-Zone
        f"{base}_remaining"                # Remaining
    ]

    for entity in entities:
        if state.exist(entity):
            if entity.endswith("_remaining"):
                state.set(entity, 0)
            elif entity.endswith("_soil_water_mm"):
                state.set(entity, 0)
            elif entity.endswith("_soil_deficit_mm"):
                state.set(entity, 0)
            else:
                # Haupt-Zone
                state.set(
                    entity,
                    "deleted",
                    {
                        "zone_id": zone_id,
                        "deleted": True,
                        "updated_at": aware_now().isoformat()
                    }
                )

def project_all_zone_charts(zone_store, hydro_store, zone_keys = None):

    from datetime import date, timedelta

    zones = zone_store.all().values()
    if zone_keys:
        zones = [z for z in zones if f"zone:{z['zone_id']}" in zone_keys]

    today = date.today()
    start = (today - timedelta(days=9)).isoformat()
    end   = (today + timedelta(days=4)).isoformat()

    for zone in zones:

        zone_id = zone["zone_id"]
        zone_key = f"zone:{zone_id}"

        soil_series = hydro_store.build_series(zone_key, "soil_mm", start=start, end=end)
        irrigation_series = hydro_store.build_series(zone_key, "irrigation_mm", start=start, end=end)

        state.set(
            f"sensor.irrigation_chart_zone_{zone_id:02d}_soil",
            0,
            {
                "unit_of_measurement": "mm",
                **soil_series
            }
        )

        state.set(
            f"sensor.irrigation_chart_zone_{zone_id:02d}_irrigation",
            0,
            {
                "unit_of_measurement": "mm",
                **irrigation_series
            }
        )


# ----------- Soil, Deficit --------------
@service  
def rebuild_soil_all():
    soil_min = scheduler_context.soil_margins.get("minimum") or 0
    soil_opt = scheduler_context.soil_margins.get("optimal") or 20
    soil_max = scheduler_context.soil_margins.get("capacity") or 30

    days = hydro_store.get_days("global")

    for day in sorted(days):
        hydro_store.compute_soil_for_day("global", soil_min, soil_opt, soil_max, day)
        for zone in zone_store.all().values():
            zone_id  = zone["zone_id"]
            zone_key = f"zone:{zone_id}"
            hydro_store.compute_soil_for_day(zone_key, soil_min, soil_opt, soil_max, day)

def apply_daily_balance_if_needed(zone_store, hydro_store):

    yesterday = (dt_date.today() - timedelta(days=1)).isoformat()
    today     = dt_date.today().isoformat()

    eto  = hydro_store.get("global", "eto_mm",  "derived", "median", yesterday) or 0
    rain = hydro_store.get("global", "rain_mm", "derived", "median", yesterday) or 0

    log_irrigation.info(f"Apply Daily Balance: ETo={eto}, Rain={rain}")

    for zone in zone_store.all().values():

        zone_id  = zone["zone_id"]
        zone_key = f"zone:{zone_id}"

        soil_capacity = safe_float(INPUT_SOIL_CAPACITY, 30)
        soil_optimal  = safe_float(INPUT_SOIL_OPTIMAL, 0)

        # ------------------------
        # GLOBAL SOIL (gestern)
        # ------------------------
        global_soil = hydro_store.get(None, "soil_mm", "derived", "median", yesterday)

        if global_soil is None:
            global_soil = soil_optimal

        # ------------------------
        # IRRIGATION (gestern)
        # ------------------------
        irrigation = hydro_store.get(zone_key, "irrigation_mm", "actual", None, yesterday) or 0

        # ------------------------
        # Compute
        # ------------------------
        new_soil = global_soil - eto + rain + irrigation
        new_soil = max(0, min(soil_capacity, new_soil))

        # 👉 wichtig: heute schreiben!
        hydro_store.write(zone_key, "soil_mm", "derived", "model", round(new_soil, 2), today)

        log_irrigation.info(
            f"Soil: old={global_soil}, new={new_soil}, "
            f"ETo={eto}, rain={rain}, irrigation={irrigation}"
        )

# ----------- Timeline -------------------

def ensure_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime.datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.datetime.fromisoformat(val)
        except Exception:
            return None
    return None

def entry_to_timeline_event(entry):
    start = None
    end = None

    status = entry.status
    
    if status == "skipped" or status == "skip":
        start = ensure_dt(entry.planned_start)
        end = ensure_dt(entry.planned_end)
    elif status == "done":
        start = ensure_dt(entry.actual_start)
        end = ensure_dt(entry.actual_end)
    elif status == "queued":
        start = ensure_dt(entry.scheduled_start)
        end = ensure_dt(entry.scheduled_end)
    elif status == "running":
        start = ensure_dt(entry.actual_start)
        end = ensure_dt(entry.scheduled_end)
    elif status == "cancelled" or status == "cancel":
        start = ensure_dt(entry.actual_start)
        if not start:
            start = ensure_dt(entry.scheduled_start)

        end = ensure_dt(entry.actual_end)
        if not end:
            end = ensure_dt(entry.scheduled_end)

    if not start or not end:
        return
    
    program = None
    if entry.program_id:
        program = {
            "id": entry.program_id,
            "name": entry.program_name or entry.program_id,
            "color": entry.program_color
        }

    return {
        "zone": {
            "id": entry.zone_id,
            "name": entry.zone_name,
            "zone_index": entry.zone_index,
            "zone_count": entry.zone_count
        },
        "program": program,
        "policy": entry.policy,
        "state": status,
        "start": start.isoformat() if start else None,
        "slot": entry.slot,
        "load": entry.load,
        "end": end.isoformat() if end else None,
        "program_color": entry.program_color,
        "program_run_index": entry.program_run_index,
        "program_run_count": entry.program_run_count
    }

def build_timeline_events():
    events = []
    for e in sprinkler_core.active_queue.all():
        ev = entry_to_timeline_event(e)
        if ev is not None:
            events.append(ev)

    for e in sprinkler_core.done_queue.all():
        ev = entry_to_timeline_event(e)
        if ev is not None:
            events.append(ev)

    return events

def project_timeline():
    events = build_timeline_events()

    state.set(
        SENSOR_TIMELINE,
        len(events),
        {
            "events": events,
            "updated_at": aware_now().isoformat(),
        }
    )

# -------------- ETo, Soil_Water, Deficit
@time_trigger("cron(05 00 * * *)") # 00:05 täglich
def irrigation_daily():
    # apply_daily_balance_if_needed(zone_store, hydro_store)
    sprinkler_core.compute_soil_all_zones(zone_store, hydro_store)

def update_soil_margins():
    soil_margins = {
        "capacity": float(state.get("input_number.soil_capacity_mm") or 30),
        "optimal": float(state.get("input_number.soil_optimal_mm") or 20),
        "minimum": float(state.get("input_number.soil_min_mm") or 5)
    }

    return soil_margins


# -------------------------
# Start and Update Sunrise/Sunset
# -------------------------
def update_sun_times():
    sunrise_state = state.get("sensor.sun_next_rising")
    sunset_state = state.get("sensor.sun_next_setting")

    sunrise = None
    sunset = None

    if sunrise_state:
        dt = datetime.datetime.fromisoformat(sunrise_state)
        sunrise = dt_util.as_local(dt)

    if sunset_state:
        dt = datetime.datetime.fromisoformat(sunset_state)
        sunset = dt_util.as_local(dt)

    log_sprinkler.info(f"sun-init: {sunrise}  {sunset}")

    sun_times = {"sunrise": sunrise, "sunset": sunset}

    return sun_times

@state_trigger("input_number.sprinkler_capacity")
def capacity_changed(value=None, old_value=None):
    if value == old_value:
        return

    log_sprinkler.info(f"[CAPA] changed {old_value} → {value}")
    # Alle QE's abbrechen (cancel) - das führt zu neuplanung im n. Tick
  
    sprinkler_core.remove_all_active()

@time_trigger("cron(10 0 * * *)")  # 00:10 täglich
def update_sun_times_daily():
    scheduler_context.sun_times = update_sun_times()

    if sprinkler_core:
        sprinkler_core.update_context(scheduler_context)

# -------------------------
# Start Core
# -------------------------
@time_trigger("startup")
def sprinkler_startup():
    scheduler_context.capacity = get_capacity()
    scheduler_context.sun_times = update_sun_times()
    scheduler_context.soil_margins = update_soil_margins()   

    if sprinkler_core:
        sprinkler_core.update_context(scheduler_context)

    # 1️⃣ Queues aufbauen

    # ----------------------------------
    # 1) Manual Queue aus Zonen aufbauen
    # ----------------------------------
    sprinkler_core.initialize_manual_queue()

    # ----------------------------------
    # 2) Done Queue laden (Historie)
    # ----------------------------------
    sprinkler_core.done_queue.load()

    # ----------------------------------
    # 3) Programm für Scheduler aufbereiten
    # ----------------------------------


    sprinkler_core.initialize_program_queue(program_store)

    # 2️⃣ erste Projektionen
    project_all_zones(zone_store)
    
    sprinkler_core.compute_soil_all_zones(zone_store, hydro_store)
    # apply_daily_balance_if_needed(zone_store, hydro_store)

    project_all_programs(program_store, sprinkler_core)
    
    project_timeline()
    # Debug Sensor
    # program_queue_debug()


    log_sprinkler.info("Scheduler Startup Done, starting Scheduler")

    sprinkler_scheduler_start() # Create the detached Task

def sprinkler_scheduler_start():
    global sprinkler_scheduler_task, sprinkler_scheduler_running

    if sprinkler_scheduler_task and not sprinkler_scheduler_task.done():
        log_sprinkler.warning("Scheduler läuft bereits")
        return

    sprinkler_scheduler_running = True
    sprinkler_scheduler_task = task.create(sprinkler_scheduler_loop())

    log_sprinkler.info("Scheduler task gestartet")

async def sprinkler_scheduler_loop():
    global sprinkler_scheduler_running

    log_sprinkler.info("Scheduler started")
    sprinkler_scheduler_running = True


    hydro_store.mark_global_dirty()

    for zone in zone_store.all().values():
        zone_id  = zone["zone_id"]
        zone_key = f"zone:{zone_id}"
        hydro_store.mark_zone_dirty(zone_key)

    try:
        while sprinkler_scheduler_running:
            is_active = sprinkler_is_active()

            scheduler_context.capacity = get_capacity()
            scheduler_context.soil_margins = update_soil_margins()
            if sprinkler_core:
                sprinkler_core.update_context(scheduler_context)

            await sprinkler_core.tick(is_active)

            dirty_global = hydro_store.consume_dirty("global", "sprinkler")
            # ------------------------
            # 1. Global → Soil
            # ------------------------
            if dirty_global:
                dirty_zones = hydro_store.consume_dirty("zones", "sprinkler")
                sprinkler_core.compute_soil_all_zones(zone_store, hydro_store)
                project_all_zone_charts(zone_store, hydro_store)

            # ------------------------
            # 2. Zone → Soil
            # ------------------------
            dirty_zones = hydro_store.consume_dirty("zones", "sprinkler")
            if dirty_zones:
                sprinkler_core.compute_soil_all_zones(zone_store, hydro_store, dirty_zones)
                dirty_zones = hydro_store.consume_dirty("zones", "sprinkler")
                project_all_zone_charts(zone_store, hydro_store, dirty_zones)
                

            project_sprinkler_core()
            project_all_zones(zone_store)
                
            project_all_programs(program_store, sprinkler_core)
            project_timeline()

            # Debug Sensor
            # program_queue_debug()
            await task.sleep(1)
    except Exception:
        log_sprinkler.exception("Scheduler tick crashed")
    finally:
        sprinkler_scheduler_running = False
        log_sprinkler.info("Scheduler stopped")
