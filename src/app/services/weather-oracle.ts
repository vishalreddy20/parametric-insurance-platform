/**
 * ZyroSafe Weather Oracle
 * Real-time weather data + parametric trigger thresholds
 * Blueprint: "Environmental Data Oracles and Meteorological Trigger Engineering"
 */

// ============= Types =============

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGust: number;
  rainfall1h: number;
  rainfall3h: number;
  rainAccumulation24h: number;
  aqi: number;
  description: string;
  icon: string;
  cityName: string;
  timestamp: string;
}

export interface DisruptionResult {
  disrupted: boolean;
  severity: 'none' | 'moderate' | 'severe';
  type: string;
  typeLabel: string;
  lostHours: number;
  confidence: number;
  details: string;
  weatherData: WeatherData;
}

export interface ForecastDay {
  date: string;
  tempHigh: number;
  tempLow: number;
  rainfall: number;
  windSpeed: number;
  description: string;
  icon: string;
  riskLevel: 'safe' | 'caution' | 'warning' | 'danger';
  predictedClaims: number;
}

// ============= Thresholds (from Blueprint) =============

const THRESHOLDS = {
  rainfall: {
    moderate: 45,   // mm/day → 3 lost hours
    severe: 60,     // mm/day → 5 lost hours
  },
  temperature: {
    severe: 45,     // °C → 4 lost hours
    warning: 42,    // °C → advisory
  },
  wind: {
    storm: 60,      // km/h → 6 lost hours
    warning: 40,    // km/h → advisory
  },
  aqi: {
    hazardous: 300,  // → 3 lost hours
    veryUnhealthy: 200, // → advisory
  },
};

// ============= City Weather Profiles (Realistic Mock Data) =============

interface CityWeatherProfile {
  baseTemp: number;
  tempVariance: number;
  baseRain: number;
  monsoonMultiplier: number;
  baseWind: number;
  baseAqi: number;
  lat: number;
  lon: number;
}

const CITY_PROFILES: Record<string, CityWeatherProfile> = {
  mumbai: { baseTemp: 30, tempVariance: 5, baseRain: 15, monsoonMultiplier: 4, baseWind: 18, baseAqi: 120, lat: 19.076, lon: 72.877 },
  delhi: { baseTemp: 32, tempVariance: 12, baseRain: 5, monsoonMultiplier: 3, baseWind: 12, baseAqi: 250, lat: 28.613, lon: 77.209 },
  hyderabad: { baseTemp: 31, tempVariance: 6, baseRain: 8, monsoonMultiplier: 3.5, baseWind: 14, baseAqi: 100, lat: 17.385, lon: 78.486 },
  bangalore: { baseTemp: 27, tempVariance: 4, baseRain: 10, monsoonMultiplier: 2.5, baseWind: 15, baseAqi: 80, lat: 12.971, lon: 77.594 },
  chennai: { baseTemp: 32, tempVariance: 4, baseRain: 12, monsoonMultiplier: 4.5, baseWind: 20, baseAqi: 90, lat: 13.082, lon: 80.270 },
  kolkata: { baseTemp: 30, tempVariance: 8, baseRain: 14, monsoonMultiplier: 3.5, baseWind: 16, baseAqi: 150, lat: 22.572, lon: 88.363 },
  pune: { baseTemp: 28, tempVariance: 6, baseRain: 10, monsoonMultiplier: 3, baseWind: 14, baseAqi: 95, lat: 18.520, lon: 73.856 },
  ahmedabad: { baseTemp: 34, tempVariance: 10, baseRain: 3, monsoonMultiplier: 2.5, baseWind: 15, baseAqi: 140, lat: 23.022, lon: 72.571 },
  jaipur: { baseTemp: 33, tempVariance: 12, baseRain: 3, monsoonMultiplier: 2, baseWind: 18, baseAqi: 130, lat: 26.912, lon: 75.787 },
  lucknow: { baseTemp: 31, tempVariance: 10, baseRain: 5, monsoonMultiplier: 2.5, baseWind: 10, baseAqi: 180, lat: 26.846, lon: 80.946 },
};

// ============= Generate Realistic Weather =============

function generateRealisticWeather(city: string): WeatherData {
  const profile = CITY_PROFILES[city.toLowerCase()] || CITY_PROFILES.hyderabad;
  const month = new Date().getMonth();
  const hour = new Date().getHours();
  const isMonsoon = month >= 5 && month <= 8;
  const isSummer = month >= 2 && month <= 5;

  // Temperature varies by time of day
  const tempOffset = hour >= 10 && hour <= 16 ? profile.tempVariance * 0.5 : -profile.tempVariance * 0.3;
  const seasonOffset = isSummer ? profile.tempVariance * 0.6 : isMonsoon ? -3 : 0;
  const temperature = Math.round((profile.baseTemp + tempOffset + seasonOffset + (Math.random() - 0.5) * 4) * 10) / 10;

  // Rainfall — use date-seeded random for consistency within a day
  const daySeed = new Date().toISOString().split('T')[0];
  const rainSeed = daySeed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rainRand = Math.abs(Math.sin(rainSeed * (city.length + 1)) * 100) % 100;
  
  let rainfall1h = 0;
  let rainAccumulation24h = 0;
  const rainMultiplier = isMonsoon ? profile.monsoonMultiplier : 1;
  
  if (rainRand < 20) { // 20% chance of significant rain
    rainfall1h = Math.round((profile.baseRain * rainMultiplier * (0.5 + Math.random())) * 10) / 10;
    rainAccumulation24h = Math.round(rainfall1h * (8 + Math.random() * 8));
  } else if (rainRand < 40) { // 20% chance of light rain
    rainfall1h = Math.round((profile.baseRain * 0.3 * rainMultiplier) * 10) / 10;
    rainAccumulation24h = Math.round(rainfall1h * (4 + Math.random() * 4));
  }

  // Wind
  const windBase = profile.baseWind + (Math.random() - 0.5) * 10;
  const windSpeed = Math.round(Math.max(5, windBase + (isMonsoon ? 10 : 0)) * 10) / 10;
  const windGust = Math.round(windSpeed * (1.3 + Math.random() * 0.4) * 10) / 10;

  // AQI
  const aqiOffset = isSummer ? 30 : isMonsoon ? -40 : 0;
  const aqi = Math.round(Math.max(30, profile.baseAqi + aqiOffset + (Math.random() - 0.5) * 60));

  // Weather description
  let description = 'Clear sky';
  let icon = '☀️';
  if (rainfall1h > 10) { description = 'Heavy rainfall'; icon = '🌧️'; }
  else if (rainfall1h > 3) { description = 'Moderate rain'; icon = '🌦️'; }
  else if (rainfall1h > 0) { description = 'Light drizzle'; icon = '🌤️'; }
  else if (temperature > 42) { description = 'Extreme heat warning'; icon = '🔥'; }
  else if (temperature > 38) { description = 'Very hot'; icon = '☀️'; }
  else if (aqi > 300) { description = 'Hazardous air quality'; icon = '😷'; }
  else if (windSpeed > 50) { description = 'Strong winds'; icon = '💨'; }
  else if (temperature < 15) { description = 'Cold'; icon = '🥶'; }
  else { description = 'Partly cloudy'; icon = '⛅'; }

  return {
    temperature,
    feelsLike: Math.round((temperature + (isSummer ? 3 : -1)) * 10) / 10,
    humidity: Math.round(isMonsoon ? 75 + Math.random() * 20 : 40 + Math.random() * 30),
    windSpeed,
    windGust,
    rainfall1h,
    rainfall3h: Math.round(rainfall1h * 2.5 * 10) / 10,
    rainAccumulation24h,
    aqi,
    description,
    icon,
    cityName: city.charAt(0).toUpperCase() + city.slice(1),
    timestamp: new Date().toISOString(),
  };
}

// ============= Main Disruption Check =============

export function checkWeatherDisruption(city: string, lat?: number, lon?: number): DisruptionResult {
  const weather = generateRealisticWeather(city);

  // Check extreme heat
  if (weather.temperature >= THRESHOLDS.temperature.severe) {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'extreme_heat',
      typeLabel: 'Extreme Heat',
      lostHours: 4,
      confidence: 95,
      details: `Temperature of ${weather.temperature}°C exceeds the ${THRESHOLDS.temperature.severe}°C critical threshold. Outdoor delivery operations are physiologically dangerous.`,
      weatherData: weather,
    };
  }

  // Check severe rainfall
  if (weather.rainAccumulation24h >= THRESHOLDS.rainfall.severe) {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'heavy_rainfall',
      typeLabel: 'Heavy Rainfall',
      lostHours: 5,
      confidence: 92,
      details: `24h rainfall accumulation of ${weather.rainAccumulation24h}mm exceeds the ${THRESHOLDS.rainfall.severe}mm severe threshold. Urban infrastructure likely inundated.`,
      weatherData: weather,
    };
  }

  // Check moderate rainfall
  if (weather.rainAccumulation24h >= THRESHOLDS.rainfall.moderate) {
    return {
      disrupted: true,
      severity: 'moderate',
      type: 'moderate_rainfall',
      typeLabel: 'Moderate Rainfall',
      lostHours: 3,
      confidence: 85,
      details: `24h rainfall accumulation of ${weather.rainAccumulation24h}mm exceeds the ${THRESHOLDS.rainfall.moderate}mm moderate threshold. Intermittent disruption expected.`,
      weatherData: weather,
    };
  }

  // Check storm / high wind
  if (weather.windSpeed >= THRESHOLDS.wind.storm) {
    return {
      disrupted: true,
      severity: 'severe',
      type: 'severe_storm',
      typeLabel: 'Severe Storm',
      lostHours: 6,
      confidence: 90,
      details: `Wind speed of ${weather.windSpeed}km/h exceeds the ${THRESHOLDS.wind.storm}km/h storm threshold. Two-wheeled transit is fundamentally unsafe.`,
      weatherData: weather,
    };
  }

  // Check hazardous AQI
  if (weather.aqi >= THRESHOLDS.aqi.hazardous) {
    return {
      disrupted: true,
      severity: 'moderate',
      type: 'hazardous_pollution',
      typeLabel: 'Hazardous Air Quality',
      lostHours: 3,
      confidence: 88,
      details: `AQI level of ${weather.aqi} exceeds the ${THRESHOLDS.aqi.hazardous} hazardous threshold. Prolonged outdoor exposure is dangerous.`,
      weatherData: weather,
    };
  }

  // No disruption
  return {
    disrupted: false,
    severity: 'none',
    type: 'none',
    typeLabel: 'No Disruption',
    lostHours: 0,
    confidence: 0,
    details: 'Current conditions are within safe operational parameters. No parametric triggers activated.',
    weatherData: weather,
  };
}

// ============= Simulate Specific Disruption (for demo) =============

export function simulateDisruption(type: 'rainfall' | 'heat' | 'storm' | 'pollution' | 'cyclone', city: string): DisruptionResult {
  const weather = generateRealisticWeather(city);

  switch (type) {
    case 'rainfall':
      weather.rainAccumulation24h = 72;
      weather.rainfall1h = 18;
      weather.description = 'Torrential rainfall';
      weather.icon = '🌧️';
      return { disrupted: true, severity: 'severe', type: 'heavy_rainfall', typeLabel: 'Heavy Rainfall', lostHours: 5, confidence: 95, details: `SIMULATED: 24h rainfall of 72mm exceeds the 60mm threshold. Urban flooding confirmed.`, weatherData: weather };
    case 'heat':
      weather.temperature = 47.2;
      weather.feelsLike = 49;
      weather.description = 'Extreme heat wave';
      weather.icon = '🔥';
      return { disrupted: true, severity: 'severe', type: 'extreme_heat', typeLabel: 'Extreme Heat', lostHours: 4, confidence: 97, details: `SIMULATED: Temperature of 47.2°C exceeds 45°C critical threshold. Heat stroke danger.`, weatherData: weather };
    case 'storm':
      weather.windSpeed = 78;
      weather.windGust = 105;
      weather.description = 'Severe storm warning';
      weather.icon = '🌪️';
      return { disrupted: true, severity: 'severe', type: 'severe_storm', typeLabel: 'Severe Storm', lostHours: 6, confidence: 93, details: `SIMULATED: Wind speed of 78km/h exceeds 60km/h storm threshold. Movement restricted.`, weatherData: weather };
    case 'pollution':
      weather.aqi = 380;
      weather.description = 'Hazardous air quality';
      weather.icon = '😷';
      return { disrupted: true, severity: 'moderate', type: 'hazardous_pollution', typeLabel: 'Hazardous AQI', lostHours: 3, confidence: 90, details: `SIMULATED: AQI level of 380 exceeds 300 hazardous threshold.`, weatherData: weather };
    case 'cyclone':
      weather.windSpeed = 120;
      weather.windGust = 160;
      weather.rainAccumulation24h = 150;
      weather.description = 'Cyclone warning active';
      weather.icon = '🌀';
      return { disrupted: true, severity: 'severe', type: 'cyclone', typeLabel: 'Cyclone Alert', lostHours: 8, confidence: 99, details: `SIMULATED: Official cyclone alert for the region. Full disruption protocol activated. Maximal payouts authorized.`, weatherData: weather };
    default:
      return checkWeatherDisruption(city);
  }
}

// ============= 5-Day Forecast =============

export function getForecast(city: string): ForecastDay[] {
  const profile = CITY_PROFILES[city.toLowerCase()] || CITY_PROFILES.hyderabad;
  const forecast: ForecastDay[] = [];
  const isMonsoon = new Date().getMonth() >= 5 && new Date().getMonth() <= 8;
  const totalUsers = 100 + Math.floor(Math.random() * 200);

  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayStr = date.toISOString().split('T')[0];
    const seed = dayStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + city.length;
    const rand = Math.abs(Math.sin(seed * (i + 1)));

    const tempBase = profile.baseTemp + (Math.sin(seed) * profile.tempVariance * 0.5);
    const tempHigh = Math.round((tempBase + profile.tempVariance * 0.5 + rand * 3) * 10) / 10;
    const tempLow = Math.round((tempBase - profile.tempVariance * 0.3) * 10) / 10;
    const rainfall = Math.round((rand < 0.3 ? profile.baseRain * (isMonsoon ? profile.monsoonMultiplier : 1) * rand * 5 : 0) * 10) / 10;
    const windSpeed = Math.round((profile.baseWind + rand * 15) * 10) / 10;

    let riskLevel: ForecastDay['riskLevel'] = 'safe';
    let predictedClaims = 0;
    let description = 'Clear';
    let icon = '☀️';

    if (rainfall > THRESHOLDS.rainfall.severe) {
      riskLevel = 'danger'; predictedClaims = Math.round(totalUsers * 0.4 + rand * 20); description = 'Heavy rain expected'; icon = '🌧️';
    } else if (rainfall > THRESHOLDS.rainfall.moderate) {
      riskLevel = 'warning'; predictedClaims = Math.round(totalUsers * 0.2 + rand * 10); description = 'Rain likely'; icon = '🌦️';
    } else if (tempHigh > THRESHOLDS.temperature.severe) {
      riskLevel = 'danger'; predictedClaims = Math.round(totalUsers * 0.3 + rand * 15); description = 'Heat wave'; icon = '🔥';
    } else if (tempHigh > THRESHOLDS.temperature.warning) {
      riskLevel = 'warning'; predictedClaims = Math.round(totalUsers * 0.1 + rand * 5); description = 'Very hot'; icon = '🌡️';
    } else if (windSpeed > THRESHOLDS.wind.warning) {
      riskLevel = 'caution'; predictedClaims = Math.round(totalUsers * 0.05); description = 'Windy'; icon = '💨';
    } else {
      description = rainfall > 0 ? 'Light rain' : 'Partly cloudy';
      icon = rainfall > 0 ? '🌤️' : '⛅';
    }

    forecast.push({ date: dayStr, tempHigh, tempLow, rainfall, windSpeed, description, icon, riskLevel, predictedClaims });
  }

  return forecast;
}

// ============= Get Current Weather (simple) =============

export function getCurrentWeather(city: string): WeatherData {
  return generateRealisticWeather(city);
}
