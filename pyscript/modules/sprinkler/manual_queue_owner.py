from pyscript.modules.infra.queues.manual_queue import ManualQueue
from .zones import zone_store

class ManualQueueOwner:
    """
    Responsible for:
    - Initializing ManualQueue from zones
    - Reflecting zone changes into ManualQueue
    """

    def __init__(self, manual_queue: ManualQueue):
        self.queue = manual_queue

    # -------------------------------------------------
    # Initialization
    # -------------------------------------------------

    def initialize(self):
        """
        Build ManualQueue from ZoneStore.
        Idempotent.
        """
        self.queue.clear()

        zones = zone_store.all()

        for zone in zones.items():
            qe = self.queue.create_for_zone(zone)
            self.queue.add(qe)

    # -------------------------------------------------
    # Zone Change Handling
    # -------------------------------------------------

    def on_zone_added(self, zone: dict):
        qe = self.queue.create_for_zone(zone)
        self.queue.add(qe)

    def on_zone_updated(self, zone: dict):
        zone_id = zone.get("zone_id")
        if zone_id is None:
            return

        qid = str(zone_id)
        qe = self.queue.get(qid)

        if not qe:
            # Zone was not in queue yet (unlikely but safe)
            self.on_zone_added(zone)
            return

        duration = zone["default_duration"]
        # Reflect changes
        qe.zone_name = zone["name"]
        qe.switch = zone["switch"]
        qe.planned_duration = duration
        qe.scheduled_duration = duration
        qe.remaining = duration
        qe.load = zone.get("load", 1)
        qe.enabled = zone.get("enabled", True)
        qe.policy = "floating"

    def on_zone_deleted(self, zone_id: int):
        qid = str(zone_id)
        self.queue.remove(qid)

    def request_start(self, zone_id: int) -> bool:

        entry = self.queue.get(str(zone_id))

        if not entry:
            return False

        if entry.status != "idle":
            return False

        entry.status = "enqueue"

        return True