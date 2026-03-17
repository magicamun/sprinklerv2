# TODO v2.1
# unify build_series / build_soil_series
# introduce history index for O(1) lookup

import os
import json
import logging

from datetime import date, datetime, timedelta

from pyscript.modules.sprinkler.sprinkler_config import (
    TODAY_FILE, HISTORY_FILE, MAX_HISTORY_DAYS
)

log_store           = logging.getLogger("pyscript.sprinkler.irrigation_store")

class TimeseriesStore:

    def __init__(self):
        self._history_index = None
        self.today = {}
        self._dirty = False
        self._history_cache = None
        self._load_today()

    def _build_history_index(self):

        entries = self._read_history()

        index = {}

        for e in entries:

            key = (e["scope"], e["key"], e["source"])

            index.setdefault(key, {})[e["date"]] = e["value"]

        self._history_index = index

        log_store.info(f"History index built ({len(index)} keys)")

    def _get_history_series(self, scope, key, source):

        if self._history_index is None:
            self._build_history_index()

        return self._history_index.get((scope, key, source), {})

    def _write_file(self, path: Path, payload: bytes, flags):
        fd = os.open(str(path), flags, 0o644)
        try:
            os.write(fd, payload)
        finally:
            os.close(fd)
            log_store.info(f"File {path} geschrieben")        

    def _read_history(self):

        if self._history_cache is not None:
            return self._history_cache

        if not HISTORY_FILE.exists():
            self._history_cache = []
            return self._history_cache
            
        fd = os.open(str(HISTORY_FILE), os.O_RDONLY)

        try:
            size = os.path.getsize(HISTORY_FILE)
            data = os.read(fd, size)
        finally:
            os.close(fd)

        if not data:
            self._history_cache = []
            return self._history_cache
            
        lines = data.decode("utf-8").splitlines()

        self._history_cache = [
            json.loads(line) for line in lines if line.strip()
        ]
        log_store.info(f"Store History mit. {len(lines)} geladen")

        return self._history_cache

    # ------------------------------------------------
    # LOAD TODAY STORE
    # ------------------------------------------------

    def _load_today(self):

        if not TODAY_FILE.exists():
            self.today = {
                "date": date.today().isoformat(),
                "forecast": {}
            }
            return

        size = os.path.getsize(TODAY_FILE)
        fd = os.open(str(TODAY_FILE), os.O_RDONLY)

        try:
            data = os.read(fd, size)
        finally:
            os.close(fd)

        if not data:
            self.today = {
                "date": date.today().isoformat(),
                "forecast": {}
            }
            return

        self.today = json.loads(data.decode("utf-8"))

    # ------------------------------------------------
    # SAVE TODAY STORE
    # ------------------------------------------------
    def _save_today(self):

        payload = json.dumps(self.today, indent=2).encode("utf-8")

        try:
            self._write_file(TODAY_FILE, payload, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
        finally:
            log_store.info(f"Store Today geschrieben")

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

    def _update_median(self, data):

        values = []

        for src, val in data.items():

            if src == "median":
                continue

            values.append(val)

        med = self._median(values)

        if med is not None:
            data["median"] = med
            
    def _ensure_today(self):

        today = date.today().isoformat()

        store_date = self.today.get("date")

        if store_date == today:
            return

        # alter Tag muss historisiert werden
        self.snapshot_today()

        # neuer Tag
        self._reset_today()

    def save_today(self):
        if not self._dirty:
                return
        try:
            task.executor(self._save_today)
        except NameError:
            self._save_today()
            self._dirty = False

    # ------------------------------------------------
    # WRITE TODAY VALUE
    # ------------------------------------------------

    def write(self, scope, key, source, value):
        self._ensure_today()
        if scope not in self.today:
            self.today[scope] = {}

        if key not in self.today[scope]:
            self.today[scope][key] = {}

        self.today[scope][key][source] = value

        self._update_median(self.today[scope][key])

        self._dirty = True

        self.save_today()

    # ------------------------------------------------
    # AAdd to TODAY VALUE
    # ------------------------------------------------
    def add(self, scope, key, source, value):

        current = (
            self.today
            .get(scope, {})
            .get(key, {})
            .get(source)
        )

        if current is None:
            new_val = value
        else:
            new_val = current + value

        self.write(scope, key, source, round(new_val, 3))

    # ------------------------------------------------
    # WRITE FORECAST VALUE
    # ------------------------------------------------

    def write_forecast(self, forecast_date, key, source, value):
        self._ensure_today()
        forecast_date = str(forecast_date)

        if "forecast" not in self.today:
            self.today["forecast"] = {}

        if forecast_date not in self.today["forecast"]:
            self.today["forecast"][forecast_date] = {}

        if key not in self.today["forecast"][forecast_date]:
            self.today["forecast"][forecast_date][key] = {}

        self.today["forecast"][forecast_date][key][source] = value

        self._update_median(self.today["forecast"][forecast_date][key])

        self._dirty = True

        self.save_today()

    # ------------------------------------------------
    # Add Irrigation FORECAST VALUE
    # ------------------------------------------------
    def add_forecast_irrigation(self, forecast_date, zone_key, mm):

        forecast_date = str(forecast_date)

        if forecast_date not in self.today["forecast"]:
            self.today["forecast"][forecast_date] = {}

        if "irrigation" not in self.today["forecast"][forecast_date]:
            self.today["forecast"][forecast_date]["irrigation"] = {}

        self.today["forecast"][forecast_date]["irrigation"][zone_key] = mm

        self._dirty = True

        self.save_today()

    # ------------------------------------------------
    # Clear Irrigation FORECAST
    # ------------------------------------------------
    def clear_forecast_irrigation(self):

        forecast = self.today.get("forecast", {})

        changed = False

        for d in forecast:

            if "irrigation" in forecast[d]:
                del forecast[d]["irrigation"]
                changed = True

        if changed:
            self._dirty = True

    # ------------------------------------------------
    # READ TODAY VALUE
    # ------------------------------------------------

    def today_value(self, scope, key, source):

        return (
            self.today
            .get(scope, {})
            .get(key, {})
            .get(source)
        )

    
        # ------------------------------------------------

    # READ TODAY VALUE
    # ------------------------------------------------
    def yesterday_value(self, scope, key, source="median"):

        yesterday = (date.today() - timedelta(days=1)).isoformat()

        entries = self._read_history()

        for entry in reversed(entries):

            if (
                entry["date"] == yesterday
                and entry["scope"] == scope
                and entry["key"] == key
                and entry["source"] == source
            ):
                return entry["value"]

        return None

    # ------------------------------------------------
    # SNAPSHOT TODAY → HISTORY
    # ------------------------------------------------
    def snapshot_today(self):

        today_date = self.today.get("date")

        lines = []

        for scope in self.today:

            if scope in ["date", "forecast"]:
                continue

            for key in self.today[scope]:

                for source, value in self.today[scope][key].items():

                    entry = {
                        "date": today_date,
                        "scope": scope,
                        "key": key,
                        "source": source,
                        "value": value
                    }

                    lines.append(json.dumps(entry))

        if not lines:
            return

        payload = ("\n".join(lines) + "\n").encode("utf-8")

        try:
            self._write_file(HISTORY_FILE, payload, os.O_WRONLY | os.O_CREAT | os.O_APPEND)
        finally:
            log_store.info(f"Store heute historisiert")

        self._prune_history()
        self._history_cache = None
        self._history_index = None

    # ------------------------------------------------
    # PRUNE OLD HISTORY
    # ------------------------------------------------

    def _prune_history(self):

        entries = self._read_history()
        if len(entries) < 500:
            return

        cutoff = date.today() - timedelta(days=MAX_HISTORY_DAYS)

        filtered = []

        for entry in entries:

            entry_date = datetime.fromisoformat(entry["date"]).date()

            if entry_date >= cutoff:
                filtered.append(json.dumps(entry))

        payload = ("\n".join(filtered) + "\n").encode("utf-8")

        try:
            self._write_file(HISTORY_FILE, payload, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
        finally:
            log_store.info(f"Store - Historie gekürzt ({MAX_HISTORY_DAYS}) Tage")

    def _reset_today(self):

        self.today = {
            "date": date.today().isoformat(),
            "forecast": self.today.get("forecast",{})
        }
        self._dirty = True
        self.save_today()

    def _merge_series(self, base, today_val, today_date, forecast_iter):

        series = dict(base)

        if today_val is not None:
            series[today_date] = today_val

        for d, val in forecast_iter:
            if val is not None:
                series[d] = val

        return dict(sorted(series.items()))

    def build_series(self, scope, metric, source="median"):

        base = self._get_history_series(scope, metric, source)

        today_date = self.today.get("date")

        today_val = (
            self.today
            .get(scope, {})
            .get(metric, {})
            .get(source)
        )

        forecast = self.today.get("forecast", {})

        forecast_iter = (
            (d, forecast[d].get(metric, {}).get(source))
            for d in forecast
        )

        return self._merge_series(base, today_val, today_date, forecast_iter)

    def build_soil_series(self, scope, soil_min, soil_max):

        series = dict(
            self._get_history_series(scope, "soil", "median")
        )

        today = self.today.get("date")

        soil_today = self.today_value(scope, "soil", "median")

        if soil_today is None:
            return dict(sorted(series.items()))

        series[today] = round(soil_today, 2)

        soil = soil_today

        forecast = self.today.get("forecast", {})

        for d in sorted(forecast):

            eto = forecast[d].get("eto", {}).get("median")
            rain = forecast[d].get("rain", {}).get("median")

            irrigation = (
                forecast[d]
                .get("irrigation", {})
                .get(scope, 0)
            )

            if eto is None or rain is None:
                continue

            soil = soil + rain + irrigation - eto
            soil = max(soil_min, min(soil, soil_max))

            series[d] = round(soil, 2)

        return dict(sorted(series.items()))
                                
    def build_irrigation_series(self, scope):

        base = self._get_history_series(scope, "irrigation", "actual")

        today_date = self.today.get("date")

        today_val = (
            self.today
            .get(scope, {})
            .get("irrigation", {})
            .get("actual")
        )

        forecast = self.today.get("forecast", {})

        forecast_iter = (
            (d, forecast[d].get("irrigation", {}).get(scope))
            for d in forecast
        )

        return self._merge_series(base, today_val, today_date, forecast_iter)

    def compute_today_median(self, scope, key):
        self._ensure_today()
        data = self.today.get(scope, {}).get(key, {})
        self._update_median(data)
            
    def compute_soil_forecast(self, scope, minimum, maximum):
        self._ensure_today()
        soil_today = self.today_value(scope, "soil", "median")

        if soil_today is None:
            return

        soil = soil_today

        forecast = self.today.get("forecast", {})

        for d in sorted(forecast):#

            eto = forecast[d].get("eto", {}).get("median")
            rain = forecast[d].get("rain", {}).get("median")

            if eto is None or rain is None:
                continue

            soil = soil + rain - eto

            # IMPORTANT
            soil = max(minimum, min(soil, maximum))

            self.write_forecast(d, "soil", "model", round(soil, 2))
                    
    def adaptation_deficit(self, zone_key, soil_optimal, weights=(0.7,0.4,0.2), explain=False):

        soil = self.today_value(zone_key, "soil", "median")

        if soil is None:
            soil = soil_optimal

        forecast = self.today.get("forecast", {})

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

        days = sorted(forecast.keys())[:len(weights)-1]

        for i, d in enumerate(days):

            block = forecast[d]

            eto = block.get("eto", {}).get("median", 0)

            rain = block.get("rain", {}).get("median", 0)

            prob = block.get("prob", {}).get("median", 0)

            rain_eff = rain * (prob / 100)

            irrigation = (
                block
                .get("irrigation", {})
                .get(zone_key, 0)
            )

            soil = soil + rain_eff + irrigation - eto

            deficit = max(0, soil_optimal - soil)

            deficit_sum += weights[i+1] * deficit

            details["forecast"].append({
                "date": d,
                "eto": eto,
                "rain": rain,
                "prob": prob,
                "rain_effective": rain_eff,
                "irrigation_planned": irrigation,
                "soil_after": soil,
                "deficit": deficit,
                "weight": weights[i+1]
            })

        details["weighted_deficit"] = deficit_sum

        if explain:
            return deficit_sum, details

        return deficit_sum

TsStore = TimeseriesStore()