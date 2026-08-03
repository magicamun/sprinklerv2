from pyscript.modules.infra.providers.provider_base import (
    ProviderBase,
    normalize_wind_height,
)
from datetime import datetime
import math
from zoneinfo import ZoneInfo

class HomeAssistantProvider(ProviderBase):

    supports_observed = True
    supports_forecast = False
    HISTORY_OBSERVED_FIELDS = {"temp_c", "humidity_pct", "wind_ms"}

    def __init__(self, ctx, name, config):
        super().__init__(ctx, name, config)
        self.supports_forecast = bool(config.get("supports_forecast", False))

    # -----------------------------
    # Weather Data Collection
    # -----------------------------
    def collect_weather_data_for_source(self):

        data = {}

        for key, conf in self.config.get("fields", {}).items():

            if key in self.HISTORY_OBSERVED_FIELDS:
                continue

            entity = conf.get("entity")
            default = conf.get(
                "default",
                self.ctx.defaults.get(key)
            )

            if entity:
                try:
                    raw_val = self.ctx.state_get(entity)
                    self.ctx.logger.debug(
                        f"provider={self.name} action=read_observed "
                        f"entity={entity} key={key} raw={raw_val}"
                    )
                    val = float(raw_val) if raw_val is not None else None
                except Exception as e:
                    self.ctx.logger.warning(
                        f"provider={self.name} action=read_observed "
                        f"entity={entity} key={key} conversion_failed error={e}"
                    )
                    val = None
            else:
                val = None

            if val is None and default is not None:
                val = default

            if val is not None:
                val = round(val, 3)
                
            data[key] = val

        self.ctx.logger.debug(
            f"provider={self.name} action=collected_observed values={data}"
        )
        return data

    def collect_weather_source(self):

        weather = self.collect_weather_data_for_source()

        if weather.get("eto_mm") is not None:
            self.ctx.store.write_observed("global", "eto_mm", self.name, weather["eto_mm"])
            return ["eto_mm"]

        written_fields = []
        for key, value in weather.items():
            if value is None:
                continue

            self.ctx.store.write_observed("global", key, self.name, value)
            written_fields.append(key)

        return written_fields

    @staticmethod
    def _history_state_value(item):
        raw_value = (
            item.state
            if hasattr(item, "state")
            else item.get("state")
        )
        if raw_value in (None, "", "unknown", "unavailable"):
            return None

        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            return None

        return value if math.isfinite(value) else None

    @staticmethod
    def _history_state_time(item):
        timestamp = (
            item.last_changed
            if hasattr(item, "last_changed")
            else item.get("last_changed")
        )
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)
        return timestamp

    @classmethod
    def _aggregate_daily_history(cls, states, history_start, history_end):
        values = []
        weighted_sum = 0.0
        valid_duration_seconds = 0.0
        invalid_intervals = 0

        for index, item in enumerate(states):
            value = cls._history_state_value(item)
            if value is not None:
                values.append(value)

            interval_start = max(
                cls._history_state_time(item),
                history_start,
            )
            interval_end = (
                cls._history_state_time(states[index + 1])
                if index + 1 < len(states)
                else history_end
            )
            interval_end = min(interval_end, history_end)
            duration_seconds = max(
                0.0,
                (interval_end - interval_start).total_seconds(),
            )

            if duration_seconds == 0:
                continue
            if value is None:
                invalid_intervals += 1
                continue

            weighted_sum += value * duration_seconds
            valid_duration_seconds += duration_seconds

        return {
            "mean": (
                weighted_sum / valid_duration_seconds
                if valid_duration_seconds > 0
                else None
            ),
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "states": len(states),
            "valid_states": len(values),
            "valid_hours": valid_duration_seconds / 3600,
            "invalid_intervals": invalid_intervals,
        }

    async def _collect_history_observed(self):
        fields = self.config.get("fields", {})
        history_fields = {
            key: conf
            for key, conf in fields.items()
            if key in self.HISTORY_OBSERVED_FIELDS and conf.get("entity")
        }
        if not history_fields:
            return {}

        local_timezone = ZoneInfo(self.ctx.time_zone)
        history_end = datetime.now(local_timezone)
        history_start = history_end.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        entity_ids = list(dict.fromkeys(
            conf["entity"] for conf in history_fields.values()
        ))
        history = await self.ctx.history_get_states(
            entity_ids,
            history_start,
            history_end,
        )
        aggregates = {
            key: self._aggregate_daily_history(
                history.get(conf["entity"], []),
                history_start,
                history_end,
            )
            for key, conf in history_fields.items()
        }

        observed = {}
        temperature = aggregates.get("temp_c")
        if temperature and temperature["mean"] is not None:
            observed.update({
                "temp_c": round(temperature["mean"], 3),
                "temp_min_c": round(temperature["min"], 3),
                "temp_max_c": round(temperature["max"], 3),
            })

        humidity = aggregates.get("humidity_pct")
        if humidity and humidity["mean"] is not None:
            observed.update({
                "humidity_pct": round(humidity["mean"], 3),
                "humidity_min_pct": round(humidity["min"], 3),
                "humidity_max_pct": round(humidity["max"], 3),
            })

        wind = aggregates.get("wind_ms")
        if wind and wind["mean"] is not None:
            wind_unit = history_fields["wind_ms"].get("unit")
            wind_ms = self._wind_to_ms(wind["mean"], wind_unit)
            wind_ms = self._normalize_configured_wind_height(
                wind_ms, "observed"
            )
            if wind_ms is not None:
                observed["wind_ms"] = round(wind_ms, 3)

        self.ctx.logger.debug(
            f"provider={self.name} action=history_daily_observed "
            f"start={history_start.isoformat()} end={history_end.isoformat()} "
            f"temp_mean={observed.get('temp_c')} "
            f"temp_min={observed.get('temp_min_c')} "
            f"temp_max={observed.get('temp_max_c')} "
            f"humidity_mean={observed.get('humidity_pct')} "
            f"humidity_min={observed.get('humidity_min_pct')} "
            f"humidity_max={observed.get('humidity_max_pct')} "
            f"wind_mean_ms={observed.get('wind_ms')} "
            f"states_temp={temperature.get('states') if temperature else 0} "
            f"states_humidity={humidity.get('states') if humidity else 0} "
            f"states_wind={wind.get('states') if wind else 0} "
            f"valid_hours_temp={temperature.get('valid_hours') if temperature else 0:.3f} "
            f"valid_hours_humidity={humidity.get('valid_hours') if humidity else 0:.3f} "
            f"valid_hours_wind={wind.get('valid_hours') if wind else 0:.3f}"
        )

        return observed

    async def update_observed(self):
        written_fields = self.collect_weather_source()
        if written_fields == ["eto_mm"]:
            self.ctx.logger.info(
                f"provider={self.name} action=observed_updated fields=eto_mm"
            )
            return

        history_observed = await self._collect_history_observed()

        for key, value in history_observed.items():
            self.ctx.store.write_observed(
                "global", key, self.name, value
            )
            written_fields.append(key)

        self.ctx.logger.info(
            f"provider={self.name} action=observed_updated "
            f"fields={','.join(written_fields)}"
        )

    # -----------------------------
    # Weather Forecast
    # -----------------------------
    def _weather_unit(self, attribute):
        entity = self.config.get("forecast_id")
        if not entity:
            return None

        return self.ctx.state_get(f"{entity}.{attribute}")

    def _temperature_to_c(self, value, unit):
        if value is None:
            return None

        normalized_unit = str(unit).strip().lower()
        if normalized_unit in ("°c", "c", "celsius"):
            return float(value)
        if normalized_unit in ("°f", "f", "fahrenheit"):
            return (float(value) - 32) * 5 / 9

        self.ctx.logger.warning(
            f"provider={self.name} action=normalize_forecast "
            f"field=temp_c unsupported_unit={unit}"
        )
        return None

    def _wind_to_ms(self, value, unit):
        if value is None:
            return None

        normalized_unit = str(unit).strip().lower()
        factors = {
            "m/s": 1.0,
            "km/h": 1 / 3.6,
            "kmh": 1 / 3.6,
            "kph": 1 / 3.6,
            "mph": 0.44704,
            "kn": 0.514444,
            "kt": 0.514444,
            "kts": 0.514444,
            "ft/s": 0.3048,
        }
        factor = factors.get(normalized_unit)
        if factor is None:
            self.ctx.logger.warning(
                f"provider={self.name} action=normalize_forecast "
                f"field=wind_ms unsupported_unit={unit}"
            )
            return None

        return float(value) * factor

    def _normalize_configured_wind_height(self, wind_ms, kind):
        wind_config = self.config.get("fields", {}).get("wind_ms", {})
        source_height_m = wind_config.get("source_height_m")
        if wind_ms is None or source_height_m is None:
            return wind_ms

        normalized_wind_ms = normalize_wind_height(
            wind_ms,
            source_height_m,
            target_height_m=2.0,
        )
        self.ctx.logger.debug(
            f"provider={self.name} action=normalize_wind_height "
            f"kind={kind} source_height_m={source_height_m} "
            f"wind_ms_before={wind_ms} wind_ms_after={normalized_wind_ms}"
        )
        return normalized_wind_ms

    def _precipitation_to_mm(self, value, unit):
        if value is None:
            return None

        normalized_unit = str(unit).strip().lower()
        factors = {
            "mm": 1.0,
            "cm": 10.0,
            "in": 25.4,
            "inch": 25.4,
            "inches": 25.4,
        }
        factor = factors.get(normalized_unit)
        if factor is None:
            self.ctx.logger.warning(
                f"provider={self.name} action=normalize_forecast "
                f"field=rain_mm unsupported_unit={unit}"
            )
            return None

        return float(value) * factor

    def _humidity_from_dewpoint(self, temp_c, dew_point_c):
        if temp_c is None or dew_point_c is None:
            return None

        a = 17.625
        b = 243.04
        saturation = 6.1094 * math.exp((a * temp_c) / (b + temp_c))
        vapour = 6.1094 * math.exp(
            (a * dew_point_c) / (b + dew_point_c)
        )
        return max(0, min(100, 100 * vapour / saturation))

    def _normalize_forecast_entry(
        self,
        entry,
        temperature_unit,
        wind_speed_unit,
        precipitation_unit,
    ):
        values = {}
        temperature_high = entry.get("temperature")
        temperature_low = entry.get("templow")

        temp_c = None
        if temperature_high is not None and temperature_low is not None:
            mean_temperature = (
                float(temperature_high) + float(temperature_low)
            ) / 2
            temp_c = self._temperature_to_c(mean_temperature, temperature_unit)
            if temp_c is not None:
                values["temp_c"] = round(temp_c, 2)
        else:
            self.ctx.logger.warning(
                f"provider={self.name} action=normalize_forecast "
                "field=temp_c missing=temperature_or_templow"
            )

        humidity = entry.get("humidity")
        if humidity is None and temp_c is not None:
            dew_point_c = self._temperature_to_c(
                entry.get("dew_point"), temperature_unit
            )
            humidity = self._humidity_from_dewpoint(temp_c, dew_point_c)
        if humidity is not None:
            values["humidity_pct"] = round(float(humidity), 2)

        wind_ms = self._wind_to_ms(entry.get("wind_speed"), wind_speed_unit)
        wind_ms = self._normalize_configured_wind_height(
            wind_ms, "forecast"
        )
        if wind_ms is not None:
            values["wind_ms"] = round(wind_ms, 3)

        rain_mm = self._precipitation_to_mm(
            entry.get("precipitation"), precipitation_unit
        )
        if rain_mm is not None:
            values["rain_mm"] = round(rain_mm, 3)

        probability = entry.get("precipitation_probability")
        if probability is not None:
            values["prob_pct"] = round(float(probability), 2)

        return values

    async def update_forecast(self):
        entity = self.config.get("forecast_id")
        if not entity:
            self.ctx.logger.warning(
                f"provider={self.name} action=update_forecast_skipped "
                "reason=missing_forecast_id"
            )
            return

        result = await self.ctx.service_call(
            "weather",
            "get_forecasts",
            blocking=True,
            return_response=True,
            entity_id=entity,
            type="daily",
        )
        forecasts = result[entity]["forecast"]
        temperature_unit = self._weather_unit("temperature_unit")
        wind_speed_unit = self._weather_unit("wind_speed_unit")
        precipitation_unit = self._weather_unit("precipitation_unit")
        written_fields = []

        for entry in forecasts:
            forecast_datetime = entry.get("datetime")
            if not forecast_datetime:
                self.ctx.logger.warning(
                    f"provider={self.name} action=normalize_forecast "
                    "missing=datetime"
                )
                continue

            forecast_date = str(forecast_datetime)[:10]
            values = self._normalize_forecast_entry(
                entry,
                temperature_unit,
                wind_speed_unit,
                precipitation_unit,
            )
            self.ctx.logger.debug(
                f"provider={self.name} action=normalize_forecast "
                f"date={forecast_date} values={values}"
            )

            for key, value in values.items():
                self.ctx.store.write_forecast(
                    forecast_date,
                    "global",
                    key,
                    self.name,
                    value,
                )
                if key not in written_fields:
                    written_fields.append(key)

        self.ctx.logger.info(
            f"provider={self.name} action=forecast_updated "
            f"fields={','.join(written_fields)}"
        )
