import os
import json
import logging
import math
from pathlib import Path
from datetime import date as dt_date, datetime, timedelta


from pyscript.modules.sprinkler.sprinkler_config import (
    HYDRO_FILE, MAX_HISTORY_DAYS
)

log_store           = logging.getLogger("pyscript.sprinkler.hydrostore")

class HydroStore:

    def __init__(self):
        self.today = {}
        self._dirty_persist = False
        self._dirty_state = {
            "global": {
                "etoengine": False,
                "sprinkler": False,
            },
            "zones": {
                "sprinkler": set(),
            }
        }
        self._load_today()

    def consume_dirty(self, scope, consumer):

        if scope == "global":
            val = self._dirty_state["global"].get(consumer, False)
            self._dirty_state["global"][consumer] = False
            return val

        if scope == "zones":
            zones = set(self._dirty_state["zones"].get(consumer, set()))
            self._dirty_state["zones"][consumer].clear()
            return zones

        # alles
        global_dirty = self._dirty_state["global"]
        zones = set(self._dirty_state["zones"])

        self._dirty_state["global"] = False
        self._dirty_state["zones"].clear()

        return global_dirty, zones

    def mark_zone_dirty(self, zone_key):

        if not zone_key:
            return

        if zone_key not in self._dirty_state["zones"]:
            self._dirty_state["zones"]["sprinkler"].add(zone_key)
            log_store.debug(f"Zone dirty gesetzt: {zone_key}")

    def mark_zones_dirty(self, zone_keys):

        if not zone_keys:
            return

        for zone_key in zone_keys:
            if zone_key not in self._dirty_state["zones"]:
                self._dirty_state["zones"].add(zone_key)

        log_store.debug(f"Zonen dirty gesetzt: {zone_keys}")

    def mark_all_zones_dirty(self, zone_store):

        zone_keys = [f"zone:{z['zone_id']}" for z in zone_store.all().values()]

        self._dirty_state["zones"].update(zone_keys)

        log_store.debug("Alle Zonen dirty gesetzt")

    def mark_global_dirty(self):
        for consumer in self._dirty_state["global"]:
            self._dirty_state["global"][consumer] = True
                        
    def _write_file(self, path: Path, payload: bytes, flags):
        fd = os.open(str(path), flags, 0o644)
        try:
            if not payload.endswith(b"\n"):
                payload += b"\n"
            os.write(fd, payload)
        finally:
            os.close(fd)
            log_store.debug(f"File {path} geschrieben")        

    def _now_ts(self):
        return datetime.utcnow().isoformat() + "Z"

    def _val(self, v):
        if isinstance(v, dict):
            return v.get("value")
        return v

    def _num(self, v, default=0):
        val = self._val(v)
        return val if val is not None else default

    def _sum_values(self, data):
        if isinstance(data, dict):
            return sum(v for v in data.values() if v is not None)
        return data or 0
        
    def _ensure_path(self, date, scope, key, kind):

        d = self.today.setdefault(str(date), {})
        s = d.setdefault(scope, {})
        k = s.setdefault(key, {})
        k.setdefault(kind, {})
        
    def _ensure_meta(self):
        if not hasattr(self, "meta") or self.meta is None:
            self.meta = {}
            
    def get_anchor(self, scope):
        self._ensure_meta()
        return self.meta.get(scope, {}).get("soil_anchor")

    def set_anchor(self, scope, value):
        self._ensure_meta()
        self.meta.setdefault(scope, {})["soil_anchor"] = value

    def _get_all_scopes(self):
        scopes = set()

        for day in self.today.values():
            for scope in day.keys():
                scopes.add(scope)

        return scopes
    
    def _migrate_meta_from_today(self):

        if not self.today:
            return

        days_sorted = sorted(self.today.keys())
        first_day = days_sorted[0]

        for scope in self._get_all_scopes():

            val = (
                self.today.get(first_day, {})
                .get(scope, {})
                .get("soil_mm", {})
                .get("derived", {})
                .get("model", {})
                .get("value")
            )

            if val is not None:
                self.set_anchor(scope, val)

    # ------------------------------------------------
    # LOAD TODAY STORE
    # ------------------------------------------------
    def _load_today(self):

        if not HYDRO_FILE.exists():
            self.today = {}
            return

        size = os.path.getsize(HYDRO_FILE)
        fd = os.open(str(HYDRO_FILE), os.O_RDONLY)

        try:
            data = os.read(fd, size)
        finally:
            os.close(fd)

        if not data:
            self.today = {}
            self.meta = {}
            return

        raw = json.loads(data.decode("utf-8"))

        # ------------------------
        # MIGRATION
        # ------------------------

        if "today" in raw:
            # ✅ neues Format
            self.today = raw.get("today", {})
            self.meta  = raw.get("meta", {})
        else:
            # 🔥 altes Format → MIGRATION
            self.today = raw
            self.meta = {}

            self._migrate_meta_from_today()

        # ------------------------
        # PRUNE danach
        # ------------------------

        self.prune()
        
    # ------------------------------------------------
    # SAVE TODAY STORE
    # ------------------------------------------------
    def _save_today(self):

        payload = json.dumps({
            "today": self.today,
            "meta": getattr(self, "meta", {})
        }, indent=2).encode("utf-8")

        try:
            self._write_file(HYDRO_FILE, payload, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
        finally:
            log_store.info(f"Store Today geschrieben")

    def save_today(self):
        if not self._dirty_persist:
                return
        try:
            task.executor(self._save_today)
        except NameError:
            self._save_today()
            self._dirty_persist = False

    def _median(self, values):

        vals = [v for v in values if v is not None]

        if not vals:
            return None

        vals.sort()

        n = len(vals)
        mid = n // 2

        if n % 2:            
            return vals[mid]

        return (vals[mid-1] + vals[mid]) / 2
           
    # ------------------------------------------------
    # PRUNE OLD HISTORY
    # ------------------------------------------------
    def prune(self, days=MAX_HISTORY_DAYS):

        cutoff = dt_date.today() - timedelta(days=days)

        # ------------------------
        # 1. Anchor bestimmen
        # ------------------------

        # sortierte Tage
        days_sorted = sorted(self.today.keys())

        for scope in self._get_all_scopes():

            last_value = None

            for d in days_sorted:
                day_date = datetime.fromisoformat(d).date()

                if day_date > cutoff:
                    break  # wir sind im Fenster angekommen

                val = (
                    self.today.get(d, {})
                    .get(scope, {})
                    .get("soil_mm", {})
                    .get("derived", {})
                    .get("model", {})
                    .get("value")
                )

                if val is not None:
                    last_value = val

            if last_value is not None:
                self.set_anchor(scope, last_value)

        # ------------------------
        # 2. Jetzt erst prune
        # ------------------------

        self.today = {
            d: v for d, v in self.today.items()
            if datetime.fromisoformat(d).date() >= cutoff
        }

        self._dirty_persist = True
        self.save_today()

    # -----------------------------
    # CORE: FAO-56-Light (Stub)
    # -----------------------------
    def calculate_eto_fao56_light(self, data: dict, latitude: float, day: str) -> float:
        """
        FAO-56-Light Reference Evapotranspiration (mm/day)
        Uses temperature, humidity, sun hours, fixed wind.
        """

        # -----------------------------
        # Input
        # -----------------------------
        t_mean = data["temp_c"]
        rh_mean = data.get("humidity_pct", 60)
        wind = data["wind_ms"]
        sun_hours = data.get("sun_hours")

        # -----------------------------
        # Constants
        # -----------------------------
        G = 0.0  # soil heat flux (daily)
        gamma = 0.066  # psychrometric constant (kPa/°C)
        albedo = 0.23

        # -----------------------------
        # Saturation vapour pressure
        # -----------------------------
        es = 0.6108 * math.exp((17.27 * t_mean) / (t_mean + 237.3))
        ea = es * (rh_mean / 100.0)
        delta = (4098 * es) / ((t_mean + 237.3) ** 2)

        # -----------------------------
        # Extraterrestrial radiation
        # -----------------------------
        # day_of_year = datetime.now().timetuple().tm_yday
        day_of_year = datetime.fromisoformat(day).timetuple().tm_yday
        lat_rad = math.radians(latitude)

        dr = 1 + 0.033 * math.cos(2 * math.pi / 365 * day_of_year)
        solar_dec = 0.409 * math.sin(2 * math.pi / 365 * day_of_year - 1.39)
        ws = math.acos(-math.tan(lat_rad) * math.tan(solar_dec))

        ra = (
            24 * 60 / math.pi
            * 0.0820
            * dr
            * (
                ws * math.sin(lat_rad) * math.sin(solar_dec)
                + math.cos(lat_rad) * math.cos(solar_dec) * math.sin(ws)
            )
        )

        # -----------------------------
        # Solar radiation from sun hours
        # -----------------------------
        if sun_hours is not None:
            n = sun_hours
            N = 24 / math.pi * ws
            rs = (0.25 + 0.5 * (n / N)) * ra
        else:
            rs = 0.75 * ra  # fallback

        rns = (1 - albedo) * rs
        rnl = 4.903e-9 * ((t_mean + 273.16) ** 4) * (0.34 - 0.14 * math.sqrt(ea))
        rn = rns - rnl

        # -----------------------------
        # Penman-Monteith (reduced)
        # -----------------------------
        eto = (
            (0.408 * delta * (rn - G))
            + gamma * (900 / (t_mean + 273)) * wind * (es - ea)
        ) / (delta + gamma * (1 + 0.34 * wind))

        log_store.debug(f"ETo inputs: T={t_mean} RH={rh_mean} Sun={sun_hours} Wind={wind}")
        log_store.debug(f"ETo result: {eto:.2f} mm")
        
        return max(0.0, eto)

    def compute_eto_for_day(self, latitude: float, day):

        scope = "global"
        results = {}

        # 🔥 bereits vorhandene direkte ETo holen
        direct_eto = self.get(scope, "eto_mm", "observed", date=day)

        if direct_eto:
            results.setdefault("observed", {}).update(direct_eto)

        # 🔥 klassische Berechnung für andere Quellen
        variants = self.get_variants(scope, "temp_c", day)

        for variant in variants:

            sources = self.get_sources(scope, "temp_c", variant, day)

            for source in sources:

                # 🔥 skip wenn schon direct vorhanden
                if source in results.get(variant, {}):
                    continue

                try:
                    temp = self.get(scope, "temp_c", variant, source, day)
                    hum  = self.get(scope, "humidity_pct", variant, source, day)
                    wind = self.get(scope, "wind_ms", variant, source, day)
                    sun  = self.get(scope, "sun_hours", variant, source, day)

                    if temp is None or hum is None:
                        continue

                    eto = self.calculate_eto_fao56_light({
                        "temp_c": temp,
                        "humidity_pct": hum,
                        "wind_ms": wind,
                        "sun_hours": sun,
                    }, latitude, day)

                    results.setdefault(variant, {})[source] = round(eto, 3)

                except Exception as e:
                    log_store.error(f"ETo failed {day} {variant}/{source}: {e}")

        # 🔥 WRITE BACK
        for variant, sources in results.items():
            for source, value in sources.items():
                self.write("global", "eto_mm", variant, source, value, day)

        return results
        
    def compute_eto_all_days(self, latitude, force_all: bool = False):

        scope = "global"
        today = dt_date.today().isoformat()

        days = self.get_days(scope)

        results = {}

        for day in sorted(days):
            if day < today and not force_all:
                continue

            try:
                results[day] = self.compute_eto_for_day(latitude, day)

            except Exception as e:
                log_store.error(f"ETo failed for day {day}: {e}")
        
        return results

    def compute_soil_for_day(self, scope, soil_min, soil_opt, soil_max, day):
        prev_day = (datetime.fromisoformat(day).date() - timedelta(days=1)).isoformat()

        soil_prev = self.get(scope, "soil_mm", "derived", "model", prev_day)

        if soil_prev is None:
            soil_prev = self.get_anchor(scope)

        if soil_prev is None:
            soil_prev = soil_opt

        # ------------------------
        # ETo
        # ------------------------
        #eto = self.get(scope, "eto_mm", "derived", "current", day)

        #if eto is None:
        eto = self.get("global", "eto_mm", "derived", "median", day) or 0

        # ------------------------
        # Rain
        # ------------------------
        rain = self.get("global", "rain_mm", "derived", "median", day) or 0

        # ------------------------
        # Irrigation
        # ------------------------
        irrigation = self.get(scope, "irrigation_mm", "derived", "median", day) or 0

        # ------------------------
        # SKIP wenn kein ETo
        # ------------------------
        if eto is None:
            return

        # ------------------------
        # Compute
        # ------------------------
        soil = soil_prev + (rain or 0) + irrigation - eto

        soil = max(soil_min, min(soil, soil_max))

        self.write(scope, "soil_mm", "derived", "model", round(soil, 2), day)     

    def compute_soil_all_days(self, soil_min, soil_opt, soil_max, scope: str = "global", force_all: bool = False):

        today = dt_date.today().isoformat()

        days = sorted(self.today.keys())

        for day in sorted(days):
            if day < today and not force_all:
                continue
            
            try:
                self.compute_soil_for_day(scope, soil_min, soil_opt, soil_max, day)

            except Exception as e:
                log_store.error(f"Soil {scope} failed for day {day}: {e}")

    # ------------------------------------------------
    # Zonen, Irrigation
    # ------------------------------------------------
    def clear_forecast_irrigation_for_zone(self, zone_key, day=None):

        changed = False

        days = [day] if day else list(self.today.keys())

        for d in days:
            day_block = self.today.get(d, {})
            scope_block = day_block.get(zone_key)

            if not scope_block:
                continue

            irrigation = scope_block.get("irrigation_mm")
            if not irrigation:
                continue

            # ------------------------
            # forecast löschen
            # ------------------------
            if "forecast" in irrigation:
                del irrigation["forecast"]
                changed = True

            # ------------------------
            # derived löschen (wichtig!)
            # ------------------------
            if "derived" in irrigation:
                del irrigation["derived"]
                changed = True

            # optional: leere Struktur aufräumen
            if not irrigation:
                scope_block.pop("irrigation_mm", None)

        if changed:
            self._dirty_persist = True
            self.mark_zone_dirty(zone_key)

        return changed
        
    def clear_forecast_irrigation_all_zones(self, zone_keys, day=None):
        any_changed = False

        for zone_key in zone_keys:
            changed = self.clear_forecast_irrigation_for_zone(zone_key, day=day)
            if changed:
                any_changed = True

        if any_changed:
            self.save_today()

        return any_changed
        
    def add_actual_irrigation(self, zone_key, value):

        today = dt_date.today().isoformat()

        # bestehende Werte holen
        existing = self.get(zone_key, "irrigation_mm", "observed", date=today)

        total = value

        if isinstance(existing, dict):
            total += sum(v for v in existing.values() if v is not None)

        self.write(
            zone_key,
            "irrigation_mm",
            "observed",
            "runtime",
            round(total, 2),
            today
        )
        
    
#    def clear_forecast_irrigation(self):
#
#        changed = False
#
#        for day, day_block in self.today.items():
#            for scope, scope_block in day_block.items():
#                irrigation = scope_block.get("irrigation_mm")
#                if not irrigation:
#                    continue
#
#                if "forecast" in irrigation:
#                    del irrigation["forecast"]
#                    changed = True
#
#                if "derived" in irrigation:
#                    del irrigation["derived"]
#                    changed = True
#
#
#        if changed:
#            self._dirty_persist = True
#            self.save_today()

        # 👉 fachliches dirty
        #if scope == "global":
        #    self._dirty_state["global"] = True
        #else:
        #    self._dirty_state["zones"].add(scope)

    def add_forecast_irrigation(self, forecast_date, zone_key, mm):

        day = str(forecast_date)
        log_store.info(f"add forecast irrigation {zone_key} {forecast_date} {day}")

        existing = self.get(zone_key, "irrigation_mm", "forecast", date=day)

        total = mm

        if isinstance(existing, dict):
            total += sum(v for v in existing.values() if v is not None)

        self.write(
            zone_key,
            "irrigation_mm",
            "forecast",
            "scheduler",
            round(total, 2),
            day
        )

    # ------------------------------------------------
    # Store API
    # ------------------------------------------------
    def write_observed(self, scope, key, source, value):

        today = dt_date.today().isoformat()
        
        self._ensure_path(today, scope, key, "observed")

        self.today[today][scope][key]["observed"][source] = {
            "value": value,
            "ts": self._now_ts()
        }

        # 🔥 AUTO MEDIAN, AUTO CURRENT
        self._update_derived_median(today, scope, key)
        self._update_derived_current(today, scope, key)

        self._dirty_persist = True
        self.save_today()

        # 👉 fachliches dirty
        if scope == "global":
            self.mark_global_dirty()
        else:
            self.mark_zone_dirty(scope)

    def write_forecast(self, forecast_date, scope, key, source, value):

        d = str(forecast_date)

        self._ensure_path(d, scope, key, "forecast")

        self.today[d][scope][key]["forecast"][source] = {
            "value": value,
            "ts": self._now_ts()
        }

        self._update_derived_median(forecast_date, scope, key)
        self._update_derived_current(forecast_date, scope, key)

        self._dirty_persist = True
        self.save_today()

        # 👉 fachliches dirty
        if scope == "global":
            self.mark_global_dirty()
        else:
            self.mark_zone_dirty(scope)

    def write(self, scope, key, variant, source, value, day):

        day = str(day)

        d = self.today.setdefault(day, {})
        s = d.setdefault(scope, {})
        k = s.setdefault(key, {})
        v = k.setdefault(variant, {})

        # ------------------------
        # write value
        # ------------------------
        self.today[day][scope][key][variant][source] = {
            "value": value,
            "ts": self._now_ts()
        }

        self._update_derived_median(day, scope, key)
        self._update_derived_current(day, scope, key)

        # persist_dirty
        self._dirty_persist = True
        self.save_today()

        # 👉 fachliches dirty
        if scope == "global":
            self.mark_global_dirty()
        else:
            self.mark_zone_dirty(scope)


    def get(self, scope, key, kind, source=None, date=None):

        if date is None:
            date = dt_date.today().isoformat()

        block = (
            self.today
            .get(date, {})
            .get(scope, {})
            .get(key, {})
            .get(kind, {})
        )

        if source:
            return self._val(block.get(source))

        return {
            s: self._val(v)
            for s, v in block.items()
        }
        
    def get_yesterday(self, scope, key, source="median"):

        y = (dt_date.today() - timedelta(days=1)).isoformat()

        return self.get(scope, key, "derived", source, y)

    def last_known_value(self, scope, key, source="median"):

        today = date.today().isoformat()

        candidates = []

        for d, day_block in self.today.items():

            if d >= today:
                continue

            val = self.get(scope, key, "derived", source, d)

            if val is not None:
                candidates.append((d, val))

        if not candidates:
            return None

        # letztes Datum nehmen
        return sorted(candidates)[-1][1]    
    
    def get_observed(self, scope, key):
        return self.get(scope, key, "observed")

    def get_forecast(self, date, scope, key):
        return self.get(scope, key, "forecast", date=date)

    def get_current(self, scope, key):
        return self.get(scope, key, "derived", "current")

    def get_days(self, scope=None):

        days = set()

        for day, day_block in self.today.items():

            if scope is None:
                days.add(day)
                continue

            if scope in day_block:
                days.add(day)

        return sorted(days)

    def get_variants(self, scope, key, day):

        day_block = (
            self.today
            .get(day, {})
            .get(scope, {})
            .get(key, {})
        )

        if not isinstance(day_block, dict):
            return []

        return list(day_block.keys())

    def get_sources(self, scope, key, variant, day):

        block = (
            self.today
            .get(day, {})
            .get(scope, {})
            .get(key, {})
            .get(variant, {})
        )

        if not isinstance(block, dict):
            return []

        return list(block.keys())

    # ------------------------------------------------
    # Median, Current
    # ------------------------------------------------
    def _compute_median(self, day, scope, key):

        day = str(day)
        today = dt_date.today().isoformat()
        
        block = (
            self.today
            .get(day, {})
            .get(scope, {})
            .get(key, {})
        )

        if not isinstance(block, dict):
            return None

        values = []

        # ------------------------
        # TODAY → observed bevorzugen
        # ------------------------
        if day == today:

            observed = block.get("observed", {})

            if isinstance(observed, dict):
                for v in observed.values():
                    val = self._val(v)
                    if val is not None:
                        values.append(val)

            # fallback → forecast
            if not values:
                forecast = block.get("forecast", {})
                if isinstance(forecast, dict):
                    for v in forecast.values():
                        val = self._val(v)
                        if val is not None:
                            values.append(val)

        # ------------------------
        # FUTURE → forecast only
        # ------------------------
        else:

            forecast = block.get("forecast", {})
            if isinstance(forecast, dict):
                for v in forecast.values():
                    val = self._val(v)
                    if val is not None:
                        values.append(val)

        if not values:
            return None

        return round(self._median(values), 3)

    def _update_derived_median(self, day, scope, key):

        val = self._compute_median(day, scope, key)

        if val is None:
            return

        self._ensure_path(day, scope, key, "derived")

        self.today[str(day)][scope][key]["derived"]["median"] = {
            "value": val,
            "ts": self._now_ts()
        }

        self._dirty_persist = True

    def _compute_current(self, day, scope, key):

        day = str(day)
        today = dt_date.today().isoformat()
        
        med = self.get(scope, key, "derived", "median", day)

        if med is None:
            return None

        # ------------------------
        # FUTURE → direkt median
        # ------------------------
        if day != today:
            return round(med, 3)

        # ------------------------
        # TODAY → blend observed + forecast
        # ------------------------

        med_obs = None
        med_fc  = None

        # observed median (nur heute sinnvoll)
        block = (
            self.today
            .get(day, {})
            .get(scope, {})
            .get(key, {})
        )

        observed = block.get("observed", {})
        forecast = block.get("forecast", {})

        obs_vals = [self._val(v) for v in observed.values() if self._val(v) is not None]
        fc_vals  = [self._val(v) for v in forecast.values() if self._val(v) is not None]

        if obs_vals:
            med_obs = self._median(obs_vals)

        if fc_vals:
            med_fc = self._median(fc_vals)

        # ------------------------
        # fallback logic
        # ------------------------
        if med_obs is None and med_fc is None:
            return None

        if med_obs is None:
            return round(med_fc, 3)

        if med_fc is None:
            return round(med_obs, 3)

        # ------------------------
        # blend
        # ------------------------
        now = datetime.utcnow()
        hour = now.hour + now.minute / 60

        t = min(1.0, max(0.0, hour / 24))

        current = med_obs * t + med_fc * (1 - t)

        return round(current, 3)

    def _update_derived_current(self, day, scope, key):

        val = self._compute_current(day, scope, key)

        if val is None:
            return

        self._ensure_path(day, scope, key, "derived")

        self.today[str(day)][scope][key]["derived"]["current"] = {
            "value": val,
            "ts": self._now_ts()
        }

        self._dirty = True    

    # ------------------------------------------------
    # Build-Series (Projektionen, Charts)
    # ------------------------------------------------
    def build_series(self, scope, key, days=None, start=None, end=None):

        result = {}

        all_days = self.get_days(scope)
        if not all_days:
            return result

        all_days = sorted(all_days)

        # ------------------------
        # RANGE FILTER (neu)
        # ------------------------
        if start:
            all_days = [d for d in all_days if d >= start]

        if end:
            all_days = [d for d in all_days if d <= end]

        # ------------------------
        # FALLBACK: days (alt)
        # ------------------------
        if days and not (start or end):
            all_days = all_days[:days]

        today = dt_date.today().isoformat()

        for day in all_days:

            value = None

            # ------------------------
            # TODAY → current
            # ------------------------
            #if day == today:
            #    value = self.get(scope, key, "derived", "current", day)

            # ------------------------
            # FUTURE → median
            # ------------------------
            if value is None:
                value = self.get(scope, key, "derived", "median", day)

            # ------------------------
            # SOIL → model
            # ------------------------
            if value is None:
                value = self.get(scope, key, "derived", "model", day)

            # ------------------------
            # FALLBACKS
            # ------------------------
            if value is None:
                fc = self.get(scope, key, "forecast", date=day)
                if fc:
                    vals = [v for v in fc.values() if v is not None]
                    if vals:
                        value = self._median(vals)

            if value is None and day == today:
                obs = self.get(scope, key, "observed", date=day)
                if obs:
                    vals = [v for v in obs.values() if v is not None]
                    if vals:
                        value = self._median(vals)

            if value is not None:
                result[day] = value

            #result.append({
            #    "date": day,
            #    "value": value
            #})

        log_store.debug(f"build_series: {scope} {key} {result}")
        return result
                    
hydro_store = HydroStore()

