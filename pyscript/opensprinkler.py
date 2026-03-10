import datetime
import logging
import json
import os

log = logging.getLogger("pyscript.opensprinkler")

# -------------------------
# Globale Zones aus json
# -------------------------
ZONES_FILE = "/config/pyscript/sprinkler_zones.json"

_loaded = False

_zones = {}
valid_zones = {}

def opensprinkler_load_zones(force=False):
    global _zones
    try:
        # Open the file
        log.info(f"OpenSprinkler: open Zones-File {ZONES_FILE}")
        fd = os.open(ZONES_FILE, os.O_RDWR)

        #getting file size
        f_size = os.path.getsize(ZONES_FILE)	

        # Reading text
        log.info(f"OpenSprinkler: File- Size {f_size}")
        zones_json_str = os.read(fd, f_size)

        data = json.loads(zones_json_str)
        log.info(f"OpenSprinkler: Zones= {zones_json_str}")
        # Close opened file
        os.close(fd) # **korrekte Pyscript-Funktion**

    except Exception as e:
        log.error(f"OpenSprinkler: Cannot read zones JSON: {e}")
        log.error(f"OpenSprinkler: Json = {zones_json_str}")
        _zones = {}
        return {}

    valid_zones = {} 
    zones_list = data.get("zones", [])
    
    for zone in zones_list:
        zone_id = zone.get("zone_id")

        if not zone_id or not zone.get("name") or not zone.get("switch"):
            log.warning(f"Zone ungültig: {zone}")
            continue

        valid_zones[zone_id] = {
            "zone_id": zone_id,
            "name": zone["name"],
            "switch": zone["switch"],
            "enabled": zone.get("enabled", True),
        }

    _zones = valid_zones
    log.info(f"OpenSprinkler: Loaded zones = {[(k, v['name'], v['switch']) for k, v in _zones.items()]}")

@time_trigger("startup")
def opensprinkler_start():
    global _zones
    log.info("OpenSprinkler: lade Zonen aus JSON")

    opensprinkler_load_zones()

    if not _zones:
        log.error(f"OpenSprinkler: No zones loaded")
        
@service
def opensprinkler(cmd):
    """
    cmd = "set zone_01 on"
    """
    parts = cmd.split()
    if len(parts) != 3 or parts[0] != "set":
        log.error(f"Invalid cmd: {cmd}")
        return

    zone_key = parts[1]    # z.B. "zone_01"
    state = parts[2]       # "on" / "off"

    try:
        zone_key = int(zone_key)
    except (TypeError, ValueError):
        log.error(f"Invalid zone key: {zone_key}")
        return

    zone = _zones.get(zone_key)
    # Lookup im geladenen _zones Dict
    zone = _zones.get(zone_key)  # _zones ist dein JSON-Dict
    
    if not zone:
        log.error(f"OpenSprinkler: Unknown zone: {zone_key}")
        return
    
    entity_id = zone['switch']

    log.info(f"OpenSprinkler: OS cmd: {zone_key} -> {state} ({entity_id})")

    if state == "on":
        switch.turn_on(entity_id=entity_id)
    elif state == "off":
        switch.turn_off(entity_id=entity_id)
    else:
        log.error(f"OpenSprinkler: Unknown state: {state}")
        
