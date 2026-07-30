from pyscript.modules.infra.providers.provider_base import ProviderBase

class HomeAssistantProvider(ProviderBase):

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
                    self.ctx.logger.info(f"[COLLECT] entity={entity} key={key} raw={raw_val}")
                    val = float(raw_val) if raw_val is not None else None
                except Exception as e:
                    self.ctx.logger.warning(f"[COLLECT] entity={entity} key={key} conversion failed: {e}")
                    val = None
            else:
                val = None

            if val is None and default is not None:
                val = default

            # 👉 HIER
            if val is not None:
                val = round(val, 3)
                
            data[key] = val

        self.ctx.logger.info(f"[COLLECT] source_data={data}")
        return data

    def collect_weather_source(self):

        weather = self.collect_weather_data_for_source()

        # 🔥 CASE: direct ETo
        if weather.get("eto_mm") is not None:
            self.ctx.store.write_observed("global", "eto_mm", self.name, weather["eto_mm"])
            return

        # 🔥 GENERIC WRITE
        for key, value in weather.items():
            self.ctx.logger.info(

                f"{self.name}: {key} -> {value}"

            )
            if value is None:
                continue

            self.ctx.store.write_observed("global", key, self.name, value)

    def update_observed(self):
        self.ctx.logger.info(f"Provider Local for {self.name}")
        self.collect_weather_source()
        