@service
def hello_world(action=None, id=None):
    """hello_world example using pyscript."""
    log.info(f"hello world: got action {action} id {id}")
    if action == "turn_on" and id is not None:
        log.info(f"hello world: got action {action} id {id}")
        switch.turn_on(entity_id="switch.au_garten_bewaesserung_0_ch10")
    elif action == "turn_off" and id is not None:
        log.info(f"hello world: got action {action} id {id}")
        switch.turn_off(entity_id="switch.au_garten_bewaesserung_0_ch10")