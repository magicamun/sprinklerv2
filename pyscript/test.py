@service
def debug_irrigation_active():
    log.info(f"state.get: {state.get('input_boolean.irrigation_active')}")
    try:
        log.info(f"getattr: {state.getattr('input_boolean.irrigation_active')}")
    except Exception as e:
        log.error(f"getattr failed: {e}")