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

from uuid import uuid4

from pyscript.modules.sprinkler.queues.queue_entry import QueueEntry
from pyscript.modules.sprinkler.zones import zone_store
from pyscript.modules.sprinkler.datetime_utils import normalize_dt, today_at, aware_now
from pyscript.modules.sprinkler.queues.program_block import ProgramBlock

log_engine           = logging.getLogger("pyscript.sprinkler.program_engine")
log_engine.warning("Scheduler Module loading...")

class ProgramEngine:
    def __init__(self, program_queue):
        self.program_queue = program_queue

    def weekday_name(self, dt):
        return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][dt.weekday()]
        
    def compute_anchor_time(self, program: dict, day: datetime.date, sun_times: dict):
        """
        Computes anchor time for a program on a specific day.

        sun_times:
            {
                "sunrise": datetime,
                "sunset": datetime
            }
        """

        sched = program["schedule"]
        sched_type = sched.get("type")

        # ----------------------------------
        # FIXED TIME
        # ----------------------------------
        if sched_type == "fixed":
            return today_at(sched["time"], day)

        # ----------------------------------
        # SUN-BASED
        # ----------------------------------
        if sched_type == "sun":

            event = sched.get("event")  # sunrise | sunset
            offset = sched.get("offset_minutes", 0)

            if event not in ("sunrise", "sunset"):
                raise ValueError(f"Unknown sun event '{event}'")

            raw = sun_times.get(event)
            log_engine.info(f"sun: {event} : {raw}")
            if not raw:
                raise RuntimeError(f"Sun time for '{event}' not provided")

            #t = normalize_dt(raw)
            t = raw

            # pull to requested day
            if t.date() != day:
                t = datetime.datetime.combine(day, t.timetz())

            t += datetime.timedelta(minutes=offset)

            # optional latest_end cap
            latest = sched.get("latest_end")
            if latest:
                latest_t = today_at(latest, day)
                if t > latest_t:
                    t = latest_t

            return t

        raise ValueError(f"Unknown schedule type '{sched_type}'")    

    def expand_program_to_entries(self, program: dict, day, adHoc: bool = False, program_run_index: int = 1, program_run_count: int = 1) -> list[QueueEntry]:
        """
        Expands a program definition into QueueEntry instances
        for a specific execution day.
        """

        entries: list[QueueEntry] = []

        program_id = program["program_id"]
        program_run_id = uuid4().hex
        program_name = program.get("program_name")
        policy = program.get("policy", "strict")

        day_str = day.isoformat()  # YYYY-MM-DD

        program_weather_enabled = program.get("weather", {}).get("enabled", False)

        log_engine.info(f"expand program to entries {program_id} {program_run_id} {program_name} {program_weather_enabled}")

        zone_count = len(program["zones"])

        for idx, z in enumerate(program["zones"], start=1):

            zone_id = z["zone_id"]
            zone = zone_store.get(zone_id)

            if not zone:
                # Optional: log warning
                continue

            log_engine.info(f"expand Zone, found id {zone_id}, {idx}")
            planned_duration = z["planned_duration"]

            log_engine.info(f"ZONE_DATA: {zone}")

            src = f"program:{program_id}:{day_str}:{idx}"

            if adHoc:
                src = f"adhoc:{program_id}:{day_str}:{idx}"

            qe = QueueEntry(
                qe_id=None,  # will be assigned on injection
                program_id=program_id,
                program_run_id=program_run_id,
                program_name=program_name,
                program_run_index = program_run_index,
                program_run_count = program_run_count,

                zone_id=zone_id,
                zone_name=zone["name"],
                switch=zone["switch"],
                enabled=zone.get("enabled", True),
                zone_index = idx,
                zone_count = zone_count,

                status="planned",  # Engine-Level initial state
                policy=policy,
                load=z.get("load", 1),

                # Planning layer
                planned_start=None,
                planned_end=None,
                planned_duration=planned_duration,

                # Scheduler layer
                scheduled_start=None,
                scheduled_end=None,
                scheduled_duration=None,
                slot=0,

                # Runtime layer
                actual_start=None,
                actual_end=None,
                remaining=planned_duration,

                source=src,

                weather_enabled = program_weather_enabled,

                program_color = program.get("color")
            )

            log_engine.info(f"Wetter - enabled: {qe.weather_enabled} {program_weather_enabled}")

            entries.append(qe)

        return entries

    def plan_strict_forward(self, entries, anchor, capacity):
        """
        Plans entries forward from anchor time.
        Mutates QueueEntry instances in-place.

        Returns:
            datetime of last wave end
        """

        current_start = anchor
        wave_end = None
        used_slots = 0
        next_slot = 0

        for e in entries:
            load = e.load or 1
            duration_seconds = e.planned_duration
            dur = datetime.timedelta(seconds=duration_seconds)

            # fits in current wave
            if used_slots + load <= capacity:

                e.scheduled_start = current_start
                e.planned_start = current_start

                e.scheduled_duration = duration_seconds
                e.scheduled_end = current_start + dur
                e.planned_end = current_start + dur

                e.slot = next_slot

                end = e.scheduled_end

                used_slots += load
                next_slot += load

                wave_end = max(wave_end, end) if wave_end else end

            # new wave
            else:
                current_start = wave_end
                used_slots = load
                next_slot = load

                e.scheduled_start = current_start
                e.planned_start = current_start

                e.scheduled_duration = duration_seconds
                e.scheduled_end = current_start + dur
                e.planned_end = current_start + dur

                e.slot = 0

                wave_end = e.scheduled_end

        return wave_end

    def plan_strict_backward(self, entries, anchor, capacity):
        """
        Plans entries backward from anchor time.
        Mutates QueueEntry instances in-place.

        Returns:
            datetime of first wave start
        """

        current_end = anchor
        wave_start = None
        used_slots = 0
        next_slot = 0

        for e in reversed(entries):
            load = e.load or 1
            duration_seconds = e.planned_duration
            dur = datetime.timedelta(seconds=duration_seconds)

            # fits in current wave
            if used_slots + load <= capacity:

                start = current_end - dur

                e.scheduled_start = start
                e.planned_start = start

                e.scheduled_duration = duration_seconds
                e.scheduled_end = current_end
                e.planned_end = current_end

                e.slot = next_slot

                used_slots += load
                next_slot += load

                wave_start = min(wave_start, start) if wave_start else start

            # new wave
            else:
                current_end = wave_start

                start = current_end - dur

                e.scheduled_start = start
                e.planned_start = start

                e.scheduled_duration = duration_seconds
                e.scheduled_end = current_end
                e.planned_end = current_end

                e.slot = 0

                used_slots = load
                next_slot = load

                wave_start = start

        return wave_start

    def compute_next_program_run(self, program: dict, now: datetime.datetime, sun_times: dict):
        """
        Computes the next valid run (day + anchor time)
        for a given program.

        Returns:
            {
                "day": datetime.date,
                "anchor": datetime.datetime
            }
            or None if no valid run within next 7 days.
        """

        weekdays = program.get("weekdays", [])

        # today + next 7 days
        for offset in range(0, 8):

            candidate_date = now.date() + datetime.timedelta(days=offset)
            # day = normalize_dt(candidate_date)
            day = candidate_date

            # weekday filter
            if self.weekday_name(day) not in weekdays:
                continue

            anchor = self.compute_anchor_time(program, day, sun_times)
            # anchor = normalize_dt(anchor)

            # exclude past times
            if anchor <= now:
                continue

            return {
                "day": day,
                "anchor": anchor,
            }

        return None

    def build_program_block(self, program, anchor, capacity, adHoc: bool = False, program_run_index: int = 1, program_run_count: int = 1):

        day = anchor.date()

        entries = self.expand_program_to_entries(program, day, adHoc, program_run_index, program_run_count)

        if not entries:
            return None

        policy = program.get("policy", "strict")
        mode = program.get("mode", "start_at")

        if policy != "strict":
            raise NotImplementedError

        if mode == "start_at":
            self.plan_strict_forward(entries, anchor, capacity)

        elif mode == "finish_at":
            self.plan_strict_backward(entries, anchor, capacity)

        else:
            raise ValueError(f"Unknown program mode '{mode}'")

        block = ProgramBlock(
            program=program,
            day=day,
            anchor=anchor,
            entries=entries
        )

        return block

    def build_program_block_old(self, program: dict, now: datetime.datetime, capacity: int, sun_times: dict, force_start_now: bool = False):
        """
        Builds a fully planned ProgramBlock for the next execution
        of a given program.

        Returns:
            ProgramBlock | None
        """

        day = ""
        anchor = None

        if not force_start_now:
            # -------------------------------------------------
            # 1️⃣ Nächsten gültigen Lauf bestimmen
            # -------------------------------------------------
            run = self.compute_next_program_run(program, now, sun_times)
            log_engine.info(f"Computed Next run: {run}")
            if not run:
                return None

            day = run["day"]

            # Anchor mit Sun-Daten berechnen
            anchor = self.compute_anchor_time(program, day, sun_times)

            anchor = run["anchor"]

        else:
            anchor = aware_now()
            day=anchor.date()


        log_engine.info(f"Day is : {day}, anchor is: {anchor}")
        log_engine.info(f"ANCHOR tz: {anchor.tzinfo}")
        log_engine.info(f"NOW tz: {now.tzinfo}")
        # Sicherheit: Vergangenheit ausschließen
        if anchor <= now:
            return None

        # -------------------------------------------------
        # 2️⃣ Entries erzeugen
        # -------------------------------------------------
        entries = self.expand_program_to_entries(program, day, force_start_now)

        log_engine.info(f"Entries expanded")
        if not entries:
            return None

        log_engine.info("plan strict")
        # -------------------------------------------------
        # 3️⃣ Strict-Planung
        # -------------------------------------------------
        policy = program.get("policy", "strict")
        mode = program.get("mode", "start_at")

        if policy != "strict":
            raise NotImplementedError("Only strict policy supported currently")

        if mode == "start_at":
            self.plan_strict_forward(entries, anchor, capacity)

        elif mode == "finish_at":
            self.plan_strict_backward(entries, anchor, capacity)

        else:
            raise ValueError(f"Unknown program mode '{mode}'")

        # -------------------------------------------------
        # 4️⃣ Block erzeugen
        # -------------------------------------------------

        log_engine.info("create Block")

        block = ProgramBlock(program=program, day=day, anchor=anchor, entries=entries)

        log_engine.info(f"End of Program-Block!")
        return block

    def program_time_window(self, entries: list[QueueEntry]):
        """
        Returns overall scheduled time window of a program block.
        """

        if not entries:
            return None, None

        starts = [
            e.scheduled_start
            for e in entries
            if e.scheduled_start is not None
        ]

        ends = [
            e.scheduled_end
            for e in entries
            if e.scheduled_end is not None
        ]

        if not starts or not ends:
            return None, None

        return min(starts), max(ends)