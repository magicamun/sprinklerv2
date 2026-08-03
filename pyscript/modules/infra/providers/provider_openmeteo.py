from pyscript.modules.infra.providers.provider_base import ProviderBase
from datetime import datetime

OPENMETEO_FIELDS = {
    "temp_c": {
        "api": "temperature_2m",
        "aggregate": "mean",
    },
    "humidity_pct": {
        "api": "relative_humidity_2m",
        "aggregate": "mean",
    },
    "wind_ms": {
        "api": "wind_speed_10m",
        "aggregate": "mean",
        "factor": 1 / 3.6,
    },
    "rain_mm": {
        "api": "precipitation",
        "aggregate": "sum",
    },
    "eto_ref_mm": {
        "api": "et0_fao_evapotranspiration",
        "aggregate": "sum",
    },
    "solar_rad_mj_m2": {
        "api": "shortwave_radiation",
        "aggregate": "sum",
        "factor": 3600 / 1_000_000,
    },
}

OPENMETEO_FORECAST_FIELDS = {
    "eto_ref_mm": {
        "api": "et0_fao_evapotranspiration",
    },
    "rain_mm": {
        "api": "precipitation_sum",
    },
    "prob_pct": {
        "api": "precipitation_probability_max",
    },
    "sun_hours": {
        "api": "sunshine_duration",
        "factor": 1 / 3600,
    },
    "solar_rad_mj_m2": {
        "api": "shortwave_radiation_sum",
    },
}

OPENMETEO_FORECAST_HOURLY_FIELDS = {
    "temp_c": {
        "api": "temperature_2m",
    },
    "humidity_pct": {
        "api": "relative_humidity_2m",
    },
    "wind_ms": {
        "api": "wind_speed_10m",
        "factor": 1 / 3.6,
    },
}


class OpenMeteoProvider(ProviderBase):
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    supports_observed = True
    supports_forecast = True

    def __init__(self, ctx, name, config):

        super().__init__(ctx, name, config)

    async def update_observed(self):

        data = await self._fetch("observed")
        observed = self._aggregate_today(data["hourly"])

        self.ctx.logger.debug(
            f"provider={self.name} action=aggregate_observed values={observed}"
        )
        self.ctx.logger.debug(
            f"provider={self.name} action=solar_radiation_observed "
            f"value={observed.get('solar_rad_mj_m2')} unit=MJ/m2/day"
        )

        for key, value in observed.items():
            self.ctx.store.write_observed("global", key, self.name, value)

        self.ctx.logger.info(
            f"provider={self.name} action=observed_updated "
            f"fields={','.join(observed)}"
        )

    async def update_forecast(self):
        data = await self._fetch("forecast")
        forecast = self._normalize_forecast(data["daily"], data["hourly"])

        self.ctx.logger.debug(
            f"provider={self.name} action=normalize_forecast values={forecast}"
        )
        solar_radiation = {
            forecast_date: values["solar_rad_mj_m2"]
            for forecast_date, values in forecast.items()
            if "solar_rad_mj_m2" in values
        }
        self.ctx.logger.debug(
            f"provider={self.name} action=solar_radiation_forecast "
            f"values={solar_radiation} unit=MJ/m2/day"
        )

        written_fields = []
        for forecast_date, values in forecast.items():
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

    # ----------------------------------------------------------
    # OpenMeteo
    # ----------------------------------------------------------

    def _build_url(self):
        store = self.ctx.store
        return (
            f"{self.BASE_URL}"
            f"?latitude={store.latitude}"
            f"&longitude={store.longitude}"
            "&timezone=auto"
            "&hourly="
            "temperature_2m,"
            "relative_humidity_2m,"
            "wind_speed_10m,"
            "precipitation,"
            "et0_fao_evapotranspiration,"
            "shortwave_radiation"
            "&daily="
            "et0_fao_evapotranspiration,"
            "precipitation_sum,"
            "precipitation_probability_max,"
            "sunshine_duration,"
            "shortwave_radiation_sum"
        )

    async def _fetch(self, kind):
        url = self._build_url()
        self.ctx.logger.debug(
            f"provider={self.name} action=fetch_{kind} url={url}"
        )

        return await self.ctx.http.get_json(url)

    def _aggregate_today(self, hourly):
        now = datetime.now()
        current_hour = now.hour
        result = {}

        for target_field, cfg in OPENMETEO_FIELDS.items():
            values = hourly[cfg["api"]]
            #
            # 00:00 bis aktuelle Stunde
            #
            values = values[: current_hour + 1]

            if cfg["aggregate"] == "mean":
                value = sum(values) / len(values)
            elif cfg["aggregate"] == "sum":
                value = sum(values)
            else:
                raise ValueError(

                    f"Unknown aggregation {cfg['aggregate']}"

                )
            value *= cfg.get("factor", 1.0)
            
            result[target_field] = round(value, 2)

        return result

    def _aggregate_forecast_hourly(self, hourly):
        grouped_values = {}
        times = hourly.get("time", [])

        for target_field, cfg in OPENMETEO_FORECAST_HOURLY_FIELDS.items():
            source_values = hourly.get(cfg["api"], [])

            for index, timestamp in enumerate(times):
                if index >= len(source_values):
                    continue

                value = source_values[index]
                if value is None:
                    continue

                forecast_date = str(timestamp).split("T", 1)[0]
                date_values = grouped_values.setdefault(forecast_date, {})
                date_values.setdefault(target_field, []).append(float(value))

        forecast = {}
        for forecast_date, fields in grouped_values.items():
            values = {}
            for target_field, source_values in fields.items():
                factor = OPENMETEO_FORECAST_HOURLY_FIELDS[target_field].get(
                    "factor", 1.0
                )
                value = sum(source_values) / len(source_values) * factor
                values[target_field] = round(value, 2)
            forecast[forecast_date] = values

        return forecast

    def _normalize_forecast(self, daily, hourly):
        forecast = {}
        dates = daily.get("time", [])
        hourly_forecast = self._aggregate_forecast_hourly(hourly)

        for index, forecast_date in enumerate(dates):
            values = {}

            for key, cfg in OPENMETEO_FORECAST_FIELDS.items():
                source_values = daily.get(cfg["api"], [])
                if index >= len(source_values):
                    continue

                value = source_values[index]
                if value is None:
                    continue

                value = float(value) * cfg.get("factor", 1.0)
                values[key] = round(value, 2)

            values.update(hourly_forecast.get(str(forecast_date), {}))

            if values:
                forecast[str(forecast_date)] = values

        return forecast
