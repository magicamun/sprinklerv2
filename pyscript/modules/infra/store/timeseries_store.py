import os
import json

from datetime import date, datetime, timedelta
from pathlib import Path

TODAY_FILE = Path("/config/sprinkler/irrigation_today.json")
HISTORY_FILE = Path("/config/sprinkler/irrigation_history.jsonl")

MAX_HISTORY_DAYS = 28

class TimeseriesStore:

    def __init__(self):
        self.today = {}
        self._load_today()

    def _read_history(self):

        if not HISTORY_FILE.exists():
            return []

        fd = os.open(str(HISTORY_FILE), os.O_RDONLY)

        try:
            data = os.read(fd, 50_000_000)
        finally:
            os.close(fd)

        if not data:
            return []

        lines = data.decode("utf-8").splitlines()

        return [json.loads(line) for line in lines if line.strip()]

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

        fd = os.open(str(TODAY_FILE), os.O_RDONLY)

        try:
            data = os.read(fd, 10_000_000)
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

        fd = os.open(
            str(TODAY_FILE),
            os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
            0o644
        )

        try:
            os.write(fd, payload)
        finally:
            os.close(fd)

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
        self.today = {
            "date": today,
            "forecast": self.today.get("forecast", {})
        }

        self._save_today()
    
    def save_today(self):
        try:
            task.executor(self._save_today)
        except NameError:
            self._save_today()

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

        self._save_today()

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

        self._save_today()

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

        self._save_today()

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
            self._save_today()

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

        fd = os.open(
            str(HISTORY_FILE),
            os.O_WRONLY | os.O_CREAT | os.O_APPEND,
            0o644
        )

        try:
            os.write(fd, payload)
        finally:
            os.close(fd)

        self._prune_history()

    # ------------------------------------------------
    # PRUNE OLD HISTORY
    # ------------------------------------------------

    def _prune_history(self):

        entries = self._read_history()

        cutoff = date.today() - timedelta(days=MAX_HISTORY_DAYS)

        filtered = []

        for entry in entries:

            entry_date = datetime.fromisoformat(entry["date"]).date()

            if entry_date >= cutoff:
                filtered.append(json.dumps(entry))

        payload = ("\n".join(filtered) + "\n").encode("utf-8")

        fd = os.open(
            str(HISTORY_FILE),
            os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
            0o644
        )

        try:
            os.write(fd, payload)
        finally:
            os.close(fd)

    def reset_today(self):

        self.today = {
            "date": date.today().isoformat(),
            "forecast": self.today.get("forecast",{})
        }

        self._save_today()

    # ------------------------------------------------
    # READ TIMESERIES
    # ------------------------------------------------

    def series(self, scope, key):

        result = []

        if HISTORY_FILE.exists():

            with HISTORY_FILE.open() as f:

                for line in f:

                    entry = json.loads(line)

                    if entry["scope"] == scope and entry["key"] == key:
                        result.append((entry["date"], entry["value"]))

        # include today

        today_val = (
            self.today
            .get(scope, {})
            .get(key, {})
            .get(source)
        )

        if today_val is not None:
            result.append((self.today["date"], today_val))

        return result

    def build_series(self, scope, metric, source="median"):

        series = {}

        entries = self._read_history()

        for entry in entries:

            if (
                entry["scope"] == scope
                and entry["key"] == metric
                and entry["source"] == source
            ):
                series[entry["date"]] = entry["value"]

        today_date = self.today.get("date")

        today_val = (
            self.today
            .get(scope, {})
            .get(metric, {})
            .get(source)
        )

        if today_val is not None:
            series[today_date] = today_val

        forecast = self.today.get("forecast", {})

        for d in forecast:

            val = (
                forecast[d]
                .get(metric, {})
                .get(source)
            )

            if val is not None:
                series[d] = val

        return dict(sorted(series.items()))

    def build_soil_series(self, scope, soil_min, soil_max):

        series = {}

        # ------------------------
        # HISTORY
        # ------------------------

        entries = self._read_history()

        for entry in entries:

            if (
                entry["scope"] == scope
                and entry["key"] == "soil"
                and entry["source"] == "median"
            ):
                series[entry["date"]] = entry["value"]

        # ------------------------
        # TODAY
        # ------------------------

        today = self.today.get("date")

        soil_today = self.today_value(scope, "soil", "median")

        if soil_today is None:
            return dict(sorted(series.items()))

        series[today] = round(soil_today,2)

        soil = soil_today

        # ------------------------
        # FORECAST
        # ------------------------

        forecast = self.today.get("forecast",{})

        for d in sorted(forecast):

            eto = forecast[d].get("eto",{}).get("median")
            rain = forecast[d].get("rain",{}).get("median")

            irrigation = (
                forecast[d]
                .get("irrigation",{})
                .get(scope)
            )

            if irrigation is None:
                irrigation = 0

            if eto is None or rain is None:
                continue

            soil = soil + rain + irrigation - eto

            soil = max(soil_min, min(soil, soil_max))

            series[d] = round(soil,2)

        return dict(sorted(series.items()))
                        
    def build_irrigation_series(self, scope):

        series = {}

        # ----------------------------
        # HISTORY
        # ----------------------------

        entries = self._read_history()

        for entry in entries:

            if (
                entry["scope"] == scope
                and entry["key"] == "irrigation"
                and entry["source"] == "actual"
            ):
                series[entry["date"]] = entry["value"]

        # ----------------------------
        # TODAY
        # ----------------------------

        today_date = self.today.get("date")

        today_val = (
            self.today
            .get(scope, {})
            .get("irrigation", {})
            .get("actual")
        )

        if today_val is not None:
            series[today_date] = today_val

        # ----------------------------
        # FORECAST
        # ----------------------------

        forecast = self.today.get("forecast", {})

        for d in forecast:

            val = forecast[d].get("irrigation", {}).get(scope)

            if val is not None:
                series[d] = val

        return dict(sorted(series.items()))

    def compute_today_median(self, scope, key):

        data = self.today.get(scope, {}).get(key, {})

        vals = []

        for src, v in data.items():

            if src == "median":
                continue

            vals.append(v)

        med = self._median(vals)

        if med is not None:

            self.today[scope][key]["median"] = med

            self._save_today()
            
    def compute_soil_forecast(self, scope, minimum, maximum):

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
            
    def compute_forecast_medians(self):

        forecast = self.today.get("forecast", {})

        for d in forecast:

            for key in ["eto", "rain", "prob", "soil"]:

                src_values = forecast[d].get(key, {})

                values = []

                for src, val in src_values.items():

                    if src == "median":
                        continue

                    values.append(val)

                med = self._median(values)

                if med is None:
                    continue

                if key not in forecast[d]:
                    forecast[d][key] = {}

                forecast[d][key]["median"] = med

        self._save_today()
        
TsStore = TimeseriesStore()