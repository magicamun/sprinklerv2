class LocalProvider(ProviderBase):

    def __init__(self, ctx, source, cfg):
        super().__init__(ctx)

        self.source = source
        self.cfg = cfg


    # -----------------------------
    # Weather Data Collection
    # -----------------------------
    def collect_weather_data_for_source(self, cfg):

        data = {}

        for key, conf in cfg.get("fields", {}).items():

            entity = conf.get("entity")
            default = conf.get("default", ETO_DEFAULTS.get(key))

            if entity:
                try:
                    raw_val = state.get(entity)
                    log_eto.info(f"[COLLECT] entity={entity} key={key} raw={raw_val}")
                    val = float(raw_val) if raw_val is not None else None
                except Exception as e:
                    log_eto.warning(f"[COLLECT] entity={entity} key={key} conversion failed: {e}")
                    val = None
            else:
                val = None

            if val is None and default is not None:
                val = default

            # 👉 HIER
            if val is not None:
                val = round(val, 3)
                
            data[key] = val

        log_eto.info(f"[COLLECT] source_data={data}")
        return data

    def collect_weather_source(self, source, cfg):

        weather = self.collect_weather_data_for_source(cfg)

        # 🔥 CASE: direct ETo
        if weather.get("eto_mm") is not None:
            self.store.write_observed("global", "eto_mm", source, weather["eto_mm"])
            return

        # 🔥 GENERIC WRITE
        for key, value in weather.items():

            if value is None:
                continue

            self.store.write_observed("global", key, source, value)
