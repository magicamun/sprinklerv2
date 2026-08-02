
import requests

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