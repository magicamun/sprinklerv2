from pyscript.modules.infra.providers.provider_homeassistant import HomeAssistantProvider
from pyscript.modules.infra.providers.provider_openmeteo import OpenMeteoProvider
import inspect

class ProviderManager:

    def __init__(self, ctx, sources):

        self.ctx = ctx
        self.providers = []

        for name, config in sources.items():
            provider = config.get("provider", "homeassistant")
            self.ctx.logger.debug(f"source={name} provider={provider} action=initialized")
            
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
            if not provider.supports_observed:
                self.ctx.logger.debug(
                    f"provider={provider.name} action=update_observed_skipped "
                    "reason=unsupported"
                )
                continue

            self.ctx.logger.debug(
                f"provider={provider.name} action=update_observed_dispatched"
            )
            result = provider.update_observed()

            if inspect.isawaitable(result):
                await result

    async def update_forecast(self):

        for provider in self.providers:
            if not provider.supports_forecast:
                self.ctx.logger.debug(
                    f"provider={provider.name} action=update_forecast_skipped "
                    "reason=unsupported"
                )
                continue

            self.ctx.logger.debug(
                f"provider={provider.name} action=update_forecast_dispatched"
            )
            result = provider.update_forecast()

            if inspect.isawaitable(result):
                await result
