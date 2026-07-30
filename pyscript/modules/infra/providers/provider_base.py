class ProviderBase:

    provider = "base"

    def __init__(self, ctx, name, config):
        self.ctx = ctx
        self.name = name
        self.config = config

    def update_observed(self):
        raise NotImplementedError()

    def update_forecast(self):
        raise NotImplementedError()