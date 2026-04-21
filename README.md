# 🌤️ WeatherNow

A responsive weather application built with HTML, CSS, and JavaScript. Powered by the OpenWeatherMap API with real-time weather, air quality monitoring, an interactive map, and a premium glassmorphism UI.

🔗 **Live Demo:** [satyaprasad1706.github.io/WEATHER-APPLICATION](https://satyaprasad1706.github.io/WEATHER-APPLICATION)

---

## Features

- 🔍 Search weather by city name or GPS location
- 🌡️ Temperature in °C / °F toggle
- 💨 Wind speed & direction, visibility, pressure, dew point, cloudiness
- 🌅 Sunrise & sunset with animated sun arc
- 🌬️ Air Quality Index (AQI) with PM2.5, PM10, CO, NO₂, O₃
- 📅 5-Day forecast
- 🗺️ Interactive map — click anywhere for weather & AQI
- 🌦️ Weather overlay layers: Temperature, Rain, Wind, Clouds
- 🕐 Live clock, search history, smart weather tips
- 🎨 Dynamic background themes per weather condition

---

## Project Structure

```
WEATHER-APPLICATION/
├── index.html    # App layout
├── style.css     # Styles and animations
├── app.js        # Logic and API calls
├── config.js     # API key
└── README.md
```

---

## Setup

1. Get a free API key from [openweathermap.org](https://openweathermap.org/api)
2. Open `config.js` and add your key:
```js
const CONFIG = { API_KEY: "your_api_key_here" };
```
3. Open `index.html` in a browser

---

## Tech Stack

- HTML5, CSS3, JavaScript (ES6+)
- [OpenWeatherMap API](https://openweathermap.org/api)
- [Leaflet.js](https://leafletjs.com/)
- [Font Awesome 6.5](https://fontawesome.com/)
- [Google Fonts — Inter](https://fonts.google.com/specimen/Inter)
