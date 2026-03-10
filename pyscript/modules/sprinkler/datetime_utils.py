import datetime
import logging
from homeassistant.util import dt as dt_util

log_datetime = logging.getLogger("pyscript.sprinkler.datetime")

def aware_now():
    aw_now = dt_util.now()
   
    return aw_now


def normalize_dt(value):
    if value is None:
        return None

    if isinstance(value, str):
        try:
            value = datetime.datetime.fromisoformat(value)
        except Exception:
            return None

    if isinstance(value, datetime.datetime):
        if value.tzinfo is None:
            return value.astimezone()
        return value

    return None


def today_at(time_str: str, day: datetime.date) -> datetime.datetime:
    """
    Combines a time string ("HH:MM" or "HH:MM:SS")
    with a given date to a datetime.
    """

    parts = [int(p) for p in time_str.split(":")]

    if len(parts) == 2:
        hour, minute = parts
        second = 0
    elif len(parts) == 3:
        hour, minute, second = parts
    else:
        raise ValueError(f"Invalid time format: {time_str}")

    naive = datetime.datetime.combine(
        day,
        datetime.time(hour=hour, minute=minute, second=second),
    )
    aware = dt_util.as_local(naive)

    log_datetime.info(f"today_at: {aware}")

    return aware