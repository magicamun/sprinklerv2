from pyscript.modules.infra.providers.provider_base import ProviderBase
from datetime import datetime
import json

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
    },
    "rain_mm": {
        "api": "precipitation",
        "aggregate": "sum",
    },
    "eto_mm": {
        "api": "et0_fao_evapotranspiration",
        "aggregate": "sum",
    },
}

OPENMETEO_FORECAST_FIELDS = {
    "eto_mm": "et0_fao_evapotranspiration",
    "rain_mm": "precipitation_sum",
    "prob_pct": "precipitation_probability_max",
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

        for key, value in observed.items():
            self.ctx.store.write_observed("global", key, self.name, value)

        self.ctx.logger.info(
            f"provider={self.name} action=observed_updated "
            f"fields={','.join(observed)}"
        )

    async def update_forecast(self):
        data = await self._fetch("forecast")
        forecast = self._normalize_forecast(data["daily"])

        self.ctx.logger.debug(
            f"provider={self.name} action=normalize_forecast values={forecast}"
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
            "et0_fao_evapotranspiration"
            "&daily="
            "et0_fao_evapotranspiration,"
            "precipitation_sum,"
            "precipitation_probability_max"
        )

    async def _fetch(self, kind):
        url = self._build_url()
        self.ctx.logger.debug(
            f"provider={self.name} action=fetch_{kind} url={url}"
        )

        data = await self.ctx.http.get_json(url)
        self.ctx.logger.debug(
            f"provider={self.name} action=fetch_{kind}_response "
            f"json={json.dumps(data, ensure_ascii=False)}"
        )
        return data

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
            result[target_field] = round(value, 2)

        return result

    def _normalize_forecast(self, daily):
        forecast = {}
        dates = daily.get("time", [])

        for index, forecast_date in enumerate(dates):
            values = {}

            for key, api_field in OPENMETEO_FORECAST_FIELDS.items():
                source_values = daily.get(api_field, [])
                if index >= len(source_values):
                    continue

                value = source_values[index]
                if value is None:
                    continue

                values[key] = round(float(value), 2)

            if values:
                forecast[str(forecast_date)] = values

        return forecast
