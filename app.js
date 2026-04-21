const API_KEY  = CONFIG.API_KEY;
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";
const FORE_URL = "https://api.openweathermap.org/data/2.5/forecast";
const AQI_URL  = "https://api.openweathermap.org/data/2.5/air_pollution";

const cityInput   = document.getElementById("cityInput");
const searchBtn   = document.getElementById("searchBtn");
const locationBtn = document.getElementById("locationBtn");
const mainContent = document.getElementById("mainContent");
const errorDiv    = document.getElementById("error");
const loader      = document.getElementById("loader");
const bgLayer     = document.getElementById("bgLayer");
const btnC        = document.getElementById("btnC");
const btnF        = document.getElementById("btnF");

let unit         = "metric";
let lastWeather  = null;
let lastForecast = null;
let map          = null;
let mapMarker    = null;
let weatherTileLayer = null;
let mapInitialized   = false;

// ── Security helpers ──
function sanitize(str) {
  const d = document.createElement("div");
  d.textContent = String(str ?? "");
  return d.innerHTML;
}
function validateCity(input) {
  const t = input.trim().slice(0, 100);
  return /^[a-zA-Z\u00C0-\u024F\s'\-,.]+$/.test(t) ? t : null;
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Conversion helpers ──
function toDisplayTemp(c) {
  return unit === "metric" ? Math.round(c) : Math.round(c * 9 / 5 + 32);
}
function tempSym() { return unit === "metric" ? "°C" : "°F"; }
function windDisplay(ms) {
  return unit === "metric" ? `${ms} m/s` : `${(ms * 2.237).toFixed(1)} mph`;
}

// ── Live Clock ──
function updateClock() {
  document.getElementById("headerTime").textContent =
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
setInterval(updateClock, 1000);
updateClock();

// ── Particles ──
(function () {
  const c = document.getElementById("particles");
  for (let i = 0; i < 20; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const s = Math.random() * 5 + 2;
    p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*100}%;animation-duration:${Math.random()*12+8}s;animation-delay:${Math.random()*12}s;opacity:${Math.random()*0.35+0.08};`;
    c.appendChild(p);
  }
})();

// ── Theme ──
function setTheme(id, icon) {
  bgLayer.className = "bg-layer";
  if (icon?.endsWith("n")) { bgLayer.classList.add("night"); return; }
  if (id >= 200 && id < 300)      bgLayer.classList.add("stormy");
  else if (id >= 300 && id < 600) bgLayer.classList.add("rainy");
  else if (id >= 600 && id < 700) bgLayer.classList.add("snowy");
  else if (id >= 700 && id < 800) bgLayer.classList.add("cloudy");
  else if (id === 800)             bgLayer.classList.add("sunny");
  else                             bgLayer.classList.add("cloudy");
}

// ── Unit Toggle ──
btnC.addEventListener("click", () => {
  if (unit === "metric") return;
  unit = "metric";
  btnC.classList.add("active"); btnF.classList.remove("active");
  if (lastWeather)  renderWeather(lastWeather);
  if (lastForecast) renderForecast(lastForecast);
});
btnF.addEventListener("click", () => {
  if (unit === "imperial") return;
  unit = "imperial";
  btnF.classList.add("active"); btnC.classList.remove("active");
  if (lastWeather)  renderWeather(lastWeather);
  if (lastForecast) renderForecast(lastForecast);
});

// ── Search History ──
function getHistory() {
  try { return JSON.parse(localStorage.getItem("wx_history") || "[]"); } catch { return []; }
}
function saveHistory(city) {
  let h = getHistory().filter(c => c.toLowerCase() !== city.toLowerCase());
  h.unshift(city);
  localStorage.setItem("wx_history", JSON.stringify(h.slice(0, 6)));
  renderHistory();
}
function renderHistory() {
  const chips = document.getElementById("historyChips");
  chips.innerHTML = "";
  getHistory().forEach(city => {
    const chip  = document.createElement("div"); chip.className = "chip";
    const ico   = document.createElement("i");   ico.className = "fa fa-clock-rotate-left";
    const label = document.createElement("span"); label.textContent = city;
    label.addEventListener("click", () => { cityInput.value = city; fetchAll(city); });
    const del   = document.createElement("span"); del.className = "chip-del";
    const delI  = document.createElement("i");   delI.className = "fa fa-xmark";
    del.appendChild(delI);
    del.addEventListener("click", e => {
      e.stopPropagation();
      localStorage.setItem("wx_history", JSON.stringify(getHistory().filter(c => c !== city)));
      renderHistory();
    });
    chip.appendChild(ico); chip.appendChild(label); chip.appendChild(del);
    chips.appendChild(chip);
  });
}
renderHistory();

// ── Tabs ──
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "map") initMap();
  });
});

// ── Weather Tips ──
function getTip(id, humidity, windMs) {
  if (id >= 200 && id < 300)     return "⚡ Thunderstorm alert! Stay indoors and avoid open areas.";
  if (id >= 300 && id < 600)     return "🌧️ Carry an umbrella — rain is expected today.";
  if (id >= 600 && id < 700)     return "❄️ Icy conditions possible. Drive carefully and dress warmly.";
  if (id >= 700 && id < 800)     return "🌫️ Low visibility due to fog or haze. Take it slow.";
  if (id === 800 && windMs > 10) return "☀️ Clear skies but windy! Great for a kite day.";
  if (id === 800)                return "☀️ Beautiful clear day! Perfect for outdoor activities.";
  if (humidity > 80)             return "💧 High humidity today. Stay hydrated and cool.";
  return "🌤️ Partly cloudy skies. A comfortable day overall.";
}

// ── Dew Point ──
function calcDewPoint(tempC, humidity) {
  const a = 17.27, b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
  return (b * alpha) / (a - alpha);
}

// ── Wind Direction ──
function windDegToDir(deg) {
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8];
}

// ── Sun Arc ──
function animateSunArc(sunrise, sunset) {
  const t = Math.max(0, Math.min(1, (Date.now() / 1000 - sunrise) / (sunset - sunrise)));
  const x = (1-t)*(1-t)*10 + 2*(1-t)*t*60 + t*t*110;
  const y = (1-t)*(1-t)*55 + 2*(1-t)*t*(-10) + t*t*55;
  const dot = document.getElementById("sunDot");
  if (dot) { dot.setAttribute("cx", x.toFixed(1)); dot.setAttribute("cy", y.toFixed(1)); }
}

// ── AQI ──
async function fetchAQI(lat, lon) {
  const badge     = document.getElementById("aqiBadge");
  const dot       = document.getElementById("aqiDot");
  const aqiText   = document.getElementById("aqiText");
  const detailBar = document.getElementById("aqiDetailBar");
  badge.style.display = "";
  try {
    const res = await fetch(`${AQI_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
    if (!res.ok) throw new Error();
    const data  = await res.json();
    const entry = data?.list?.[0];
    if (!entry) throw new Error();
    const aqi     = entry.main.aqi;
    const labels  = ["", "Good", "Fair", "Moderate", "Poor", "Very Poor"];
    const classes = ["", "aqi-good", "aqi-fair", "aqi-moderate", "aqi-poor", "aqi-bad"];
    const colors  = ["", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
    badge.className      = `aqi-badge ${classes[aqi]}`;
    dot.style.background = colors[aqi];
    aqiText.textContent  = `AQI · ${labels[aqi]}`;
    const c = entry.components;
    document.getElementById("aqiPm25").textContent = `${c.pm2_5?.toFixed(1) ?? "—"} µg`;
    document.getElementById("aqiPm10").textContent = `${c.pm10?.toFixed(1)  ?? "—"} µg`;
    document.getElementById("aqiCo").textContent   = `${c.co?.toFixed(0)    ?? "—"} µg`;
    document.getElementById("aqiNo2").textContent  = `${c.no2?.toFixed(1)   ?? "—"} µg`;
    document.getElementById("aqiO3").textContent   = `${c.o3?.toFixed(1)    ?? "—"} µg`;
    detailBar.style.display = "";
  } catch {
    badge.style.display     = "none";
    detailBar.style.display = "none";
  }
}

// ── Forecast ──
function renderForecast(list) {
  const daily = {};
  list.forEach(item => {
    const day = new Date(item.dt * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (!daily[day]) daily[day] = { temps: [], icons: [], descs: [] };
    daily[day].temps.push(item.main.temp);
    daily[day].icons.push(item.weather[0].icon);
    daily[day].descs.push(item.weather[0].description);
  });
  const todayKey  = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const rows      = Object.entries(daily).filter(([k]) => k !== todayKey).slice(0, 5);
  const sym       = tempSym();
  const container = document.getElementById("forecastList");
  container.innerHTML = "";
  rows.forEach(([day, data]) => {
    const hi    = toDisplayTemp(Math.max(...data.temps));
    const lo    = toDisplayTemp(Math.min(...data.temps));
    const icon  = data.icons[Math.floor(data.icons.length / 2)];
    const desc  = data.descs[Math.floor(data.descs.length / 2)];
    const row   = document.createElement("div"); row.className = "forecast-row";
    const dayEl = document.createElement("span"); dayEl.className = "forecast-day"; dayEl.textContent = day;
    const img   = document.createElement("img");  img.className = "forecast-icon";
    img.src = `https://openweathermap.org/img/wn/${sanitize(icon)}@2x.png`; img.alt = desc;
    const descEl = document.createElement("span"); descEl.className = "forecast-desc"; descEl.textContent = desc;
    const temps  = document.createElement("div");  temps.className = "forecast-temps";
    const hi_s   = document.createElement("span"); hi_s.className = "hi"; hi_s.textContent = `${hi}${sym}`;
    const lo_s   = document.createElement("span"); lo_s.className = "lo"; lo_s.textContent = `${lo}${sym}`;
    temps.appendChild(hi_s); temps.appendChild(lo_s);
    row.appendChild(dayEl); row.appendChild(img); row.appendChild(descEl); row.appendChild(temps);
    container.appendChild(row);
  });
}

// ── Render Weather ──
function renderWeather(d) {
  const icon = d.weather[0].icon;
  const id   = d.weather[0].id;
  const sym  = tempSym();
  setTheme(id, icon);
  document.getElementById("cityName").textContent    = d.name;
  document.getElementById("countryCode").textContent = d.sys.country;
  document.getElementById("date").textContent        = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("temp").textContent        = `${toDisplayTemp(d.main.temp)}${sym}`;
  document.getElementById("feelsLike").textContent   = `${toDisplayTemp(d.main.feels_like)}${sym}`;
  document.getElementById("description").textContent = d.weather[0].description;
  document.getElementById("humidity").textContent    = `${d.main.humidity}%`;
  document.getElementById("wind").textContent        = windDisplay(d.wind.speed);
  document.getElementById("visibility").textContent  = `${(d.visibility / 1000).toFixed(1)} km`;
  document.getElementById("pressure").textContent    = `${d.main.pressure} hPa`;
  document.getElementById("cloudiness").textContent  = `${d.clouds.all}%`;
  document.getElementById("tempMin").textContent     = `${toDisplayTemp(d.main.temp_min)}${sym}`;
  document.getElementById("tempMax").textContent     = `${toDisplayTemp(d.main.temp_max)}${sym}`;
  document.getElementById("weatherIcon").src         = `https://openweathermap.org/img/wn/${sanitize(icon)}@2x.png`;
  const dpC = calcDewPoint(d.main.temp, d.main.humidity);
  document.getElementById("dewPoint").textContent = `${toDisplayTemp(dpC)}${sym}`;
  const dirEl = document.getElementById("windDir"); dirEl.textContent = "";
  const arrow = document.createElement("i"); arrow.className = "fa fa-arrow-up";
  arrow.style.transform = `rotate(${d.wind.deg ?? 0}deg)`;
  dirEl.appendChild(arrow);
  dirEl.appendChild(document.createTextNode(` ${windDegToDir(d.wind.deg ?? 0)}`));
  document.getElementById("humidityRing").setAttribute("stroke-dasharray", `${d.main.humidity} 100`);
  const { temp_min: mn, temp_max: mx, temp: cur } = d.main;
  document.getElementById("tempRangeFill").style.width = mx !== mn ? `${Math.round(((cur-mn)/(mx-mn))*100)}%` : "50%";
  const toTime = ts => new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("sunrise").textContent = toTime(d.sys.sunrise);
  document.getElementById("sunset").textContent  = toTime(d.sys.sunset);
  animateSunArc(d.sys.sunrise, d.sys.sunset);
  document.getElementById("tipText").textContent = getTip(id, d.main.humidity, d.wind.speed);
  errorDiv.classList.add("hidden");
  mainContent.classList.remove("hidden");
  if (map) { map.setView([d.coord.lat, d.coord.lon], 10); placeMapMarker(d.coord.lat, d.coord.lon); }
}

// ── Fetch All ──
async function fetchAll(rawCity) {
  const city = validateCity(rawCity);
  if (!city) { showError(); return; }
  showLoader();
  try {
    const res = await fetch(`${BASE_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    lastWeather = data;
    renderWeather(data);
    saveHistory(data.name);
    fetchAQI(data.coord.lat, data.coord.lon);
    fetchForecastByCoords(data.coord.lat, data.coord.lon);
  } catch { showError(); } finally { hideLoader(); }
}

async function fetchAllByCoords(lat, lon) {
  showLoader();
  try {
    const res = await fetch(`${BASE_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    lastWeather = data;
    renderWeather(data);
    saveHistory(data.name);
    fetchAQI(data.coord.lat, data.coord.lon);
    fetchForecastByCoords(lat, lon);
  } catch { showError(); } finally { hideLoader(); }
}

async function fetchForecastByCoords(lat, lon) {
  try {
    const res = await fetch(`${FORE_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    lastForecast = data.list;
    renderForecast(data.list);
  } catch { document.getElementById("forecastList").textContent = "Forecast unavailable."; }
}

function showError()  { mainContent.classList.add("hidden"); errorDiv.classList.remove("hidden"); }
function showLoader() { errorDiv.classList.add("hidden"); mainContent.classList.add("hidden"); loader.classList.remove("hidden"); }
function hideLoader() { loader.classList.add("hidden"); }

// ── MAP ──
const TILE_LAYERS = {
  temp:          `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${API_KEY}`,
  precipitation: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${API_KEY}`,
  wind:          `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${API_KEY}`,
  clouds:        `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${API_KEY}`,
};

function initMap() {
  if (mapInitialized) return;
  mapInitialized = true;
  const center = lastWeather ? [lastWeather.coord.lat, lastWeather.coord.lon] : [51.505, -0.09];
  map = L.map("weatherMap", { zoomControl: true, attributionControl: true }).setView(center, 10);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '© <a href="https://carto.com/">CARTO</a>', maxZoom: 18,
  }).addTo(map);
  weatherTileLayer = L.tileLayer(TILE_LAYERS.temp, { opacity: 0.65, maxZoom: 18 }).addTo(map);
  if (lastWeather) placeMapMarker(lastWeather.coord.lat, lastWeather.coord.lon);
  map.on("click", async (e) => {
    const { lat, lng } = e.latlng;
    placeMapMarker(lat, lng);
    await showMapPopup(lat, lng);
  });
  document.querySelectorAll(".map-layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".map-layer-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (weatherTileLayer) map.removeLayer(weatherTileLayer);
      weatherTileLayer = L.tileLayer(TILE_LAYERS[btn.dataset.layer], { opacity: 0.65, maxZoom: 18 }).addTo(map);
    });
  });
}

function placeMapMarker(lat, lng) {
  if (mapMarker) map.removeLayer(mapMarker);
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:#60a5fa;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(96,165,250,0.8);"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
  mapMarker = L.marker([lat, lng], { icon }).addTo(map);
}

async function showMapPopup(lat, lng) {
  if (mapMarker) {
    mapMarker.bindPopup(`<div class="map-popup"><div class="map-popup-loader"><i class="fa fa-spinner fa-spin"></i> Loading...</div></div>`, { maxWidth: 280 }).openPopup();
  }
  try {
    const [wRes, aqiRes] = await Promise.all([
      fetch(`${BASE_URL}?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`),
      fetch(`${AQI_URL}?lat=${lat}&lon=${lng}&appid=${API_KEY}`)
    ]);
    if (!wRes.ok) throw new Error();
    const w       = await wRes.json();
    const aqiData = aqiRes.ok ? await aqiRes.json() : null;
    const sym     = tempSym();
    const temp    = toDisplayTemp(w.main.temp);
    const icon    = sanitize(w.weather[0].icon);
    const desc    = w.weather[0].description;
    const aqiLabels = ["", "Good", "Fair", "Moderate", "Poor", "Very Poor"];
    const aqiColors = ["", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
    const aqiVal    = aqiData?.list?.[0]?.main?.aqi;
    const aqiHtml   = aqiVal
      ? `<div class="map-popup-aqi" style="background:${aqiColors[aqiVal]}22;border-color:${aqiColors[aqiVal]}55;color:${aqiColors[aqiVal]}"><i class="fa fa-leaf"></i> Air Quality: ${aqiLabels[aqiVal]}</div>`
      : "";
    const html = `
      <div class="map-popup">
        <div class="map-popup-city">${sanitize(w.name)}</div>
        <div class="map-popup-country">${sanitize(w.sys.country)} · ${lat.toFixed(2)}, ${lng.toFixed(2)}</div>
        <div class="map-popup-row">
          <img class="map-popup-icon" src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${sanitize(desc)}"/>
          <div><div class="map-popup-temp">${temp}${sym}</div><div class="map-popup-desc">${sanitize(desc)}</div></div>
        </div>
        <div class="map-popup-stats">
          <div class="map-popup-stat"><span class="map-popup-stat-label">Humidity</span>${w.main.humidity}%</div>
          <div class="map-popup-stat"><span class="map-popup-stat-label">Wind</span>${windDisplay(w.wind.speed)}</div>
          <div class="map-popup-stat"><span class="map-popup-stat-label">Pressure</span>${w.main.pressure} hPa</div>
          <div class="map-popup-stat"><span class="map-popup-stat-label">Feels Like</span>${toDisplayTemp(w.main.feels_like)}${sym}</div>
        </div>
        ${aqiHtml}
        <button onclick="loadFromMap(${w.coord.lat},${w.coord.lon})" style="margin-top:10px;width:100%;padding:8px;border-radius:10px;border:none;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">
          <i class="fa fa-cloud-sun"></i> Load Full Weather
        </button>
      </div>`;
    if (mapMarker) mapMarker.setPopupContent(html);
  } catch {
    if (mapMarker) mapMarker.setPopupContent(`<div class="map-popup"><div class="map-popup-loader">Could not load weather for this location.</div></div>`);
  }
}

window.loadFromMap = function(lat, lon) {
  fetchAllByCoords(lat, lon);
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelector('[data-tab="today"]').classList.add("active");
  document.getElementById("tab-today").classList.add("active");
  if (mapMarker) mapMarker.closePopup();
};

// ── Events ──
const debouncedSearch = debounce(() => { const c = cityInput.value.trim(); if (c) fetchAll(c); }, 400);
searchBtn.addEventListener("click", debouncedSearch);
cityInput.addEventListener("keydown", e => { if (e.key === "Enter") debouncedSearch(); });
locationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition(
    p => fetchAllByCoords(p.coords.latitude, p.coords.longitude),
    () => alert("Unable to retrieve your location.")
  );
});

// ── Default Load ──
fetchAll("London");
