class ProviderContext:

    def __init__(self, engine):
        self.engine = engine
        self.store = engine.store