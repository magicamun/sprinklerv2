from pyscript.modules.infra.providers.provider_homeassistant import HomeAssistantProvider
from pyscript.modules.infra.providers.provider_openmeteo import OpenMeteoProvider
import inspect

class ProviderManager:

    def __init__(self, ctx, sources):

        self.ctx = ctx
        self.providers = []

        for name, config in sources.items():
            provider = config.get("provider", "homeassistant")
            self.ctx.logger.info(f"Source={name}, provider={provider}")
            
            if provider == "homeassistant":
                self.providers.append(HomeAssistantProvider(ctx, name, config))
            elif provider == "openmeteo":
                self.providers.append(OpenMeteoProvider(ctx, name, config))
            else:
                raise ValueError(f"Unknown provider '{provider}' for source '{name}'")

    def register(self, provider):

        self.providers.append(provider)

    def get_provider(self, provider_type):
        for provider in self.providers:
            if isinstance(provider, provider_type):
                return provider
        return None
        
    async def update_observed(self):

        for provider in self.providers:
            result = provider.update_observed()

            if inspect.isawaitable(result):
                await result

    def update_forecast(self):

        for p in self.providers:
            p.update_forecast()