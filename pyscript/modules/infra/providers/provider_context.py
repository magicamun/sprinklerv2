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
        self.task_executor = task_executor
        self.logger = logger