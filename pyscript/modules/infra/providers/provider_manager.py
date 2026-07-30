from pyscript.modules.infra.providers.provider_local import LocalProvider

class ProviderManager:

    def __init__(self, ctx, sources):

        self.ctx = ctx
        self.providers = []

        for name, config in sources.items():
            self.providers.append(LocalProvider(ctx, name, config))

    def register(self, provider):

        self.providers.append(provider)

    def update_observed(self):

        for p in self.providers:
            p.update_observed()

    def update_forecast(self):

        for p in self.providers:
            p.update_forecast()