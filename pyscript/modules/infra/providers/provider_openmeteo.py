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


class OpenMeteoProvider(ProviderBase):
    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    def __init__(self, ctx, name, config):

        super().__init__(ctx, name, config)

    async def update_observed(self):

        data = await self._fetch()
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

    def update_forecast(self):
        self.ctx.logger.info(f"Provider OpenMeteo forecast for {self.name}")
        # kommt im nächsten Schritt

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

    async def _fetch(self):
        url = self._build_url()
        self.ctx.logger.debug(
            f"provider={self.name} action=fetch_observed url={url}"
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
            result[target_field] = round(value, 2)

        return result
