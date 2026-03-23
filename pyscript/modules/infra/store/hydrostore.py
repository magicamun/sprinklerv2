import os
import json
import logging
from pathlib import Path
from datetime import date as dt_date, datetime, timedelta


from pyscript.modules.sprinkler.sprinkler_config import (
    TODAY_FILE, HISTORY_FILE, MAX_HISTORY_DAYS
)

TODAY_FILE = Path("/config/sprinkler/hydro_today.json")
HISTORY_FILE = Path("/config/sprinkler/hydro_history.json")

log_store           = logging.getLogger("pyscript.sprinkler.hydrostore")

class HydroStore:

    def __init__(self):
        self.today = {}
        self._dirty = False
        self._load_today()

    def _write_file(self, path: Path, payload: bytes, flags):
        fd = os.open(str(path), flags, 0o644)
        try:
            if not payload.endswith(b"\n"):
                payload += b"\n"
            os.write(fd, payload)
        finally:
            os.close(fd)
            log_store.info(f"File {path} geschrieben")        

    def _now_ts(self):
        return datetime.utcnow().isoformat() + "Z"

    def _val(self, v):
        if isinstance(v, dict):
            return v.get("value")
        return v

    def _num(self, v, default=0):
        val = self._val(v)
        return val if val is not None else default
        
    def _ensure_path(self, date, scope, key, kind):

        d = self.today.setdefault(str(date), {})
        s = d.setdefault(scope, {})
        k = s.setdefault(key, {})
        k.setdefault(kind, {})
        
    # ------------------------------------------------
    # LOAD TODAY STORE
    # ------------------------------------------------
    def _load_today(self):

        if not TODAY_FILE.exists():
            self.today = {}
            return

        size = os.path.getsize(TODAY_FILE)
        fd = os.open(str(TODAY_FILE), os.O_RDONLY)

        try:
            data = os.read(fd, size)
        finally:
            os.close(fd)

        if not data:
            self.today = {}
            return

        self.today = json.loads(data.decode("utf-8"))

        today_str = dt_date.today().isoformat()

        self.prune()

    # ------------------------------------------------
    # SAVE TODAY STORE
    # ------------------------------------------------
    def _save_today(self):

        payload = json.dumps(self.today, indent=2).encode("utf-8")

        try:
            self._write_file(TODAY_FILE, payload, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
        finally:
            log_store.info(f"Store Today geschrieben")

    def save_today(self):
        if not self._dirty:
                return
        try:
            task.executor(self._save_today)
        except NameError:
            self._save_today()
            self._dirty = False

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

        self.today = {
            d: v for d, v in self.today.items()
            if datetime.fromisoformat(d).date() >= cutoff
        }

        self._dirty = True
        self.save_today()

    # ---------------------------------------------------------
    # Soil berechnen "ab heute" Startwert gestern oder Default
    # ---------------------------------------------------------
    def compute_soil_all_days(self, scope, soil_min, soil_opt, soil_max):

        days = self.get_days(scope)

        if not days:
            return

        days = sorted(days)

        # ------------------------
        # LOOP
        # ------------------------

        for day in days:
            prev_day = (datetime.fromisoformat(day).date() - timedelta(days=1)).isoformat()

            soil_prev = self.get(scope, "soil_mm", "derived", "model", prev_day)

            if soil_prev is None:
                soil_prev = soil_opt
            # ------------------------
            # ETo
            # ------------------------
            eto = self.get(scope, "eto_mm", "derived", "current", day)

            if eto is None:
                eto = self.get(scope, "eto_mm", "derived", "median", day)

            # ------------------------
            # Rain
            # ------------------------
            rain = self.get(scope, "rain_mm", "derived", "median", day)

            # ------------------------
            # Irrigation
            # ------------------------
            irrigation = (
                self.today
                .get(day, {})
                .get(scope, {})
                .get("irrigation_mm", {})
                .get(scope, 0)
            )

            # ------------------------
            # SKIP wenn kein ETo
            # ------------------------
            if eto is None:
                continue

            # ------------------------
            # Compute
            # ------------------------
            soil = soil_prev + (rain or 0) + irrigation - eto

            soil = max(soil_min, min(soil, soil_max))

            self.write(scope, "soil_mm", "derived", "model", round(soil, 2), day)     

    # ------------------------------------------------
    # Anpassungsrechung Zonendefizit mit Forecast-Gewichtung
    # ------------------------------------------------
    def adaptation_deficit(self, zone_key, soil_optimal, weights=(0.7,0.4,0.2), eto_factor=1.0, rain_factor=1.0, explain=False):

        soil = self.scope_value(zone_key, "soil", "median")

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

        days = sorted(self.today.keys())[:len(weights)-1]

        for i, d in enumerate(days):

            block = self.today.get(d, {})

            eto = self._val(block.get("eto_mm", {}).get("median"))

            rain = self._val(block.get("rain_mm", {}).get("median"))

            prob = self._val(block.get("prob_pct", {}).get("median"))

            rain_eff = round(rain * (prob / 100) * rain_factor, 2)
            eto_eff = round(eto * eto_factor, 2)

            irrigation = (
                block
                .get("irrigation_mm", {})
                .get(zone_key, 0)
            )

            soil = soil + rain_eff + irrigation - eto_eff

            deficit = max(0, soil_optimal - soil)

            deficit_sum += weights[i+1] * deficit

            details["forecast"].append({
                "date": d,
                "eto_mm": eto,
                "eto_effective_mm": eto_eff,
                "rain_mm": rain,
                "prob_pct": prob,
                "rain_effective_mm": rain_eff,
                "irrigation_planned_mm": irrigation,
                "soil_after_mm": soil,
                "deficit_mm": deficit,
                "weight": weights[i+1]
            })

        details["weighted_defici_mm"] = deficit_sum
        details["eto_factor"] = eto_factor
        details["rain_factor"] = rain_factor

        if explain:
            return deficit_sum, details

        return deficit_sum

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

        self._dirty = True
        self.save_today()

    def write_forecast(self, forecast_date, scope, key, source, value):

        d = str(forecast_date)

        self._ensure_path(d, scope, key, "forecast")

        self.today[d][scope][key]["forecast"][source] = {
            "value": value,
            "ts": self._now_ts()
        }

        self._update_derived_median(forecast_date, scope, key)
        self._update_derived_current(forecast_date, scope, key)

        self._dirty = True
        self.save_today()

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

        self._dirty = True
        self.save_today()

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

        self._dirty = True

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

        result = []

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
            if day == today:
                value = self.get(scope, key, "derived", "current", day)

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

            result.append({
                "date": day,
                "value": value
            })

        log_store.info(f"build_series: {result}")
        return result
                        
hydro_store = HydroStore()
log_store.info("=== HYDROSTORE DEBUG ===")
log_store.info(dir(hydro_store))
log_store.info(hydro_store.__class__)
log_store.info(hydro_store.__class__.__module__)
