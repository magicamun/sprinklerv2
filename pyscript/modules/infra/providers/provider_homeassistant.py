from pyscript.modules.infra.providers.provider_base import ProviderBase
import math

class HomeAssistantProvider(ProviderBase):

    supports_observed = True
    supports_forecast = False

    def __init__(self, ctx, name, config):
        super().__init__(ctx, name, config)
        self.supports_forecast = bool(config.get("supports_forecast", False))

    # -----------------------------
    # Weather Data Collection
    # -----------------------------
    def collect_weather_data_for_source(self):

        data = {}

        for key, conf in self.config.get("fields", {}).items():

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

            # 👉 HIER
            if val is not None:
                val = round(val, 3)
                
            data[key] = val

        self.ctx.logger.debug(
            f"provider={self.name} action=collected_observed values={data}"
        )
        return data

    def collect_weather_source(self):

        weather = self.collect_weather_data_for_source()

        # 🔥 CASE: direct ETo
        if weather.get("eto_mm") is not None:
            self.ctx.store.write_observed("global", "eto_mm", self.name, weather["eto_mm"])
            self.ctx.logger.info(
                f"provider={self.name} action=observed_updated fields=eto_mm"
            )
            return

        # 🔥 GENERIC WRITE
        written_fields = []
        for key, value in weather.items():
            if value is None:
                continue

            self.ctx.store.write_observed("global", key, self.name, value)
            written_fields.append(key)

        self.ctx.logger.info(
            f"provider={self.name} action=observed_updated "
            f"fields={','.join(written_fields)}"
        )

    def update_observed(self):
        self.collect_weather_source()

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
