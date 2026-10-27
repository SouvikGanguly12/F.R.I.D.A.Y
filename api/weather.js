const { hasSession } = require("../lib/session");

const WEATHER_CODES = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "light rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "light snow",
  73: "moderate snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "light snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with light hail",
  99: "thunderstorm with heavy hail",
};

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  try {
    if (!hasSession(request)) {
      return sendJson(response, 401, { error: "Please sign in again." });
    }
  } catch {
    return sendJson(response, 500, { error: "App authentication is not configured." });
  }

  const city = request.body && request.body.city;
  if (typeof city !== "string" || city.trim().length < 2 || city.length > 100) {
    return sendJson(response, 400, { error: "Enter a city name." });
  }

  try {
    const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodingUrl.searchParams.set("name", city.trim());
    geocodingUrl.searchParams.set("count", "1");
    geocodingUrl.searchParams.set("language", "en");
    geocodingUrl.searchParams.set("format", "json");
    const geocodingResponse = await fetchWithTimeout(geocodingUrl);
    if (!geocodingResponse.ok) {
      return sendJson(response, 502, { error: "Weather location lookup failed." });
    }
    const geocodingData = await geocodingResponse.json();
    const location = geocodingData.results && geocodingData.results[0];
    if (!location) {
      return sendJson(response, 404, { error: "I couldn't find that city. Try another name." });
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(location.latitude));
    weatherUrl.searchParams.set("longitude", String(location.longitude));
    weatherUrl.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    );
    weatherUrl.searchParams.set("timezone", "auto");
    const weatherResponse = await fetchWithTimeout(weatherUrl);
    if (!weatherResponse.ok) {
      return sendJson(response, 502, { error: "Current weather is unavailable right now." });
    }
    const weatherData = await weatherResponse.json();
    const current = weatherData.current;
    if (!current) {
      return sendJson(response, 502, { error: "The weather service returned no current conditions." });
    }

    return sendJson(response, 200, {
      location: [location.name, location.admin1, location.country].filter(Boolean).join(", "),
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      condition: WEATHER_CODES[current.weather_code] || "unknown conditions",
      unit: weatherData.current_units?.temperature_2m || "°C",
      observedAt: current.time,
      source: "Open-Meteo",
    });
  } catch {
    return sendJson(response, 502, { error: "Could not reach the weather service." });
  }
};
