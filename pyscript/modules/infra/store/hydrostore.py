import os
import json
import logging
import math
from pathlib import Path
from datetime import date as dt_date, datetime, timedelta
from dataclasses import dataclass

from pyscript.modules.sprinkler.sprinkler_config import (
    HYDRO_FILE, MAX_HISTORY_DAYS
)

log_store           = logging.getLogger("pyscript.sprinkler.hydrostore")

CURRENT_POLICIES = {
    "rain_mm": "daily_total",
    "sun_hours": "daily_total",
    "solar_rad_mj_m2": "daily_total",
    "eto_ref_mm": "daily_total",
}


def _air_pressure_from_elevation(elevation_m):
    return 101.3 * (
        (293.0 - 0.0065 * elevation_m) / 293.0
    ) ** 5.26


def _psychrometric_constant(pressure_kpa):
    return 0.000665 * pressure_kpa


@dataclass(slots=True)

class EToResult:

    eto: float

    # Eingabedaten
    temp_min_c: float
    temp_max_c: float
    humidity_min_pct: float
    humidity_max_pct: float
    t_mean: float
    wind_ms: float
    solar_rad_mj_m2: float
    pressure_station_kpa: float | None

    # Standort
    latitude: float
    elevation: float
    day_of_year: int

    # Zwischenwerte
    es: float
    ea: float
    delta: float
    gamma: float
    gamma_source: str
    dr: float
    solar_declination: float
    sunset_hour_angle: float
    ra: float
    rso: float
    rs: float
    rns: float
    rnl: float
    rn: float
    cloud_factor: float

    def __str__(self) -> str:

        def fmt(v, digits=2):
            if v is None:
                return "-"

            return f"{v:.{digits}f}"

        return (
            f"ETo={fmt(self.eto)} mm | "
            f"Tmin={fmt(self.temp_min_c,1)}°C "
            f"Tmax={fmt(self.temp_max_c,1)}°C "
            f"Tmean={fmt(self.t_mean,1)}°C "
            f"RHmin={fmt(self.humidity_min_pct,0)}% "
            f"RHmax={fmt(self.humidity_max_pct,0)}% "
            f"Wind={fmt(self.wind_ms,1)}m/s "
            f"RsInput={fmt(self.solar_rad_mj_m2)}MJ/m²/day | "
            f"PressureStation={fmt(self.pressure_station_kpa,3)}kPa "
            f"GammaSource={self.gamma_source} | "
            f"Lat={fmt(self.latitude,4)} "
            f"Elev={fmt(self.elevation,0)}m "
            f"DOY={self.day_of_year} | "
            f"es={fmt(self.es,3)} "
            f"ea={fmt(self.ea,3)} "
            f"Δ={fmt(self.delta,3)} "
            f"γ={fmt(self.gamma,3)} | "
            f"Ra={fmt(self.ra)} "
            f"Rs={fmt(self.rs)} "
            f"Rso={fmt(self.rso)} "
            f"Rns={fmt(self.rns)} "
            f"Rnl={fmt(self.rnl)} "
            f"Rn={fmt(self.rn)} "
            f"Cloud={fmt(self.cloud_factor,3)}"
        )

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
        self.longitude = None
        self.latitude = None
        self.elevation = None


    def configure_site(self, latitude: float, longitude: float, elevation: float):
        self.latitude = latitude
        self.longitude = longitude
        self.elevation = elevation
        
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
        return datetime.now().astimezone().isoformat(timespec="seconds")

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
            log_store.debug(f"Store Today geschrieben")

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
    def _solar_geometry(self, day):
        day_of_year = datetime.fromisoformat(day).timetuple().tm_yday
        lat_rad = math.radians(self.latitude)

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
        daylight_hours = 24 / math.pi * ws

        return day_of_year, dr, solar_dec, ws, ra, daylight_hours

    def compute_solar_radiation_for_day(self, day):
        scope = "global"
        results = {}

        for variant in ("observed", "forecast"):
            for source in self.get_sources(scope, "sun_hours", variant, day):
                sun_hours = self.get(
                    scope, "sun_hours", variant, source, day
                )
                if sun_hours is None:
                    continue

                existing = self.get(
                    scope, "solar_rad_mj_m2", variant, source, day
                )
                if existing is not None:
                    log_store.debug(
                        f"action=derive_solar_radiation day={day} "
                        f"variant={variant} source={source} "
                        "result=skipped reason=existing_value"
                    )
                    continue

                _, _, _, _, ra, daylight_hours = self._solar_geometry(day)
                solar_radiation = (
                    0.25 + 0.5 * (sun_hours / daylight_hours)
                ) * ra
                solar_radiation = round(solar_radiation, 3)

                self.write(
                    scope,
                    "solar_rad_mj_m2",
                    variant,
                    source,
                    solar_radiation,
                    day,
                )
                results.setdefault(variant, {})[source] = solar_radiation

                log_store.debug(
                    f"action=derive_solar_radiation day={day} "
                    f"variant={variant} source={source} "
                    f"sun_hours={sun_hours} ra={ra} "
                    f"daylight_hours={daylight_hours} "
                    f"solar_rad_mj_m2={solar_radiation}"
                )

        return results

    def compute_solar_radiation_all_days(self):
        results = {}

        for day in self.get_days("global"):
            results[day] = self.compute_solar_radiation_for_day(day)

        return results

    def calculate_eto_fao56_light(self, data: dict, day: str) -> EToResult:
        """
        FAO-56-Light Reference Evapotranspiration (mm/day)
        Uses temperature, humidity, solar radiation, and wind.
        """

        # -----------------------------
        # Input
        # -----------------------------
        t_min = data["temp_min_c"]
        t_max = data["temp_max_c"]
        rh_min = data["humidity_min_pct"]
        rh_max = data["humidity_max_pct"]
        t_mean = (t_min + t_max) / 2
        wind = data["wind_ms"]
        solar_rad_mj_m2 = data["solar_rad_mj_m2"]
        pressure_station_kpa = data.get("pressure_station_kpa")

        # -----------------------------
        # Constants
        # -----------------------------
        G = 0.0  # soil heat flux (daily)
        if pressure_station_kpa is not None:
            pressure_kpa = pressure_station_kpa
            gamma_source = "pressure"
        else:
            pressure_kpa = _air_pressure_from_elevation(self.elevation)
            gamma_source = "elevation"
        gamma = _psychrometric_constant(pressure_kpa)
        albedo = 0.23

        # -----------------------------
        # Saturation vapour pressure
        # -----------------------------
        es_tmax = 0.6108 * math.exp((17.27 * t_max) / (t_max + 237.3))
        es_tmin = 0.6108 * math.exp((17.27 * t_min) / (t_min + 237.3))
        es = (es_tmax + es_tmin) / 2
        ea = (
            es_tmin * (rh_max / 100.0)
            + es_tmax * (rh_min / 100.0)
        ) / 2
        es_tmean = 0.6108 * math.exp(
            (17.27 * t_mean) / (t_mean + 237.3)
        )
        delta = (4098 * es_tmean) / ((t_mean + 237.3) ** 2)

        # -----------------------------
        # Extraterrestrial radiation
        # -----------------------------
        (
            day_of_year,
            dr,
            solar_dec,
            ws,
            ra,
            _,
        ) = self._solar_geometry(day)

        # -----------------------------
        # Clear sky radiation
        # -----------------------------
        rso = (0.75 + 2e-5 * self.elevation) * ra

        # -----------------------------
        # Solar radiation
        # -----------------------------
        rs = solar_rad_mj_m2

        # Net shortwave radiation
        rns = (1 - albedo) * rs

        # Net longwave radiation (FAO-56)
        cloud_factor = max(0.05, min(1.0, 1.35 * (rs / rso) - 0.35))

        rnl = (
            4.903e-9
            * (
                ((t_max + 273.16) ** 4 + (t_min + 273.16) ** 4)
                / 2
            )
            * (0.34 - 0.14 * math.sqrt(ea))
            * cloud_factor
        )

        # Net radiation
        rn = rns - rnl

        # -----------------------------
        # Penman-Monteith (reduced)
        # -----------------------------
        eto = (
            (0.408 * delta * (rn - G))
            + gamma * (900 / (t_mean + 273)) * wind * (es - ea)
        ) / (delta + gamma * (1 + 0.34 * wind))

        #log_store.info(f"ETo inputs: T={t_mean} RH={rh_mean} Rs={solar_rad_mj_m2} Wind={wind}, Latitude={self.latitude}, Elevation={self.elevation}")
        #log_store.info(f"Ra={ra:.2f} Rs={rs:.2f} Rso={rso:.2f} Cloud={cloud_factor:.2f} Rn={rn:.2f}")
        #log_store.info(f"ETo result: {eto:.2f} mm")
                
        eto = max(0.0, eto)

        return EToResult(
            eto=eto,
            temp_min_c=t_min,
            temp_max_c=t_max,
            humidity_min_pct=rh_min,
            humidity_max_pct=rh_max,
            t_mean=t_mean,
            wind_ms=wind,
            solar_rad_mj_m2=solar_rad_mj_m2,
            pressure_station_kpa=pressure_station_kpa,
            latitude=self.latitude,
            elevation=self.elevation,
            day_of_year=day_of_year,
            es=es,
            ea=ea,
            delta=delta,
            gamma=gamma,
            gamma_source=gamma_source,
            dr=dr,
            solar_declination=solar_dec,
            sunset_hour_angle=ws,
            ra=ra,
            rso=rso,
            rs=rs,
            rns=rns,
            rnl=rnl,
            rn=rn,
            cloud_factor=cloud_factor,
        )

    def _compute_eto_variant(self, day, variant, source):

        scope = "global"

        temp_min = self.get(scope, "temp_min_c", variant, source, day)
        temp_max = self.get(scope, "temp_max_c", variant, source, day)
        hum_min = self.get(scope, "humidity_min_pct", variant, source, day)
        hum_max = self.get(scope, "humidity_max_pct", variant, source, day)
        wind = self.get(scope, "wind_ms", variant, source, day)
        solar_rad = self.get(
            scope, "solar_rad_mj_m2", variant, source, day
        )
        pressure_station = self.get(
            scope, "pressure_station_kpa", variant, source, day
        )

        if None in (temp_min, temp_max, hum_min, hum_max, wind, solar_rad):
            return None

        result = self.calculate_eto_fao56_light({
            "temp_min_c": temp_min,
            "temp_max_c": temp_max,
            "humidity_min_pct": hum_min,
            "humidity_max_pct": hum_max,
            "wind_ms": wind,
            "solar_rad_mj_m2": solar_rad,
            "pressure_station_kpa": pressure_station,
        }, day)

        log_store.debug(
            f"action=eto_gamma day={day} variant={variant} source={source} "
            f"pressure_station_kpa={result.pressure_station_kpa} "
            f"gamma={result.gamma} gamma_source={result.gamma_source}"
        )

        return round(result.eto, 3), result

    def compute_eto_for_day(self, day):

        scope = "global"
        results = {}

        # ----------------------------------
        # explizit definierte Varianten
        # ----------------------------------

        variants = {
            "observed": self.get_sources(
                scope, "temp_min_c", "observed", day
            ),
            "forecast": self.get_sources(
                scope, "temp_min_c", "forecast", day
            ),
            "derived":  ["median", "current"],
        }

        # vorhandene direkte Beobachtungen übernehmen
        direct = self.get(scope, "eto_mm", "observed", date=day)

        if direct:
            results["observed"] = dict(direct)

        # ----------------------------------
        # berechnen
        # ----------------------------------

        for variant, sources in variants.items():

            for source in sources:

                if source in results.get(variant, {}):
                    continue

                try:

                    eto = self._compute_eto_variant(day, variant, source)

                    if eto is None:
                        continue

                    value, details = eto

                    results.setdefault(variant, {})[source] = value

                    self.write(
                        scope,
                        "eto_mm",
                        variant,
                        source,
                        value,
                        day
                    )

                    log_store.info(
                        f"[ETO] {day} {variant}/{source}: "
                        f"eto={value:.3f} result={details}"
                    )

                except Exception as e:
                    log_store.error(
                        f"ETo failed {day} {variant}/{source}: {e}"
                    )

        return results

    def compute_eto_all_days(self, force_all: bool = False):

        scope = "global"
        today = dt_date.today().isoformat()

        days = self.get_days(scope)

        results = {}

        for day in sorted(days):
            if day < today and not force_all:
                continue

            try:
                results[day] = self.compute_eto_for_day(day)

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

        if variant in ("observed", "forecast"):
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

        # 🔥 FIX: normalize date

        if not isinstance(date, str):
            try:
                date = date.isoformat()
            except Exception:
                return None

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

        if CURRENT_POLICIES.get(key) == "daily_total":
            if med_fc is not None:
                return round(med_fc, 3)
            if med_obs is not None:
                return round(med_obs, 3)
            return None

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
        now = datetime.now()
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
