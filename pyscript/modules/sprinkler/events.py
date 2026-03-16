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

log_events           = logging.getLogger("pyscript.sprinkler.events")

log_events.debug("Module reloaded")

class SprinklerEvents:
    class Zone:
        # ---- Zone ----
        STARTED             = "ZONE_STARTED"
        CANCELLED           = "ZONE_CANCELLED"
        EXTENDED            = "ZONE_EXTENDED"
        UPDATED             = "ZONE_UPDATED"
        DELETED             = "ZONE_DELETED"
        FINISHED            = "ZONE_FINISHED"
        ADDED               = "ZONE_ADDED"

        RuntimeWarning      = "ZONE_RUNNING"
        QUEUED              = "ZONE_QUEUED"
        IN_PROGRAM          = "ZONE_IN_PROGRAM"
        INVALID_PAYLOAD     = "ZONE_INVALID_PAYLOAD"
        NOT_FOUND           = "ZONE_NOT_FOUND"
        NOT_RUNNING         = "ZONE_NOT_RUNNING"
        NOT_QUEUED          = "ZONE_NOT_QUEUED"
        NOT_CANCELLED       = "ZONE_NOT_CANCELLED"
        NOT_UPDATED         = "ZONE_NOT_UPDATED"
        IDLE                = "ZONE_IDLE"
        IGNORED             = "ZONE_IGNORED"
        NOT_ADDED           = "ZONE_NOT_ADDED"
        ACTIVE              = "ZONE_ACTIVE"
        SOIL_RESET          = "ZONE_SOIL_RESET"

    class Program:
        # ---- Program ----
        STARTED             = "PROGRAM_STARTED"
        CANCELLED           = "PROGRAM_CANCELLED"
        COMPLETED           = "PROGRAM_COMPLETED"

        CONFLICT            = "PROGRAM_CONFLICT"
        NOT_FOUND           = "PROGRAM_NOT_FOUND"
        NOT_ADDED           = "PROGRAM_NOT_ADDED"
        NOT_UPDATED         = "PROGRAM_NOT_UPDATED"
        NOT_DELETED         = "PROGRAM_NOT_DELETED"
        ADDED               = "PROGRAM_ADDED"
        UPDATED             = "PROGRAM_UPDATED"
        DELETED             = "PROGRAM_DELETED"
        NOT_STARTED         = "PROGRAM_NOT_STARTED"
        NOT_RUNNING         = "PROGRAM_NOT_RUNNING"
        NOT_STOPPED         = "PROGRAM_NOT_STOPPED"
        STOPPED             = "PROGRAM_STOPPED"
        NOT_SKIPPED         = "PROGRAM_NOT_SKIPPED"
        SKIPPED             = "PROGRAM_SKIPPED" 

    class Scheduler:
        # ---- Scheduler ----
        STARTED             = "SCHEDULER_STARTED"
        STOPPED             = "SCHEDULER_STOPPED"
        ERROR               = "SCHEDULER_ERROR"

    class Internal:
        # ---- Internal ----
        PROGRAMS_CHANGED    = "INTERNAL_PROGRAMS_CHANGED"
        ERROR               = "INTERNAL_ERROR"

    class User:
        # ---- User ----
        NOT_ADMIN           = "USER_NOT_ADMIN"


