import math


def normalize_pressure_kpa(value, unit):
    if value is None:
        return None

    factors = {
        "pa": 0.001,
        "hpa": 0.1,
        "mbar": 0.1,
        "kpa": 1.0,
        "bar": 100.0,
        "inhg": 3.386389,
        "psi": 6.894757,
    }
    factor = factors.get(str(unit).strip().lower())
    if factor is None:
        return None

    return float(value) * factor


def normalize_wind_height(wind_ms, source_height_m, target_height_m=2.0):
    if wind_ms is None:
        return None

    source_factor = 4.87 / math.log(67.8 * source_height_m - 5.42)
    wind_ms_at_2m = float(wind_ms) * source_factor
    if target_height_m == 2.0:
        return wind_ms_at_2m

    target_factor = 4.87 / math.log(67.8 * target_height_m - 5.42)
    return wind_ms_at_2m / target_factor


class ProviderBase:

    provider = "base"
    supports_observed = False
    supports_forecast = False

    def __init__(self, ctx, name, config):
        self.ctx = ctx
        self.name = name
        self.config = config

    def update_observed(self):
        raise NotImplementedError()

    def update_forecast(self):
        raise NotImplementedError()
