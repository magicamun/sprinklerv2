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
        self._last_snapshot_date = None

    def _build_history_index(self):

        entries = self._read_history()

        index = {}

        for e in entries:

            key = (e["scope"], e["key"], e["source"])

            index.setdefault(key, {})[e["date"]] = self._val(e["value"])

        self._history_index = index

        log_store.info(f"History index built ({len(index)} keys)")

    def _get_history_series(self, scope, key, source):

        if self._history_index is None:
            self._build_history_index()

        return self._history_index.get((scope, key, source), {})

    def _write_file(self, path: Path, payload: bytes, flags):
        fd = os.open(str(path), flags, 0o644)
        try:
            if not payload.endswith(b"\n"):
                payload += b"\n"
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

        clean = []

        for line in lines:
            if not line.strip():
                continue
            try:
                clean.append(json.loads(line))
            except Exception:
                log_store.error(f"Skipping bad history line: {line}")

        self._history_cache = clean

        log_store.info(f"Store History mit. {len(clean)} geladen")

        return self._history_cache

    def _now_ts(self):
        return datetime.utcnow().isoformat() + "Z"

    def _val(self, v):
        if isinstance(v, dict):
            return v.get("value", 0)
        return v or 0

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

        today_str = date.today().isoformat()

        # 👉 Forecast bereinigen (Vergangenheit raus)
        forecast = self.today.get("forecast", {})

        self.today["forecast"] = {
            d: v for d, v in forecast.items()
            if d >= today_str
        }

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

            if isinstance(val, dict):
                v = val.get("value")
            else:
                v = val  # backward compatibility

            if v is not None:
                values.append(v)

        med = self._median(values)

        if med is not None:
            data["median"] = {
                "value": med,
                "ts": self._now_ts()
            }
            
    def _ensure_today(self):

        today = date.today().isoformat()

        store_date = self.today.get("date")

        if store_date == today:
            return

        # alter Tag muss historisiert werden
        self.snapshot_today()

        # neuer Tag
        self.reset_today()

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

        today_str = self.today.get("date")

        # 👉 sicherstellen, dass forecast existiert
        if "forecast" not in self.today:
            self.today["forecast"] = {}

        if today_str not in self.today["forecast"]:
            self.today["forecast"][today_str] = {}

        # 👉 scope berücksichtigen (z.B. "zone:1" oder "global")
        if scope not in self.today["forecast"][today_str]:
            self.today["forecast"][today_str][scope] = {}

        if key not in self.today["forecast"][today_str][scope]:
            self.today["forecast"][today_str][scope][key] = {}

        self.today["forecast"][today_str][scope][key][source] = { "value": value, "ts": self._now_ts()}

        self._update_median(self.today["forecast"][today_str][scope][key])

        self._dirty = True
        self.save_today()

    # ------------------------------------------------
    # AAdd to TODAY VALUE
    # ------------------------------------------------
    def add(self, scope, key, source, value):

        today_str = self.today.get("date")

        current = (
            self.today
            .get("forecast", {})
            .get(today_str, {})
            .get(scope, {})
            .get(key, {})
            .get(source)
        )

        if current is None:
            new_val = value
        else:
            new_val = self._val(current) + value

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

        self.today["forecast"][forecast_date][key][source] = { "value": value, "ts": self._now_ts()}

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
    def scope_value(self, scope, key, source):

        today_str = self.today.get("date")

        val = (
            self.today
            .get("forecast", {})
            .get(today_str, {})
            .get(scope, {})
            .get(key, {})
            .get(source)
        )

        return self._val(val)
        
    def today_value(self, key, source):

        today_str = self.today.get("date")

        val = (
            self.today
            .get("forecast", {})
            .get(today_str, {})
            .get(key, {})
            .get(source)
        )

        return self._val(val)

    # ------------------------------------------------
    # READ Yesterday VALUE
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
                log_store.info(f"yesterday_value: {entry.get('value')}")
                return self._val(entry.get("value"))

        return None

    # ------------------------------------------------
    # SNAPSHOT TODAY → HISTORY
    # ------------------------------------------------
    def snapshot_today(self):

        today_date = self.today.get("date")
        forecast = self.today.get("forecast", {})
    
        # 🔥 GUARD: nur 1x pro Tag snapshotten
        if getattr(self, "_last_snapshot_date", None) == today_date:
            log_store.info(f"snapshot_today skipped (already done for {today_date})")
            return

        self._last_snapshot_date = today_date
        
        lines = []

        day_block = forecast.get(today_date)

        if not day_block:
            return
        
        log_store.info(f"snapshot_today {today_date}")

        for key, val in day_block.items():
            log_store.info(f"snapshot_today get keys {key} {val}")

            # 👉 CASE 1: zone blocks
            if key.startswith("zone:"):

                zone = key

                for subkey, subval in val.items():

                    for source, entry in subval.items():

                        v = self._val(entry)
                        ts = entry.get("ts") if isinstance(entry, dict) else None

                        lines.append(json.dumps({
                            "date": today_date,
                            "scope": zone,
                            "key": subkey,
                            "source": source,
                            "value": v,
                            "ts": ts
                        }))

            # 👉 CASE 2: irrigation
            elif key == "irrigation":

                for zone, mm in val.items():

                    lines.append(json.dumps({
                        "date": today_date,
                        "scope": zone,
                        "key": "irrigation",
                        "source": "forecast",
                        "value": mm,
                        "ts": None
                    }))

            # 👉 CASE 3: env data (eto, rain, prob, soil)
            elif isinstance(val, dict) and all(isinstance(v, dict) for v in val.values()):

                for source, entry in val.items():

                    v = self._val(entry)
                    ts = entry.get("ts") if isinstance(entry, dict) else None

                    lines.append(json.dumps({
                        "date": today_date,
                        "scope": None,
                        "key": key,
                        "source": source,
                        "value": v,
                        "ts": ts
                    }))


        log_store.info(f"snapshot - Anzahl lines :{len(lines)}")
        if not lines:
            return

        payload = ("\n".join(lines) + "\n").encode("utf-8")

        self._write_file(
            HISTORY_FILE,
            payload,
            os.O_WRONLY | os.O_CREAT | os.O_APPEND
        )

        log_store.info("Store heute historisiert")

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

    def reset_today(self):
        today_str = date.today().isoformat()

        old_forecast = self.today.get("forecast", {})

        # 👉 Vergangenheit rauswerfen
        new_forecast = {
            d: v for d, v in old_forecast.items()
            if d >= today_str
        }

        self.today = {
            "date": today_str,
            "forecast": new_forecast
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

        forecast = self.today.get("forecast", {})

        series = dict(base)

        for d in sorted(forecast):

            if scope is None:
                raw = forecast[d].get(metric, {}).get(source)
            else:
                raw = (
                    forecast[d]
                    .get(scope, {})
                    .get(metric, {})
                    .get(source)
                )

            val = self._val(raw)

            if val is not None:
                series[d] = round(val, 2)

        return dict(sorted(series.items()))

    def build_soil_series(self, scope, soil_min, soil_max):

        series = dict(
            self._get_history_series(scope, "soil", "median")
        )

        today = self.today.get("date")

        soil_today = None

        if scope:
            soil_today = self.scope_value(scope, "soil", "median")
        else:
            soil_today = self.today_value("soil", "median")
        
        if soil_today is None:
            return dict(sorted(series.items()))

        series[today] = round(soil_today, 2)

        soil = soil_today

        forecast = self.today.get("forecast", {})

        for d in sorted(forecast):

            eto = self._val(forecast[d].get("eto", {}).get("median"))
            rain = self._val(forecast[d].get("rain", {}).get("median"))

            irrigation = self._val(forecast[d].get("irrigation", {}).get(scope, 0))

            if eto is None or rain is None:
                continue

            soil = soil + rain + irrigation - eto
            soil = max(soil_min, min(soil, soil_max))

            series[d] = round(soil, 2)

        return dict(sorted(series.items()))
                                
    def build_irrigation_series(self, scope):

        base = self._get_history_series(scope, "irrigation", "actual")

        today_date = self.today.get("date")

        today_val = self._val(
            self.today
            .get("forecast", {})
            .get(today_date, {})
            .get("irrigation", {})
            .get(scope)
        )

        forecast = self.today.get("forecast", {})

        forecast_iter = (
            (d, forecast[d].get("irrigation", {}).get(scope))
            for d in forecast
        )

        return self._merge_series(base, today_val, today_date, forecast_iter)

    def compute_today_median(self, scope, key):
        self._ensure_today()
        today_str = self.today.get("date")

        data = (
            self.today
            .get("forecast", {})
            .get(today_str, {})
            .get(scope, {})
            .get(key, {})
        )

        self._update_median(data)
            
    def compute_soil_forecast(self, scope, minimum, optimal, maximum):

        self._ensure_today()

        soil_yesterday = self.yesterday_value(scope, "soil", "median")

        if soil_yesterday is None:
            soil_yesterday = optimal

        soil = soil_yesterday

        forecast = self.today.get("forecast", {})

        for d in sorted(forecast):

            block = forecast[d]

            eto = self._val(block.get("eto", {}).get("median"))
            rain = self._val(block.get("rain", {}).get("median"))

            if eto is None or rain is None:
                continue

            # 👉 irrigation nur bei Zonen!
            irrigation = 0
            if scope:
                irrigation = self._val(
                    block.get("irrigation", {}).get(scope, 0)
                )

            soil = soil + rain + irrigation - eto
            soil = max(minimum, min(soil, maximum))

            # 🔥 WRITE – entscheidend!
            if scope:
                # zone
                self.write(scope, "soil", "model", round(soil, 2))
            else:
                # global
                self.write_forecast(d, "soil", "model", round(soil, 2))
                    
    def adaptation_deficit(self, zone_key, soil_optimal, weights=(0.7,0.4,0.2), eto_factor=1.0, rain_factor=1.0, explain=False):

        soil = self.scope_value(zone_key, "soil", "median")

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

            eto = self._val(block.get("eto", {}).get("median"))

            rain = self._val(block.get("rain", {}).get("median"))

            prob = self._val(block.get("prob", {}).get("median"))

            rain_eff = round(rain * (prob / 100) * rain_factor, 2)
            eto_eff = round(eto * eto_factor, 2)

            irrigation = (
                block
                .get("irrigation", {})
                .get(zone_key, 0)
            )

            soil = soil + rain_eff + irrigation - eto_eff

            deficit = max(0, soil_optimal - soil)

            deficit_sum += weights[i+1] * deficit

            details["forecast"].append({
                "date": d,
                "eto": eto,
                "eto_effective": eto_eff,
                "rain": rain,
                "prob": prob,
                "rain_effective": rain_eff,
                "irrigation_planned": irrigation,
                "soil_after": soil,
                "deficit": deficit,
                "weight": weights[i+1]
            })

        details["weighted_deficit"] = deficit_sum
        details["eto_factor"] = eto_factor
        details["rain_factor"] = rain_factor

        if explain:
            return deficit_sum, details

        return deficit_sum

TsStore = TimeseriesStore()