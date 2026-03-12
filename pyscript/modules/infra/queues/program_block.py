from pyscript.modules.util.datetime_utils import aware_now

class ProgramBlock:
    """
    Represents one planned execution of a program
    for a specific day and anchor.
    """

    def __init__(self, program: dict, day, anchor, entries: list):
        self.program_id         = program["program_id"]
        self.program_name       = program["program_name"]
        self.policy             = program["policy"]
        self.mode               = program["mode"]
        self.schedule           = program["schedule"]
        self.weekdays           = program["weekdays"]
        self.weather_enabled    = program.get("weather", {}).get("enabled", False)
        self.color              = program.get("color", "#999999")
        self.repeat             = max(0, int(program.get("repeat", 0)))
        self.pause_minutes      = max(0, int(program.get("pause_minutes", 0)))

        # Planung
        self.day                = day
        self.anchor             = anchor
        self.entries            = entries  # List[QueueEntry]

        # lifecycle state of block
        self.state              = "planned"  
        # planned | injected | running | done | cancelled
        self.planned_at         = aware_now()

    def to_dict(self):
        return {
            "program_id": self.program_id,
            "program_name": self.program_name,
            "day": self.day.isoformat() if self.day else None,
            "anchor": self.anchor.isoformat() if self.anchor else None,
            "planned_at": self.planned_at.isoformat() if self.planned_at else None,
            "state": self.state,
            "weather_enabled": self.weather_enabled,
            "color": self.color,
            "repeat": self.repeat,
            "pause_minutes": self.pause_minutes,
            "entries": [
                e.to_dict() for e in self.entries
            ],
        }
    
    def all_entries(self):
        return self.entries

    def is_injected(self):
        return self.state in ("injected", "running")

    def is_done(self):
        return self.state == "done"

    def has_active_entries(self):
        """
        True if any entry still running or queued.
        """
        for e in self.entries:
            if e.status in ("queued", "running"):
                return True
        return False

    def mark_injected(self):
        self.state = "injected"

    def mark_done(self):
        self.state = "done"

    def mark_cancelled(self):
        self.state = "cancelled" 

