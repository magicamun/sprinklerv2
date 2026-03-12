import requests
LATITUDE = 47.5546
LONGITUDE =  8.2623

def fetch_openmeteo(latitude: float = LATITUDE, longitude: float = LONGITUDE):

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={LATITUDE}&longitude={LONGITUDE}"
        "&daily=et0_fao_evapotranspiration,precipitation_sum,precipitation_probability_max"
        "&timezone=auto"
    )

    resp = requests.get(url, timeout=10)

    return resp.json()


# https://api.open-meteo.com/v1/forecast?latitude=47.5546&longitude=8.2623&daily=et0_fao_evapotranspiration,precipitation_sum,precipitation_probability_max&timezone=auto

# {"latitude":47.56,"longitude":8.26,"generationtime_ms":0.42939186096191406,"utc_offset_seconds":3600,"timezone":"Europe/Zurich","timezone_abbreviation":"GMT+1","elevation":390.0,"daily_units":{"time":"iso8601","et0_fao_evapotranspiration":"mm","precipitation_sum":"mm"},"daily":{"time":["2026-03-11","2026-03-12","2026-03-13","2026-03-14","2026-03-15","2026-03-16","2026-03-17"],"et0_fao_evapotranspiration":[1.69,2.07,2.53,0.66,0.93,1.51,1.85],"precipitation_sum":[5.60,2.90,0.00,3.80,0.70,4.40,0.00]}}
# daily: {"time":["2026-03-11","2026-03-12","2026-03-13","2026-03-14","2026-03-15","2026-03-16","2026-03-17"],"et0_fao_evapotranspiration":[1.69,2.07,2.53,0.66,0.93,1.51,1.85],"precipitation_sum":[5.60,2.90,0.00,3.80,0.70,4.40,0.00]}
# 
