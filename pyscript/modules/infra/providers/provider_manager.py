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

        summary = {
            "providers": 0,
            "ok": 0,
            "failed": 0,
            "failed_sources": [],
        }

        for provider in self.providers:
            if not provider.supports_observed:
                self.ctx.logger.debug(
                    f"provider={provider.name} action=update_observed_skipped "
                    "reason=unsupported"
                )
                continue

            summary["providers"] += 1

            self.ctx.logger.debug(
                f"provider={provider.name} action=update_observed_dispatched"
            )

            try:
                result = provider.update_observed()

                if inspect.isawaitable(result):
                    await result

                summary["ok"] += 1
            except Exception as exc:
                summary["failed"] += 1
                summary["failed_sources"].append(provider.name)
                self.ctx.logger.exception(
                    f"provider={provider.name} action=update_observed "
                    f"result=failed error={exc}"
                )

        self.ctx.logger.info(
            f"action=update_observed_complete "
            f"providers={summary['providers']} ok={summary['ok']} "
            f"failed={summary['failed']}"
        )

        return summary

    async def update_forecast(self):

        summary = {
            "providers": 0,
            "ok": 0,
            "failed": 0,
            "failed_sources": [],
        }

        for provider in self.providers:
            if not provider.supports_forecast:
                self.ctx.logger.debug(
                    f"provider={provider.name} action=update_forecast_skipped "
                    "reason=unsupported"
                )
                continue

            summary["providers"] += 1

            self.ctx.logger.debug(
                f"provider={provider.name} action=update_forecast_dispatched"
            )

            try:
                result = provider.update_forecast()

                if inspect.isawaitable(result):
                    await result

                summary["ok"] += 1
            except Exception as exc:
                summary["failed"] += 1
                summary["failed_sources"].append(provider.name)
                self.ctx.logger.exception(
                    f"provider={provider.name} action=update_forecast "
                    f"result=failed error={exc}"
                )

        self.ctx.logger.info(
            f"action=update_forecast_complete "
            f"providers={summary['providers']} ok={summary['ok']} "
            f"failed={summary['failed']}"
        )

        return summary

    async def finalize_day(self, day):

        summary = {
            "providers": 0,
            "ok": 0,
            "failed": 0,
            "failed_sources": [],
        }

        for provider in self.providers:
            if not provider.supports_finalize_day:
                self.ctx.logger.debug(
                    f"provider={provider.name} action=finalize_day_skipped "
                    f"day={day} reason=unsupported"
                )
                continue

            summary["providers"] += 1

            self.ctx.logger.debug(
                f"provider={provider.name} action=finalize_day_dispatched "
                f"day={day}"
            )

            try:
                result = provider.finalize_day(day)

                if inspect.isawaitable(result):
                    await result

                summary["ok"] += 1
            except Exception as exc:
                summary["failed"] += 1
                summary["failed_sources"].append(provider.name)
                self.ctx.logger.exception(
                    f"provider={provider.name} action=finalize_day "
                    f"day={day} result=failed error={exc}"
                )

        self.ctx.logger.info(
            f"action=finalize_day day={day} "
            f"providers={summary['providers']} ok={summary['ok']} "
            f"failed={summary['failed']}"
        )

        return summary
