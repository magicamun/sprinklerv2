from .program_block import ProgramBlock

class ProgramQueue:
    """
    Holds all planned program blocks.
    """

    def __init__(self):
        self._blocks: list[ProgramBlock] = []

    def __iter__(self):
        return iter(self._blocks)
    
    # -------------------------------------------------
    # Basic operations
    # -------------------------------------------------

    def add_block(self, block: ProgramBlock):
        self._blocks.append(block)

    def remove_block(self, block: ProgramBlock):
        if block in self._blocks:
            self._blocks.remove(block)

    def all_blocks(self):
        return list(self._blocks)

    def blocks_for_program(self, program_id: int):
        return [
            b for b in self._blocks
            if b.program_id == program_id
        ]
    
    def to_list(self):
        return [b.to_dict() for b in self._blocks]

    def clear(self):
        self.blocks = []

    def remove_block(self, block: ProgramBlock):
        if block in self._blocks:
            self._blocks.remove(block)

    # -------------------------------------------------
    # Execution-related
    # -------------------------------------------------

    def has_active_program(self):
        """
        True if any block currently injected/running.
        Used for first-come-first-serve rule.
        """
        for b in self._blocks:
            if b.state in ("injected", "running"):
                return True
        return False

    def next_planned_block(self):
        """
        Returns earliest planned block.
        """
        planned = [b for b in self._blocks if b.state == "planned"]
        if not planned:
            return None

        return sorted(planned, key=lambda b: b.anchor)[0]