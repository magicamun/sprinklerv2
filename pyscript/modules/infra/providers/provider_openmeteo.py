from pyscript.modules.infra.providers.provider_base import ProviderBase

class OpenMeteoProvider(ProviderBase):

    def update_observed(self):
        self.ctx.logger.info(f"Provider OpenMeteo for {self.name}")
        pass

    def update_forecast(self):
        pass