# queues/queue_entry.py

from dataclasses import dataclass, asdict, fields
from typing import Optional
from uuid import uuid4

@dataclass
class ForecastContribution:

    date: str

    eto: float
    rain: float
    prob: float

    rain_effective: float
    irrigation_planned: float

    soil_after: float
    deficit: float

    weight: float
    weighted_deficit: float

@dataclass
class RuntimeReason:
    model: str

    soil: float
    soil_optimal: float

    deficit_today: float
    weighted_deficit: float

    precip_rate_mm_h: float
    runtime_seconds: int

    forecast: list[ForecastContribution]

    version: int = 1


@dataclass
class QueueEntry:

    # Identity
    qe_id: str

    # Program context
    program_id: Optional[int] = None
    program_run_id: Optional[str] = None
    program_name: Optional[str] = None
    program_run_index: int = 1
    program_run_count: int = 1

    # Zone context
    zone_id: int = 0
    zone_name: str = ""
    switch: str = ""
    enabled: bool = True
    zone_index: int = 1
    zone_count: int = 1

    # Policy / Scheduling
    status: str = "idle"
    policy: str = "floating"
    load: int = 1

    # Planning layer
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    planned_duration: int = 0

    # Scheduled layer
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    scheduled_duration: int = 0
    slot: int = 0

    # Runtime layer
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None
    remaining: int = 0

    # Meta
    source: str = ""

    # Weather
    weather_enabled: bool = False

    # Color
    program_color:  Optional[str]   = None

    # Herleitung Laufzeit aus Wetterabhängiger Adaption
    zone_precipitation_rate: float | None = None
    runtime_deficit_mm: float | None = None
    runtime_reason: RuntimeReason | None = None
    irrigation_mm: float | None = None


    # ---------------------------------
    # Serialization
    # ---------------------------------

    def to_dict(self) -> dict:
        data = asdict(self)

        if self.runtime_reason:
            data["runtime_reason"] = asdict(self.runtime_reason)

        return data

    @classmethod
    def from_dict(cls, data: dict) -> "QueueEntry":

        allowed = {f.name for f in fields(cls)}

        filtered = {
            k: v for k, v in data.items()
            if k in allowed
        }

        # runtime_reason rekonstruieren
        rr = filtered.get("runtime_reason")

        if isinstance(rr, dict):

            forecast = rr.get("forecast")

            if isinstance(forecast, list):

                rr["forecast"] = [
                    ForecastContribution(**f)
                    for f in forecast
                ]

            filtered["runtime_reason"] = RuntimeReason(**rr)
        return cls(**filtered)

    # ---------------------------------
    # Helpers
    # ---------------------------------

    @staticmethod
    def new_activity_id() -> str:
        return uuid4().hex

    def clone_for_active(self) -> "QueueEntry":
        return QueueEntry(
            qe_id=self.new_activity_id(),
            program_id=self.program_id,
            program_run_id=self.program_run_id,
            program_name=self.program_name,
            program_run_index = self.program_run_index,
            program_run_count = self.program_run_count,

            zone_id=self.zone_id,
            zone_name=self.zone_name,
            switch=self.switch,
            enabled=self.enabled,
            zone_index = self.zone_index,
            zone_count = self.zone_count,

            status="queued",
            policy=self.policy,
            load=self.load,
            planned_start=self.planned_start,
            planned_end=self.planned_end,
            planned_duration=self.planned_duration,
            scheduled_start=self.scheduled_start,
            scheduled_end=self.scheduled_end,
            scheduled_duration=self.scheduled_duration,
            slot=self.slot,
            actual_start=None,
            actual_end=None,
            remaining=self.planned_duration,
            source=self.source,
            weather_enabled=self.weather_enabled,
            program_color = self.program_color,

            zone_precipitation_rate = self.zone_precipitation_rate,
            runtime_deficit_mm = None,
            runtime_reason = None,
            irrigation_mm = self.zone_precipitation_rate * self.planned_duration / 3600
        )