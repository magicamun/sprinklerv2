class ProviderBase:

    provider = "base"

    def __init__(self, ctx):
        self.ctx = ctx

    def update_observed(self):
        raise NotImplementedError()

    def update_forecast(self):
        raise NotImplementedError()