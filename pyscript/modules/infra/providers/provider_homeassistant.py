from pyscript.modules.infra.providers.provider_base import ProviderBase

class HomeAssistantProvider(ProviderBase):

    supports_observed = True
    supports_forecast = False

    def __init__(self, ctx, name, config):
        super().__init__(ctx, name, config)

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
