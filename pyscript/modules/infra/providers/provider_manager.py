class ProviderManager:

    def __init__(self, ctx):

        self.ctx = ctx
        self.providers = []

    def register(self, provider):

        self.providers.append(provider)

    def update_observed(self):

        for p in self.providers:
            p.update_observed()

    def update_forecast(self):

        for p in self.providers:
            p.update_forecast()