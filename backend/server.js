const crypto = require('node:crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
// Hosts such as Render provide PORT; API_PORT keeps local development on 3000.
const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const deviceId = process.env.DEVICE_ID;
const deviceSecret = process.env.DEVICE_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const demoLatitude = Number(process.env.DEMO_LATITUDE);
const demoLongitude = Number(process.env.DEMO_LONGITUDE);
const demoLocationName = process.env.DEMO_LOCATION_NAME || 'Capstone demonstration station';
const demoEnvironment = process.env.DEMO_ENVIRONMENT || 'indoor';
const nwsStationLimit = Math.min(Math.max(Number(process.env.NWS_STATION_LIMIT) || 5, 1), 10);

if (!deviceId || !deviceSecret || deviceSecret.startsWith('replace-this') || !supabaseUrl || !supabaseSecretKey || supabaseSecretKey.startsWith('replace-with') || !Number.isFinite(demoLatitude) || !Number.isFinite(demoLongitude)) {
  console.error('Set device, Supabase, and demo-location variables in .env before starting the server.');
  process.exit(1);
}

if (demoLatitude < -90 || demoLatitude > 90 || demoLongitude < -180 || demoLongitude > 180) {
  console.error('DEMO_LATITUDE or DEMO_LONGITUDE is outside its valid range.');
  process.exit(1);
}

if (demoEnvironment !== 'indoor' && demoEnvironment !== 'outdoor') {
  console.error('DEMO_ENVIRONMENT must be indoor or outdoor.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

app.use(express.json({ limit: '2kb' }));
app.use(express.static('frontend'));

function hasValidDeviceSecret(request) {
  const suppliedSecret = request.get('X-Device-Secret');

  if (!suppliedSecret) {
    return false;
  }

  const expected = Buffer.from(deviceSecret);
  const supplied = Buffer.from(suppliedSecret);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function isNumberInRange(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function hasValidObservationValues({ temperatureC, humidityPercent, pressureHpa }) {
  return (
    isNumberInRange(temperatureC, -40, 85) &&
    isNumberInRange(humidityPercent, 0, 100) &&
    isNumberInRange(pressureHpa, 300, 1100)
  );
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function storeObservation({ temperatureC, humidityPercent, pressureHpa, source }) {
  const { data, error } = await supabase
    .from('measurements')
    .insert({
      temperature_c: temperatureC,
      humidity_percent: humidityPercent,
      pressure_hpa: pressureHpa,
      source,
      latitude: demoLatitude,
      longitude: demoLongitude,
      location_name: demoLocationName,
      environment: demoEnvironment
    })
    .select('id, received_at, temperature_c, humidity_percent, pressure_hpa, source, latitude, longitude, location_name, environment')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/demo-config', (_request, response) => {
  response.json({
    station: {
      name: demoLocationName,
      latitude: demoLatitude,
      longitude: demoLongitude,
      environment: demoEnvironment,
      locationSource: 'demo_configuration'
    }
  });
});

function pascalsToHpa(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value / 100 : null;
}

function weatherValue(property) {
  return property && typeof property.value === 'number' && Number.isFinite(property.value)
    ? property.value
    : null;
}

async function fetchJson(url, headers = {}) {
  const upstreamResponse = await fetch(url, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'User-Agent': 'AccessibleHyperlocalWeatherStation/0.1 (capstone educational demo)',
      ...headers
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!upstreamResponse.ok) {
    throw new Error(`Weather provider returned HTTP ${upstreamResponse.status}.`);
  }

  return upstreamResponse.json();
}

async function getOpenMeteoConditions() {
  const parameters = new URLSearchParams({
    latitude: String(demoLatitude),
    longitude: String(demoLongitude),
    current: 'temperature_2m,relative_humidity_2m,surface_pressure',
    temperature_unit: 'celsius',
    timezone: 'auto',
    timeformat: 'unixtime'
  });
  const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${parameters}`);
  return {
    provider: 'Open-Meteo',
    kind: 'modeled_conditions',
    name: 'Model at demo location',
    latitude: data.latitude,
    longitude: data.longitude,
    observedAt: Number.isFinite(data.current?.time) ? new Date(data.current.time * 1000).toISOString() : null,
    temperatureC: data.current?.temperature_2m ?? null,
    humidityPercent: data.current?.relative_humidity_2m ?? null,
    pressureHpa: data.current?.surface_pressure ?? null,
    pressureType: 'surface_pressure'
  };
}

async function getNwsStations() {
  const stationsDocument = await fetchJson(
    `https://api.weather.gov/points/${demoLatitude},${demoLongitude}/stations`
  );
  const stationFeatures = (stationsDocument.features || []).slice(0, nwsStationLimit);
  const observations = await Promise.allSettled(stationFeatures.map(async (station) => {
    const stationId = station.properties?.stationIdentifier;
    const latest = await fetchJson(`https://api.weather.gov/stations/${encodeURIComponent(stationId)}/observations/latest`);
    const properties = latest.properties || {};
    const coordinates = latest.geometry?.coordinates || station.geometry?.coordinates || [];
    return {
      provider: 'National Weather Service',
      kind: 'physical_station_observation',
      stationId,
      name: station.properties?.name || stationId,
      latitude: coordinates[1],
      longitude: coordinates[0],
      observedAt: properties.timestamp || null,
      temperatureC: weatherValue(properties.temperature),
      humidityPercent: weatherValue(properties.relativeHumidity),
      pressureHpa: pascalsToHpa(weatherValue(properties.barometricPressure)),
      pressureType: 'station_pressure'
    };
  }));

  return observations
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((station) => Number.isFinite(station.latitude) && Number.isFinite(station.longitude));
}

app.get('/api/comparisons/current', async (_request, response) => {
  const [modelResult, stationsResult] = await Promise.allSettled([
    getOpenMeteoConditions(),
    getNwsStations()
  ]);

  return response.json({
    retrievedAt: new Date().toISOString(),
    model: modelResult.status === 'fulfilled' ? modelResult.value : null,
    stations: stationsResult.status === 'fulfilled' ? stationsResult.value : [],
    warnings: [
      ...(modelResult.status === 'rejected' ? ['Open-Meteo conditions are currently unavailable.'] : []),
      ...(stationsResult.status === 'rejected' ? ['Nearby NWS observations are currently unavailable.'] : [])
    ]
  });
});

app.post('/api/devices/:id/readings', async (request, response, next) => {
  if (request.params.id !== deviceId || !hasValidDeviceSecret(request)) {
    return response.status(401).json({ error: 'Invalid device credential.' });
  }

  const { temperatureC, humidityPercent, pressureHpa } = request.body;

  if (
    !isNumberInRange(temperatureC, -40, 85) ||
    !isNumberInRange(humidityPercent, 0, 100) ||
    !isNumberInRange(pressureHpa, 300, 1100)
  ) {
    return response.status(400).json({
      error: 'Expected finite temperatureC (-40–85), humidityPercent (0–100), and pressureHpa (300–1100).'
    });
  }

  try {
    const observation = await storeObservation({ temperatureC, humidityPercent, pressureHpa, source: 'device_upload' });
    console.log('Device observation stored:', { deviceId, id: observation.id, receivedAt: observation.received_at });
    return response.status(201).json({ accepted: true, receivedAt: observation.received_at, id: observation.id });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/demo-observations', async (request, response, next) => {
  if (!isLocalRequest(request)) {
    return response.status(403).json({ error: 'Manual demo observations are available only from this computer.' });
  }

  const { temperatureC, humidityPercent, pressureHpa } = request.body;
  if (!hasValidObservationValues({ temperatureC, humidityPercent, pressureHpa })) {
    return response.status(400).json({
      error: 'Expected finite temperatureC (-40–85), humidityPercent (0–100), and pressureHpa (300–1100).'
    });
  }

  try {
    const observation = await storeObservation({ temperatureC, humidityPercent, pressureHpa, source: 'manual_serial_monitor_entry' });
    console.log('Manual demo observation stored:', { id: observation.id, receivedAt: observation.received_at });
    return response.status(201).json({
      accepted: true,
      receivedAt: observation.received_at,
      id: observation.id,
      source: observation.source,
      station: {
        name: observation.location_name,
        latitude: observation.latitude,
        longitude: observation.longitude,
        environment: observation.environment
      },
      measurement: {
        temperatureC: observation.temperature_c,
        humidityPercent: observation.humidity_percent,
        pressureHpa: observation.pressure_hpa
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/measurements/recent', async (_request, response, next) => {
  try {
    const { data, error } = await supabase
      .from('measurements')
      .select('id, received_at, temperature_c, humidity_percent, pressure_hpa, source, latitude, longitude, location_name, environment')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return response.json({ measurements: data });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return response.status(400).json({ error: 'Request body must be valid JSON.' });
  }

  console.error(error);
  return response.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`Weather-station backend listening on http://localhost:${port}`);
});
