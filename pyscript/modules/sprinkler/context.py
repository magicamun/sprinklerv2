from dataclasses import dataclass, field

@dataclass
class SchedulerContext:

    capacity: int

    sun_times: dict = field(default_factory=dict)

    soil_margins: dict = field(default_factory=dict)
