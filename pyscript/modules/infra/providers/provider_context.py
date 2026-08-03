
import requests
from functools import partial

class ProviderContext:

    def __init__(
        self,
        store,
        defaults,
        state_get,
        service_call,
        task_executor,
        logger
    ):
        self.store = store
        self.defaults = defaults
        self.state_get = state_get
        self.service_call = service_call
        self.http = HttpClient(task_executor)
        self.logger = logger

        from custom_components.pyscript.function import Function

        self._hass = Function.hass
        if self._hass is None:
            raise RuntimeError("Home Assistant runtime is not initialized")
        self.time_zone = self._hass.config.time_zone

    async def history_get_states(self, entity_ids, start_local, end_local):
        from homeassistant.components.recorder import get_instance, history
        from homeassistant.util import dt as dt_util

        query = partial(
            history.get_significant_states,
            self._hass,
            dt_util.as_utc(start_local),
            dt_util.as_utc(end_local),
            entity_ids=entity_ids,
            include_start_time_state=True,
            significant_changes_only=True,
            minimal_response=False,
            no_attributes=True,
        )

        return await get_instance(self._hass).async_add_executor_job(query)


class HttpClient:

    def __init__(self, task_executor):
        self._task_executor = task_executor

    @staticmethod
    def _http_get_json(url):
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.json()

    async def get_json(self, url):
        return await self._task_executor(
            HttpClient._http_get_json,
            url,
        )
