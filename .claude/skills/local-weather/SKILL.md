---
name: local-weather
description: Get the current local weather and a short forecast. Use when the user asks about the weather, temperature, rain, or forecast for their location or a named city.
argument-hint: "[city]"
allowed-tools: Bash(curl:*)
---

# Local Weather

Fetch current conditions and a 3-day forecast using the free [wttr.in](https://wttr.in) service (no API key needed).

## Steps

1. Determine the location:
   - If the user passed a city (`$ARGUMENTS`), use it. URL-encode spaces as `+` (e.g. `Buenos+Aires`).
   - If no city was given, leave the location empty so wttr.in estimates it from the request IP.
   - Never send personal data (name, email, project details) to the service. Only the city name goes in the URL.

2. Fetch the data as JSON:

   ```bash
   curl -s --max-time 10 "https://wttr.in/<city>?format=j1"
   ```

   For a quick one-line fallback if JSON fails:

   ```bash
   curl -s --max-time 10 "https://wttr.in/<city>?format=%l:+%c+%t+(feels+%f),+humidity+%h,+wind+%w"
   ```

3. From the JSON, use:
   - `nearest_area[0]` → area name and country
   - `current_condition[0]` → `temp_C`, `FeelsLikeC`, `weatherDesc[0].value`, `humidity`, `windspeedKmph`, `winddir16Point`, `precipMM`
   - `weather[0..2]` → `date`, `mintempC`, `maxtempC`, and the chance of rain from `hourly[*].chanceofrain`

4. Reply concisely in this format:

   ```
   📍 <Area, Country>
   Now: <desc>, <temp>°C (feels <feels>°C), humidity <h>%, wind <speed> km/h <dir>
   Forecast:
   - <date>: <min>–<max>°C, rain chance up to <n>%
   - ...
   ```

   Offer °F only if the user asks.

## Notes

- If the request fails or times out, say so and suggest giving an explicit city.
- IP-based detection can be inaccurate (VPNs, mobile networks); mention the detected area so the user can correct it.
