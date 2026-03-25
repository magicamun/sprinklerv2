
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
import datetime

from datetime import timedelta, date as dt_date

from pyscript.modules.util.datetime_utils import aware_now
from pyscript.modules.infra.queues.active_queue import ActiveQueue
from pyscript.modules.infra.queues.program_queue import ProgramQueue
from pyscript.modules.infra.queues.done_queue import DoneQueue
from pyscript.modules.infra.queues.queue_entry import QueueEntry, RuntimeReason, ForecastContribution
from pyscript.modules.infra.queues.program_block import ProgramBlock
from pyscript.modules.infra.queues.manual_queue import ManualQueue

from pyscript.modules.infra.store.hydrostore import hydro_store

from pyscript.modules.sprinkler.manual_queue_owner import ManualQueueOwner
# from pyscript.modules.sprinkler.irrigations import IrrigationStore
from pyscript.modules.sprinkler.program_engine import ProgramEngine
from pyscript.modules.sprinkler.zones import zone_store
from pyscript.modules.sprinkler.context import SchedulerContext




log_scheduler = logging.getLogger("pyscript.sprinkler.scheduler")

log_scheduler.debug("Scheduler Module loading...")

# =====================================================
# Hardware
# =====================================================
class HardwareAdapter:

    async def turn_on(self, entity_id: str):
        raise NotImplementedError

    async def turn_off(self, entity_id: str):
        raise NotImplementedError

# =====================================================
# Core
# =====================================================
class SprinklerCore():
    """
    Central runtime container.
    Holds all queues and owners.
    """

    def __init__(self, hardware, done_file_path):
        self.manual_queue = ManualQueue()
        self.manual_owner = ManualQueueOwner(self.manual_queue)
        self.done_queue = DoneQueue(done_file_path)
        self.active_queue = ActiveQueue()
        self.hardware = hardware

        self.program_queue = ProgramQueue()
        self.program_engine = ProgramEngine(self.program_queue)

        self.used = 0
        self._dirty_irrigation = True

        self.context = SchedulerContext(
            capacity = 1,
            sun_times = {},
            soil_margins = { "capacity": 30, "optimal": 20, "minimum": 5}
        )

    def update_context(self, ctx: SchedulerContext):
        self.context = ctx

    # -------------------------------------------------
    # Bootstrap
    # -------------------------------------------------
    def initialize_done_queue(self):
        self.done_queue.load()

    def initialize_manual_queue(self):
        """
        Build manual queue from current zone definitions.
        Idempotent.
        """
        self.manual_queue.clear()

        zones = zone_store.all()

        for zone_id, zone in zones.items():
            qe = self.manual_queue.create_for_zone(zone)
            self.manual_queue.add(qe)

        log_scheduler.info(
            "ManualQueue initialized with %s entries",
            self.manual_queue.size(),
        )

        for qe in self.manual_queue.all():
            log_scheduler.info(
                "Manual QE: %s (%s)",
                qe.zone_id,
                qe.zone_name,
            )
            
    # -------------------------------------------------
    # Program-Queue Init und Program Reschedule
    # -------------------------------------------------
    def _schedule_single_program(self, raw_program: dict, adHoc: bool = False):
        capacity = self.context.capacity

        name = raw_program.get("name")
        enabled = raw_program.get("enabled")

        log_scheduler.info(f"Schedule Single Program %s -> enabled=%s", name, enabled)

        if not raw_program.get("enabled"):
            return

        now = aware_now()

        engine_zones = []

        for z in raw_program.get("zones", []):
            engine_zones.append({
                "zone_id": z["zone_id"],
                "zone_index": z.get("zone_index"),
                "zone_count": z.get("zone_count"),
                "planned_duration": z.get("planned_duration") or z.get("duration"),
                "enabled": z.get("enabled", True),
                "load": z.get("load", 1),
            })

        program = {
            "program_id": raw_program.get("id"),
            "program_name": raw_program.get("name"),
            "policy": raw_program.get("policy"),
            "mode": raw_program.get("mode"),
            "schedule": raw_program.get("schedule"),
            "weekdays": raw_program.get("weekdays"),
            "zones": engine_zones,
            "color": raw_program.get("color"),
            "weather": raw_program.get("weather"),
            "repeat": raw_program.get("repeat", 0),
            "pause": raw_program.get("pause_minutes", 0),
        }

        # -------------------------------------------------
        # Anchor bestimmen
        # -------------------------------------------------

        if adHoc:
            anchor = now
        else:
            run = self.program_engine.compute_next_program_run(
                program,
                now,
                self.context.sun_times
            )

            if not run:
                return

            anchor = run["anchor"]

        repeat = program.get("repeat", 0)
        pause = program.get("pause", 0)

        # -------------------------------------------------
        # Repeat Loop
        # -------------------------------------------------

        for i in range(repeat + 1):

            block = self.program_engine.build_program_block(
                program=program,
                anchor=anchor,
                capacity=capacity,
                adHoc = adHoc, 
                program_run_index = i + 1,
                program_run_count = repeat +1
            )

            if not block:
                break

            self.program_queue.add_block(block)

            program_id = program.get("program_id")
            log_scheduler.info(
                f"[program] block scheduled run {i} for {program_id} Capacity: {capacity}"
            )

            start, end = self.program_engine.program_time_window(block.entries)

            if not end:
                break

            mode = program.get("mode")
            if mode == "finish_at":
                anchor = start - timedelta(minutes=pause)
            else:
                anchor = end + timedelta(minutes=pause)
            
    def initialize_program_queue(self, program_store):
        """
        Initial planning of all programs into program_queue.
        Called once at startup.
        """
        self.program_store = program_store
        # self._capacity = capacity

        # Queue vorher leeren (falls Restart)
        self.program_queue.clear()

        if not self.context.sun_times:
            log_scheduler.warning(f"Not Data for sun - rising, setting")
            return

        for raw_program in program_store.all().values():
            self._schedule_single_program(raw_program, False)

    async def _maybe_reschedule_program(self, program_id: int):

        raw_program = self.program_store.get(program_id)
        if not raw_program:
            return

        log_scheduler.info(
            f"[program] program finished → reschedule {program_id}"
        )

        self._schedule_single_program(raw_program, False)

    # -------------------------------------------------
    # Internal
    # -------------------------------------------------
    def _current_load(self) -> int:
        load = 0
        for entry in self.active_queue.all():
            if entry.status == "running":
                load += entry.load or 1
        return load
    
    async def _start_zone(self, entry: QueueEntry):

        now = aware_now()

        log_scheduler.info(
            f"Starting QE {entry.qe_id} ({entry.zone_name})"
        )

        # -------------------------
        # Status setzen
        # -------------------------

        entry.status = "running"

        # -------------------------
        # Startzeiten setzen
        # -------------------------

        entry.actual_start = now

        if entry.scheduled_start is None:
            entry.scheduled_start = now

        entry.scheduled_end = (
            now + timedelta(seconds=entry.scheduled_duration)
        )

        entry.remaining = entry.scheduled_duration

        # -------------------------
        # Hardware einschalten
        # -------------------------
        await self.hardware.turn_on(entry.switch)
        
    async def _stop_zone(self, entry: QueueEntry):

        # -------------------------
        # 1) Hardware ausschalten
        # -------------------------
        await self.hardware.turn_off(entry.switch)
        
        reason = entry.status
        now = aware_now()
        runtime = 0

        # -------------------------
        # 2) Status finalisieren
        # -------------------------

        if reason == "skip":

            entry.status = "skipped"
            entry.actual_start = entry.scheduled_start
            entry.actual_end = entry.scheduled_end

            log_scheduler.info(
                f"Entry {entry.qe_id} skipped "
                f"{entry.actual_start} → {entry.actual_end}"
            )

        elif reason == "finish":

            entry.actual_end = now
            entry.status = "done"

            if entry.actual_start:
                runtime = (now - entry.actual_start).total_seconds()

        elif reason == "remove":
            entry.status = "removed"
            entry.program_id = None
        else:
            # cancel
            entry.actual_end = now
            entry.status = "cancelled"

            if entry.actual_start:
                runtime = (now - entry.actual_start).total_seconds()

        # -------------------------
        # 3) Runtime / Soil
        # -------------------------
        if runtime > 0:
            self.apply_irrigation_to_zone(entry.zone_id, runtime)

        # -------------------------
        # 4) Historie
        # -------------------------
        if entry.status != "removed":
            self.done_queue.append(entry)

        # -------------------------
        # 5) Active entfernen
        # -------------------------

        self.active_queue.remove(entry.qe_id)

        log_scheduler.info(
            f"Stopped, Removed, Cancelled QE {entry.qe_id} "
            f"({entry.zone_name}) reason={reason}"
        )

        if entry.program_id and entry.source.startswith("program:"):
            is_last_zone = entry.zone_index == entry.zone_count
            is_last_run = entry.program_run_index == entry.program_run_count

            if is_last_zone and is_last_run:        
                await self._maybe_reschedule_program(entry.program_id)
                log_scheduler.info(
                    f"[program] final run finished → reschedule program {entry.program_id}"
                )

    def _sorted_active_entries(self):

        return sorted(
            self.active_queue.all(),
            key=lambda e: (
                0 if e.status == "running"
                else 1 if e.policy == "strict"
                else 2,
                e.scheduled_start or datetime.datetime.max.replace(tzinfo=None)
            )
        )

    # -------------------------------------------------
    # Scheduler Functions 
    # -------------------------------------------------   
    def _compute_occupied_slots(self) -> set[int]:
        occupied: set[int] = set()

        for entry in self.active_queue.all():
            if entry.status != "running":
                continue

            base = entry.slot or 0
            load = entry.load or 1

            for s in range(base, base + load):
                occupied.add(s)

        return occupied
     
    def _find_free_slot(self, load: int, capacity: int) -> int | None:

        occupied = self._compute_occupied_slots()

        for base in range(capacity):

            fits = True

            for s in range(base, base + load):

                if s >= capacity or s in occupied:
                    fits = False
                    break

            if fits:
                return base

        return None
            
    async def _process_cancellations(self):
        to_cancel_ids: list[str] = []

        now = aware_now()

        for entry in self.active_queue.all():
            # Cancel requested
            if entry.status == "remove":
                log_scheduler.info(
                    f"Remove physically zone {entry.zone_id} (removed) - due to Program-Change/Delete"
                )
                to_cancel_ids.append(entry.qe_id)
                continue

            # Cancel requested
            if entry.status == "cancel":
                log_scheduler.info(
                    f"Stopping physically zone {entry.zone_id} (cancelled)"
                )
                to_cancel_ids.append(entry.qe_id)
                continue
            # skip erst wegräumen (lassen), wenn Zeit abgelaufen ist, damit dann sauber neu geplant werden kann
            # notwendig für strict-backward, schadet aber auch bei forward nicht
            if (
                entry.status == "skip"
                and entry.scheduled_end
                and entry.scheduled_end <= now
            ):
                log_scheduler.info(
                    f"Skipping zone {entry.zone_id} (skip) End: {entry.scheduled_end}"
                )
                to_cancel_ids.append(entry.qe_id)

        # --- Execute cancellations outside iteration ---

        for qe_id in to_cancel_ids:
            entry = self.active_queue.get(qe_id)
            if entry:
                await self._stop_zone(entry)     # <- neue Methode im Scheduler
            self._dirty_irrigation = True

    async def _process_manual_enqueue(self):
        to_enqueue = []

        for entry in self.manual_queue.all():
            if entry.status == "enqueue":
                to_enqueue.append(entry)

        for entry in to_enqueue:

            log_scheduler.info(
                f"Enqueue {entry.zone_id} ({entry.zone_name})"
            )

            # Clone → neue Runtime-Instanz
            active_entry = entry.clone_for_active()

            # ActiveQueue übernehmen
            self.active_queue.add(active_entry)

            # ManualEntry zurücksetzen
            entry.status = "idle"

            # Projection falls nötig
            #MIG write_zone_runtime_state(active_entry)

            log_scheduler.info(
                f"Queued QE {active_entry.qe_id} ({active_entry.zone_name})"
            )
            self._dirty_irrigation = True

    async def _process_running(self):
        now = aware_now()
        to_stop: list[QueueEntry] = []

        for entry in self.active_queue.all():

            if entry.status != "running":
                continue

            if not entry.actual_start:
                continue

            if not entry.scheduled_end:
                continue

            # Remaining berechnen
            remaining = int((entry.scheduled_end - now).total_seconds())
            entry.remaining = max(0, remaining)

            # Laufzeitende erreicht?
            if now >= entry.scheduled_end:
                entry.status = "finish"
                to_stop.append(entry)


        # --- Stop außerhalb der Iteration ---

        for entry in to_stop:
            await self._stop_zone(entry)

        to_stop.clear()

    async def _process_start_logic(self):
        capacity = self.context.capacity
        now = aware_now()

        self.used = self._current_load()

        for entry in self._sorted_active_entries():

            if entry.status != "queued":
                continue

            load = entry.load
            start = entry.scheduled_start
            program_run_id = entry.program_run_id
            program_id = entry.program_id

            # =================================================
            # STRICT (noch nicht implementiert)
            # =================================================
            if entry.policy == "strict":
                # -------------------------
                # STRICT
                # -------------------------
                # Startzeit noch nicht erreicht
                if start and start > now:
                    continue

                if self.used + load <= capacity:
                    # 👇 Nur bei erster Zone eines Programms anpassen
                    if entry.zone_index == 1:
                        self.adapt_program_durations(
                            program_run_id,
                            recalc_durations=entry.weather_enabled
                        )
                        log_scheduler.info(
                            f"Weather enabled for program {program_id} → recalc durations"
                        )
                    # 🔥 0-Minuten Sonderfall
                    if (entry.scheduled_duration or 0) <= 0:
                        log_scheduler.info(
                            f"Skipping QE {entry.qe_id} "
                            f"(Zone {entry.zone_id}) – duration=0"
                        )
                        continue
                

                    # ✅ Normales Starten
                    await self._start_zone(entry)
                    self.used += load
                else:
                    break   # strict blockiert alles dahinter
                
                    # später
                continue

            # =================================================
            # FLOATING
            # =================================================

            SAFETY_MARGIN = timedelta(seconds=10)

            latest_end = (
                now
                + timedelta(seconds=entry.planned_duration)
                + SAFETY_MARGIN
            )

            next_strict = None
            # next_strict = next_strict_start_after(now)

            # Wenn kein strict kommt oder wir davor fertig sind
            if next_strict is None or latest_end < next_strict:

                slot = self._find_free_slot(load, capacity)

                if slot is not None:

                    entry.slot = slot

                    await self._start_zone(entry)

                    self.used += load

                # Kein else → nächstes Floating prüfen
            else:
                continue

    def request_cancel_qe(self, qe_id: str) -> bool:

        entry = self.active_queue.get(qe_id)

        if not entry:
            log_scheduler.warning(f"Cancel failed: QE {qe_id} not found")
            return False

        if entry.status not in ("queued", "running"):
            log_scheduler.warning(
                f"Cancel ignored: QE {qe_id} status={entry.status}"
            )
            return False

        entry.status = "cancel"
        return True

    def compute_program_conflict_delta(self, entries: list[QueueEntry]):
        """
        Checks conflicts between a planned strict program block
        and current active queue.

        Returns:
            timedelta >= 0
        """

        prog_start, prog_end = self.program_engine.program_time_window(entries)

        if not prog_start or not prog_end:
            return timedelta(0)

        delta = timedelta(0)

        for other in self.active_queue.all():

            if other.status not in ("running", "queued"):
                continue

            # strict queued OR any running
            if other.policy != "strict" and other.status != "running":
                continue

            other_start = other.scheduled_start
            other_end = other.scheduled_end

            if not other_start or not other_end:
                continue

            if (
                prog_start + delta < other_end
                and other_start < prog_end + delta
            ):
                shift = other_end - prog_start
                if shift > delta:
                    delta = shift

        return max(delta, timedelta(0))

    def enqueue_strict_entry(self, planned_entry: QueueEntry, delta: timedelta):
        """
        Injects a strict entry into active queue with optional shift delta.
        """

        entry = planned_entry.clone_for_active()

        # Shift times if necessary
        if delta.total_seconds() > 0:
            entry.scheduled_start += delta
            entry.scheduled_end += delta

            entry.planned_start += delta
            entry.planned_end += delta

        # Scheduler Layer initialization
        entry.status = "queued"
        entry.actual_start = None
        entry.actual_end = None
        entry.remaining = entry.scheduled_duration

        self.active_queue.add(entry)
        log_scheduler.info(f"[program-enqueue] zone ({entry.qe_id}, '{entry.zone_name}', '{entry.status}')")

    def enqueue_program_block(self, block: ProgramBlock):
        """
        Injects entire strict program block into active queue.
        """

        entries = block.entries

        delta = self.compute_program_conflict_delta(entries)

        if delta.total_seconds() > 0:
            log_scheduler.info(
                f"[program-enqueue] shifting program {block.program_id} by {delta}"
            )

        for e in entries:
            log_scheduler.info(f"[program-enqueue] zone {e.qe_id, e.zone_name, e.status} ")
            self.enqueue_strict_entry(e, delta)
            self._dirty_irrigation = True

        self.program_queue.remove_block(block)

        log_scheduler.info(
            f"[program-enqueue] program {block.program_id} enqueued"
        )

    def calculate_zone_seconds(self, zone: dict, soil_deficit_mm: float) -> int:

        if soil_deficit_mm <= 0:
            return 0

        mm_per_hour = zone.get("precipitation_rate_mm_per_hour")
        if not mm_per_hour:
            log_scheduler.warning(
                f"Zone {zone.get('zone_id')}: no precipitation rate defined"
            )
            return 0

        zone_factor = zone.get("zone_factor", 1.0)

        adjusted_deficit = soil_deficit_mm * zone_factor

        seconds = (adjusted_deficit / mm_per_hour) * 3600

        MIN_RUNTIME_SECONDS = 3 * 60

        if seconds < MIN_RUNTIME_SECONDS:
            return 0

        return round(seconds)
        
    def adapt_program_durations(self, program_run_id: str, recalc_durations: bool = True):
        log_scheduler.info(
            f"Adapt program {program_run_id} | recalc={recalc_durations}"
        )

        today = dt_date.today().isoformat()

        slots = {}

        # 🔹 Entries pro Slot aus active_queue sammeln
        program_entries = [
            e for e in self.active_queue.all()
                if e.program_run_id == program_run_id and e.status in ("queued", "running")
        ]

        if not program_entries:
            return

        # 🔹 Nach Slots gruppieren
        slots: dict[int, list[QueueEntry]] = {}

        for entry in program_entries:
            slots.setdefault(entry.slot, []).append(entry)

        log_scheduler.info(
            f"[ADAPT] Program {program_run_id}: found slots {list(slots.keys())}"
        )

        for slot, entries in slots.items():
            entries.sort(key=lambda e: e.scheduled_start)

            previous_end = None
                
            for i, entry in enumerate(entries):
                zone_id = entry.zone_id

                old_duration = entry.scheduled_duration or 0
                new_duration = old_duration

                # ------------------------------------------
                # 🔹 Neue Dauer berechnen
                # ------------------------------------------
                if recalc_durations:

                    zone = zone_store.get(zone_id)

                    zone_key = f"zone:{zone_id}"

                    soil = hydro_store.get(zone_key, "soil_mm", "derived", "model", today)

                    soil_optimal = self.context.soil_margins.get("optimal")
                    soil_capacity = self.context.soil_margins.get("capacity")

                    if soil is None:
                        soil = soil_optimal

                    deficit, details = self.adaptation_deficit(hydro_store, zone_key, soil_optimal, eto_factor=zone.get("eto_factor", 1.0), rain_factor=zone.get("rain_factor", 1.0), explain=True)
                
                    deficit = min(deficit, soil_capacity)

                    entry.runtime_deficit_mm = deficit
                    entry.zone_precipitation_rate = zone.get("precipitation_rate_mm_per_hour", 0)
                    
                    new_duration = self.calculate_zone_seconds(zone, deficit)

                    if details:
                        forecast_items = [
                            ForecastContribution(**f)
                            for f in details.get("forecast", [])
                        ]

                        entry.runtime_reason = RuntimeReason(
                            model=details.get("model", "forecast_weighted_v1"),
                            soil=details["soil"],
                            soil_optimal=details["soil_optimal"],
                            deficit_today=details["deficit_today"],
                            weighted_deficit=details.get("weighted_deficit", 0),
                            precip_rate_mm_h=zone.get("precipitation_rate_mm_per_hour", 0),
                            runtime_seconds=new_duration,
                            forecast=forecast_items
                        )

                    explain = {}
                    explain["precip_rate"] = zone.get("precipitation_rate_mm_per_hour", 0)
                    explain["runtime_seconds"] = new_duration

                    log_scheduler.info(
                        f"[ADAPT] Zone {zone_id} "
                        f"soil={soil:.2f} "
                        f"deficit={deficit:.2f} "
                        f"raw_deficit={max(0, soil_optimal - soil):.2f}"
                    )

                # ------------------------------------------
                # 🔥 0-Duration → skip, keine Rechain
                # ------------------------------------------
                if recalc_durations and new_duration == 0:

                    entry.scheduled_duration = 0
                    entry.remaining = 0
                    entry.status = "skip"

                    log_scheduler.info(
                        f"[ADAPT] Zone {zone_id} duration=0 → no rechain"
                    )

                    # ❗ scheduled_start bleibt wie geplant
                    # ❗ scheduled_end bleibt wie geplant
                    continue

                # ------------------------------------------
                # 🔹 Normale Re-Kettung
                # ------------------------------------------
                entry.scheduled_duration = new_duration
                entry.remaining = new_duration

                if i == 0:
                    # erste Zone im Slot
                    previous_end = (
                        entry.scheduled_start +
                        timedelta(seconds=new_duration)
                    )
                    entry.scheduled_end = previous_end
                else:
                    # Folgezone im Slot
                    entry.scheduled_start = previous_end
                    entry.scheduled_end = (
                        entry.scheduled_start +
                        timedelta(seconds=new_duration)
                    )
                    previous_end = entry.scheduled_end

                log_scheduler.info(
                    f"[ADAPT] Program {program_run_id} | "
                    f"Slot {slot} | Zone {zone_id} "
                    f"{old_duration}→{new_duration}"
                )

        log_scheduler.info(f"Program {program_run_id}: adaptation finished")
        
    def adaptation_deficit(self, hydro_store, zone_key, soil_optimal, weights=(0.7,0.4,0.2),
                        eto_factor=1.0, rain_factor=1.0, explain=False):

        today = dt_date.today().isoformat()

        soil = hydro_store.get(zone_key, "soil_mm", "derived", "model", today)
        if soil is None:
            soil = soil_optimal

        details = {
            "soil": soil,
            "soil_optimal": soil_optimal,
            "forecast": []
        }

        deficit_sum = 0

        # ------------------------
        # TODAY
        # ------------------------
        deficit_today = max(0, soil_optimal - soil)
        deficit_sum += weights[0] * deficit_today

        details["deficit_today"] = deficit_today

        # ------------------------
        # FORECAST DAYS
        # ------------------------
        days = hydro_store.get_days("global")

        future_days = [d for d in days if d >= today][:len(weights)-1]

        for i, d in enumerate(future_days):

            eto  = hydro_store.get("global", "eto_mm",  "derived", "median", d)
            rain = hydro_store.get("global", "rain_mm", "derived", "median", d)
            prob = hydro_store.get("global", "prob_pct","derived", "median", d)

            rain_eff = round((rain or 0) * ((prob or 0) / 100) * rain_factor, 2)
            eto_eff  = round((eto or 0) * eto_factor, 2)


            if d == today:
                irrigation = (
                    hydro_store._sum_values(hydro_store.get(zone_key, "irrigation_mm", "forecast", None, d)) +
                    hydro_store._sum_values(hydro_store.get(zone_key, "irrigation_mm", "observed", None, today))
                )
            else:
                irrigation = (
                    hydro_store._sum_values(hydro_store.get(zone_key, "irrigation_mm", "forecast", None, d))
                )            

            soil = soil + rain_eff + irrigation - eto_eff
            deficit = max(0, soil_optimal - soil)

            deficit_sum += weights[i+1] * deficit

            details["forecast"].append({
                "date": d,
                "eto": eto or 0,
                "rain": rain or 0,
                "prob": prob or 0,
                "rain_effective": rain_eff,
                "irrigation_planned": irrigation or 0,
                "weight": weights[i+1],
                "weighted_deficit": deficit_sum,
                # optional (für Debug/UI nice)
                "soil_after": soil,
                "deficit": deficit
            })

        if explain:
            return deficit_sum, details

        return deficit_sum

    def rebuild_irrigation_forecast(self, forecast_days: int = 7):

        today = dt_date.today()
        max_date = today + timedelta(days=forecast_days)

        # --------------------------------
        # 1. Forecast löschen
        # --------------------------------
        hydro_store.clear_forecast_irrigation()

        entries = self.active_queue.all()

        if not entries:
            self._dirty_irrigation = False
            return

        # --------------------------------
        # 2. Queue scannen
        # --------------------------------
        for entry in entries:

            if entry.status not in ("queued", "running"):
                continue

            if not entry.scheduled_start:
                continue

            run_date = entry.scheduled_start.date()

            if run_date < today or run_date > max_date:
                continue

            zone = zone_store.get(entry.zone_id)
            if not zone:
                continue

            mm_per_hour = zone.get("precipitation_rate_mm_per_hour")
            if not mm_per_hour:
                continue

            duration = entry.scheduled_duration or entry.remaining or 0
            if duration <= 0:
                continue

            irrigation_mm = mm_per_hour * (duration / 3600)

            zone_key = f"zone:{entry.zone_id}"

            # --------------------------------
            # 3. Store schreiben
            # --------------------------------
            hydro_store.add_forecast_irrigation(
                run_date,
                zone_key,
                round(irrigation_mm, 2)
            )

        self._dirty_irrigation = False
            
    def apply_irrigation_to_zone(self, zone_id: int, runtime_seconds: float):

        zone = zone_store.get(zone_id)
        if not zone:
            return

        zone_key = f"zone:{zone_id}"

        mm_per_hour = zone.get("precipitation_rate_mm_per_hour")
        if not mm_per_hour:
            return

        irrigation_mm = mm_per_hour * (runtime_seconds / 3600)

        hydro_store.add_actual_irrigation(
            zone_key,
            round(irrigation_mm, 2)
        )

        log_scheduler.info(
            f"[IRRIGATION] Zone {zone_id}: +{irrigation_mm:.2f}mm"
        )

    def _group_entries_by_run(self, entries):
        runs = {}

        for e in entries:
            runs.setdefault(e.program_run_id, []).append(e)

        return runs

    def get_program_runtime_state(self, program_id: int) -> dict:

        entries = self.active_queue.get_by_program(program_id)

        if not entries:
            return {"state": "idle"}

        runs = self._group_entries_by_run(entries)

        # ------------------------------------------------
        # 1️⃣ RUNNING RUN finden
        # ------------------------------------------------
        for run_id, run_entries in runs.items():
            if any(e.status == "running" for e in run_entries):

                planned_start = min(
                    e.scheduled_start for e in run_entries if e.scheduled_start
                )

                planned_end = max(
                    e.scheduled_end for e in run_entries if e.scheduled_end
                )

                actual_start = min(
                    e.actual_start for e in run_entries if e.actual_start
                )

                return {
                    "state": "running",
                    "program_run_id": run_id,
                    "planned_start": planned_start,
                    "planned_end": planned_end,
                    "actual_start": actual_start,
                    "program_run_id": run_id,
                }

        # ------------------------------------------------
        # 2️⃣ QUEUED RUN finden (frühester)
        # ------------------------------------------------
        queued_runs = []

        for run_id, run_entries in runs.items():

            if all(e.status == "queued" for e in run_entries):

                start = min(
                    e.scheduled_start for e in run_entries if e.scheduled_start
                )

                end = max(
                    e.scheduled_end for e in run_entries if e.scheduled_end
                )

                queued_runs.append((start, run_id, run_entries, end))

        if queued_runs:

            queued_runs.sort(key=lambda x: x[0])
            start, run_id, run_entries, end = queued_runs[0]

            return {
                "state": "queued",
                "program_run_id": run_id,
                "planned_start": start,
                "planned_end": end,
                "program_run_id": run_id,
            }

        # ------------------------------------------------
        # 3️⃣ FALLBACK
        # ------------------------------------------------
        # ⚪ nichts vorhanden
        return {
            "state": "idle"
        }

    async def add_program(self, program_id: int):
        await self._maybe_reschedule_program(program_id)
            
    def delete_program(self, program_id: int):

        if self.active_queue.has_running_program(program_id):
            return

        self.active_queue.remove_by_program(program_id)
            
    async def update_program(self, program_id: int):

        if self.active_queue.has_running_program(program_id):
            return

        self.active_queue.remove_by_program(program_id)
        await self._maybe_reschedule_program(program_id)

    def start_program_now(self, program_id: int):
        program = self.program_store.get(program_id)

        self._schedule_single_program(program, True)
        
    def request_cancel_program_run(self, program_run_id):

        entries = [
            e for e in self.active_queue.all()
            if e.program_run_id == program_run_id
        ]

        if not entries:
            return False

        for e in entries:

            if e.status in ("queued", "running"):
                e.status = "cancel"

        return True
    
    def request_skip_program_run(self, program_id):

        entries = [
            e for e in self.active_queue.all()
            if e.program_id == program_id
        ]

        if not entries:
            return False

        for e in entries:

            if e.status in ("queued", "running"):
                e.status = "skip"

        return True

    # -------------------------------------------------
    # Scheduler-Tick
    # -------------------------------------------------
    async def tick(self, is_active: bool):
        self._dirty_planned_irrigation = False
        # MIG global sprinkler_scheduler_running
        """
        Scheduler-Loop für die Bewässerungs-Queue
        - JSON-Zonen
        - Prüft input_boolean.sprinkler_scheduler_aktiv
        - Startet nur eine Zone gleichzeitig
        """
        
        # log_scheduler.info(f"Scheduler Tick({is_active}, {capacity}) startet...")
        # -------------------------
        # 0) Aufräumen: Done-Queue - Retention
        # -------------------------
        #MIG cleanup_done_queue()

        # -------------------------
        # 1) Cleanup: cancelled / skipped entries
        # -------------------------
        await self._process_cancellations()
        
        # -------------------------
        # 2) Enqueue
        # -------------------------

        # --- 2a) Programme enqueuen (blockweise!) ---

        for block in list(self.program_queue):
            self.enqueue_program_block(block)

        # --- 2b) Zonene aus der Off-Queue enqueuen (zonenweise) ---
        # -------------------------
        # Manual enqueue → Active
        # -------------------------
        await self._process_manual_enqueue()


        # -------------------------
        # 3) Running entries prüfen (Laufzeitende)
        # -------------------------
        await self._process_running()

        if self._dirty_irrigation:
            self.rebuild_irrigation_forecast(forecast_days = 7)

        # sort_active_queue()

        # 4.0 Globaler Scheduler-Schalter
            
        if not is_active:
            # publish_ui_state()
            return
        # -------------------------
        # 4.1) queued Elemente starten, nur wenn keine running
        # -------------------------

        await self._process_start_logic()

        # log_scheduler.info(f"Scheduler Tick({is_active}, {capacity}) ended...")


